// Plazo de pago "al finalizar el período": todo lo comprado en la semana o la quincena vence junto al cierre.
// NULL = se usa plazo_pago_dias como siempre.
const PERIODOS = "'SEMANA', 'QUINCENA'";

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE clientes    ADD COLUMN plazo_periodo TEXT CHECK (plazo_periodo IN (${PERIODOS}));
    ALTER TABLE proveedores ADD COLUMN plazo_periodo TEXT CHECK (plazo_periodo IN (${PERIODOS}));
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE clientes    DROP COLUMN plazo_periodo;
    ALTER TABLE proveedores DROP COLUMN plazo_periodo;
  `);
}
