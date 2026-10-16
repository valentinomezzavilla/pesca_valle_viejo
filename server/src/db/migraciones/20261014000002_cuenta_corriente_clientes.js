// Cuenta corriente de clientes: se habilita por cliente, tiene plazo de pago y los cobros se pueden anular.
const TIPOS_CC = ['VENTA', 'PAGO', 'ANULACION_VENTA', 'AJUSTE', 'ANULACION_PAGO'];
const TIPOS_CAJA = [
  'APERTURA', 'VENTA', 'ANULACION_VENTA', 'COBRO_CLIENTE', 'ANULACION_COBRO_CLIENTE',
  'PAGO_PROVEEDOR', 'ANULACION_PAGO_PROVEEDOR', 'GASTO', 'RETIRO', 'INGRESO',
];
const lista = (xs) => xs.map((x) => `'${x}'`).join(', ');

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE clientes
      ADD COLUMN cuenta_corriente BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN plazo_pago_dias  INTEGER NOT NULL DEFAULT 0 CHECK (plazo_pago_dias BETWEEN 0 AND 365);

    ALTER TABLE cc_clientes_movimientos
      ADD COLUMN anula_movimiento_id BIGINT UNIQUE REFERENCES cc_clientes_movimientos(id),
      DROP CONSTRAINT cc_clientes_movimientos_tipo_check,
      ADD CONSTRAINT cc_clientes_movimientos_tipo_check CHECK (tipo IN (${lista(TIPOS_CC)})),
      DROP CONSTRAINT ck_cc_cli_signo,
      ADD CONSTRAINT ck_cc_cli_signo CHECK (
        CASE tipo
          WHEN 'VENTA'           THEN importe > 0
          WHEN 'PAGO'            THEN importe < 0
          WHEN 'ANULACION_VENTA' THEN importe < 0
          WHEN 'ANULACION_PAGO'  THEN importe > 0
          ELSE true
        END
      ),
      ADD CONSTRAINT ck_cc_cli_anula CHECK ((tipo = 'ANULACION_PAGO') = (anula_movimiento_id IS NOT NULL)),
      -- La anulación de un cobro siempre saca la plata de una caja
      ADD CONSTRAINT ck_cc_cli_anula_caja CHECK (tipo <> 'ANULACION_PAGO' OR caja_movimiento_id IS NOT NULL);

    ALTER TABLE caja_movimientos
      DROP CONSTRAINT caja_movimientos_tipo_check,
      ADD CONSTRAINT caja_movimientos_tipo_check CHECK (tipo IN (${lista(TIPOS_CAJA)})),
      DROP CONSTRAINT ck_caja_mov_signo,
      ADD CONSTRAINT ck_caja_mov_signo CHECK (
        CASE tipo
          WHEN 'APERTURA'                 THEN importe > 0
          WHEN 'VENTA'                    THEN importe > 0
          WHEN 'COBRO_CLIENTE'            THEN importe > 0
          WHEN 'INGRESO'                  THEN importe > 0
          WHEN 'ANULACION_PAGO_PROVEEDOR' THEN importe > 0
          WHEN 'ANULACION_VENTA'          THEN importe < 0
          WHEN 'ANULACION_COBRO_CLIENTE'  THEN importe < 0
          WHEN 'PAGO_PROVEEDOR'           THEN importe < 0
          WHEN 'GASTO'                    THEN importe < 0
          WHEN 'RETIRO'                   THEN importe < 0
        END
      );
  `);
  await habilitarClientesExistentes(knex);
}

/**
 * Los clientes que ya fiaban (o tenían límite de crédito) quedan con la cuenta corriente habilitada,
 * con 30 días de plazo: con 0, el primer día toda la deuda vieja figuraría vencida. El dueño lo ajusta después.
 */
export async function habilitarClientesExistentes(knex) {
  await knex.raw(`
    UPDATE clientes c SET cuenta_corriente = true, plazo_pago_dias = 30
     WHERE c.limite_credito IS NOT NULL
        OR EXISTS (SELECT 1 FROM cc_clientes_movimientos m WHERE m.cliente_id = c.id);
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE cc_clientes_movimientos DISABLE TRIGGER trg_cc_cli_inmutable;
    ALTER TABLE caja_movimientos DISABLE TRIGGER trg_caja_mov_inmutable;
    DELETE FROM cc_clientes_movimientos WHERE tipo = 'ANULACION_PAGO';
    DELETE FROM caja_movimientos WHERE tipo = 'ANULACION_COBRO_CLIENTE';
    ALTER TABLE cc_clientes_movimientos ENABLE TRIGGER trg_cc_cli_inmutable;
    ALTER TABLE caja_movimientos ENABLE TRIGGER trg_caja_mov_inmutable;

    ALTER TABLE cc_clientes_movimientos
      DROP CONSTRAINT ck_cc_cli_anula_caja,
      DROP CONSTRAINT ck_cc_cli_anula,
      DROP COLUMN anula_movimiento_id;
    ALTER TABLE clientes DROP COLUMN cuenta_corriente, DROP COLUMN plazo_pago_dias;
  `);
}
