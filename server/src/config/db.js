import knexLib from 'knex';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { ZONA_HORARIA } from '@pescaderia/shared';
import { env } from './env.js';

// NUMERIC llega como string (se opera con decimal.js). BIGINT (ids, COUNT) como number. DATE como 'YYYY-MM-DD'.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export function crearKnex({ url = env.DATABASE_URL, poolMax = env.DB_POOL_MAX } = {}) {
  return knexLib({
    client: 'pg',
    connection: url,
    pool: {
      min: 0,
      max: poolMax,
      afterCreate(conn, done) {
        conn.query(`SET TIME ZONE '${ZONA_HORARIA}'`, (err) => done(err, conn));
      },
    },
    migrations: {
      directory: fileURLToPath(new URL('../db/migraciones', import.meta.url)),
      tableName: 'knex_migrations',
      loadExtensions: ['.js'],
    },
  });
}

export const db = crearKnex();
