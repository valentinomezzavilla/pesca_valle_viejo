import { Router } from 'express';
import { z } from 'zod';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import * as service from './auditoria.service.js';

const filtros = z.object({
  usuario_id: z.coerce.number().int().positive().optional(),
  entidad: z.string().max(50).optional(),
  accion: z.string().max(50).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(500).default(100),
});

export const auditoriaRouter = Router();

auditoriaRouter.get('/', requierePermiso('auditoria.ver'), validar(filtros, 'query'), async (req, res) => {
  res.json(await service.listar(req.datos));
});
