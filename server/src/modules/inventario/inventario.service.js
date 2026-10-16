import { aPesos, dec, redondear, sumar } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as stock from '../stock/stock.service.js';

/**
 * Inventario = conteo físico. Al empezar se arma la lista de productos; cada vez que se carga un conteo
 * se toma una foto del stock del sistema en ese momento. Así las ventas que ocurren mientras se cuenta
 * no generan diferencias falsas. Al cerrar, cada diferencia se aplica como movimiento de stock.
 */

export async function listar() {
  return db('inventarios as i')
    .join('usuarios as u', 'u.id', 'i.iniciado_por_id')
    .leftJoin('categorias as c', 'c.id', 'i.categoria_id')
    .select(
      'i.*',
      'u.nombre as iniciado_por',
      'c.nombre as categoria',
      db.raw('(SELECT COUNT(*) FROM inventario_items WHERE inventario_id = i.id)::int AS total_items'),
      db.raw('(SELECT COUNT(*) FROM inventario_items WHERE inventario_id = i.id AND cantidad_contada IS NOT NULL)::int AS contados'),
      db.raw('(SELECT COUNT(*) FROM inventario_items WHERE inventario_id = i.id AND diferencia <> 0)::int AS con_diferencia'),
    )
    .orderBy('i.id', 'desc')
    .limit(50);
}

export async function obtener(id) {
  const inventario = await db('inventarios as i')
    .join('usuarios as u', 'u.id', 'i.iniciado_por_id')
    .leftJoin('usuarios as uc', 'uc.id', 'i.cerrado_por_id')
    .leftJoin('categorias as c', 'c.id', 'i.categoria_id')
    .select('i.*', 'u.nombre as iniciado_por', 'uc.nombre as cerrado_por', 'c.nombre as categoria')
    .where('i.id', id)
    .first();
  if (!inventario) throw new ErrorNoEncontrado('El inventario');
  inventario.items = await db('inventario_items as ii')
    .join('productos as p', 'p.id', 'ii.producto_id')
    .join('categorias as c', 'c.id', 'p.categoria_id')
    .where('ii.inventario_id', id)
    .select('ii.*', 'p.nombre as producto', 'p.unidad', 'c.nombre as categoria')
    .orderBy([{ column: 'c.orden' }, { column: 'c.nombre' }, { column: 'p.nombre' }]);
  return inventario;
}

export async function iniciar(ctx, { categoria_id, observaciones }) {
  return db.transaction(async (trx) => {
    if (categoria_id) {
      const cat = await trx('categorias').where({ id: categoria_id }).first('id');
      if (!cat) throw new ErrorNoEncontrado('La categoría');
    }
    const abierto = await trx('inventarios').where({ estado: 'ABIERTO' }).first('id');
    if (abierto) throw new ErrorNegocio('Ya hay un inventario en curso. Terminalo o cancelalo antes de empezar otro.', 'INVENTARIO_ABIERTO');

    const [inventario] = await trx('inventarios')
      .insert({ categoria_id: categoria_id ?? null, iniciado_por_id: ctx.usuario.id, observaciones: observaciones ?? null })
      .returning('*');
    const productos = await trx('productos')
      .where({ activo: true })
      .modify((q) => categoria_id && q.where({ categoria_id }))
      .select('id', 'stock_actual', 'costo_referencia');
    if (!productos.length) throw new ErrorNegocio('No hay productos para contar en esa categoría.');
    await trx('inventario_items').insert(
      productos.map((p) => ({
        inventario_id: inventario.id,
        producto_id: p.id,
        stock_sistema: p.stock_actual,
        costo_unitario: p.costo_referencia,
      })),
    );
    await auditoria.registrar(trx, ctx, {
      accion: 'INVENTARIO_INICIADO',
      entidad: 'inventario',
      entidadId: inventario.id,
      despues: { categoria_id: categoria_id ?? null, productos: productos.length },
    });
    return inventario;
  });
}

async function inventarioAbierto(trx, id) {
  const inventario = await trx('inventarios').where({ id }).forUpdate().first();
  if (!inventario) throw new ErrorNoEncontrado('El inventario');
  if (inventario.estado !== 'ABIERTO') throw new ErrorNegocio('Ese inventario ya está cerrado.', 'INVENTARIO_CERRADO');
  return inventario;
}

/** Carga (o deshace) el conteo de un producto. Guarda el stock del sistema en este momento. */
export async function contar(ctx, inventarioId, productoId, { cantidad_contada }) {
  return db.transaction(async (trx) => {
    const inventario = await inventarioAbierto(trx, inventarioId);
    const productos = await stock.bloquearProductos(trx, [productoId]);
    const producto = productos.get(productoId);
    if (inventario.categoria_id && inventario.categoria_id !== producto.categoria_id) {
      throw new ErrorNegocio(`"${producto.nombre}" no es de la categoría de este inventario.`);
    }
    if (cantidad_contada !== null && producto.unidad === 'UNIDAD' && !dec(cantidad_contada).isInteger()) {
      throw new ErrorNegocio(`"${producto.nombre}" se cuenta por unidad: la cantidad tiene que ser entera.`);
    }
    const valores =
      cantidad_contada === null
        ? { cantidad_contada: null, contado_por_id: null, contado_en: null }
        : {
            cantidad_contada,
            stock_sistema: producto.stock_actual,
            costo_unitario: producto.costo_referencia,
            contado_por_id: ctx.usuario.id,
            contado_en: trx.fn.now(),
          };
    const existente = await trx('inventario_items').where({ inventario_id: inventarioId, producto_id: productoId }).first('id');
    if (existente) {
      await trx('inventario_items').where({ id: existente.id }).update(valores);
    } else {
      // Producto creado después de empezar el inventario
      await trx('inventario_items').insert({
        inventario_id: inventarioId,
        producto_id: productoId,
        stock_sistema: producto.stock_actual,
        costo_unitario: producto.costo_referencia,
        ...valores,
      });
    }
    return trx('inventario_items').where({ inventario_id: inventarioId, producto_id: productoId }).first();
  });
}

/** Aplica las diferencias al stock y cierra el inventario. Lo no contado no se toca. */
export async function cerrar(ctx, id, { observaciones }) {
  return db.transaction(async (trx) => {
    await inventarioAbierto(trx, id);
    const items = await trx('inventario_items').where({ inventario_id: id }).whereNotNull('cantidad_contada').orderBy('producto_id');
    if (!items.length) throw new ErrorNegocio('Todavía no contaste ningún producto.', 'SIN_CONTEOS');
    const sinContar = Number((await trx('inventario_items').where({ inventario_id: id }).whereNull('cantidad_contada').count('* as n').first()).n);

    await stock.bloquearProductos(trx, items.map((i) => i.producto_id));
    const diferencias = [];
    for (const it of items) {
      const dif = dec(it.diferencia);
      if (dif.isZero()) continue;
      if (dif.gt(0)) {
        await stock.ingresar(trx, {
          productoId: it.producto_id,
          cantidad: dif,
          costoUnitario: it.costo_unitario,
          origenLote: 'INVENTARIO',
          tipoMovimiento: 'INVENTARIO',
          origenMov: { inventario_item_id: it.id },
          usuarioId: ctx.usuario.id,
        });
      } else {
        await stock.consumir(trx, {
          productoId: it.producto_id,
          cantidad: dif.neg(),
          tipo: 'INVENTARIO',
          origen: { inventario_item_id: it.id },
          usuarioId: ctx.usuario.id,
        });
      }
      diferencias.push(redondear(dif.times(it.costo_unitario), 2));
    }
    const [cerrado] = await trx('inventarios')
      .where({ id })
      .update({ estado: 'CERRADO', cerrado_por_id: ctx.usuario.id, cerrado_en: trx.fn.now(), observaciones: observaciones ?? undefined })
      .returning('*');
    const resumen = {
      contados: items.length,
      sin_contar: sinContar,
      ajustados: diferencias.length,
      costo_diferencia: aPesos(sumar(diferencias)),
    };
    await auditoria.registrar(trx, ctx, { accion: 'INVENTARIO_CERRADO', entidad: 'inventario', entidadId: id, despues: resumen, motivo: observaciones ?? null });
    return { ...cerrado, resumen };
  });
}

export async function cancelar(ctx, id) {
  return db.transaction(async (trx) => {
    await inventarioAbierto(trx, id);
    const [cancelado] = await trx('inventarios')
      .where({ id })
      .update({ estado: 'CANCELADO', cerrado_por_id: ctx.usuario.id, cerrado_en: trx.fn.now() })
      .returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'INVENTARIO_CANCELADO', entidad: 'inventario', entidadId: id });
    return cancelado;
  });
}
