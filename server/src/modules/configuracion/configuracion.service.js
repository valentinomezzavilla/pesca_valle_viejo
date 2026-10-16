import { db } from '../../config/db.js';
import { CONFIGURACION_INICIAL } from '../../db/seeds.js';
import * as auditoria from '../auditoria/auditoria.service.js';

export async function obtenerTodo(trx = db) {
  const filas = await trx('configuracion').select('clave', 'valor');
  const config = structuredClone(CONFIGURACION_INICIAL);
  for (const f of filas) config[f.clave] = f.valor;
  return config;
}

export async function obtener(trx, clave) {
  const fila = await trx('configuracion').where({ clave }).first('valor');
  return fila ? fila.valor : CONFIGURACION_INICIAL[clave];
}

export async function actualizar(ctx, cambios) {
  return db.transaction(async (trx) => {
    const antes = await obtenerTodo(trx);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === undefined) continue;
      await trx('configuracion')
        .insert({ clave, valor: JSON.stringify(valor) })
        .onConflict('clave')
        .merge();
    }
    if (cambios.punto_venta) {
      await trx('numeradores').insert({ tipo: 'TICKET_INTERNO', punto_venta: cambios.punto_venta }).onConflict(['tipo', 'punto_venta']).ignore();
    }
    const despues = await obtenerTodo(trx);
    await auditoria.registrar(trx, ctx, { accion: 'CONFIGURACION_MODIFICADA', entidad: 'configuracion', antes, despues });
    return despues;
  });
}
