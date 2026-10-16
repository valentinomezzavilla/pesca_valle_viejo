import { Router } from 'express';
import { esquemaUsuarioNuevo, esquemaUsuarioEdicion, esquemaResetPassword } from '@pescaderia/shared';
import { requierePermiso } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import * as c from './usuarios.controller.js';

export const usuariosRouter = Router();
usuariosRouter.use(requierePermiso('usuarios.gestionar'));

usuariosRouter.get('/', c.listar);
usuariosRouter.post('/', validar(esquemaUsuarioNuevo), c.crear);
usuariosRouter.put('/:id', validar(esquemaUsuarioEdicion), c.actualizar);
usuariosRouter.post('/:id/reset-password', validar(esquemaResetPassword), c.resetearPassword);
