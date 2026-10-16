import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const respuesta = {
  error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' },
};

export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: respuesta,
  skip: () => env.NODE_ENV === 'test',
});
