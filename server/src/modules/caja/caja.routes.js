import { Router } from 'express';
import {
  esquemaCaja, esquemaCategoriaGasto, esquemaAbrirCaja, esquemaMovimientoCaja, esquemaCerrarCaja, esquemaListado,
} from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import * as c from './caja.controller.js';

const operar = requierePermiso('caja.operar');
const configurar = requierePermiso('caja.configurar');

export const cajasRouter = Router();
cajasRouter.get('/', c.listarCajas);
cajasRouter.post('/', configurar, validar(esquemaCaja), c.crearCaja);
cajasRouter.put('/:id', configurar, validar(esquemaCaja.partial()), c.actualizarCaja);
cajasRouter.post('/:id/abrir', operar, validar(esquemaAbrirCaja), c.abrir);
cajasRouter.get('/:id/actual', operar, c.actual);

export const cajaSesionesRouter = Router();
cajaSesionesRouter.get('/', requierePermiso('caja.historial'), validar(esquemaListado, 'query'), c.listarSesiones);
cajaSesionesRouter.get('/:id', operar, c.detalleSesion);
cajaSesionesRouter.post('/:id/movimientos', operar, validar(esquemaMovimientoCaja), c.movimientoManual);
cajaSesionesRouter.get('/:id/resumen-cierre', operar, c.resumenCierre);
cajaSesionesRouter.post('/:id/cerrar', operar, validar(esquemaCerrarCaja), c.cerrar);

export const categoriasGastoRouter = Router();
categoriasGastoRouter.get('/', c.listarCategoriasGasto);
categoriasGastoRouter.post('/', configurar, validar(esquemaCategoriaGasto), c.crearCategoriaGasto);
categoriasGastoRouter.put('/:id', configurar, validar(esquemaCategoriaGasto.partial()), c.actualizarCategoriaGasto);
