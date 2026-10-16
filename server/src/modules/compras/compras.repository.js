export function listar(trx, { proveedor_id, desde, hasta, pagina = 1, porPagina = 100 }) {
  const q = trx('compras as c')
    .join('proveedores as p', 'p.id', 'c.proveedor_id')
    .join('usuarios as u', 'u.id', 'c.usuario_id')
    .select('c.*', 'p.nombre as proveedor', 'u.nombre as usuario_nombre')
    .orderBy([{ column: 'c.fecha', order: 'desc' }, { column: 'c.id', order: 'desc' }])
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);
  if (proveedor_id) q.where('c.proveedor_id', proveedor_id);
  if (desde) q.where('c.fecha', '>=', desde);
  if (hasta) q.where('c.fecha', '<=', hasta);
  return q;
}

export function buscarPorId(trx, id) {
  return trx('compras as c')
    .join('proveedores as p', 'p.id', 'c.proveedor_id')
    .join('usuarios as u', 'u.id', 'c.usuario_id')
    .leftJoin('usuarios as ua', 'ua.id', 'c.anulada_por_id')
    .select('c.*', 'p.nombre as proveedor', 'u.nombre as usuario_nombre', 'ua.nombre as anulada_por')
    .where('c.id', id)
    .first();
}

export function items(trx, compraId) {
  return trx('compra_items as ci')
    .join('productos as p', 'p.id', 'ci.producto_id')
    .leftJoin('lotes as l', 'l.compra_item_id', 'ci.id')
    .where('ci.compra_id', compraId)
    .select('ci.*', 'p.nombre as producto', 'p.unidad', 'l.id as lote_id', 'l.cantidad_actual as lote_cantidad_actual')
    .orderBy('ci.id');
}

