import { aPesos, dec, redondear } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as auth from '../auth/auth.service.js';
import * as configuracion from '../configuracion/configuracion.service.js';
import * as stock from './stock.service.js';

/**
 * Corrige el stock de un producto a la cantidad que realmente hay.
 * Si falta mercadería sale por FIFO; si sobra entra un lote nuevo al último costo conocido.
 * El cajero necesita el PIN del dueño.
 */
export async function ajustar(ctx, { producto_id, cantidad_real, motivo, pinAutorizacion }) {
  return db.transaction(async (trx) => {
    const autorizadoPorId = await auth.autorizar(trx, ctx, 'stock.ajustar', pinAutorizacion);
    const productos = await stock.bloquearProductos(trx, [producto_id]);
    const producto = productos.get(producto_id);
    if (producto.unidad === 'UNIDAD' && !dec(cantidad_real).isInteger()) {
      throw new ErrorNegocio(`"${producto.nombre}" se maneja por unidad: la cantidad tiene que ser entera.`);
    }
    const diferencia = dec(cantidad_real).minus(producto.stock_actual);
    if (diferencia.isZero()) throw new ErrorNegocio('Ya figuraba esa cantidad: no hay nada que corregir.', 'SIN_DIFERENCIA');

    if (diferencia.gt(0)) {
      await stock.ingresar(trx, {
        productoId: producto_id,
        cantidad: diferencia,
        costoUnitario: producto.costo_referencia,
        origenLote: 'AJUSTE',
        tipoMovimiento: 'AJUSTE',
        motivo,
        usuarioId: ctx.usuario.id,
      });
    } else {
      await stock.consumir(trx, {
        productoId: producto_id,
        cantidad: diferencia.neg(),
        tipo: 'AJUSTE',
        origen: {},
        motivo,
        usuarioId: ctx.usuario.id,
      });
    }
    const resultado = {
      producto_id,
      producto: producto.nombre,
      unidad: producto.unidad,
      stock_anterior: dec(producto.stock_actual).toFixed(3),
      stock_nuevo: dec(cantidad_real).toFixed(3),
      diferencia: diferencia.toFixed(3),
      costo_diferencia: aPesos(redondear(diferencia.times(producto.costo_referencia), 2)),
    };
    await auditoria.registrar(trx, ctx, {
      accion: 'STOCK_AJUSTADO',
      entidad: 'producto',
      entidadId: producto_id,
      antes: { stock: resultado.stock_anterior },
      despues: { stock: resultado.stock_nuevo, diferencia: resultado.diferencia },
      motivo,
      autorizadoPorId,
    });
    return resultado;
  });
}

/** Lotes con mercadería de un producto (el más viejo primero). */
export async function lotesDeProducto(productoId) {
  const producto = await db('productos').where({ id: productoId }).first('id');
  if (!producto) throw new ErrorNoEncontrado('El producto');
  return db('lotes')
    .where({ producto_id: productoId })
    .where('cantidad_actual', '>', 0)
    .select('id', 'origen', 'fecha_ingreso', 'fecha_vencimiento', 'cantidad_inicial', 'cantidad_actual', 'costo_unitario')
    .orderBy([{ column: 'fecha_ingreso' }, { column: 'id' }]);
}

/** Historial de movimientos de un producto (de lo más nuevo a lo más viejo). */
export async function movimientosDeProducto(productoId, limite = 100) {
  const producto = await db('productos').where({ id: productoId }).first('id');
  if (!producto) throw new ErrorNoEncontrado('El producto');
  return db('movimientos_stock as m')
    .join('usuarios as u', 'u.id', 'm.usuario_id')
    .where('m.producto_id', productoId)
    .select('m.id', 'm.tipo', 'm.cantidad', 'm.costo_unitario', 'm.lote_id', 'm.motivo', 'm.creado_en', 'u.nombre as usuario_nombre')
    .orderBy('m.id', 'desc')
    .limit(limite);
}

/** Todo lo que requiere atención: reponer, vencimientos, y productos vendidos sin stock cargado. */
export async function alertas() {
  const dias = Number(await configuracion.obtener(db, 'dias_alerta_vencimiento')) || 2;
  const [bajoMinimo, vencimientos, negativos] = await Promise.all([
    db('v_stock_productos')
      .where('stock_minimo', '>', 0)
      .where('stock_actual', '>=', 0)
      .where('bajo_minimo', true)
      .select('id', 'nombre', 'categoria', 'unidad', 'stock_actual', 'stock_minimo')
      .orderBy('nombre'),
    db('lotes as l')
      .join('productos as p', 'p.id', 'l.producto_id')
      .where('l.cantidad_actual', '>', 0)
      .whereNotNull('l.fecha_vencimiento')
      .whereRaw('l.fecha_vencimiento <= current_date + ?::int', [dias])
      .select(
        'l.id as lote_id', 'p.id as producto_id', 'p.nombre as producto', 'p.unidad', 'l.cantidad_actual',
        'l.fecha_vencimiento', 'l.costo_unitario',
        db.raw('(l.fecha_vencimiento - current_date)::int AS dias_restantes'),
      )
      .orderBy([{ column: 'l.fecha_vencimiento' }, { column: 'p.nombre' }]),
    db('productos').where('stock_actual', '<', 0).where('activo', true).select('id', 'nombre', 'unidad', 'stock_actual').orderBy('nombre'),
  ]);
  return {
    dias_alerta: dias,
    bajo_minimo: bajoMinimo,
    vencimientos,
    negativos,
    total: bajoMinimo.length + vencimientos.length + negativos.length,
  };
}
