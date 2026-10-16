import { afterAll } from 'vitest';
import { db } from '../src/config/db.js';

// Cada archivo de test libera su conexión al terminar (PGlite acepta una sola a la vez)
afterAll(async () => {
  await db.destroy();
});
