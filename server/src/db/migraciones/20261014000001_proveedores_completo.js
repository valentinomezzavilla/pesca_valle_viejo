// Proveedores completo: datos para pagar, cheques, anulación de pagos y notas de crédito,
// y el pago de una compra de contado atado a su compra (para saber qué compras quedan sin pagar).
const TIPOS_CC = ['COMPRA', 'PAGO', 'NOTA_CREDITO', 'ANULACION_COMPRA', 'AJUSTE', 'ANULACION_PAGO', 'ANULACION_NOTA_CREDITO'];
const TIPOS_CAJA = ['APERTURA', 'VENTA', 'ANULACION_VENTA', 'COBRO_CLIENTE', 'PAGO_PROVEEDOR', 'ANULACION_PAGO_PROVEEDOR', 'GASTO', 'RETIRO', 'INGRESO'];
const lista = (xs) => xs.map((x) => `'${x}'`).join(', ');

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE proveedores
      ADD COLUMN cbu_alias       TEXT,
      ADD COLUMN plazo_pago_dias INTEGER    NOT NULL DEFAULT 0 CHECK (plazo_pago_dias BETWEEN 0 AND 365),
      ADD COLUMN dias_entrega    SMALLINT[] NOT NULL DEFAULT '{}' CHECK (dias_entrega <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]);

    ALTER TABLE cc_proveedores_movimientos
      ADD COLUMN anula_movimiento_id BIGINT UNIQUE REFERENCES cc_proveedores_movimientos(id),
      ADD COLUMN cheque_numero       TEXT,
      ADD COLUMN cheque_banco        TEXT,
      ADD COLUMN cheque_fecha_cobro  DATE,
      DROP CONSTRAINT cc_proveedores_movimientos_tipo_check,
      ADD CONSTRAINT cc_proveedores_movimientos_tipo_check CHECK (tipo IN (${lista(TIPOS_CC)})),
      DROP CONSTRAINT ck_cc_prov_signo,
      ADD CONSTRAINT ck_cc_prov_signo CHECK (
        CASE tipo
          WHEN 'COMPRA'                 THEN importe > 0
          WHEN 'PAGO'                   THEN importe < 0
          WHEN 'NOTA_CREDITO'           THEN importe < 0
          WHEN 'ANULACION_COMPRA'       THEN importe < 0
          WHEN 'ANULACION_PAGO'         THEN importe > 0
          WHEN 'ANULACION_NOTA_CREDITO' THEN importe > 0
          ELSE true
        END
      ),
      -- El PAGO puede traer compra_id: es el pago de contado que se hace al cargar la compra
      DROP CONSTRAINT ck_cc_prov_compra,
      ADD CONSTRAINT ck_cc_prov_compra CHECK (
        CASE
          WHEN tipo IN ('COMPRA', 'ANULACION_COMPRA') THEN compra_id IS NOT NULL
          WHEN tipo = 'PAGO' THEN true
          ELSE compra_id IS NULL
        END
      ),
      -- La anulación de un pago en efectivo devuelve la plata a la caja (lo controla el servicio)
      DROP CONSTRAINT ck_cc_prov_caja,
      ADD CONSTRAINT ck_cc_prov_caja CHECK (
        tipo = 'ANULACION_PAGO' OR COALESCE(medio_pago = 'EFECTIVO_CAJA', false) = (caja_movimiento_id IS NOT NULL)
      ),
      ADD CONSTRAINT ck_cc_prov_anula CHECK ((tipo IN ('ANULACION_PAGO', 'ANULACION_NOTA_CREDITO')) = (anula_movimiento_id IS NOT NULL)),
      ADD CONSTRAINT ck_cc_prov_cheque CHECK (
        COALESCE(medio_pago = 'CHEQUE', false) OR (cheque_numero IS NULL AND cheque_banco IS NULL AND cheque_fecha_cobro IS NULL)
      );

    CREATE INDEX ix_cc_prov_cheques ON cc_proveedores_movimientos (cheque_fecha_cobro) WHERE cheque_fecha_cobro IS NOT NULL;

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
          WHEN 'PAGO_PROVEEDOR'           THEN importe < 0
          WHEN 'GASTO'                    THEN importe < 0
          WHEN 'RETIRO'                   THEN importe < 0
        END
      );
  `);
  await atarPagosDeContado(knex);
}

/** Los pagos de contado cargados antes de esta migración se atan a su compra (la tabla es de solo inserción: se abre solo para esto). */
export async function atarPagosDeContado(knex) {
  await knex.raw(`
    ALTER TABLE cc_proveedores_movimientos DISABLE TRIGGER trg_cc_prov_inmutable;
    UPDATE cc_proveedores_movimientos m
       SET compra_id = c.id
      FROM compras c
     WHERE m.tipo = 'PAGO' AND m.compra_id IS NULL
       AND m.descripcion ~ '^Pago de la compra #[0-9]+$'
       AND c.id = substring(m.descripcion FROM '#([0-9]+)$')::BIGINT
       AND c.proveedor_id = m.proveedor_id;
    ALTER TABLE cc_proveedores_movimientos ENABLE TRIGGER trg_cc_prov_inmutable;
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE cc_proveedores_movimientos DISABLE TRIGGER trg_cc_prov_inmutable;
    ALTER TABLE caja_movimientos DISABLE TRIGGER trg_caja_mov_inmutable;
    DELETE FROM cc_proveedores_movimientos WHERE tipo IN ('ANULACION_PAGO', 'ANULACION_NOTA_CREDITO');
    DELETE FROM caja_movimientos WHERE tipo = 'ANULACION_PAGO_PROVEEDOR';
    UPDATE cc_proveedores_movimientos SET compra_id = NULL WHERE tipo = 'PAGO';
    ALTER TABLE cc_proveedores_movimientos ENABLE TRIGGER trg_cc_prov_inmutable;
    ALTER TABLE caja_movimientos ENABLE TRIGGER trg_caja_mov_inmutable;

    DROP INDEX IF EXISTS ix_cc_prov_cheques;
    ALTER TABLE cc_proveedores_movimientos
      DROP CONSTRAINT ck_cc_prov_cheque,
      DROP CONSTRAINT ck_cc_prov_anula,
      DROP CONSTRAINT ck_cc_prov_caja,
      ADD CONSTRAINT ck_cc_prov_caja CHECK (COALESCE(medio_pago = 'EFECTIVO_CAJA', false) = (caja_movimiento_id IS NOT NULL)),
      DROP CONSTRAINT ck_cc_prov_compra,
      ADD CONSTRAINT ck_cc_prov_compra CHECK ((tipo IN ('COMPRA', 'ANULACION_COMPRA')) = (compra_id IS NOT NULL)),
      DROP COLUMN anula_movimiento_id,
      DROP COLUMN cheque_numero,
      DROP COLUMN cheque_banco,
      DROP COLUMN cheque_fecha_cobro;
    ALTER TABLE proveedores DROP COLUMN cbu_alias, DROP COLUMN plazo_pago_dias, DROP COLUMN dias_entrega;
  `);
}
