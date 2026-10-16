import { defineConfig } from 'vitest/config';

// Si hay TEST_DATABASE_URL (ej. el Postgres de test de docker-compose), se usa ese.
// Si no, test/globalSetup.js levanta un PostgreSQL embebido (PGlite) en el puerto 54329.
const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54329/postgres';

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.js',
    setupFiles: ['./test/setup.js'],
    fileParallelism: false, // una sola base: los archivos corren de a uno
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      TZ: 'America/Argentina/Cordoba',
      DATABASE_URL: url,
      DB_POOL_MAX: process.env.TEST_DATABASE_URL ? '5' : '1',
      SESSION_SECRET: 'secreto-de-tests-1234567890',
      ADMIN_USUARIO: 'admin',
      ADMIN_PASSWORD: 'admin1234',
      ADMIN_PIN: '1234',
    },
  },
});
