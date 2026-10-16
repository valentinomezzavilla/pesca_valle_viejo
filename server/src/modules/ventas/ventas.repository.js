import { filtroDias } from '../../lib/fechas.js';

export function listar(trx, { desde, hasta, estado, caja_sesion_id, soloSesionesAbiertas, pagina = 1, porPagina = 50 }) {
  const q = trx('ventas as v')
    .join('usuarios as u', 'u.id', 'v.usuario_id')
    .join('caja_sesiones as s', 's.id', 'v.caja_sesion_id')
    .join('cajas as c', 'c.id', 's.caja_id')
    .leftJoin('clientes as cl', 'cl.id', 'v.cliente_id')
    .leftJoin('comprobantes as cp', function unir() {
      this.on('cp.venta_id', 'v.id').andOnVal('cp.tipo', 'TICKET_INTERNO');
    })
    .select(
      'cl.nombre as cliente', 'v.id', 'v.fecha', 'v.total', 'v.costo_total', 'v.estado', 'v.descuento_items', 'v.descuento_global',
      'u.nombre as usuario_nombre', 'c.nombre as caja', 'cp.id as comprobante_id', 'cp.punto_venta', 'cp.numero',
      trx.raw('(SELECT string_agg(DISTINCT medio, \',\') FROM venta_pagos WHERE venta_id = v.id) AS medios'),
      trx.raw('(SELECT COUNT(*) FROM venta_items WHERE venta_id = v.id) AS cantidad_items'),
    )
    .orderBy('v.id', 'desc')
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);
  if (estado) q.where('v.estado', estado);
  if (caja_sesion_id) q.where('v.caja_sesion_id', caja_sesion_id);
  if (soloSesionesAbiertas) q.where('s.estado', 'ABIERTA');
  filtroDias(q, 'v.fecha', { desde, hasta });
  return q;
}

export function totales(trx, filtros) {
  const q = trx('ventas as v')
    .join('caja_sesiones as s', 's.id', 'v.caja_sesion_id')
    .where('v.estado', 'CONFIRMADA')
    .select(trx.raw('COUNT(*) AS cantidad'), trx.raw('COALESCE(SUM(v.total), 0) AS total'), trx.raw('COALESCE(SUM(v.costo_total), 0) AS costo_total'))
    .first();
  if (filtros.caja_sesion_id) q.where('v.caja_sesion_id', filtros.caja_sesion_id);
  if (filtros.soloSesionesAbiertas) q.where('s.estado', 'ABIERTA');
  filtroDias(q, 'v.fecha', filtros);
  return q;
}

export function buscarPorId(trx, id) {
  return trx('ventas as v')
    .join('usuarios as u', 'u.id', 'v.usuario_id')
    .join('caja_sesiones as s', 's.id', 'v.caja_sesion_id')
    .join('cajas as c', 'c.id', 's.caja_id')
    .leftJoin('usuarios as ua', 'ua.id', 'v.anulada_por_id')
    .leftJoin('usuarios as uz', 'uz.id', 'v.anulacion_autorizada_por_id')
    .leftJoin('clientes as cl', 'cl.id', 'v.cliente_id')
    .select('cl.nombre as cliente', 'v.*', 'u.nombre as usuario_nombre', 'c.nombre as caja', 's.estado as caja_estado', 'ua.nombre as anulada_por', 'uz.nombre as autorizada_por')
    .where('v.id', id)
    .first();
}

export const items = (trx, ventaId) => trx('venta_items').where({ venta_id: ventaId }).orderBy('id');
export const pagos = (trx, ventaId) => trx('venta_pagos').where({ venta_id: ventaId }).orderBy('id');
export const comprobantes = (trx, ventaId) => trx('comprobantes').where({ venta_id: ventaId }).orderBy('id');

export function movimientosStockDeVenta(trx, ventaId) {
  return trx('movimientos_stock as m')
    .join('venta_items as vi', 'vi.id', 'm.venta_item_id')
    .where('vi.venta_id', ventaId)
    .where('m.tipo', 'VENTA')
    .select('m.*')
    .orderBy([{ column: 'm.producto_id' }, { column: 'm.id' }]);
}
