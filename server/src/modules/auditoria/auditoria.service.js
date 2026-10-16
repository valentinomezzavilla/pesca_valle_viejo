import { db } from '../../config/db.js';
import * as repo from './auditoria.repository.js';

/**
 * Registra una acción sensible. Se llama DENTRO de la transacción de la operación:
 * si la operación falla, tampoco queda el registro (y viceversa).
 */
export function registrar(trx, ctx, { accion, entidad, entidadId = null, antes = null, despues = null, motivo = null, autorizadoPorId = null }) {
  return repo.insertar(trx, {
    usuario_id: ctx.usuario?.id ?? null,
    autorizado_por_id: autorizadoPorId && autorizadoPorId !== ctx.usuario?.id ? autorizadoPorId : null,
    accion,
    entidad,
    entidad_id: entidadId,
    datos_antes: antes ? JSON.stringify(antes) : null,
    datos_despues: despues ? JSON.stringify(despues) : null,
    motivo,
    ip: ctx.ip ?? null,
  });
}

export function listar(filtros) {
  return repo.listar(db, filtros);
}
