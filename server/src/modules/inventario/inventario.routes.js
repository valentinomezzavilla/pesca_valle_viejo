import { Router } from 'express';
import { esquemaInventarioNuevo, esquemaConteo, esquemaCerrarInventario } from '@pescaderia/shared';
import { requierePermiso, puede } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx, sinCostos } from '../../lib/http.js';
import * as service from './inventario.service.js';

export const inventarioRouter = Router();
const contar = requierePermiso('inventario.contar');
const cerrar = requierePermiso('inventario.cerrar');
const verCostos = (req) => puede(req, 'costos.ver');

inventarioRouter.get('/', contar, async (req, res) => {
  res.json(await service.listar());
});

inventarioRouter.get('/:id', contar, async (req, res) => {
  res.json(sinCostos(await service.obtener(Number(req.params.id)), verCostos(req)));
});

inventarioRouter.post('/', contar, validar(esquemaInventarioNuevo), async (req, res) => {
  res.status(201).json(await service.iniciar(ctx(req), req.datos));
});

inventarioRouter.put('/:id/items/:productoId', contar, validar(esquemaConteo), async (req, res) => {
  res.json(sinCostos(await service.contar(ctx(req), Number(req.params.id), Number(req.params.productoId), req.datos), verCostos(req)));
});

inventarioRouter.post('/:id/cerrar', cerrar, validar(esquemaCerrarInventario), async (req, res) => {
  res.json(await service.cerrar(ctx(req), Number(req.params.id), req.datos));
});

inventarioRouter.post('/:id/cancelar', cerrar, async (req, res) => {
  res.json(await service.cancelar(ctx(req), Number(req.params.id)));
});
