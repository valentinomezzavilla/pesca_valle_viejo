-- =====================================================================
--  PESCADERÍA — Esquema inicial (PostgreSQL 15+)
--
--  Convenciones
--   * Dinero (importes, totales, precios de venta): NUMERIC(14,2).
--   * Costos unitarios: NUMERIC(14,4). Un costo por kg calculado como
--     "total del remito / kg" necesita más de 2 decimales para no perder
--     centavos al multiplicar de vuelta.
--   * Cantidades: NUMERIC(12,3)  (kg con gramos, o unidades enteras).
--   * Fechas y horas: TIMESTAMPTZ. La conexión fija
--     TimeZone = 'America/Argentina/Cordoba'. Fechas "de calendario"
--     (vencimiento, fecha del remito) son DATE.
--   * Tipos y estados: TEXT + CHECK (más fácil de extender que ENUM).
--   * Lo que tiene historia no se borra: se desactiva (activo = false)
--     o se anula (estado = 'ANULADA'), siempre con auditoría.
--   * Importes firmados en los libros (stock, caja, cuentas corrientes):
--     positivo = entra / aumenta, negativo = sale / disminuye.
-- =====================================================================

SET TIME ZONE 'America/Argentina/Cordoba';

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- búsqueda rápida por nombre en el POS

-- ---------------------------------------------------------------------
-- Funciones utilitarias
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_actualizado_en() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_solo_insercion() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción (no se modifica ni se borra)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- 1. USUARIOS, SESIONES, AUDITORÍA, CONFIGURACIÓN
-- =====================================================================

CREATE TABLE usuarios (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          TEXT        NOT NULL,
  usuario         TEXT        NOT NULL,
  password_hash   TEXT        NOT NULL,                 -- bcrypt
  pin_hash        TEXT,                                 -- bcrypt; PIN corto para autorizar al lado del cajero
  rol             TEXT        NOT NULL CHECK (rol IN ('DUENO', 'CAJERO')),
  activo          BOOLEAN     NOT NULL DEFAULT true,
  ultimo_acceso   TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_usuarios_usuario ON usuarios (lower(usuario));
CREATE TRIGGER trg_usuarios_upd BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Sesiones de login (store propio sobre Knex: server/src/lib/sessionStore.js)
CREATE TABLE sesiones (
  sid     VARCHAR      NOT NULL PRIMARY KEY,
  sess    JSON         NOT NULL,
  expire  TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_sesiones_expire ON sesiones (expire);

-- Auditoría de acciones sensibles. Solo inserción.
CREATE TABLE auditoria (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id         BIGINT      REFERENCES usuarios(id),
  autorizado_por_id  BIGINT      REFERENCES usuarios(id),  -- quien puso el PIN, si aplica
  accion             TEXT        NOT NULL,   -- 'VENTA_ANULADA', 'PRECIO_MODIFICADO', 'STOCK_AJUSTADO', ...
  entidad            TEXT        NOT NULL,   -- 'venta', 'producto', 'caja_sesion', ...
  entidad_id         BIGINT,
  datos_antes        JSONB,
  datos_despues      JSONB,
  motivo             TEXT,
  ip                 INET,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_entidad ON auditoria (entidad, entidad_id);
CREATE INDEX ix_auditoria_fecha   ON auditoria (creado_en DESC);
CREATE TRIGGER trg_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION fn_solo_insercion();

-- Parámetros del negocio (datos del ticket, días de alerta, % máx. de descuento del cajero, ...)
CREATE TABLE configuracion (
  clave           TEXT        PRIMARY KEY,
  valor           JSONB       NOT NULL,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_configuracion_upd BEFORE UPDATE ON configuracion
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();


-- =====================================================================
-- 2. CATÁLOGO
-- =====================================================================

CREATE TABLE categorias (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre           TEXT         NOT NULL,
  margen_objetivo  NUMERIC(6,2) CHECK (margen_objetivo >= 0),  -- % para sugerir precio (opcional)
  orden            INT          NOT NULL DEFAULT 0,
  activa           BOOLEAN      NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX ux_categorias_nombre ON categorias (lower(nombre));

CREATE TABLE productos (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                TEXT,                                   -- código corto opcional para tipear en el POS
  nombre                TEXT          NOT NULL,
  categoria_id          BIGINT        NOT NULL REFERENCES categorias(id),
  unidad                TEXT          NOT NULL CHECK (unidad IN ('KG', 'UNIDAD')),
  precio_venta          NUMERIC(14,2) NOT NULL CHECK (precio_venta >= 0),   -- por kg o por unidad
  costo_referencia      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (costo_referencia >= 0), -- último costo de compra
  stock_actual          NUMERIC(12,3) NOT NULL DEFAULT 0,       -- caché; puede quedar negativo (ver invariantes)
  stock_minimo          NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  controla_vencimiento  BOOLEAN       NOT NULL DEFAULT true,
  dias_vida_util        INT           CHECK (dias_vida_util > 0), -- sugiere el vencimiento al ingresar mercadería
  favorito              BOOLEAN       NOT NULL DEFAULT false,     -- aparece en la grilla rápida del POS
  activo                BOOLEAN       NOT NULL DEFAULT true,
  creado_en             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizado_en        TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_productos_codigo   ON productos (lower(codigo)) WHERE codigo IS NOT NULL;
CREATE INDEX ix_productos_nombre_trgm     ON productos USING gin (nombre gin_trgm_ops);
CREATE INDEX ix_productos_categoria       ON productos (categoria_id) WHERE activo;
CREATE TRIGGER trg_productos_upd BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

-- Cada cambio de precio de venta (el precio cambia seguido: sirve para reportes y para auditar)
CREATE TABLE productos_precios_historial (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id      BIGINT        NOT NULL REFERENCES productos(id),
  precio_anterior  NUMERIC(14,2) NOT NULL,
  precio_nuevo     NUMERIC(14,2) NOT NULL,
  usuario_id       BIGINT        NOT NULL REFERENCES usuarios(id),
  creado_en        TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_precios_hist_producto ON productos_precios_historial (producto_id, creado_en DESC);


-- =====================================================================
-- 3. PROVEEDORES Y COMPRAS (ingreso de mercadería)
-- =====================================================================

CREATE TABLE proveedores (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          TEXT        NOT NULL,
  cuit            TEXT,
  telefono        TEXT,
  email           TEXT,
  direccion       TEXT,
  contacto        TEXT,
  notas           TEXT,
  activo          BOOLEAN     NOT NULL DEFAULT true,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_proveedores_nombre ON proveedores (lower(nombre));
CREATE TRIGGER trg_proveedores_upd BEFORE UPDATE ON proveedores
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();

CREATE TABLE compras (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proveedor_id      BIGINT        NOT NULL REFERENCES proveedores(id),
  fecha             DATE          NOT NULL DEFAULT current_date,     -- fecha del remito/factura
  tipo_documento    TEXT          NOT NULL CHECK (tipo_documento IN ('REMITO', 'FACTURA', 'SIN_COMPROBANTE')),
  numero_documento  TEXT,
  condicion         TEXT          NOT NULL CHECK (condicion IN ('CONTADO', 'CUENTA_CORRIENTE')),
  total             NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  estado            TEXT          NOT NULL DEFAULT 'CONFIRMADA' CHECK (estado IN ('CONFIRMADA', 'ANULADA')),
  observaciones     TEXT,
  usuario_id        BIGINT        NOT NULL REFERENCES usuarios(id),
  anulada_por_id    BIGINT        REFERENCES usuarios(id),
  anulada_en        TIMESTAMPTZ,
  motivo_anulacion  TEXT,
  creado_en         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_compras_anulacion CHECK (
    (estado = 'ANULADA') = (anulada_en IS NOT NULL AND anulada_por_id IS NOT NULL)
  )
);
-- Evita cargar dos veces el mismo remito del mismo proveedor
CREATE UNIQUE INDEX ux_compras_documento ON compras (proveedor_id, tipo_documento, numero_documento)
  WHERE numero_documento IS NOT NULL AND estado = 'CONFIRMADA';
CREATE INDEX ix_compras_proveedor_fecha ON compras (proveedor_id, fecha DESC);

CREATE TABLE compra_items (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  compra_id          BIGINT        NOT NULL REFERENCES compras(id),
  producto_id        BIGINT        NOT NULL REFERENCES productos(id),
  cantidad           NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario     NUMERIC(14,4) NOT NULL CHECK (costo_unitario >= 0),
  subtotal           NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
  fecha_vencimiento  DATE
);
CREATE INDEX ix_compra_items_compra   ON compra_items (compra_id);
-- Historial de precios de compra = compra_items JOIN compras (no hace falta otra tabla)
CREATE INDEX ix_compra_items_producto ON compra_items (producto_id);

-- Lotes: cada ingreso de mercadería genera un lote. Base del FIFO, del costo real y de los vencimientos.
CREATE TABLE lotes (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id        BIGINT        NOT NULL REFERENCES productos(id),
  compra_item_id     BIGINT        UNIQUE REFERENCES compra_items(id),   -- NULL si viene de ajuste/inventario
  origen             TEXT          NOT NULL CHECK (origen IN ('COMPRA', 'AJUSTE', 'INVENTARIO')),
  fecha_ingreso      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  fecha_vencimiento  DATE,
  cantidad_inicial   NUMERIC(12,3) NOT NULL CHECK (cantidad_inicial > 0),
  cantidad_actual    NUMERIC(12,3) NOT NULL CHECK (cantidad_actual >= 0),
  costo_unitario     NUMERIC(14,4) NOT NULL CHECK (costo_unitario >= 0),
  creado_en          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_lotes_cantidad CHECK (cantidad_actual <= cantidad_inicial),
  CONSTRAINT ck_lotes_origen   CHECK ((origen = 'COMPRA') = (compra_item_id IS NOT NULL))
);
-- FIFO: lotes con saldo, del más viejo al más nuevo
CREATE INDEX ix_lotes_fifo        ON lotes (producto_id, fecha_ingreso, id) WHERE cantidad_actual > 0;
CREATE INDEX ix_lotes_vencimiento ON lotes (fecha_vencimiento)            WHERE cantidad_actual > 0;


-- =====================================================================
-- 4. CLIENTES (opcionales, para fiado)
-- =====================================================================

CREATE TABLE clientes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          TEXT          NOT NULL,
  telefono        TEXT,
  documento       TEXT,                                      -- DNI/CUIT (servirá para facturar a futuro)
  direccion       TEXT,
  limite_credito  NUMERIC(14,2) CHECK (limite_credito >= 0), -- NULL = sin límite
  notas           TEXT,
  activo          BOOLEAN       NOT NULL DEFAULT true,
  creado_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_clientes_nombre_trgm ON clientes USING gin (nombre gin_trgm_ops);
CREATE TRIGGER trg_clientes_upd BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION fn_set_actualizado_en();


-- =====================================================================
-- 5. CAJA
-- =====================================================================

-- Puestos de cobro físicos ("Caja 1", "Mostrador")
CREATE TABLE cajas (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre  TEXT    NOT NULL UNIQUE,
  activa  BOOLEAN NOT NULL DEFAULT true
);

-- Rubros de gastos para los egresos de caja (hielo, limpieza, flete, sueldos...)
CREATE TABLE categorias_gasto (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre  TEXT    NOT NULL UNIQUE,
  activa  BOOLEAN NOT NULL DEFAULT true
);

-- Un turno de caja: desde la apertura hasta el cierre con arqueo
CREATE TABLE caja_sesiones (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  caja_id            BIGINT        NOT NULL REFERENCES cajas(id),
  estado             TEXT          NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA')),
  abierta_por_id     BIGINT        NOT NULL REFERENCES usuarios(id),
  abierta_en         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  monto_inicial      NUMERIC(14,2) NOT NULL CHECK (monto_inicial >= 0),  -- cambio con el que arranca
  cerrada_por_id     BIGINT        REFERENCES usuarios(id),
  cerrada_en         TIMESTAMPTZ,
  efectivo_esperado  NUMERIC(14,2),   -- calculado al cerrar: suma de caja_movimientos en EFECTIVO
  efectivo_contado   NUMERIC(14,2),   -- lo que contó el cajero
  diferencia         NUMERIC(14,2),   -- contado - esperado (negativo = falta plata)
  totales_por_medio  JSONB,           -- foto al cierre: {"EFECTIVO": "...", "TRANSFERENCIA": "...", ...}
  detalle_arqueo     JSONB,           -- conteo por billete (opcional): {"10000": 3, "2000": 5, ...}
  observaciones      TEXT,
  CONSTRAINT ck_caja_cierre CHECK (
    (estado = 'CERRADA') = (cerrada_en IS NOT NULL
                            AND cerrada_por_id IS NOT NULL
                            AND efectivo_esperado IS NOT NULL
                            AND efectivo_contado IS NOT NULL
                            AND diferencia IS NOT NULL)
  )
);
-- Solo un turno abierto por caja física
CREATE UNIQUE INDEX ux_caja_sesion_abierta ON caja_sesiones (caja_id) WHERE estado = 'ABIERTA';
CREATE INDEX ix_caja_sesiones_fecha ON caja_sesiones (abierta_en DESC);


-- =====================================================================
-- 6. VENTAS (no sabe nada de comprobantes: ver sección 8)
-- =====================================================================

CREATE TABLE ventas (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  caja_sesion_id       BIGINT        NOT NULL REFERENCES caja_sesiones(id),  -- no se vende sin caja abierta
  usuario_id           BIGINT        NOT NULL REFERENCES usuarios(id),
  cliente_id           BIGINT        REFERENCES clientes(id),               -- opcional; obligatorio si hay fiado
  subtotal             NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),        -- suma de items sin descuentos
  descuento_items      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (descuento_items >= 0),
  descuento_global     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (descuento_global >= 0),
  total                NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  costo_total          NUMERIC(14,2) NOT NULL DEFAULT 0,                    -- costo FIFO de lo vendido
  vuelto               NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (vuelto >= 0),-- solo para mostrar en el ticket
  estado               TEXT          NOT NULL DEFAULT 'CONFIRMADA' CHECK (estado IN ('CONFIRMADA', 'ANULADA')),
  anulada_por_id       BIGINT        REFERENCES usuarios(id),
  anulacion_autorizada_por_id BIGINT REFERENCES usuarios(id),               -- quien puso el PIN
  anulada_en           TIMESTAMPTZ,
  motivo_anulacion     TEXT,
  CONSTRAINT ck_ventas_total CHECK (total = subtotal - descuento_items - descuento_global),
  CONSTRAINT ck_ventas_anulacion CHECK (
    (estado = 'ANULADA') = (anulada_en IS NOT NULL AND anulada_por_id IS NOT NULL AND motivo_anulacion IS NOT NULL)
  )
);
CREATE INDEX ix_ventas_fecha        ON ventas (fecha DESC);
CREATE INDEX ix_ventas_caja_sesion  ON ventas (caja_sesion_id);
CREATE INDEX ix_ventas_cliente      ON ventas (cliente_id) WHERE cliente_id IS NOT NULL;

CREATE TABLE venta_items (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venta_id              BIGINT        NOT NULL REFERENCES ventas(id),
  producto_id           BIGINT        NOT NULL REFERENCES productos(id),
  descripcion           TEXT          NOT NULL,   -- foto del nombre al momento de vender
  unidad                TEXT          NOT NULL CHECK (unidad IN ('KG', 'UNIDAD')),
  cantidad              NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario       NUMERIC(14,2) NOT NULL CHECK (precio_unitario >= 0),  -- foto del precio
  subtotal              NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),         -- round(cantidad * precio, 2)
  descuento             NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  descuento_prorrateado NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (descuento_prorrateado >= 0), -- parte del descuento global
  total                 NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  costo_total           NUMERIC(14,2) NOT NULL DEFAULT 0,  -- costo FIFO real (suma de los lotes consumidos)
  CONSTRAINT ck_venta_items_total  CHECK (total = subtotal - descuento - descuento_prorrateado),
  CONSTRAINT ck_venta_items_unidad CHECK (unidad = 'KG' OR cantidad = trunc(cantidad))
);
CREATE INDEX ix_venta_items_venta    ON venta_items (venta_id);
CREATE INDEX ix_venta_items_producto ON venta_items (producto_id);

-- Pagos de la venta: una fila por medio (pago mixto = varias filas). La suma = ventas.total.
CREATE TABLE venta_pagos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venta_id    BIGINT        NOT NULL REFERENCES ventas(id),
  medio       TEXT          NOT NULL CHECK (medio IN
                ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'CUENTA_CORRIENTE')),
  monto       NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  referencia  TEXT                                   -- nro. de operación, últimos 4 de la tarjeta, etc.
);
CREATE INDEX ix_venta_pagos_venta ON venta_pagos (venta_id);


-- ---------------------------------------------------------------------
-- 5b. Movimientos de caja (después de ventas por la FK)
--     Todo lo que entra o sale de la caja, por medio de pago.
--     Efectivo esperado al cierre = SUM(importe) WHERE medio = 'EFECTIVO'.
-- ---------------------------------------------------------------------
CREATE TABLE caja_movimientos (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  caja_sesion_id      BIGINT        NOT NULL REFERENCES caja_sesiones(id),
  tipo                TEXT          NOT NULL CHECK (tipo IN (
                        'APERTURA',         -- monto inicial
                        'VENTA',
                        'ANULACION_VENTA',  -- devolución de plata (importe negativo)
                        'COBRO_CLIENTE',    -- cliente paga su fiado
                        'PAGO_PROVEEDOR',   -- pago en efectivo desde la caja
                        'GASTO',            -- egreso con rubro
                        'RETIRO',           -- el dueño saca plata
                        'INGRESO'           -- se agrega cambio
                      )),
  medio               TEXT          NOT NULL CHECK (medio IN
                        ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO')),
  importe             NUMERIC(14,2) NOT NULL CHECK (importe <> 0),  -- + entra, - sale
  venta_id            BIGINT        REFERENCES ventas(id),
  categoria_gasto_id  BIGINT        REFERENCES categorias_gasto(id),
  descripcion         TEXT,
  usuario_id          BIGINT        NOT NULL REFERENCES usuarios(id),
  creado_en           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_caja_mov_signo CHECK (
    CASE tipo
      WHEN 'APERTURA'        THEN importe > 0
      WHEN 'VENTA'           THEN importe > 0
      WHEN 'COBRO_CLIENTE'   THEN importe > 0
      WHEN 'INGRESO'         THEN importe > 0
      WHEN 'ANULACION_VENTA' THEN importe < 0
      WHEN 'PAGO_PROVEEDOR'  THEN importe < 0
      WHEN 'GASTO'           THEN importe < 0
      WHEN 'RETIRO'          THEN importe < 0
    END
  ),
  CONSTRAINT ck_caja_mov_venta  CHECK ((tipo IN ('VENTA', 'ANULACION_VENTA')) = (venta_id IS NOT NULL)),
  CONSTRAINT ck_caja_mov_gasto  CHECK (tipo <> 'GASTO' OR categoria_gasto_id IS NOT NULL)
);
CREATE INDEX ix_caja_mov_sesion ON caja_movimientos (caja_sesion_id, medio);
CREATE INDEX ix_caja_mov_venta  ON caja_movimientos (venta_id) WHERE venta_id IS NOT NULL;
CREATE TRIGGER trg_caja_mov_inmutable BEFORE UPDATE OR DELETE ON caja_movimientos
  FOR EACH ROW EXECUTE FUNCTION fn_solo_insercion();


-- =====================================================================
-- 7. CUENTAS CORRIENTES (libros firmados; saldo = SUM(importe))
-- =====================================================================

-- Clientes: importe > 0 = el cliente debe más (fiado); < 0 = pagó / se anuló
CREATE TABLE cc_clientes_movimientos (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id         BIGINT        NOT NULL REFERENCES clientes(id),
  tipo               TEXT          NOT NULL CHECK (tipo IN ('VENTA', 'PAGO', 'ANULACION_VENTA', 'AJUSTE')),
  importe            NUMERIC(14,2) NOT NULL CHECK (importe <> 0),
  venta_id           BIGINT        REFERENCES ventas(id),
  caja_movimiento_id BIGINT        UNIQUE REFERENCES caja_movimientos(id),  -- el cobro que entró a caja
  descripcion        TEXT,
  usuario_id         BIGINT        NOT NULL REFERENCES usuarios(id),
  creado_en          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_cc_cli_signo CHECK (
    CASE tipo
      WHEN 'VENTA'           THEN importe > 0
      WHEN 'PAGO'            THEN importe < 0
      WHEN 'ANULACION_VENTA' THEN importe < 0
      ELSE true
    END
  ),
  CONSTRAINT ck_cc_cli_venta CHECK ((tipo IN ('VENTA', 'ANULACION_VENTA')) = (venta_id IS NOT NULL)),
  CONSTRAINT ck_cc_cli_pago  CHECK (tipo <> 'PAGO' OR caja_movimiento_id IS NOT NULL)
);
CREATE INDEX ix_cc_cli_cliente ON cc_clientes_movimientos (cliente_id, creado_en);
CREATE TRIGGER trg_cc_cli_inmutable BEFORE UPDATE OR DELETE ON cc_clientes_movimientos
  FOR EACH ROW EXECUTE FUNCTION fn_solo_insercion();

-- Proveedores: importe > 0 = le debemos más; < 0 = le pagamos / nota de crédito / anulación
CREATE TABLE cc_proveedores_movimientos (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proveedor_id       BIGINT        NOT NULL REFERENCES proveedores(id),
  tipo               TEXT          NOT NULL CHECK (tipo IN ('COMPRA', 'PAGO', 'NOTA_CREDITO', 'ANULACION_COMPRA', 'AJUSTE')),
  importe            NUMERIC(14,2) NOT NULL CHECK (importe <> 0),
  compra_id          BIGINT        REFERENCES compras(id),
  medio_pago         TEXT          CHECK (medio_pago IN ('EFECTIVO_CAJA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO')),
  caja_movimiento_id BIGINT        UNIQUE REFERENCES caja_movimientos(id),  -- si se pagó con plata de la caja
  referencia         TEXT,                                                -- nro. de transferencia, recibo, etc.
  fecha              DATE          NOT NULL DEFAULT current_date,
  descripcion        TEXT,
  usuario_id         BIGINT        NOT NULL REFERENCES usuarios(id),
  creado_en          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_cc_prov_signo CHECK (
    CASE tipo
      WHEN 'COMPRA'           THEN importe > 0
      WHEN 'PAGO'             THEN importe < 0
      WHEN 'NOTA_CREDITO'     THEN importe < 0
      WHEN 'ANULACION_COMPRA' THEN importe < 0
      ELSE true
    END
  ),
  CONSTRAINT ck_cc_prov_compra CHECK ((tipo IN ('COMPRA', 'ANULACION_COMPRA')) = (compra_id IS NOT NULL)),
  CONSTRAINT ck_cc_prov_pago   CHECK ((tipo = 'PAGO') = (medio_pago IS NOT NULL)),
  CONSTRAINT ck_cc_prov_caja   CHECK (COALESCE(medio_pago = 'EFECTIVO_CAJA', false) = (caja_movimiento_id IS NOT NULL))
);
CREATE INDEX ix_cc_prov_proveedor ON cc_proveedores_movimientos (proveedor_id, creado_en);
CREATE TRIGGER trg_cc_prov_inmutable BEFORE UPDATE OR DELETE ON cc_proveedores_movimientos
  FOR EACH ROW EXECUTE FUNCTION fn_solo_insercion();


-- =====================================================================
-- 8. STOCK: mermas, inventarios y libro de movimientos
-- =====================================================================

CREATE TABLE mermas (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id  BIGINT        NOT NULL REFERENCES productos(id),
  cantidad     NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  motivo       TEXT          NOT NULL CHECK (motivo IN
                 ('VENCIDO', 'MAL_ESTADO', 'LIMPIEZA_FILETEADO', 'CADENA_FRIO', 'ROTURA', 'OTRO')),
  detalle      TEXT,
  costo_total  NUMERIC(14,2) NOT NULL DEFAULT 0,    -- plata perdida (costo FIFO de lo descartado)
  usuario_id   BIGINT        NOT NULL REFERENCES usuarios(id),
  creado_en    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_mermas_otro CHECK (motivo <> 'OTRO' OR detalle IS NOT NULL)
);
CREATE INDEX ix_mermas_fecha    ON mermas (creado_en DESC);
CREATE INDEX ix_mermas_producto ON mermas (producto_id);

-- Conteo físico (total o por categoría)
CREATE TABLE inventarios (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  estado          TEXT        NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'CERRADO', 'CANCELADO')),
  categoria_id    BIGINT      REFERENCES categorias(id),   -- NULL = inventario completo
  iniciado_por_id BIGINT      NOT NULL REFERENCES usuarios(id),
  iniciado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_por_id  BIGINT      REFERENCES usuarios(id),
  cerrado_en      TIMESTAMPTZ,
  observaciones   TEXT
);
-- Un solo inventario abierto a la vez
CREATE UNIQUE INDEX ux_inventario_abierto ON inventarios ((true)) WHERE estado = 'ABIERTO';

CREATE TABLE inventario_items (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventario_id     BIGINT        NOT NULL REFERENCES inventarios(id),
  producto_id       BIGINT        NOT NULL REFERENCES productos(id),
  stock_sistema     NUMERIC(12,3) NOT NULL,          -- foto al momento de contar
  cantidad_contada  NUMERIC(12,3) CHECK (cantidad_contada >= 0),  -- NULL = todavía no se contó
  diferencia        NUMERIC(12,3) GENERATED ALWAYS AS (cantidad_contada - stock_sistema) STORED,
  costo_unitario    NUMERIC(14,4) NOT NULL DEFAULT 0, -- para valorizar la diferencia
  contado_por_id    BIGINT        REFERENCES usuarios(id),
  contado_en        TIMESTAMPTZ,
  UNIQUE (inventario_id, producto_id)
);

-- Libro de stock: TODO cambio de stock deja una fila acá. Solo inserción.
-- Una venta que consume 2 lotes genera 2 filas (una por lote) → trazabilidad y costo real.
CREATE TABLE movimientos_stock (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id      BIGINT        NOT NULL REFERENCES productos(id),
  lote_id          BIGINT        REFERENCES lotes(id),   -- NULL = venta sin stock registrado (faltante)
  tipo             TEXT          NOT NULL CHECK (tipo IN (
                     'COMPRA', 'ANULACION_COMPRA',
                     'VENTA',  'ANULACION_VENTA',
                     'MERMA',  'AJUSTE', 'INVENTARIO'
                   )),
  cantidad         NUMERIC(12,3) NOT NULL CHECK (cantidad <> 0),  -- + entra, - sale
  costo_unitario   NUMERIC(14,4) NOT NULL,
  -- Origen del movimiento (FKs explícitas: una sola debería estar cargada)
  compra_item_id   BIGINT        REFERENCES compra_items(id),
  venta_item_id    BIGINT        REFERENCES venta_items(id),
  merma_id         BIGINT        REFERENCES mermas(id),
  inventario_item_id BIGINT      REFERENCES inventario_items(id),
  motivo           TEXT,                                   -- obligatorio en AJUSTE
  usuario_id       BIGINT        NOT NULL REFERENCES usuarios(id),
  creado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_mov_origen CHECK (
    CASE tipo
      WHEN 'COMPRA'           THEN compra_item_id IS NOT NULL AND cantidad > 0
      WHEN 'ANULACION_COMPRA' THEN compra_item_id IS NOT NULL AND cantidad < 0
      WHEN 'VENTA'            THEN venta_item_id  IS NOT NULL AND cantidad < 0
      WHEN 'ANULACION_VENTA'  THEN venta_item_id  IS NOT NULL AND cantidad > 0
      WHEN 'MERMA'            THEN merma_id       IS NOT NULL AND cantidad < 0
      WHEN 'INVENTARIO'       THEN inventario_item_id IS NOT NULL
      WHEN 'AJUSTE'           THEN motivo IS NOT NULL
    END
  )
);
CREATE INDEX ix_mov_stock_producto   ON movimientos_stock (producto_id, creado_en);
CREATE INDEX ix_mov_stock_venta_item ON movimientos_stock (venta_item_id) WHERE venta_item_id IS NOT NULL;
CREATE INDEX ix_mov_stock_lote       ON movimientos_stock (lote_id) WHERE lote_id IS NOT NULL;
CREATE TRIGGER trg_mov_stock_inmutable BEFORE UPDATE OR DELETE ON movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION fn_solo_insercion();


-- =====================================================================
-- 9. COMPROBANTES (desacoplados de la venta)
--    Hoy: solo TICKET_INTERNO ("Comprobante no válido como factura").
--    Mañana: agregar 'FACTURA_B', 'FACTURA_C', 'NOTA_CREDITO_B', ... al CHECK,
--    completar datos_fiscales (CAE, vencimiento CAE, QR) y un servicio nuevo
--    que emita. La tabla ventas no se toca.
-- =====================================================================

-- Numeración correlativa sin huecos por tipo y punto de venta (se bloquea con SELECT ... FOR UPDATE)
CREATE TABLE numeradores (
  tipo           TEXT   NOT NULL,
  punto_venta    INT    NOT NULL CHECK (punto_venta > 0),
  ultimo_numero  BIGINT NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
  PRIMARY KEY (tipo, punto_venta)
);

CREATE TABLE comprobantes (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venta_id                 BIGINT        NOT NULL REFERENCES ventas(id),
  tipo                     TEXT          NOT NULL CHECK (tipo IN ('TICKET_INTERNO')),
  punto_venta              INT           NOT NULL,
  numero                   BIGINT        NOT NULL,
  estado                   TEXT          NOT NULL DEFAULT 'EMITIDO' CHECK (estado IN ('EMITIDO', 'ANULADO')),
  total                    NUMERIC(14,2) NOT NULL,
  receptor                 JSONB,         -- foto de los datos del cliente (nombre, doc) si hubo
  leyenda                  TEXT          NOT NULL DEFAULT 'Comprobante no válido como factura',
  datos_fiscales           JSONB,         -- reservado para facturación electrónica (CAE, QR, etc.)
  comprobante_asociado_id  BIGINT        REFERENCES comprobantes(id),  -- futuro: nota de crédito → factura
  reimpresiones            INT           NOT NULL DEFAULT 0,
  emitido_en               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  anulado_en               TIMESTAMPTZ,
  UNIQUE (tipo, punto_venta, numero),
  FOREIGN KEY (tipo, punto_venta) REFERENCES numeradores (tipo, punto_venta)
);
CREATE INDEX ix_comprobantes_venta ON comprobantes (venta_id);


-- =====================================================================
-- 10. VISTAS de consulta frecuente
-- =====================================================================

-- Stock por producto con alertas y valorización (a costo real de los lotes)
CREATE VIEW v_stock_productos AS
SELECT
  p.id,
  p.nombre,
  p.codigo,
  p.categoria_id,
  c.nombre                                         AS categoria,
  p.unidad,
  p.stock_actual,
  p.stock_minimo,
  (p.stock_actual <= p.stock_minimo)               AS bajo_minimo,
  COALESCE(l.valor_stock, 0)::NUMERIC(14,2)        AS valor_stock,
  l.proximo_vencimiento,
  p.precio_venta,
  p.costo_referencia
FROM productos p
JOIN categorias c ON c.id = p.categoria_id
LEFT JOIN LATERAL (
  SELECT SUM(cantidad_actual * costo_unitario) AS valor_stock,
         MIN(fecha_vencimiento)                AS proximo_vencimiento
  FROM lotes
  WHERE producto_id = p.id AND cantidad_actual > 0
) l ON true
WHERE p.activo;

CREATE VIEW v_saldos_clientes AS
SELECT c.id, c.nombre, c.telefono, c.limite_credito,
       COALESCE(SUM(m.importe), 0)::NUMERIC(14,2) AS saldo,
       MAX(m.creado_en)                           AS ultimo_movimiento
FROM clientes c
LEFT JOIN cc_clientes_movimientos m ON m.cliente_id = c.id
GROUP BY c.id;

CREATE VIEW v_saldos_proveedores AS
SELECT p.id, p.nombre, p.telefono,
       COALESCE(SUM(m.importe), 0)::NUMERIC(14,2) AS saldo,
       MAX(m.creado_en)                           AS ultimo_movimiento
FROM proveedores p
LEFT JOIN cc_proveedores_movimientos m ON m.proveedor_id = p.id
GROUP BY p.id;
