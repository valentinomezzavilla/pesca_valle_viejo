import { Router } from 'express';
import { esquemaProducto, esquemaCambioPrecio, esquemaPreciosMasivo, esquemaFavorito, esquemaListado } from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import * as c from './productos.controller.js';

export const productosRouter = Router();
const editar = requierePermiso('productos.editar');

productosRouter.get('/', validar(esquemaListado, 'query'), c.listar);
productosRouter.get('/pos', c.pos);
productosRouter.patch('/precios', editar, validar(esquemaPreciosMasivo), c.cambiarPreciosMasivo);
productosRouter.get('/:id', c.obtener);
productosRouter.get('/:id/historial', requierePermiso('costos.ver'), c.historial);
productosRouter.post('/', editar, validar(esquemaProducto), c.crear);
productosRouter.put('/:id', editar, validar(esquemaProducto.partial()), c.actualizar);
productosRouter.patch('/:id/precio', editar, validar(esquemaCambioPrecio), c.cambiarPrecio);
productosRouter.patch('/:id/favorito', editar, validar(esquemaFavorito), c.marcarFavorito);
