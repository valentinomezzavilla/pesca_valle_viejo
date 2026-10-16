import { filtroDias } from '../../lib/fechas.js';

export function insertar(trx, fila) {
  return trx('auditoria').insert(fila);
}

export function listar(trx, { usuario_id, entidad, accion, desde, hasta, pagina = 1, porPagina = 100 }) {
  const q = trx('auditoria as a')
    .leftJoin('usuarios as u', 'u.id', 'a.usuario_id')
    .leftJoin('usuarios as au', 'au.id', 'a.autorizado_por_id')
    .select('a.*', 'u.nombre as usuario_nombre', 'au.nombre as autorizado_por_nombre')
    .orderBy('a.id', 'desc')
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);
  if (usuario_id) q.where('a.usuario_id', usuario_id);
  if (entidad) q.where('a.entidad', entidad);
  if (accion) q.where('a.accion', accion);
  filtroDias(q, 'a.creado_en', { desde, hasta });
  return q;
}
