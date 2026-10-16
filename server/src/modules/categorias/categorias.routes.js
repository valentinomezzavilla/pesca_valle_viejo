// Módulo chico: routes + controller juntos, service y repository en un archivo.
import { Router } from 'express';
import { esquemaCategoria } from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { ctx } from '../../lib/http.js';
import * as service from './categorias.service.js';

export const categoriasRouter = Router();

categoriasRouter.get('/', async (_req, res) => {
  res.json(await service.listar());
});

categoriasRouter.post('/', requierePermiso('productos.editar'), validar(esquemaCategoria), async (req, res) => {
  res.status(201).json(await service.crear(ctx(req), req.datos));
});

categoriasRouter.put('/:id', requierePermiso('productos.editar'), validar(esquemaCategoria.partial()), async (req, res) => {
  res.json(await service.actualizar(ctx(req), Number(req.params.id), req.datos));
});
