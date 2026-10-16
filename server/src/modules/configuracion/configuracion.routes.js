import { Router } from 'express';
import { esquemaConfiguracion } from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx } from '../../lib/http.js';
import * as service from './configuracion.service.js';

export const configuracionRouter = Router();

configuracionRouter.get('/', async (_req, res) => {
  res.json(await service.obtenerTodo());
});

configuracionRouter.put('/', requierePermiso('configuracion.editar'), validar(esquemaConfiguracion), async (req, res) => {
  res.json(await service.actualizar(ctx(req), req.datos));
});
