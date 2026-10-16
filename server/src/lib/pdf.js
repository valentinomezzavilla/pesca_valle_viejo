// Piezas comunes de los PDF de cuentas (resumen de proveedores, resumen y detalle de deuda de clientes).
import PDFDocument from 'pdfkit';
import { LEYENDA_COMPROBANTE_INTERNO } from '@pescaderia/shared';

export const MARGEN = 40;
const ALTO_FILA = 18;
const AZUL = '#0b5c8e';

/** Arma un PDF A4. dibujar(doc) escribe el contenido; al final se agrega la leyenda de comprobante interno. */
export function crearPdf({ titulo, autor }, dibujar) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGEN, info: { Title: titulo, Author: autor } });
    const partes = [];
    doc.on('data', (x) => partes.push(x));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    dibujar(doc);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777777').text(LEYENDA_COMPROBANTE_INTERNO, MARGEN, doc.page.height - MARGEN - 12, { lineBreak: false });
    doc.end();
  });
}

/** Título grande y debajo las líneas de datos (negocio, a quién, período). */
export function encabezadoPdf(doc, titulo, lineas) {
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(16).text(titulo, MARGEN, MARGEN);
  doc.font('Helvetica').fontSize(10).fillColor('#444444');
  lineas.filter(Boolean).forEach((l) => doc.text(l));
  return doc.y + 12;
}

/**
 * Tabla con encabezado azul y filas alternadas. Corta de página sola.
 * columnas: [{ titulo, ancho (fracción del ancho útil), derecha? }]
 * filas: arrays de textos, o { celdas, destacada: true } para una fila en negrita con fondo (ej. el encabezado de una compra)
 */
export function tablaPdf(doc, yInicial, columnas, filas) {
  let y = yInicial;
  const ancho = doc.page.width - MARGEN * 2;
  const anchos = columnas.map((c) => c.ancho * ancho);
  const fila = (valores, { negrita = false, blanco = false, fondo = null } = {}) => {
    if (y + ALTO_FILA > doc.page.height - MARGEN - 30) {
      doc.addPage();
      y = MARGEN;
    }
    if (fondo) doc.rect(MARGEN, y, ancho, ALTO_FILA).fill(fondo);
    doc.fillColor(blanco ? '#ffffff' : '#111111').font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    let x = MARGEN;
    valores.forEach((v, i) => {
      doc.text(v ?? '', x + 4, y + 5, { width: anchos[i] - 8, lineBreak: false, ellipsis: true, align: columnas[i].derecha ? 'right' : 'left' });
      x += anchos[i];
    });
    y += ALTO_FILA;
  };
  fila(columnas.map((c) => c.titulo), { negrita: true, blanco: true, fondo: AZUL });
  filas.forEach((f, i) => {
    if (Array.isArray(f)) fila(f, { fondo: i % 2 ? '#f2f6f9' : null });
    else fila(f.celdas, { negrita: true, fondo: f.destacada ? '#dde9f2' : null });
  });
  return y;
}

/** Línea de total en negrita debajo de una tabla. */
export function totalPdf(doc, y, texto) {
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(texto, MARGEN, y + 10);
  return doc.y;
}
