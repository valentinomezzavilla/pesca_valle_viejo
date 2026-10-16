const CAMPOS_PUBLICOS = ['id', 'nombre', 'usuario', 'rol', 'activo', 'ultimo_acceso', 'creado_en'];

export function listar(trx) {
  return trx('usuarios')
    .select(...CAMPOS_PUBLICOS, trx.raw('pin_hash IS NOT NULL AS tiene_pin'))
    .orderBy([{ column: 'activo', order: 'desc' }, { column: 'nombre' }]);
}

export function buscarPorId(trx, id) {
  return trx('usuarios').where({ id }).first();
}

export function buscarPorUsuario(trx, usuario) {
  return trx('usuarios').whereRaw('lower(usuario) = lower(?)', [usuario]).first();
}

export async function insertar(trx, datos) {
  const [fila] = await trx('usuarios').insert(datos).returning(CAMPOS_PUBLICOS);
  return fila;
}

export async function actualizar(trx, id, datos) {
  const [fila] = await trx('usuarios').where({ id }).update(datos).returning(CAMPOS_PUBLICOS);
  return fila;
}

export async function contarDuenosActivos(trx, excluirId) {
  const { count } = await trx('usuarios').where({ rol: 'DUENO', activo: true }).whereNot('id', excluirId).count('* as count').first();
  return count;
}

export function duenosConPin(trx) {
  return trx('usuarios').where({ rol: 'DUENO', activo: true }).whereNotNull('pin_hash').select('id', 'nombre', 'pin_hash');
}

export function borrarSesionesDe(trx, usuarioId) {
  return trx('sesiones').whereRaw("(sess->>'usuarioId')::bigint = ?", [usuarioId]).del();
}
