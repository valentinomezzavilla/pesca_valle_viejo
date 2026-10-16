import { Router } from 'express';
import { esquemaFiltroReporte } from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx } from '../../lib/http.js';
import * as service from './reportes.service.js';

export const reportesRouter = Router();
reportesRouter.use(requierePermiso('reportes.ver'));

reportesRouter.get('/', (_req, res) => {
  res.json(service.catalogo());
});

reportesRouter.get('/panel', async (_req, res) => {
  res.json(await service.panel());
});

// ?formato=json (en pantalla) | xlsx | pdf (descarga)
reportesRouter.get('/:id', validar(esquemaFiltroReporte, 'query'), async (req, res) => {
  const { formato, ...filtros } = req.datos;
  if (formato === 'json') {
    res.json(await service.ejecutar(req.params.id, filtros));
    return;
  }
  const archivo = await service.exportar(ctx(req), req.params.id, filtros, formato);
  res.setHeader('Content-Type', archivo.tipo);
  res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(archivo.buffer);
});
