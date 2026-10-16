import { Router } from 'express';
import { esquemaVenta, esquemaAnulacion, esquemaFiltroVentas } from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import * as c from './ventas.controller.js';

export const ventasRouter = Router();
ventasRouter.use(requierePermiso('ventas.crear'));

ventasRouter.post('/', validar(esquemaVenta), c.crear);
ventasRouter.get('/', validar(esquemaFiltroVentas, 'query'), c.listar);
ventasRouter.get('/:id', c.obtener);
// El permiso de anular se resuelve en el service: dueño directo, cajero con PIN
ventasRouter.post('/:id/anular', validar(esquemaAnulacion), c.anular);
