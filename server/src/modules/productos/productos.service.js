import { aPesos, dec, redondearAMultiplo } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as repo from './productos.repository.js';

export function listar(filtros) {
  return repo.listar(db, filtros);
}

export async function obtener(id) {
  const producto = await repo.buscarPorId(db, id);
  if (!producto) throw new ErrorNoEncontrado('El producto');
  producto.lotes = await repo.lotesVigentes(db, id);
  return producto;
}

export async function datosPos() {
  const [productos, masVendidos] = await Promise.all([repo.paraPos(db), repo.masVendidos(db, {})]);
  return { productos, masVendidos };
}

export async function crear(ctx, datos) {
  return db.transaction(async (trx) => {
    const producto = await repo.insertar(trx, datos);
    await auditoria.registrar(trx, ctx, { accion: 'PRODUCTO_CREADO', entidad: 'producto', entidadId: producto.id, despues: producto });
    return producto;
  });
}

async function aplicarCambioPrecio(trx, ctx, producto, precioNuevo) {
  if (dec(producto.precio_venta).eq(precioNuevo)) return producto;
  const actualizado = await repo.actualizar(trx, producto.id, { precio_venta: aPesos(precioNuevo) });
  await repo.registrarCambioPrecio(trx, {
    producto_id: producto.id,
    precio_anterior: producto.precio_venta,
    precio_nuevo: actualizado.precio_venta,
    usuario_id: ctx.usuario.id,
  });
  await auditoria.registrar(trx, ctx, {
    accion: 'PRECIO_MODIFICADO',
    entidad: 'producto',
    entidadId: producto.id,
    antes: { precio_venta: producto.precio_venta },
    despues: { precio_venta: actualizado.precio_venta },
  });
  return actualizado;
}

export async function actualizar(ctx, id, datos) {
  return db.transaction(async (trx) => {
    const antes = await trx('productos').where({ id }).forUpdate().first();
    if (!antes) throw new ErrorNoEncontrado('El producto');
    if (datos.unidad && datos.unidad !== antes.unidad) {
      const { count } = await trx('venta_items').where('producto_id', id).count('* as count').first();
      if (count > 0) throw new ErrorNegocio('No se puede cambiar la unidad de un producto que ya tiene ventas. Creá un producto nuevo.');
    }
    const { precio_venta, ...resto } = datos;
    let producto = Object.keys(resto).length ? await repo.actualizar(trx, id, resto) : antes;
    if (precio_venta !== undefined) producto = await aplicarCambioPrecio(trx, ctx, producto, precio_venta);
    if (Object.keys(resto).length) {
      await auditoria.registrar(trx, ctx, { accion: 'PRODUCTO_MODIFICADO', entidad: 'producto', entidadId: id, antes, despues: producto });
    }
    return producto;
  });
}

export async function cambiarPrecio(ctx, id, precio) {
  return db.transaction(async (trx) => {
    const producto = await trx('productos').where({ id }).forUpdate().first();
    if (!producto) throw new ErrorNoEncontrado('El producto');
    return aplicarCambioPrecio(trx, ctx, producto, precio);
  });
}

/** Cambio masivo: lista explícita de precios, o un % sobre una categoría con redondeo opcional. */
export async function cambiarPreciosMasivo(ctx, datos) {
  return db.transaction(async (trx) => {
    let cambios;
    if (datos.items) {
      cambios = datos.items.map((i) => ({ id: i.id, precio: dec(i.precio_venta) }));
    } else {
      const productos = await trx('productos').where({ categoria_id: datos.categoria_id, activo: true }).select('id', 'precio_venta');
      const factor = dec(100).plus(datos.porcentaje).div(100);
      cambios = productos.map((p) => ({ id: p.id, precio: redondearAMultiplo(dec(p.precio_venta).times(factor), datos.redondeo) }));
    }
    const ids = cambios.map((c) => c.id).sort((a, b) => a - b);
    const productos = await trx('productos').whereIn('id', ids).orderBy('id').forUpdate();
    if (productos.length !== new Set(ids).size) throw new ErrorNoEncontrado('Alguno de los productos');
    const porId = new Map(productos.map((p) => [p.id, p]));
    const resultado = [];
    for (const c of cambios) resultado.push(await aplicarCambioPrecio(trx, ctx, porId.get(c.id), c.precio));
    return resultado;
  });
}

export async function marcarFavorito(ctx, id, favorito) {
  const producto = await repo.actualizar(db, id, { favorito });
  if (!producto) throw new ErrorNoEncontrado('El producto');
  return producto;
}

export async function historial(id) {
  const [precios, compras] = await Promise.all([repo.historialPrecios(db, id), repo.historialCompras(db, id)]);
  return { precios, compras };
}
