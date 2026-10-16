// Uso: node src/db/cli.js migrar | seed | demo | rollback
import { db } from '../config/db.js';
import { seedBase } from './seeds.js';
import { seedDemo } from './demo.js';

const comando = process.argv[2];

try {
  if (comando === 'migrar' || comando === 'seed' || comando === 'demo') {
    const [, aplicadas] = await db.migrate.latest();
    console.log(aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'La base ya está al día.');
  }
  if (comando === 'seed' || comando === 'demo') {
    await seedBase(db);
    console.log('Datos base listos.');
  }
  if (comando === 'demo') {
    await seedDemo(db);
  }
  if (comando === 'rollback') {
    await db.migrate.rollback(undefined, true);
    console.log('Migraciones revertidas.');
  }
  if (!['migrar', 'seed', 'demo', 'rollback'].includes(comando)) {
    console.log('Uso: node src/db/cli.js migrar | seed | demo | rollback');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
