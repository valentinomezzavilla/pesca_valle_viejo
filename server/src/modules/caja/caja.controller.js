import { ErrorPermiso } from '../../lib/errores.js';
import { ctx } from '../../lib/http.js';
import { puede } from '../../middlewares/auth.js';
import * as service from './caja.service.js';

export async function listarCajas(_req, res) {
  res.json(await service.listarCajas());
}

export async function crearCaja(req, res) {
  res.status(201).json(await service.crearCaja(ctx(req), req.datos));
}

export async function actualizarCaja(req, res) {
  res.json(await service.actualizarCaja(ctx(req), Number(req.params.id), req.datos));
}

export async function abrir(req, res) {
  res.status(201).json(await service.abrir(ctx(req), Number(req.params.id), req.datos));
}

export async function actual(req, res) {
  res.json(await service.actualDeCaja(Number(req.params.id)));
}

export async function listarSesiones(req, res) {
  res.json(await service.listarSesiones(req.datos));
}

export async function detalleSesion(req, res) {
  const detalle = await service.detalleSesion(Number(req.params.id));
  // El cajero solo puede ver el detalle de turnos abiertos (el suyo, en el mostrador)
  if (!puede(req, 'caja.historial') && detalle.sesion.estado !== 'ABIERTA') throw new ErrorPermiso();
  res.json(detalle);
}

export async function movimientoManual(req, res) {
  res.status(201).json(await service.movimientoManual(ctx(req), Number(req.params.id), req.datos));
}

export async function resumenCierre(req, res) {
  res.json(await service.resumenCierre(Number(req.params.id)));
}

export async function cerrar(req, res) {
  res.json(await service.cerrar(ctx(req), Number(req.params.id), req.datos));
}

export async function listarCategoriasGasto(_req, res) {
  res.json(await service.listarCategoriasGasto());
}

export async function crearCategoriaGasto(req, res) {
  res.status(201).json(await service.guardarCategoriaGasto(null, req.datos));
}

export async function actualizarCategoriaGasto(req, res) {
  res.json(await service.guardarCategoriaGasto(Number(req.params.id), req.datos));
}
