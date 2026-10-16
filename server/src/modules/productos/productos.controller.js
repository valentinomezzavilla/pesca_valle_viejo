import { ctx, sinCostos } from '../../lib/http.js';
import { puede } from '../../middlewares/auth.js';
import * as service from './productos.service.js';

export async function listar(req, res) {
  res.json(sinCostos(await service.listar(req.datos), puede(req, 'costos.ver')));
}

export async function pos(_req, res) {
  res.json(await service.datosPos());
}

export async function obtener(req, res) {
  res.json(sinCostos(await service.obtener(Number(req.params.id)), puede(req, 'costos.ver')));
}

export async function crear(req, res) {
  res.status(201).json(await service.crear(ctx(req), req.datos));
}

export async function actualizar(req, res) {
  res.json(await service.actualizar(ctx(req), Number(req.params.id), req.datos));
}

export async function cambiarPrecio(req, res) {
  res.json(await service.cambiarPrecio(ctx(req), Number(req.params.id), req.datos.precio_venta));
}

export async function cambiarPreciosMasivo(req, res) {
  res.json(await service.cambiarPreciosMasivo(ctx(req), req.datos));
}

export async function marcarFavorito(req, res) {
  res.json(await service.marcarFavorito(ctx(req), Number(req.params.id), req.datos.favorito));
}

export async function historial(req, res) {
  res.json(await service.historial(Number(req.params.id)));
}
