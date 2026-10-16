import { env } from './config/env.js';
import { db } from './config/db.js';
import { logger } from './config/logger.js';
import { crearApp } from './app.js';
import { seedBase } from './db/seeds.js';

// Al arrancar: aplica migraciones pendientes y datos base (idempotente). Así un deploy es "build + restart".
await db.migrate.latest();
await seedBase(db);

const servidor = crearApp().listen(env.PORT, () => {
  logger.info(`Servidor escuchando en http://localhost:${env.PORT} (${env.NODE_ENV}, TZ ${process.env.TZ})`);
});

const apagar = (senal) => {
  logger.info(`${senal} recibido, cerrando...`);
  servidor.close(async () => {
    await db.destroy();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
