import { Router } from 'express';
import * as service from './comprobantes.service.js';

export const comprobantesRouter = Router();

comprobantesRouter.get('/:id', async (req, res) => {
  res.json(await service.paraImprimir(Number(req.params.id)));
});

comprobantesRouter.post('/:id/reimpresion', async (req, res) => {
  res.json(await service.registrarReimpresion(Number(req.params.id)));
});
