import { db } from '../../config/db.js';
import { ErrorApp, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import { estadoDeudas } from './deuda.service.js';

/** conSaldos: solo el dueño ve cuánto se le debe y qué está vencido. */
export async function listar({ q, activo = 'true' }, { conSaldos = false } = {}) {
  const query = db('proveedores as p').select('p.*').orderBy('p.nombre');
  if (activo !== 'todos') query.where('p.activo', activo === 'true');
  if (q) query.whereILike('p.nombre', `%${q}%`);
  const lista = await query;
  if (!conSaldos) return lista;
  const estados = await estadoDeudas(db, lista);
  return lista
    .map((p) => {
      const e = estados.get(p.id);
      return { ...p, saldo: e.saldo, vencido: e.vencido, proximo_vencimiento: e.proximo_vencimiento };
    })
    .sort((a, b) => Number(b.vencido) - Number(a.vencido) || a.nombre.localeCompare(b.nombre, 'es'));
}

export async function obtener(id) {
  const p = await db('proveedores').where({ id }).first();
  if (!p) throw new ErrorNoEncontrado('El proveedor');
  return p;
}

async function verificarCuitLibre(trx, cuit, idPropio = null) {
  if (!cuit) return;
  const query = trx('proveedores').whereRaw("regexp_replace(cuit, '[^0-9]', '', 'g') = ?", [cuit.replace(/\D/g, '')]);
  if (idPropio) query.whereNot({ id: idPropio });
  const otro = await query.first('nombre');
  if (otro) {
    const mensaje = `Ese CUIT ya lo tiene ${otro.nombre}.`;
    throw new ErrorApp(mensaje, { codigo: 'CUIT_REPETIDO', status: 409, campos: { cuit: mensaje } });
  }
}

export async function crear(ctx, datos) {
  return db.transaction(async (trx) => {
    await verificarCuitLibre(trx, datos.cuit);
    const [p] = await trx('proveedores').insert(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'PROVEEDOR_CREADO', entidad: 'proveedor', entidadId: p.id, despues: p });
    return p;
  });
}

export async function actualizar(ctx, id, datos) {
  return db.transaction(async (trx) => {
    const antes = await trx('proveedores').where({ id }).first();
    if (!antes) throw new ErrorNoEncontrado('El proveedor');
    await verificarCuitLibre(trx, datos.cuit, id);
    const [p] = await trx('proveedores').where({ id }).update(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'PROVEEDOR_MODIFICADO', entidad: 'proveedor', entidadId: id, antes, despues: p });
    return p;
  });
}
