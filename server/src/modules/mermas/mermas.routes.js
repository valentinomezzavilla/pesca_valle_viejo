import { Router } from 'express';
import { esquemaMerma, esquemaListado } from '@pescaderia/shared';
import { requierePermiso, puede } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx, sinCostos } from '../../lib/http.js';
import * as service from './mermas.service.js';

export const mermasRouter = Router();
mermasRouter.use(requierePermiso('mermas.registrar'));

mermasRouter.get('/', validar(esquemaListado, 'query'), async (req, res) => {
  res.json(sinCostos(await service.listar(req.datos), puede(req, 'costos.ver')));
});

mermasRouter.post('/', validar(esquemaMerma), async (req, res) => {
  res.status(201).json(sinCostos(await service.registrar(ctx(req), req.datos), puede(req, 'costos.ver')));
});
