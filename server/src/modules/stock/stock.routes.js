import { Router } from 'express';
import { esquemaAjusteStock, esquemaListado } from '@pescaderia/shared';
import { requierePermiso, puede } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx, sinCostos } from '../../lib/http.js';
import * as service from './stock.service.js';
import * as ajustes from './ajustes.service.js';

export const stockRouter = Router();

stockRouter.get('/', requierePermiso('stock.ver'), validar(esquemaListado, 'query'), async (req, res) => {
  res.json(sinCostos(await service.listar(req.datos), puede(req, 'costos.ver')));
});

stockRouter.get('/consistencia', requierePermiso('costos.ver'), async (_req, res) => {
  const problemas = await service.verificarConsistencia();
  res.json({ ok: problemas.length === 0, problemas });
});

stockRouter.get('/alertas', requierePermiso('stock.ver'), async (req, res) => {
  res.json(sinCostos(await ajustes.alertas(), puede(req, 'costos.ver')));
});

stockRouter.get('/productos/:id/lotes', requierePermiso('stock.ver'), async (req, res) => {
  res.json(sinCostos(await ajustes.lotesDeProducto(Number(req.params.id)), puede(req, 'costos.ver')));
});

stockRouter.get('/productos/:id/movimientos', requierePermiso('stock.ver'), async (req, res) => {
  res.json(sinCostos(await ajustes.movimientosDeProducto(Number(req.params.id)), puede(req, 'costos.ver')));
});

// El permiso se resuelve en el service: dueño directo, cajero con el PIN del dueño
stockRouter.post('/ajustes', requierePermiso('stock.ver'), validar(esquemaAjusteStock), async (req, res) => {
  res.status(201).json(sinCostos(await ajustes.ajustar(ctx(req), req.datos), puede(req, 'costos.ver')));
});
