import { aPesos, dec } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio } from '../../lib/errores.js';
import { filtroDias } from '../../lib/fechas.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as stock from '../stock/stock.service.js';

/**
 * Registra una merma (mercadería que se descarta). Descuenta por FIFO — o del lote indicado, por ejemplo
 * el que se venció — y guarda cuánta plata se perdió según el costo real de lo descartado.
 * No deja descartar más de lo que hay.
 */
export async function registrar(ctx, datos) {
  return db.transaction(async (trx) => {
    const productos = await stock.bloquearProductos(trx, [datos.producto_id]);
    const producto = productos.get(datos.producto_id);
    if (producto.unidad === 'UNIDAD' && !dec(datos.cantidad).isInteger()) {
      throw new ErrorNegocio(`"${producto.nombre}" se maneja por unidad: la cantidad tiene que ser entera.`);
    }
    const [merma] = await trx('mermas')
      .insert({
        producto_id: datos.producto_id,
        cantidad: datos.cantidad,
        motivo: datos.motivo,
        detalle: datos.detalle ?? null,
        usuario_id: ctx.usuario.id,
      })
      .returning('*');
    const consumo = await stock.consumir(trx, {
      productoId: datos.producto_id,
      cantidad: datos.cantidad,
      tipo: 'MERMA',
      origen: { merma_id: merma.id },
      usuarioId: ctx.usuario.id,
      permitirNegativo: false,
      loteId: datos.lote_id ?? null,
    });
    const [final] = await trx('mermas').where({ id: merma.id }).update({ costo_total: aPesos(consumo.costoTotal) }).returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: 'MERMA_REGISTRADA',
      entidad: 'merma',
      entidadId: merma.id,
      despues: { producto: producto.nombre, cantidad: final.cantidad, motivo: final.motivo, costo_total: final.costo_total },
      motivo: datos.detalle ?? null,
    });
    return { ...final, producto: producto.nombre, unidad: producto.unidad };
  });
}

export async function listar({ q, desde, hasta, categoria_id, pagina = 1, porPagina = 100 }) {
  const base = () => {
    const query = db('mermas as m').join('productos as p', 'p.id', 'm.producto_id');
    if (q) query.whereILike('p.nombre', `%${q}%`);
    if (categoria_id) query.where('p.categoria_id', categoria_id);
    return filtroDias(query, 'm.creado_en', { desde, hasta });
  };
  const [mermas, porMotivo] = await Promise.all([
    base()
      .join('usuarios as u', 'u.id', 'm.usuario_id')
      .select('m.*', 'p.nombre as producto', 'p.unidad', 'u.nombre as usuario_nombre')
      .orderBy('m.id', 'desc')
      .limit(porPagina)
      .offset((pagina - 1) * porPagina),
    base()
      .select('m.motivo')
      .count('* as cantidad')
      .sum('m.costo_total as costo_total')
      .groupBy('m.motivo')
      .orderBy('costo_total', 'desc'),
  ]);
  const costoTotal = porMotivo.reduce((acc, f) => acc.plus(f.costo_total ?? 0), dec(0));
  return {
    mermas,
    resumen: {
      cantidad: porMotivo.reduce((acc, f) => acc + Number(f.cantidad), 0),
      costo_total: aPesos(costoTotal),
      por_motivo: porMotivo.map((f) => ({ motivo: f.motivo, cantidad: Number(f.cantidad), costo_total: aPesos(f.costo_total ?? 0) })),
    },
  };
}
