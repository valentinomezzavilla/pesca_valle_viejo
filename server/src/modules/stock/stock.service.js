/**
 * Núcleo de stock. TODAS las funciones de escritura reciben `trx` y deben llamarse dentro de una transacción.
 *
 * Invariantes (verificadas por tests y por verificarConsistencia):
 *   1. productos.stock_actual = SUM(movimientos_stock.cantidad) del producto
 *   2. SUM(lotes.cantidad_actual) = GREATEST(productos.stock_actual, 0)
 *      → si el stock está en negativo (se vendió más de lo registrado), todos los lotes están en 0
 *        y el próximo ingreso primero "tapa" ese faltante.
 *
 * Concurrencia: cada operación bloquea la fila del producto (SELECT ... FOR UPDATE). Dos ventas del mismo
 * producto se ordenan solas. Para varios productos, bloquear siempre en orden de id (bloquearProductos).
 */
import { aCantidad, aCosto, dec, minimo, redondear } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';

export async function bloquearProductos(trx, ids) {
  const unicos = [...new Set(ids)].sort((a, b) => a - b);
  const filas = await trx('productos').whereIn('id', unicos).orderBy('id').forUpdate();
  if (filas.length !== unicos.length) throw new ErrorNoEncontrado('Alguno de los productos');
  return new Map(filas.map((f) => [f.id, f]));
}

async function bloquearProducto(trx, productoId) {
  const producto = await trx('productos').where({ id: productoId }).forUpdate().first();
  if (!producto) throw new ErrorNoEncontrado('El producto');
  return producto;
}

/**
 * Descuenta stock por FIFO (lote más viejo primero).
 * origen: { venta_item_id } | { merma_id }
 * Devuelve el costo real de lo consumido y cuánto quedó sin lote (faltante).
 */
export async function consumir(trx, { productoId, cantidad, tipo, origen, usuarioId, permitirNegativo = true, loteId = null, motivo = null }) {
  const producto = await bloquearProducto(trx, productoId);
  const consulta = trx('lotes')
    .where('producto_id', productoId)
    .where('cantidad_actual', '>', 0)
    .orderBy([{ column: 'fecha_ingreso' }, { column: 'id' }])
    .forUpdate();
  // loteId: se descarta de ESE lote (ej. el que se venció) en vez de seguir el orden FIFO
  if (loteId) consulta.where('id', loteId);
  const lotes = await consulta;

  let restante = dec(cantidad);
  const partes = [];
  for (const lote of lotes) {
    if (restante.lte(0)) break;
    const tomar = minimo(restante, lote.cantidad_actual);
    await trx('lotes').where({ id: lote.id }).update({ cantidad_actual: aCantidad(dec(lote.cantidad_actual).minus(tomar)) });
    partes.push({ lote_id: lote.id, cantidad: tomar, costo_unitario: lote.costo_unitario });
    restante = restante.minus(tomar);
  }
  if (restante.gt(0)) {
    if (!permitirNegativo || loteId) {
      throw new ErrorNegocio(
        loteId
          ? `Ese lote de "${producto.nombre}" no tiene tanta cantidad.`
          : `No hay stock suficiente de "${producto.nombre}".`,
        'SIN_STOCK',
      );
    }
    // Venta sin stock registrado: se valoriza al último costo conocido y queda marcada (lote_id NULL)
    partes.push({ lote_id: null, cantidad: restante, costo_unitario: producto.costo_referencia });
  }

  await trx('movimientos_stock').insert(
    partes.map((p) => ({
      producto_id: productoId,
      lote_id: p.lote_id,
      tipo,
      cantidad: aCantidad(p.cantidad.neg()),
      costo_unitario: p.costo_unitario,
      ...origen,
      motivo,
      usuario_id: usuarioId,
    })),
  );
  await trx('productos')
    .where({ id: productoId })
    .update({ stock_actual: aCantidad(dec(producto.stock_actual).minus(cantidad)) });

  const costo = partes.reduce((acc, p) => acc.plus(p.cantidad.times(p.costo_unitario)), dec(0));
  return { costoTotal: redondear(costo, 2), faltante: restante.gt(0) ? restante : dec(0), partes };
}

/**
 * Ingresa mercadería creando un lote nuevo. Si el producto estaba en negativo, el lote primero cubre ese faltante.
 * origenMov: { compra_item_id } | { inventario_item_id } | {} (AJUSTE con motivo)
 */
export async function ingresar(trx, {
  productoId, cantidad, costoUnitario, fechaVencimiento = null, origenLote, compraItemId = null,
  tipoMovimiento, origenMov = {}, motivo = null, usuarioId,
}) {
  const producto = await bloquearProducto(trx, productoId);
  const stock = dec(producto.stock_actual);
  const faltante = stock.lt(0) ? stock.neg() : dec(0);
  const cubre = minimo(faltante, cantidad);

  const [lote] = await trx('lotes')
    .insert({
      producto_id: productoId,
      compra_item_id: compraItemId,
      origen: origenLote,
      fecha_vencimiento: fechaVencimiento,
      cantidad_inicial: aCantidad(cantidad),
      cantidad_actual: aCantidad(dec(cantidad).minus(cubre)),
      costo_unitario: aCosto(costoUnitario),
    })
    .returning('*');

  await trx('movimientos_stock').insert({
    producto_id: productoId,
    lote_id: lote.id,
    tipo: tipoMovimiento,
    cantidad: aCantidad(cantidad),
    costo_unitario: aCosto(costoUnitario),
    ...origenMov,
    motivo,
    usuario_id: usuarioId,
  });
  await trx('productos').where({ id: productoId }).update({ stock_actual: aCantidad(stock.plus(cantidad)) });
  return { lote, faltanteCubierto: cubre };
}

/**
 * Devuelve stock (anulación de venta): vuelve al MISMO lote del que salió, con su costo original.
 * Si salió sin lote (faltante) o el producto está en negativo, se respeta la invariante 2.
 */
export async function devolver(trx, { productoId, cantidad, loteId, costoUnitario, tipo, origenMov, usuarioId }) {
  const producto = await bloquearProducto(trx, productoId);
  const stock = dec(producto.stock_actual);
  const faltante = stock.lt(0) ? stock.neg() : dec(0);
  const resto = dec(cantidad).minus(minimo(faltante, cantidad)); // lo que realmente vuelve a un lote

  let loteDestino = null;
  if (resto.gt(0)) {
    if (loteId) {
      const lote = await trx('lotes').where({ id: loteId }).forUpdate().first();
      await trx('lotes').where({ id: loteId }).update({ cantidad_actual: aCantidad(dec(lote.cantidad_actual).plus(resto)) });
      loteDestino = loteId;
    } else {
      const [lote] = await trx('lotes')
        .insert({
          producto_id: productoId,
          origen: 'AJUSTE',
          cantidad_inicial: aCantidad(resto),
          cantidad_actual: aCantidad(resto),
          costo_unitario: costoUnitario,
        })
        .returning('id');
      loteDestino = lote.id;
    }
  }

  await trx('movimientos_stock').insert({
    producto_id: productoId,
    lote_id: loteDestino,
    tipo,
    cantidad: aCantidad(cantidad),
    costo_unitario: costoUnitario,
    ...origenMov,
    usuario_id: usuarioId,
  });
  await trx('productos').where({ id: productoId }).update({ stock_actual: aCantidad(stock.plus(cantidad)) });
}

/** Retira un lote completo sin consumir (anulación de compra). */
export async function retirarLoteCompleto(trx, { lote, compraItemId, usuarioId }) {
  const producto = await bloquearProducto(trx, lote.producto_id);
  const actual = await trx('lotes').where({ id: lote.id }).forUpdate().first();
  if (!dec(actual.cantidad_actual).eq(actual.cantidad_inicial)) {
    throw new ErrorNegocio(
      `Ya se vendió o usó parte de "${producto.nombre}" de este ingreso, así que no se puede anular. Corregilo con un ajuste de stock.`,
      'LOTE_CONSUMIDO',
    );
  }
  await trx('lotes').where({ id: lote.id }).update({ cantidad_actual: aCantidad(0) });
  await trx('movimientos_stock').insert({
    producto_id: lote.producto_id,
    lote_id: lote.id,
    tipo: 'ANULACION_COMPRA',
    cantidad: aCantidad(dec(actual.cantidad_inicial).neg()),
    costo_unitario: actual.costo_unitario,
    compra_item_id: compraItemId,
    usuario_id: usuarioId,
  });
  await trx('productos')
    .where({ id: lote.producto_id })
    .update({ stock_actual: aCantidad(dec(producto.stock_actual).minus(actual.cantidad_inicial)) });
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export function listar({ q, categoria_id, bajo_minimo }) {
  const query = db('v_stock_productos').select('*').orderBy([{ column: 'categoria' }, { column: 'nombre' }]);
  if (q) query.whereILike('nombre', `%${q}%`);
  if (categoria_id) query.where('categoria_id', categoria_id);
  if (bajo_minimo === 'true') query.where('bajo_minimo', true);
  return query;
}

/** Productos donde las invariantes no se cumplen (debería devolver siempre vacío). */
export function verificarConsistencia(trx = db) {
  return trx
    .select('p.id', 'p.nombre', 'p.stock_actual')
    .select(trx.raw('COALESCE(m.total, 0) AS suma_movimientos'))
    .select(trx.raw('COALESCE(l.total, 0) AS suma_lotes'))
    .from('productos as p')
    .leftJoin(trx('movimientos_stock').select('producto_id').sum('cantidad as total').groupBy('producto_id').as('m'), 'm.producto_id', 'p.id')
    .leftJoin(trx('lotes').select('producto_id').sum('cantidad_actual as total').groupBy('producto_id').as('l'), 'l.producto_id', 'p.id')
    .whereRaw('p.stock_actual <> COALESCE(m.total, 0)')
    .orWhereRaw('GREATEST(p.stock_actual, 0) <> COALESCE(l.total, 0)');
}
