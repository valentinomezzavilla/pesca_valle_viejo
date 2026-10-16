// Postgres embebido para desarrollo, sin instalar nada (PGlite = PostgreSQL compilado a WebAssembly).
// Guarda los datos en ./.pgdata y escucha en el puerto 54320. Acepta UNA conexión: usar DB_POOL_MAX=1.
// En producción se usa PostgreSQL real (Docker Compose).
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { fileURLToPath } from 'node:url';
import { iniciarServidorPglite } from '../src/db/pgliteServidor.js';

const directorio = fileURLToPath(new URL('../../.pgdata', import.meta.url));
const puerto = Number(process.env.PG_LOCAL_PORT ?? 54320);

const db = await PGlite.create(directorio, { extensions: { pg_trgm } });
const servidor = await iniciarServidorPglite({ db, puerto });
console.log(`Postgres local escuchando en 127.0.0.1:${puerto} (datos en .pgdata). Ctrl+C para cortar.`);

const cerrar = async () => {
  await servidor.detener();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
