// Levanta un PostgreSQL embebido (PGlite) para los tests si no se indicó TEST_DATABASE_URL.
export default async function setup() {
  if (process.env.TEST_DATABASE_URL) return undefined;
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { iniciarServidorPglite } = await import('../src/db/pgliteServidor.js');
  const db = await PGlite.create({ extensions: { pg_trgm } });
  const servidor = await iniciarServidorPglite({ db, puerto: 54329 });
  return async () => {
    await servidor.detener();
    await db.close();
  };
}
