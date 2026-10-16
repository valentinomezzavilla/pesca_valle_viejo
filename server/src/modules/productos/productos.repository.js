export function listar(trx, { q, categoria_id, activo = 'true' }) {
  const query = trx('productos as p')
    .join('categorias as c', 'c.id', 'p.categoria_id')
    .select('p.*', 'c.nombre as categoria')
    .orderBy([{ column: 'c.orden' }, { column: 'p.nombre' }]);
  if (activo !== 'todos') query.where('p.activo', activo === 'true');
  if (categoria_id) query.where('p.categoria_id', categoria_id);
  if (q) query.where((w) => w.whereILike('p.nombre', `%${q}%`).orWhereILike('p.codigo', `${q}%`));
  return query;
}

export function buscarPorId(trx, id) {
  return trx('productos as p')
    .join('categorias as c', 'c.id', 'p.categoria_id')
    .select('p.*', 'c.nombre as categoria')
    .where('p.id', id)
    .first();
}

export function lotesVigentes(trx, productoId) {
  return trx('lotes')
    .where('producto_id', productoId)
    .where('cantidad_actual', '>', 0)
    .orderBy([{ column: 'fecha_ingreso' }, { column: 'id' }]);
}

export async function insertar(trx, datos) {
  const [fila] = await trx('productos').insert(datos).returning('*');
  return fila;
}

export async function actualizar(trx, id, datos) {
  const [fila] = await trx('productos').where({ id }).update(datos).returning('*');
  return fila;
}

export function registrarCambioPrecio(trx, { producto_id, precio_anterior, precio_nuevo, usuario_id }) {
  return trx('productos_precios_historial').insert({ producto_id, precio_anterior, precio_nuevo, usuario_id });
}

export function paraPos(trx) {
  return trx('productos')
    .where('activo', true)
    .select('id', 'codigo', 'nombre', 'categoria_id', 'unidad', 'precio_venta', 'stock_actual', 'favorito')
    .orderBy('nombre');
}

// Productos más vendidos de los últimos `dias` días (por cantidad de veces que se vendieron)
export function masVendidos(trx, { dias = 30, limite = 12 }) {
  return trx('venta_items as vi')
    .join('ventas as v', 'v.id', 'vi.venta_id')
    .join('productos as p', 'p.id', 'vi.producto_id')
    .where('v.estado', 'CONFIRMADA')
    .where('p.activo', true)
    .whereRaw("v.fecha >= now() - (? || ' days')::interval", [dias])
    .groupBy('vi.producto_id')
    .orderByRaw('COUNT(*) DESC')
    .limit(limite)
    .pluck('vi.producto_id');
}

export function historialPrecios(trx, productoId) {
  return trx('productos_precios_historial as h')
    .join('usuarios as u', 'u.id', 'h.usuario_id')
    .where('h.producto_id', productoId)
    .select('h.*', 'u.nombre as usuario_nombre')
    .orderBy('h.creado_en', 'desc')
    .limit(100);
}

export function historialCompras(trx, productoId) {
  return trx('compra_items as ci')
    .join('compras as c', 'c.id', 'ci.compra_id')
    .join('proveedores as pr', 'pr.id', 'c.proveedor_id')
    .where('ci.producto_id', productoId)
    .where('c.estado', 'CONFIRMADA')
    .select('c.id as compra_id', 'c.fecha', 'pr.nombre as proveedor', 'ci.cantidad', 'ci.costo_unitario')
    .orderBy([{ column: 'c.fecha', order: 'desc' }, { column: 'c.id', order: 'desc' }])
    .limit(100);
}
