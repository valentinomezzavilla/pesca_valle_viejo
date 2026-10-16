import { db } from '../../config/db.js';
import { ctx } from '../../lib/http.js';
import * as service from './auth.service.js';

export async function login(req, res, next) {
  const usuario = await service.login(req.datos);
  // Sesión nueva en cada login (evita fijación de sesión)
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.usuarioId = usuario.id;
    req.session.save((err2) => (err2 ? next(err2) : res.json(usuario)));
  });
}

export function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('pesca.sid');
    res.status(204).end();
  });
}

export function yo(req, res) {
  res.json(service.perfil(req.usuario));
}

export async function cambiarPassword(req, res) {
  await service.cambiarPassword(ctx(req), req.datos);
  res.status(204).end();
}

export async function cambiarPin(req, res) {
  await service.cambiarPin(ctx(req), req.datos);
  res.status(204).end();
}

export async function verificarPin(req, res) {
  const dueno = await service.verificarPin(db, ctx(req), req.datos.pin);
  res.json({ ok: true, nombre: dueno.nombre });
}
