import bcrypt from 'bcryptjs';
import { permisosDeRol, tienePermiso } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorApp, ErrorNegocio, ErrorRequierePin } from '../../lib/errores.js';
import * as usuariosRepo from '../usuarios/usuarios.repository.js';
import * as auditoria from '../auditoria/auditoria.service.js';

// Hash fijo para comparar aunque el usuario no exista (mismo tiempo de respuesta → no revela usuarios).
const HASH_FALSO = bcrypt.hashSync('no-existe', 10);

export async function login({ usuario, password }) {
  const u = await usuariosRepo.buscarPorUsuario(db, usuario);
  const ok = await bcrypt.compare(password, u?.password_hash ?? HASH_FALSO);
  if (!u || !ok || !u.activo) {
    throw new ErrorApp('Usuario o contraseña incorrectos.', { codigo: 'LOGIN_INCORRECTO', status: 401 });
  }
  await db('usuarios').where({ id: u.id }).update({ ultimo_acceso: db.fn.now() });
  return perfil(u);
}

export function perfil(u) {
  return { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, permisos: permisosDeRol(u.rol) };
}

export async function cambiarPassword(ctx, { actual, nueva }) {
  const u = await usuariosRepo.buscarPorId(db, ctx.usuario.id);
  if (!(await bcrypt.compare(actual, u.password_hash))) throw new ErrorNegocio('La contraseña actual no es correcta.', 'PASSWORD_INCORRECTA', 400);
  await db.transaction(async (trx) => {
    await usuariosRepo.actualizar(trx, u.id, { password_hash: await bcrypt.hash(nueva, 10) });
    await auditoria.registrar(trx, ctx, { accion: 'PASSWORD_CAMBIADA', entidad: 'usuario', entidadId: u.id });
  });
}

export async function cambiarPin(ctx, { password, pin }) {
  const u = await usuariosRepo.buscarPorId(db, ctx.usuario.id);
  if (!(await bcrypt.compare(password, u.password_hash))) throw new ErrorNegocio('La contraseña no es correcta.', 'PASSWORD_INCORRECTA', 400);
  await db.transaction(async (trx) => {
    await usuariosRepo.actualizar(trx, u.id, { pin_hash: await bcrypt.hash(pin, 10) });
    await auditoria.registrar(trx, ctx, { accion: 'PIN_CAMBIADO', entidad: 'usuario', entidadId: u.id });
  });
}

// ---------------------------------------------------------------------------
// Autorización con PIN del dueño (al lado del cajero).
// Bloqueo simple en memoria contra fuerza bruta: 5 PIN erróneos → 10 minutos bloqueado por usuario.
// ---------------------------------------------------------------------------
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 10 * 60 * 1000;
const intentos = new Map(); // usuarioId -> { fallos, hasta }

function verificarBloqueo(usuarioId) {
  const reg = intentos.get(usuarioId);
  if (reg?.hasta && reg.hasta > Date.now()) {
    throw new ErrorNegocio('Se ingresó mal el PIN demasiadas veces. Esperá 10 minutos.', 'PIN_BLOQUEADO', 429);
  }
}

function registrarFallo(usuarioId) {
  const reg = intentos.get(usuarioId) ?? { fallos: 0, hasta: 0 };
  reg.fallos += 1;
  if (reg.fallos >= MAX_INTENTOS) {
    reg.hasta = Date.now() + BLOQUEO_MS;
    reg.fallos = 0;
  }
  intentos.set(usuarioId, reg);
}

/** Devuelve el dueño que corresponde al PIN, o lanza error. */
export async function verificarPin(trx, ctx, pin) {
  verificarBloqueo(ctx.usuario.id);
  const duenos = await usuariosRepo.duenosConPin(trx);
  for (const d of duenos) {
    if (await bcrypt.compare(String(pin), d.pin_hash)) {
      intentos.delete(ctx.usuario.id);
      return { id: d.id, nombre: d.nombre };
    }
  }
  registrarFallo(ctx.usuario.id);
  throw new ErrorNegocio('El PIN no es correcto.', 'PIN_INCORRECTO', 403);
}

/**
 * Si el usuario tiene el permiso, actúa por sí mismo. Si no, necesita el PIN de un dueño.
 * Devuelve el id de quien autoriza (para la auditoría).
 */
export async function autorizar(trx, ctx, permiso, pin, mensaje) {
  if (tienePermiso(ctx.usuario.rol, permiso)) return ctx.usuario.id;
  if (!pin) throw new ErrorRequierePin(mensaje);
  const dueno = await verificarPin(trx, ctx, pin);
  return dueno.id;
}

export function _reiniciarBloqueos() {
  intentos.clear();
}
