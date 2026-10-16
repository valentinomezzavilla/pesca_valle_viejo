import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { db } from './config/db.js';
import { logger } from './config/logger.js';
import { KnexSessionStore } from './lib/sessionStore.js';
import { cargarUsuario } from './middlewares/auth.js';
import { manejadorErrores, noEncontrado } from './middlewares/errores.js';
import { rutas } from './routes.js';

const DIST_CLIENTE = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function crearApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(helmet());
  if (env.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => !req.url.startsWith('/api') || req.url === '/api/salud' } }));
  }
  app.use(express.json({ limit: '200kb' }));

  app.use(
    session({
      name: 'pesca.sid',
      store: new KnexSessionStore({ knex: db, limpiezaMs: env.NODE_ENV === 'test' ? 0 : undefined }),
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE,
        maxAge: 12 * 60 * 60 * 1000, // 12 h desde la última actividad
      },
    }),
  );
  app.use(cargarUsuario);

  app.use('/api', rutas);
  app.use('/api', noEncontrado);

  // En producción el mismo Express sirve el frontend compilado (un solo proceso, un solo deploy)
  if (existsSync(DIST_CLIENTE)) {
    app.use(express.static(DIST_CLIENTE, { index: false, maxAge: '7d', setHeaders: (res, ruta) => {
      if (ruta.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    } }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || !req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile('index.html', { root: DIST_CLIENTE });
    });
  }

  app.use(manejadorErrores);
  return app;
}
