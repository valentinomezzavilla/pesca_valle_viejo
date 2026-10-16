import { Router } from 'express';
import { esquemaLogin, esquemaCambioPassword, esquemaCambioPin, esquemaVerificarPin } from '@pescaderia/shared';
import { requiereSesion } from '../../middlewares/auth.js';
import { validar } from '../../middlewares/validar.js';
import { limiteLogin } from '../../middlewares/rateLimit.js';
import * as c from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', limiteLogin, validar(esquemaLogin), c.login);
authRouter.post('/logout', c.logout);
authRouter.get('/yo', requiereSesion, c.yo);
authRouter.put('/mi-password', requiereSesion, validar(esquemaCambioPassword), c.cambiarPassword);
authRouter.put('/mi-pin', requiereSesion, validar(esquemaCambioPin), c.cambiarPin);
authRouter.post('/verificar-pin', requiereSesion, limiteLogin, validar(esquemaVerificarPin), c.verificarPin);
