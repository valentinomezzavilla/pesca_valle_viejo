/**
 * Comprobantes: el "papel" que documenta una venta. Hoy solo TICKET_INTERNO (no fiscal).
 * Para sumar facturación electrónica: agregar un emisor (ej. emitirFacturaB) que pida el CAE a ARCA,
 * lo guarde en datos_fiscales y lo llame ventas.service según configuración. Ventas no cambia.
 */
import { LEYENDA_COMPROBANTE_INTERNO } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNoEncontrado } from '../../lib/errores.js';
import * as configuracion from '../configuracion/configuracion.service.js';

async function siguienteNumero(trx, tipo, puntoVenta) {
  await trx('numeradores').insert({ tipo, punto_venta: puntoVenta }).onConflict(['tipo', 'punto_venta']).ignore();
  // UPDATE ... RETURNING bloquea la fila hasta el fin de la transacción → numeración sin huecos ni repetidos
  const [fila] = await trx('numeradores')
    .where({ tipo, punto_venta: puntoVenta })
    .increment('ultimo_numero', 1)
    .returning('ultimo_numero');
  return fila.ultimo_numero;
}

export async function emitirTicketInterno(trx, venta, cliente = null) {
  const puntoVenta = Number(await configuracion.obtener(trx, 'punto_venta')) || 1;
  const numero = await siguienteNumero(trx, 'TICKET_INTERNO', puntoVenta);
  const [comprobante] = await trx('comprobantes')
    .insert({
      venta_id: venta.id,
      tipo: 'TICKET_INTERNO',
      punto_venta: puntoVenta,
      numero,
      total: venta.total,
      receptor: cliente ? JSON.stringify({ nombre: cliente.nombre, documento: cliente.documento }) : null,
      leyenda: LEYENDA_COMPROBANTE_INTERNO,
    })
    .returning('*');
  return comprobante;
}

export function anularDeVenta(trx, ventaId) {
  return trx('comprobantes').where({ venta_id: ventaId, estado: 'EMITIDO' }).update({ estado: 'ANULADO', anulado_en: trx.fn.now() });
}

export function numeroFormateado(c) {
  return `${String(c.punto_venta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`;
}

/** Todo lo necesario para imprimir el ticket. */
export async function paraImprimir(id) {
  const c = await db('comprobantes').where({ id }).first();
  if (!c) throw new ErrorNoEncontrado('El comprobante');
  const [venta, items, pagos, config] = await Promise.all([
    db('ventas as v').join('usuarios as u', 'u.id', 'v.usuario_id').select('v.*', 'u.nombre as cajero').where('v.id', c.venta_id).first(),
    db('venta_items').where({ venta_id: c.venta_id }).orderBy('id'),
    db('venta_pagos').where({ venta_id: c.venta_id }).orderBy('id'),
    configuracion.obtenerTodo(),
  ]);
  return {
    comprobante: { ...c, numero_formateado: numeroFormateado(c) },
    negocio: config.negocio,
    ancho: config.ticket_ancho,
    venta: {
      id: venta.id,
      fecha: venta.fecha,
      cajero: venta.cajero,
      subtotal: venta.subtotal,
      descuento_items: venta.descuento_items,
      descuento_global: venta.descuento_global,
      total: venta.total,
      vuelto: venta.vuelto,
      estado: venta.estado,
    },
    items: items.map((i) => ({
      descripcion: i.descripcion,
      unidad: i.unidad,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
      descuento: i.descuento,
    })),
    pagos: pagos.map((p) => ({ medio: p.medio, monto: p.monto })),
    cliente: c.receptor ?? null,
  };
}

export async function registrarReimpresion(id) {
  const n = await db('comprobantes').where({ id }).increment('reimpresiones', 1);
  if (!n) throw new ErrorNoEncontrado('El comprobante');
  return paraImprimir(id);
}
