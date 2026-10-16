import { Router } from 'express';
import { esquemaCompra, esquemaAnulacion, esquemaListado } from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx } from '../../lib/http.js';
import * as service from './compras.service.js';

export const comprasRouter = Router();

comprasRouter.get('/', requierePermiso('compras.crear'), validar(esquemaListado, 'query'), async (req, res) => {
  res.json(await service.listar(req.datos));
});

comprasRouter.get('/:id', requierePermiso('compras.crear'), async (req, res) => {
  res.json(await service.obtener(Number(req.params.id)));
});

comprasRouter.post('/', requierePermiso('compras.crear'), validar(esquemaCompra), async (req, res) => {
  res.status(201).json(await service.crear(ctx(req), req.datos));
});

comprasRouter.post('/:id/anular', requierePermiso('compras.anular'), validar(esquemaAnulacion), async (req, res) => {
  res.json(await service.anular(ctx(req), Number(req.params.id), req.datos));
});
