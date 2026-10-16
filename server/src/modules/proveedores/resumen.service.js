// Resumen de cuenta para mandarle al proveedor: saldo anterior, movimientos del período y compras sin pagar.
import { TIPOS_DOCUMENTO_COMPRA_ETIQUETA, TIPOS_MOV_CC_PROVEEDOR_ETIQUETA, aPesos, dec } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNoEncontrado } from '../../lib/errores.js';
import { hoy } from '../../lib/fechas.js';
import { slug } from '../../lib/texto.js';
import { MARGEN, crearPdf, encabezadoPdf, tablaPdf, totalPdf } from '../../lib/pdf.js';
import { fechaCorta, formatearCelda } from '../reportes/reportes.exportar.js';
import * as configuracion from '../configuracion/configuracion.service.js';
import { imputar } from './imputacion.js';

export async function datosResumen(proveedorId, { desde, hasta }) {
  const proveedor = await db('proveedores').where({ id: proveedorId }).first();
  if (!proveedor) throw new ErrorNoEncontrado('El proveedor');
  const h = hasta ?? hoy();
  const d = desde ?? `${h.slice(0, 7)}-01`;
  const [anterior, filas, hastaFecha, compras] = await Promise.all([
    db('cc_proveedores_movimientos').where({ proveedor_id: proveedorId }).where('fecha', '<', d).sum('importe as total').first(),
    db('cc_proveedores_movimientos').where({ proveedor_id: proveedorId }).whereBetween('fecha', [d, h]).orderBy([{ column: 'fecha' }, { column: 'id' }]),
    db('cc_proveedores_movimientos').where({ proveedor_id: proveedorId }).where('fecha', '<=', h).select('id', 'tipo', 'importe', 'compra_id', 'anula_movimiento_id'),
    db('compras').where({ proveedor_id: proveedorId }).where('fecha', '<=', h).select('id', 'fecha', 'total', 'estado', 'tipo_documento', 'numero_documento'),
  ]);
  // Las compras sin pagar como estaban al cierre del período, así el PDF no se contradice con su propio saldo
  const estado = imputar({ movimientos: hastaFecha, compras, plazoDias: proveedor.plazo_pago_dias, hoy: h });
  let saldo = dec(anterior?.total ?? 0);
  const movimientos = filas.map((m) => {
    saldo = saldo.plus(m.importe);
    const extra = [m.descripcion, m.referencia && `Ref. ${m.referencia}`, m.cheque_numero && `Cheque ${m.cheque_numero}`].filter(Boolean).join(' · ');
    return {
      fecha: m.fecha,
      detalle: `${TIPOS_MOV_CC_PROVEEDOR_ETIQUETA[m.tipo] ?? m.tipo}${extra ? ` — ${extra}` : ''}`,
      importe: aPesos(m.importe),
      saldo: aPesos(saldo),
    };
  });
  return {
    proveedor,
    desde: d,
    hasta: h,
    saldo_anterior: aPesos(anterior?.total ?? 0),
    movimientos,
    saldo_final: aPesos(saldo),
    compras_pendientes: estado.compras.filter((c) => c.estado !== 'PAGADA'),
  };
}

export async function resumenPdf(proveedorId, filtros) {
  const datos = await datosResumen(proveedorId, filtros);
  const config = await configuracion.obtenerTodo();
  const negocio = config.negocio?.nombre || 'Pescadería';
  const p = datos.proveedor;

  const buffer = await crearPdf({ titulo: `Resumen de cuenta — ${p.nombre}`, autor: negocio }, (doc) => {
    let y = encabezadoPdf(doc, 'Resumen de cuenta', [
      negocio,
      `Proveedor: ${p.nombre}${p.cuit ? ` · CUIT ${p.cuit}` : ''}`,
      `Del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}`,
    ]);
    y = tablaPdf(doc, y, [
      { titulo: 'Fecha', ancho: 0.14 },
      { titulo: 'Detalle', ancho: 0.5 },
      { titulo: 'Importe', ancho: 0.18, derecha: true },
      { titulo: 'Saldo', ancho: 0.18, derecha: true },
    ], [
      ['', 'Saldo anterior', '', formatearCelda(datos.saldo_anterior, 'pesos')],
      ...datos.movimientos.map((m) => [fechaCorta(m.fecha), m.detalle, formatearCelda(m.importe, 'pesos'), formatearCelda(m.saldo, 'pesos')]),
    ]);
    totalPdf(doc, y, `Saldo al ${fechaCorta(datos.hasta)}: ${formatearCelda(datos.saldo_final, 'pesos')}`);

    if (datos.compras_pendientes.length) {
      doc.font('Helvetica-Bold').fontSize(12).text(`Compras sin pagar al ${fechaCorta(datos.hasta)}`, MARGEN, doc.y + 16);
      tablaPdf(doc, doc.y + 6, [
        { titulo: 'Fecha', ancho: 0.16 },
        { titulo: 'Comprobante', ancho: 0.36 },
        { titulo: 'Vence', ancho: 0.16 },
        { titulo: 'Falta pagar', ancho: 0.32, derecha: true },
      ], datos.compras_pendientes.map((c) => [
        fechaCorta(c.fecha),
        `${TIPOS_DOCUMENTO_COMPRA_ETIQUETA[c.tipo_documento] ?? c.tipo_documento} ${c.numero_documento ?? ''}`.trim(),
        fechaCorta(c.vence),
        formatearCelda(c.pendiente, 'pesos'),
      ]));
    }
  });
  return { buffer, nombre: `resumen-${slug(p.nombre) || proveedorId}-${datos.hasta}.pdf` };
}
