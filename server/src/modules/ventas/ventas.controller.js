import { ErrorPermiso } from '../../lib/errores.js';
import { ctx, sinCostos } from '../../lib/http.js';
import { puede } from '../../middlewares/auth.js';
import * as service from './ventas.service.js';

export async function crear(req, res) {
  const resultado = await service.crear(ctx(req), req.datos);
  res.status(201).json(sinCostos(resultado, puede(req, 'costos.ver')));
}

export async function listar(req, res) {
  // El cajero ve solo las ventas de los turnos abiertos
  const filtros = puede(req, 'ventas.ver_todas') ? req.datos : { ...req.datos, soloSesionesAbiertas: true };
  res.json(sinCostos(await service.listar(filtros), puede(req, 'costos.ver')));
}

export async function obtener(req, res) {
  const venta = await service.obtener(Number(req.params.id));
  if (!puede(req, 'ventas.ver_todas') && venta.caja_estado !== 'ABIERTA') throw new ErrorPermiso();
  res.json(sinCostos(venta, puede(req, 'costos.ver')));
}

export async function anular(req, res) {
  res.json(sinCostos(await service.anular(ctx(req), Number(req.params.id), req.datos), puede(req, 'costos.ver')));
}
