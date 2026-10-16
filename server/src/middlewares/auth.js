import { tienePermiso } from '@pescaderia/shared';
import { db } from '../config/db.js';
import { ErrorNoAutenticado, ErrorPermiso } from '../lib/errores.js';

// Carga el usuario de la sesión en cada request: si lo desactivan, pierde acceso al instante.
export async function cargarUsuario(req, _res, next) {
  const id = req.session?.usuarioId;
  if (id) {
    const u = await db('usuarios').where({ id }).first('id', 'nombre', 'usuario', 'rol', 'activo');
    if (u?.activo) req.usuario = { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol };
    else req.session.usuarioId = null;
  }
  next();
}

export function requiereSesion(req, _res, next) {
  if (!req.usuario) throw new ErrorNoAutenticado();
  next();
}

export const requierePermiso = (permiso) => (req, _res, next) => {
  if (!req.usuario) throw new ErrorNoAutenticado();
  if (!tienePermiso(req.usuario.rol, permiso)) throw new ErrorPermiso();
  next();
};

export const puede = (req, permiso) => !!req.usuario && tienePermiso(req.usuario.rol, permiso);
