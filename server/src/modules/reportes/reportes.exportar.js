/**
 * Exporta un reporte (columnas + filas + totales) a Excel o PDF.
 * `datos` = { negocio, titulo, subtitulo, columnas, filas, totales, generado }
 */
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const nf = {
  pesos: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  cantidad: new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
  entero: new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }),
  porcentaje: new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};

const vacio = (v) => v === '' || v === null || v === undefined;

export function fechaCorta(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Texto tal como se ve en el PDF. */
export function formatearCelda(valor, tipo) {
  if (vacio(valor)) return '';
  switch (tipo) {
    case 'pesos':
      return nf.pesos.format(Number(valor)).replace(/ /g, ' ');
    case 'cantidad':
      return nf.cantidad.format(Number(valor));
    case 'entero':
      return nf.entero.format(Number(valor));
    case 'porcentaje':
      return `${nf.porcentaje.format(Number(valor))} %`;
    case 'fecha':
      return fechaCorta(valor);
    default:
      return String(valor);
  }
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------
const FORMATO_EXCEL = {
  pesos: '"$" #,##0.00',
  cantidad: '#,##0.###',
  entero: '#,##0',
  porcentaje: '0.0%',
  fecha: 'dd/mm/yyyy',
};

function valorExcel(valor, tipo) {
  if (vacio(valor)) return null;
  if (tipo === 'pesos' || tipo === 'cantidad' || tipo === 'entero') return Number(valor);
  if (tipo === 'porcentaje') return Number(valor) / 100;
  if (tipo === 'fecha') {
    const [a, m, d] = String(valor).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
  }
  return String(valor);
}

export async function aExcel({ negocio, titulo, subtitulo, columnas, filas, totales, generado }) {
  const libro = new ExcelJS.Workbook();
  libro.creator = negocio;
  libro.created = new Date();
  const hoja = libro.addWorksheet(titulo.slice(0, 31), { views: [{ state: 'frozen', ySplit: 4 }] });
  const ultima = columnas.length;

  hoja.mergeCells(1, 1, 1, ultima);
  hoja.getCell(1, 1).value = `${negocio} — ${titulo}`;
  hoja.getCell(1, 1).font = { bold: true, size: 14 };
  hoja.mergeCells(2, 1, 2, ultima);
  hoja.getCell(2, 1).value = `${subtitulo} · Generado el ${generado}`;
  hoja.getCell(2, 1).font = { color: { argb: 'FF666666' }, size: 10 };

  const encabezado = hoja.getRow(4);
  columnas.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5C8E' } };
    celda.alignment = { vertical: 'middle', horizontal: ['pesos', 'cantidad', 'entero', 'porcentaje'].includes(c.tipo) ? 'right' : 'left', wrapText: true };
  });
  encabezado.height = 22;

  filas.forEach((fila, r) => {
    const row = hoja.getRow(5 + r);
    columnas.forEach((c, i) => {
      const celda = row.getCell(i + 1);
      celda.value = valorExcel(fila[c.clave], c.tipo);
      if (FORMATO_EXCEL[c.tipo]) celda.numFmt = FORMATO_EXCEL[c.tipo];
    });
  });

  if (totales && Object.keys(totales).length) {
    const row = hoja.getRow(5 + filas.length);
    row.getCell(1).value = 'TOTAL';
    columnas.forEach((c, i) => {
      if (totales[c.clave] === undefined) return;
      const celda = row.getCell(i + 1);
      celda.value = valorExcel(totales[c.clave], c.tipo);
      if (FORMATO_EXCEL[c.tipo]) celda.numFmt = FORMATO_EXCEL[c.tipo];
    });
    row.font = { bold: true };
    row.eachCell({ includeEmpty: true }, (celda) => {
      celda.border = { top: { style: 'thin' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF4F8' } };
    });
  }

  columnas.forEach((c, i) => {
    const mayor = Math.max(c.titulo.length, ...filas.map((f) => formatearCelda(f[c.clave], c.tipo).length), formatearCelda(totales?.[c.clave], c.tipo).length);
    hoja.getColumn(i + 1).width = Math.min(Math.max(mayor + 3, 12), 48);
  });
  if (filas.length) hoja.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + filas.length, column: ultima } };

  return Buffer.from(await libro.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
const ANCHO_FIJO = { pesos: 82, cantidad: 66, entero: 52, porcentaje: 62, fecha: 62 };
const AZUL = '#0b5c8e';
const MARGEN = 36;
const ALTO_FILA = 20;

function calcularAnchos(columnas, anchoUtil) {
  const fijos = columnas.reduce((a, c) => a + (ANCHO_FIJO[c.tipo] ?? 0), 0);
  const textos = columnas.filter((c) => !ANCHO_FIJO[c.tipo]);
  const libre = Math.max(anchoUtil - fijos, 0);
  const porTexto = textos.length ? Math.max(libre / textos.length, 60) : 0;
  const anchos = columnas.map((c) => ANCHO_FIJO[c.tipo] ?? porTexto);
  // Si no entra, se achica todo proporcionalmente
  const suma = anchos.reduce((a, b) => a + b, 0);
  const factor = suma > anchoUtil ? anchoUtil / suma : 1;
  return anchos.map((a) => a * factor);
}

export function aPdf({ negocio, titulo, subtitulo, columnas, filas, totales, generado }) {
  return new Promise((resolve, reject) => {
    const apaisado = columnas.length > 6;
    const doc = new PDFDocument({ size: 'A4', layout: apaisado ? 'landscape' : 'portrait', margin: MARGEN, bufferPages: true, info: { Title: titulo, Author: negocio } });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const anchoUtil = doc.page.width - MARGEN * 2;
    const anchos = calcularAnchos(columnas, anchoUtil);
    const limiteY = () => doc.page.height - MARGEN - 18;
    const alinear = (c) => (ANCHO_FIJO[c.tipo] && c.tipo !== 'fecha' ? 'right' : 'left');

    const celda = (texto, i, x, y, opciones = {}) => {
      doc.text(texto, x + 4, y + 5, { width: anchos[i] - 8, height: ALTO_FILA - 6, ellipsis: true, lineBreak: false, align: alinear(columnas[i]), ...opciones });
    };

    const dibujarEncabezadoTabla = (y) => {
      doc.rect(MARGEN, y, anchoUtil, ALTO_FILA + 2).fill(AZUL);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      let x = MARGEN;
      columnas.forEach((c, i) => {
        celda(c.titulo, i, x, y + 1);
        x += anchos[i];
      });
      return y + ALTO_FILA + 2;
    };

    // Título
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(16).text(titulo, MARGEN, MARGEN);
    doc.font('Helvetica').fontSize(9.5).fillColor('#555555').text(`${negocio} · ${subtitulo}`, MARGEN, doc.y + 2);
    doc.text(`Generado el ${generado}`, MARGEN, doc.y);
    let y = doc.y + 12;
    y = dibujarEncabezadoTabla(y);

    doc.font('Helvetica').fontSize(8.5);
    filas.forEach((fila, r) => {
      if (y + ALTO_FILA > limiteY()) {
        doc.addPage();
        y = dibujarEncabezadoTabla(MARGEN);
        doc.font('Helvetica').fontSize(8.5);
      }
      if (r % 2 === 1) doc.rect(MARGEN, y, anchoUtil, ALTO_FILA).fill('#f2f6f9');
      doc.fillColor('#111111');
      let x = MARGEN;
      columnas.forEach((c, i) => {
        celda(formatearCelda(fila[c.clave], c.tipo), i, x, y);
        x += anchos[i];
      });
      y += ALTO_FILA;
    });

    if (!filas.length) {
      doc.fillColor('#777777').font('Helvetica-Oblique').text('No hay datos para este período.', MARGEN, y + 10);
    } else if (totales && Object.keys(totales).length) {
      if (y + ALTO_FILA > limiteY()) {
        doc.addPage();
        y = MARGEN;
      }
      doc.moveTo(MARGEN, y).lineTo(MARGEN + anchoUtil, y).lineWidth(1).strokeColor('#0b5c8e').stroke();
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9);
      let x = MARGEN;
      columnas.forEach((c, i) => {
        const texto = i === 0 && totales[c.clave] === undefined ? 'TOTAL' : formatearCelda(totales[c.clave], c.tipo);
        celda(texto, i, x, y);
        x += anchos[i];
      });
    }

    // Pie con el número de página (se escribe al final, cuando ya se sabe el total)
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i += 1) {
      doc.switchToPage(paginas.start + i);
      doc.page.margins.bottom = 0; // evita que el pie dispare una página nueva
      doc.font('Helvetica').fontSize(8).fillColor('#888888');
      doc.text(`Página ${i + 1} de ${paginas.count}`, MARGEN, doc.page.height - MARGEN, { width: anchoUtil, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
