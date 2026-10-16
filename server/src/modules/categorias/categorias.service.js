import { db } from '../../config/db.js';
import { ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';

export function listar() {
  return db('categorias').select('*').orderBy([{ column: 'orden' }, { column: 'nombre' }]);
}

export async function crear(ctx, datos) {
  return db.transaction(async (trx) => {
    const [fila] = await trx('categorias').insert(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'CATEGORIA_CREADA', entidad: 'categoria', entidadId: fila.id, despues: fila });
    return fila;
  });
}

export async function actualizar(ctx, id, datos) {
  return db.transaction(async (trx) => {
    const antes = await trx('categorias').where({ id }).first();
    if (!antes) throw new ErrorNoEncontrado('La categoría');
    const [fila] = await trx('categorias').where({ id }).update(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'CATEGORIA_MODIFICADA', entidad: 'categoria', entidadId: id, antes, despues: fila });
    return fila;
  });
}
