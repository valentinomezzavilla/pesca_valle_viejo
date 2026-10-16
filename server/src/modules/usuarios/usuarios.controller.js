import { ctx } from '../../lib/http.js';
import * as service from './usuarios.service.js';

export async function listar(_req, res) {
  res.json(await service.listar());
}

export async function crear(req, res) {
  res.status(201).json(await service.crear(ctx(req), req.datos));
}

export async function actualizar(req, res) {
  res.json(await service.actualizar(ctx(req), Number(req.params.id), req.datos));
}

export async function resetearPassword(req, res) {
  await service.resetearPassword(ctx(req), Number(req.params.id), req.datos.password);
  res.status(204).end();
}
