# Proveedores completo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que la parte de proveedores tenga ficha completa, datos para pagar, control de vencimientos y cheques, anulación de pagos y resumen de cuenta en PDF.

**Arquitectura:** el estado de cada compra (pagada, a medias o vencida) se calcula en el momento con una función pura (`imputar`), a partir de los movimientos de la cuenta corriente. No se guardan imputaciones. Una migración suma columnas y constraints, y ata el pago de contado a su compra. La API suma `/ficha`, la anulación de movimientos y `/resumen.pdf`. El cliente reescribe la lista y la página del proveedor con botones grandes y con texto.

**Stack:** Node 22 + Express 5 + Knex + PostgreSQL (PGlite en desarrollo y tests) · zod en `shared/` · React 19 + React Query + Tailwind · pdfkit · vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-14-proveedores-design.md`

## Restricciones globales

- Los usuarios casi no usan computadora. Cada acción es un botón grande (`tamanio="grande"`, o `normal` dentro de tablas) **con texto**: nada de menús de tres puntitos, pestañas ni íconos solos.
- Textos en español rioplatense y simple ("Le debemos", "Ya vencido", "¿Por qué?"). Nada de jerga contable.
- La plata se opera con `dec()` / `aPesos()` de `@pescaderia/shared`, nunca con `Number`.
- La API devuelve claves en `snake_case`. Los importes van como string con 2 decimales y las fechas como `'YYYY-MM-DD'`.
- `cc_proveedores_movimientos` y `caja_movimientos` son de solo inserción: no se modifican ni se borran. Una corrección es un movimiento nuevo.
- Lo del dueño (saldos, ficha, pagos) requiere `proveedores.editar` / `proveedores.pagar`. El cajero sigue viendo solo nombre y contacto.
- Tests: `npm test` desde la raíz. Corre vitest con PGlite en el puerto 54329; no choca con el local que está levantado.
- No es un repo git: los pasos de "commit" se reemplazan por correr los tests.

## Qué revisar con más cuidado

1. **Hay deuda vieja y se carga una compra de contado:** la compra de contado tiene que figurar pagada, y la deuda vieja seguir pendiente. Test en la Tarea 4 (`imputar`) y en la Tarea 5 (de punta a punta).
2. **Se anula un pago en efectivo cuyo turno de caja ya cerró:** tiene que pedir la caja (`ELEGIR_CAJA`) y no devolver la plata a un turno cerrado. Test en la Tarea 6.
3. **Teléfonos cargados de cualquier forma** (`0351 15…`, `+54 9…`, sin característica): WhatsApp abre bien o el botón dice "Revisá el teléfono", nunca un link roto. Test en la Tarea 1.
4. **Proveedor con saldo a favor** (se le pagó de más): ninguna compra aparece vencida y no sale en los avisos del Inicio. Test en las Tareas 4 y 8.
5. **CUIT escrito con o sin guiones, o ya cargado en otro proveedor:** se guarda normalizado y el repetido se rechaza con un mensaje claro. Test en las Tareas 1 y 5.

---

### Tarea 0: Arreglar el test de reportes que depende de la fecha

El test `reportes.test.js › mermas, stock valorizado, cuentas…` ya falla antes de este cambio. El helper `ingresarMercaderia` usa la fecha fija `2026-10-13` y el reporte de compras filtra por `hoy()`.

**Archivos:**
- Modificar: `server/test/reportes.test.js:21`

- [ ] **Paso 1: pasar la fecha de hoy a la compra del `beforeAll`**

```js
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '10', costo_unitario: '6000' }], { fecha: hoy() });
```

- [ ] **Paso 2: correr y verificar**

Correr: `npm test -- reportes`. Esperado: PASS (todos los tests de `reportes.test.js`).

---

### Tarea 1: CUIT y WhatsApp en `shared/`

**Archivos:**
- Crear: `shared/src/cuit.js`, `shared/src/telefono.js`
- Modificar: `shared/src/index.js`
- Test: `server/test/proveedores-utiles.test.js`

**Interfaces que produce:**
- `cuitValido(texto: string|null): boolean`
- `normalizarCuit(texto: string|null): string|null` → `'20-12345678-6'`, o `null` si no son 11 dígitos
- `numeroWhatsApp(telefono: string|null): string|null` → `'5492235550101'`, o `null`

- [ ] **Paso 1: escribir el test que falla**

```js
// server/test/proveedores-utiles.test.js
import { describe, it, expect } from 'vitest';
import { cuitValido, normalizarCuit, numeroWhatsApp } from '@pescaderia/shared';

describe('CUIT', () => {
  it('valida el dígito verificador', () => {
    expect(cuitValido('20-12345678-6')).toBe(true);
    expect(cuitValido('20123456786')).toBe(true);
    expect(cuitValido('33-69345023-9')).toBe(true); // AFIP
    expect(cuitValido('20-12345678-5')).toBe(false);
    expect(cuitValido('30-71234567-8')).toBe(false);
    expect(cuitValido('2012345678')).toBe(false);
    expect(cuitValido('')).toBe(false);
    expect(cuitValido(null)).toBe(false);
  });

  it('normaliza con guiones', () => {
    expect(normalizarCuit('20123456786')).toBe('20-12345678-6');
    expect(normalizarCuit(' 20.12345678.6 ')).toBe('20-12345678-6');
    expect(normalizarCuit('123')).toBe(null);
  });
});

describe('WhatsApp', () => {
  it('arma el número internacional desde como lo escribe la gente', () => {
    expect(numeroWhatsApp('223 555-0101')).toBe('5492235550101');
    expect(numeroWhatsApp('11 4555-0202')).toBe('5491145550202');
    expect(numeroWhatsApp('0351 15 1234567')).toBe('5493511234567');
    expect(numeroWhatsApp('011 15 4555-0202')).toBe('5491145550202');
    expect(numeroWhatsApp('+54 9 11 4555-0202')).toBe('5491145550202');
    expect(numeroWhatsApp('+54 11 4555 0202')).toBe('5491145550202');
  });

  it('devuelve null si no se puede saber el número', () => {
    expect(numeroWhatsApp('4555-0202')).toBe(null);
    expect(numeroWhatsApp('')).toBe(null);
    expect(numeroWhatsApp(null)).toBe(null);
    expect(numeroWhatsApp('llamar a Raúl')).toBe(null);
  });
});
```

- [ ] **Paso 2: correr y ver que falla**

Correr: `npm test -- proveedores-utiles`. Esperado: FAIL (`cuitValido is not a function`).

- [ ] **Paso 3: implementar**

```js
// shared/src/cuit.js
// CUIT/CUIL argentino: 11 dígitos; el último es verificador (módulo 11).
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

const digitos = (texto) => String(texto ?? '').replace(/\D/g, '');

export function cuitValido(texto) {
  const d = digitos(texto);
  if (d.length !== 11) return false;
  const suma = PESOS_CUIT.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  if (resto === 10) return false;
  return (resto === 11 ? 0 : resto) === Number(d[10]);
}

export function normalizarCuit(texto) {
  const d = digitos(texto);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : null;
}
```

```js
// shared/src/telefono.js
/**
 * Número para wa.me (549 + característica + número, sin 0 ni 15) a partir de como lo escribe la gente.
 * Devuelve null si no hay forma segura de saberlo (ej. falta la característica).
 */
export function numeroWhatsApp(telefono) {
  let d = String(telefono ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('549') && d.length === 13) return d;
  if (d.startsWith('54') && d.length === 12) return `549${d.slice(2)}`;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    // El "15" va después de la característica, que tiene 2, 3 o 4 dígitos
    const k = [2, 3, 4].find((i) => d.slice(i, i + 2) === '15');
    if (k === undefined) return null;
    d = d.slice(0, k) + d.slice(k + 2);
  }
  return d.length === 10 ? `549${d}` : null;
}
```

En `shared/src/index.js`, agregar:

```js
export * from './cuit.js';
export * from './telefono.js';
```

- [ ] **Paso 4: correr y ver que pasa**

Correr: `npm test -- proveedores-utiles`. Esperado: PASS.

---

### Tarea 2: Constantes y esquemas en `shared/`

**Archivos:**
- Modificar: `shared/src/constantes.js` (etiquetas y días), `shared/src/esquemas.js:132-141` (proveedor), `:286-294` (pago) y agregar esquemas nuevos
- Test: `server/test/proveedores-utiles.test.js` (agregar un `describe`)

**Interfaces que produce:**
- `DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']` (índice = `getUTCDay()`) y `ORDEN_DIAS_SEMANA = [1,2,3,4,5,6,0]`
- `TIPOS_MOV_CC_PROVEEDOR_ETIQUETA.ANULACION_PAGO = 'Pago anulado'` y `.ANULACION_NOTA_CREDITO = 'Nota de crédito anulada'`
- `TIPOS_MOV_CAJA_ETIQUETA.ANULACION_PAGO_PROVEEDOR = 'Pago a proveedor anulado'`
- `esquemaProveedor` con `cuit` (normalizado), `cbu_alias`, `plazo_pago_dias`, `dias_entrega`
- `esquemaPagoProveedor` con `cheque_numero`, `cheque_banco`, `cheque_fecha_cobro`
- `esquemaAnularMovimientoProveedor = { motivo, caja_id? }`
- `esquemaResumenProveedor = { desde?, hasta? }`

- [ ] **Paso 1: escribir el test que falla**

```js
// agregar a server/test/proveedores-utiles.test.js
import { esquemaProveedor, esquemaPagoProveedor, esquemaAnularMovimientoProveedor } from '@pescaderia/shared';

describe('esquemas de proveedores', () => {
  it('normaliza el CUIT y rechaza uno mal escrito', () => {
    expect(esquemaProveedor.parse({ nombre: 'X', cuit: '20123456786' }).cuit).toBe('20-12345678-6');
    expect(esquemaProveedor.parse({ nombre: 'X', cuit: '' }).cuit).toBe(null);
    const mal = esquemaProveedor.safeParse({ nombre: 'X', cuit: '20-12345678-5' });
    expect(mal.success).toBe(false);
    expect(mal.error.issues[0].message).toBe('El CUIT no es válido. Revisá los números.');
  });

  it('acepta plazo y días de entrega', () => {
    const p = esquemaProveedor.parse({ nombre: 'X', plazo_pago_dias: '15', dias_entrega: [1, 4] });
    expect(p.plazo_pago_dias).toBe(15);
    expect(p.dias_entrega).toEqual([1, 4]);
    expect(esquemaProveedor.safeParse({ nombre: 'X', plazo_pago_dias: '400' }).success).toBe(false);
    expect(esquemaProveedor.safeParse({ nombre: 'X', dias_entrega: [7] }).success).toBe(false);
  });

  it('el cheque necesita fecha de cobro', () => {
    const sin = esquemaPagoProveedor.safeParse({ importe: '100', medio_pago: 'CHEQUE' });
    expect(sin.success).toBe(false);
    expect(sin.error.issues[0].path).toEqual(['cheque_fecha_cobro']);
    expect(esquemaPagoProveedor.safeParse({ importe: '100', medio_pago: 'CHEQUE', cheque_fecha_cobro: '2026-10-20' }).success).toBe(true);
  });

  it('anular pide motivo', () => {
    expect(esquemaAnularMovimientoProveedor.safeParse({ motivo: '' }).success).toBe(false);
    expect(esquemaAnularMovimientoProveedor.parse({ motivo: 'Cargado dos veces' }).motivo).toBe('Cargado dos veces');
  });
});
```

- [ ] **Paso 2: correr y ver que falla**

Correr: `npm test -- proveedores-utiles`. Esperado: FAIL (falta `esquemaAnularMovimientoProveedor`; el CUIT no se normaliza).

- [ ] **Paso 3: implementar las constantes**

En `shared/src/constantes.js`:

```js
// En TIPOS_MOV_CAJA_ETIQUETA agregar:
  ANULACION_PAGO_PROVEEDOR: 'Pago a proveedor anulado',

// En TIPOS_MOV_CC_PROVEEDOR_ETIQUETA agregar:
  ANULACION_PAGO: 'Pago anulado',
  ANULACION_NOTA_CREDITO: 'Nota de crédito anulada',

// Al final:
// Índice = Date#getUTCDay() (0 = domingo). En pantalla se muestran de lunes a domingo.
export const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const ORDEN_DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0];
```

- [ ] **Paso 4: implementar los esquemas**

En `shared/src/esquemas.js`, importar `cuitValido` y `normalizarCuit` desde `./cuit.js` y reemplazar `esquemaProveedor`:

```js
const zCuit = z
  .preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z
      .string()
      .trim()
      .nullable()
      .refine((v) => v === null || cuitValido(v), { message: 'El CUIT no es válido. Revisá los números.' })
      .transform((v) => (v === null ? null : normalizarCuit(v))),
  )
  .optional();

export const esquemaProveedor = z.object({
  nombre: textoRequerido('el nombre', 100),
  cuit: zCuit,
  telefono: textoOpcional(50),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().email('Email inválido').nullable()).optional(),
  direccion: textoOpcional(200),
  contacto: textoOpcional(100),
  cbu_alias: textoOpcional(60),
  plazo_pago_dias: z.coerce
    .number({ invalid_type_error: 'Ingresá la cantidad de días' })
    .int('Ingresá días enteros')
    .min(0, 'No puede ser negativo')
    .max(365, 'Máximo 365 días')
    .optional(),
  dias_entrega: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  notas: textoOpcional(1000),
  activo: z.boolean().optional(),
});
```

Reemplazar `esquemaPagoProveedor` y agregar los dos esquemas nuevos debajo de `esquemaNotaCredito`:

```js
export const esquemaPagoProveedor = z
  .object({
    importe: zPesosPositivo,
    medio_pago: z.enum(MEDIOS_PAGO_PROVEEDOR),
    caja_id: zId.optional(),
    referencia: textoOpcional(60),
    fecha: fecha.optional(),
    descripcion: textoOpcional(200),
    cheque_numero: textoOpcional(30),
    cheque_banco: textoOpcional(60),
    cheque_fecha_cobro: fechaOpcional,
  })
  .refine((p) => p.medio_pago !== 'EFECTIVO_CAJA' || p.caja_id, { message: 'Elegí de qué caja sale la plata', path: ['caja_id'] })
  .refine((p) => p.medio_pago !== 'CHEQUE' || p.cheque_fecha_cobro, { message: 'Completá la fecha de cobro del cheque', path: ['cheque_fecha_cobro'] });

export const esquemaAnularMovimientoProveedor = z.object({
  motivo: textoRequerido('por qué se anula', 200).refine((v) => v.length >= 3, { message: 'Contá un poco más por qué' }),
  caja_id: zId.optional(),
});

export const esquemaResumenProveedor = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
});
```

- [ ] **Paso 5: correr y ver que pasa**

Correr: `npm test -- proveedores-utiles`. Esperado: PASS. Correr también `npm test -- fase2`. Esperado: PASS (el pago sin cheque no cambió).

---

### Tarea 3: Migración de la base

**Archivos:**
- Crear: `server/src/db/migraciones/20261014000001_proveedores_completo.js`
- Modificar: `server/src/modules/compras/compras.service.js:85-94` (el pago de contado guarda `compra_id`)
- Modificar: `server/src/middlewares/errores.js` (mensaje de unicidad nuevo)
- Test: `server/test/proveedores.test.js` (archivo nuevo)

**Interfaces que produce (para las tareas siguientes):**
- `proveedores.cbu_alias TEXT`, `plazo_pago_dias INTEGER NOT NULL DEFAULT 0`, `dias_entrega SMALLINT[] NOT NULL DEFAULT '{}'`
- `cc_proveedores_movimientos.anula_movimiento_id`, `cheque_numero`, `cheque_banco`, `cheque_fecha_cobro`; tipos nuevos `ANULACION_PAGO` y `ANULACION_NOTA_CREDITO`
- `caja_movimientos.tipo` acepta `ANULACION_PAGO_PROVEEDOR` (importe > 0)
- El `PAGO` de una compra de contado tiene `compra_id`

- [ ] **Paso 1: escribir el test que falla**

```js
// server/test/proveedores.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, reiniciarBase, login, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja } from './helpers.js';

describe('Proveedores · base de datos', () => {
  let admin;
  let prov;
  let merluza;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
    prov = await crearProveedor(admin);
  });

  it('el pago de una compra de contado queda atado a esa compra', async () => {
    await abrirCaja(admin, '100000');
    const res = await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '2', costo_unitario: '5000' }], {
      condicion: 'CONTADO', medio_pago: 'EFECTIVO_CAJA', caja_id: 1,
    });
    expect(res.status).toBe(201);
    const pago = await db('cc_proveedores_movimientos').where({ proveedor_id: prov.id, tipo: 'PAGO' }).first();
    expect(pago.compra_id).toBe(res.body.id);
  });

  it('las columnas nuevas existen con sus valores por defecto', async () => {
    const p = await db('proveedores').where({ id: prov.id }).first();
    expect(p.plazo_pago_dias).toBe(0);
    expect(p.dias_entrega).toEqual([]);
    expect(p.cbu_alias).toBe(null);
  });

  it('no deja cargar datos de cheque en un pago que no es con cheque', async () => {
    const usuario = await db('usuarios').first('id');
    await expect(
      db('cc_proveedores_movimientos').insert({
        proveedor_id: prov.id, tipo: 'PAGO', importe: '-10.00', medio_pago: 'TRANSFERENCIA', cheque_fecha_cobro: '2026-10-20', usuario_id: usuario.id,
      }),
    ).rejects.toThrow(/ck_cc_prov_cheque/);
  });
});
```

- [ ] **Paso 2: correr y ver que falla**

Correr: `npm test -- proveedores.test`. Esperado: FAIL (`compra_id` es `null`; `plazo_pago_dias` es `undefined`).

- [ ] **Paso 3: escribir la migración**

```js
// server/src/db/migraciones/20261014000001_proveedores_completo.js
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

    -- Los pagos de contado ya cargados se atan a su compra (la tabla es de solo inserción: se abre solo para esto)
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
```

Nota: los nombres `cc_proveedores_movimientos_tipo_check` y `caja_movimientos_tipo_check` son los que Postgres les pone a los `CHECK` escritos en la misma línea de la columna, en `001_esquema_inicial.sql` (formato `<tabla>_<columna>_check`). Si la migración falla con "constraint does not exist", buscar el nombre real con
`SELECT conname FROM pg_constraint WHERE conrelid = 'caja_movimientos'::regclass;`.

- [ ] **Paso 4: atar el pago de contado a su compra**

En `server/src/modules/compras/compras.service.js`, dentro del `insert` del `PAGO` de contado (línea ~85), agregar `compra_id: compra.id,` después de `tipo: 'PAGO',`.

- [ ] **Paso 5: agregar el mensaje de "ya anulado"**

En `server/src/middlewares/errores.js`, en `MENSAJES_UNICOS`, agregar:

```js
  cc_proveedores_movimientos_anula_movimiento_id_key: 'Ese movimiento ya estaba anulado.',
```

- [ ] **Paso 6: correr y ver que pasa**

Correr: `npm test -- proveedores.test fase2 caja`. Esperado: PASS.

---

### Tarea 4: Imputación automática de pagos (función pura)

**Archivos:**
- Crear: `server/src/modules/proveedores/imputacion.js`
- Modificar: `server/src/lib/fechas.js` (agregar `diasEntre`)
- Test: `server/test/proveedores-imputacion.test.js`

**Interfaces que produce:**

```ts
diasEntre(desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD'): number   // hasta − desde, en días

imputar({ movimientos, compras, plazoDias, hoy }): {
  saldo: string,                 // Σ importe de todos los movimientos, '0.00'
  vencido: string,               // Σ pendiente de las compras VENCIDA
  proximo_vencimiento: { fecha: string, importe: string } | null,  // el más cercano que todavía no venció
  compras: Array<{
    compra_id: number, fecha: string, vence: string,
    tipo_documento: string, numero_documento: string|null,
    total: string, pagado: string, pendiente: string,
    estado: 'PAGADA'|'PARCIAL'|'PENDIENTE'|'VENCIDA',
    dias_para_vencer: number,    // negativo = días de atraso
  }>                             // ordenadas de la más vieja a la más nueva, solo las CONFIRMADA
}
// movimientos: { id, tipo, importe, compra_id, anula_movimiento_id } (cualquier orden)
// compras: { id, fecha, total, estado, tipo_documento, numero_documento }
```

- [ ] **Paso 1: escribir el test que falla**

```js
// server/test/proveedores-imputacion.test.js
import { describe, it, expect } from 'vitest';
import { imputar } from '../src/modules/proveedores/imputacion.js';
import { diasEntre } from '../src/lib/fechas.js';

const compra = (id, fecha, total, extra = {}) => ({ id, fecha, total, estado: 'CONFIRMADA', tipo_documento: 'REMITO', numero_documento: String(id), ...extra });
let n = 0;
const mov = (tipo, importe, extra = {}) => ({ id: ++n, tipo, importe, compra_id: null, anula_movimiento_id: null, ...extra });
const sumaPendiente = (r) => r.compras.reduce((a, c) => a + Number(c.pendiente), 0);

describe('diasEntre', () => {
  it('cuenta días de calendario', () => {
    expect(diasEntre('2026-10-01', '2026-10-14')).toBe(13);
    expect(diasEntre('2026-10-14', '2026-10-01')).toBe(-13);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('imputar', () => {
  const hoy = '2026-10-14';

  it('el pago cancela primero la compra más vieja y marca vencidas según el plazo', () => {
    const compras = [compra(1, '2026-09-01', '100000.00'), compra(2, '2026-10-10', '50000.00')];
    const movimientos = [
      mov('COMPRA', '100000.00', { compra_id: 1 }),
      mov('COMPRA', '50000.00', { compra_id: 2 }),
      mov('PAGO', '-120000.00'),
    ];
    const r = imputar({ movimientos, compras, plazoDias: 15, hoy });
    expect(r.saldo).toBe('30000.00');
    expect(r.compras.map((c) => c.estado)).toEqual(['PAGADA', 'PARCIAL']);
    expect(r.compras[1]).toMatchObject({ pendiente: '30000.00', pagado: '20000.00', vence: '2026-10-25', dias_para_vencer: 11 });
    expect(r.vencido).toBe('0.00');
    expect(r.proximo_vencimiento).toEqual({ fecha: '2026-10-25', importe: '30000.00' });
    expect(sumaPendiente(r)).toBe(30000);
  });

  it('una compra impaga después del plazo está vencida, con los días de atraso', () => {
    const r = imputar({ movimientos: [mov('COMPRA', '80000.00', { compra_id: 1 })], compras: [compra(1, '2026-09-20', '80000.00')], plazoDias: 10, hoy });
    expect(r.compras[0]).toMatchObject({ estado: 'VENCIDA', vence: '2026-09-30', dias_para_vencer: -14 });
    expect(r.vencido).toBe('80000.00');
    expect(r.proximo_vencimiento).toBe(null);
  });

  it('el pago de contado se aplica a su propia compra aunque haya deuda vieja', () => {
    const compras = [compra(1, '2026-09-01', '100000.00'), compra(2, '2026-10-12', '30000.00')];
    const movimientos = [
      mov('COMPRA', '100000.00', { compra_id: 1 }),
      mov('COMPRA', '30000.00', { compra_id: 2 }),
      mov('PAGO', '-30000.00', { compra_id: 2 }),
    ];
    const r = imputar({ movimientos, compras, plazoDias: 0, hoy });
    expect(r.compras.find((c) => c.compra_id === 2).estado).toBe('PAGADA');
    expect(r.compras.find((c) => c.compra_id === 1)).toMatchObject({ estado: 'VENCIDA', pendiente: '100000.00' });
    expect(sumaPendiente(r)).toBe(Number(r.saldo));
  });

  it('las compras anuladas no cuentan; si era de contado su pago queda a favor', () => {
    const compras = [compra(1, '2026-10-01', '40000.00', { estado: 'ANULADA' }), compra(2, '2026-10-05', '25000.00')];
    const movimientos = [
      mov('COMPRA', '40000.00', { compra_id: 1 }),
      mov('PAGO', '-40000.00', { compra_id: 1 }),
      mov('ANULACION_COMPRA', '-40000.00', { compra_id: 1 }),
      mov('COMPRA', '25000.00', { compra_id: 2 }),
    ];
    const r = imputar({ movimientos, compras, plazoDias: 30, hoy });
    expect(r.compras).toHaveLength(1);
    expect(r.saldo).toBe('-15000.00');
    expect(r.compras[0].estado).toBe('PAGADA');
    expect(r.vencido).toBe('0.00');
    expect(r.proximo_vencimiento).toBe(null);
  });

  it('un pago anulado no paga nada', () => {
    const pago = mov('PAGO', '-50000.00');
    const movimientos = [mov('COMPRA', '50000.00', { compra_id: 1 }), pago, mov('ANULACION_PAGO', '50000.00', { anula_movimiento_id: pago.id })];
    const r = imputar({ movimientos, compras: [compra(1, '2026-10-14', '50000.00')], plazoDias: 0, hoy });
    expect(r.saldo).toBe('50000.00');
    expect(r.compras[0]).toMatchObject({ estado: 'PENDIENTE', pendiente: '50000.00', dias_para_vencer: 0 });
    expect(r.proximo_vencimiento).toEqual({ fecha: '2026-10-14', importe: '50000.00' });
  });

  it('las notas de crédito también bajan la deuda más vieja', () => {
    const movimientos = [mov('COMPRA', '10000.00', { compra_id: 1 }), mov('NOTA_CREDITO', '-4000.00')];
    const r = imputar({ movimientos, compras: [compra(1, '2026-10-01', '10000.00')], plazoDias: 30, hoy });
    expect(r.compras[0]).toMatchObject({ estado: 'PARCIAL', pendiente: '6000.00' });
  });

  it('sin movimientos no hay deuda', () => {
    expect(imputar({ movimientos: [], compras: [], plazoDias: 0, hoy })).toEqual({ saldo: '0.00', vencido: '0.00', proximo_vencimiento: null, compras: [] });
  });
});
```

- [ ] **Paso 2: correr y ver que falla**

Correr: `npm test -- proveedores-imputacion`. Esperado: FAIL (no se puede resolver `imputacion.js`).

- [ ] **Paso 3: implementar**

En `server/src/lib/fechas.js`, agregar:

```js
// Días de calendario entre dos fechas 'YYYY-MM-DD' (hasta − desde)
export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}
```

```js
// server/src/modules/proveedores/imputacion.js
import { aPesos, dec } from '@pescaderia/shared';
import { diasEntre, sumarDias } from '../../lib/fechas.js';

const ANULACIONES = new Set(['ANULACION_PAGO', 'ANULACION_NOTA_CREDITO']);
const DE_COMPRA = new Set(['COMPRA', 'ANULACION_COMPRA']);
const menor = (a, b) => (a.lt(b) ? a : b);

/**
 * Qué compras de un proveedor están pagadas, a medias o vencidas. Función pura: no toca la base.
 * Regla: el pago de contado (PAGO con compra_id) va a su compra; todo lo demás que baja la deuda
 * (pagos, notas de crédito) se aplica a las compras de la más vieja a la más nueva.
 * Las compras anuladas y los movimientos anulados (con su anulación) no cuentan.
 */
export function imputar({ movimientos, compras, plazoDias = 0, hoy }) {
  const anulados = new Set(movimientos.filter((m) => ANULACIONES.has(m.tipo)).map((m) => Number(m.anula_movimiento_id)));
  const vigentes = movimientos.filter((m) => !ANULACIONES.has(m.tipo) && !anulados.has(Number(m.id)));
  const confirmadas = compras
    .filter((c) => c.estado === 'CONFIRMADA')
    .sort((a, b) => (a.fecha === b.fecha ? Number(a.id) - Number(b.id) : a.fecha < b.fecha ? -1 : 1));
  const falta = new Map(confirmadas.map((c) => [Number(c.id), dec(0)]));

  // 1) Lo que se debe por cada compra confirmada
  for (const m of vigentes) {
    if (m.tipo === 'COMPRA' && falta.has(Number(m.compra_id))) {
      falta.set(Number(m.compra_id), falta.get(Number(m.compra_id)).plus(m.importe));
    }
  }

  // 2) Pagos de contado a su compra; el resto de los créditos al pozo común
  let pozo = dec(0);
  for (const m of vigentes) {
    if (DE_COMPRA.has(m.tipo)) continue;
    let credito = dec(m.importe).neg();
    const id = Number(m.compra_id);
    if (m.tipo === 'PAGO' && m.compra_id != null && falta.has(id) && credito.gt(0)) {
      const aplica = menor(credito, falta.get(id));
      falta.set(id, falta.get(id).minus(aplica));
      credito = credito.minus(aplica);
    }
    pozo = pozo.plus(credito);
  }

  // 3) El pozo cancela de la compra más vieja a la más nueva
  const resultado = confirmadas.map((c) => {
    let pendiente = falta.get(Number(c.id));
    if (pozo.gt(0) && pendiente.gt(0)) {
      const aplica = menor(pozo, pendiente);
      pendiente = pendiente.minus(aplica);
      pozo = pozo.minus(aplica);
    }
    const vence = sumarDias(c.fecha, plazoDias);
    const diasParaVencer = diasEntre(hoy, vence);
    let estado = 'PENDIENTE';
    if (pendiente.lte(0)) estado = 'PAGADA';
    else if (diasParaVencer < 0) estado = 'VENCIDA';
    else if (pendiente.lt(c.total)) estado = 'PARCIAL';
    return {
      compra_id: Number(c.id),
      fecha: c.fecha,
      vence,
      tipo_documento: c.tipo_documento,
      numero_documento: c.numero_documento ?? null,
      total: aPesos(c.total),
      pagado: aPesos(dec(c.total).minus(pendiente)),
      pendiente: aPesos(pendiente),
      estado,
      dias_para_vencer: diasParaVencer,
    };
  });

  const vencido = resultado.filter((c) => c.estado === 'VENCIDA').reduce((a, c) => a.plus(c.pendiente), dec(0));
  const porVencer = resultado.filter((c) => c.estado === 'PENDIENTE' || c.estado === 'PARCIAL');
  const fechaProxima = porVencer.reduce((min, c) => (min === null || c.vence < min ? c.vence : min), null);
  const proximo = fechaProxima && {
    fecha: fechaProxima,
    importe: aPesos(porVencer.filter((c) => c.vence === fechaProxima).reduce((a, c) => a.plus(c.pendiente), dec(0))),
  };

  return {
    saldo: aPesos(movimientos.reduce((a, m) => a.plus(m.importe), dec(0))),
    vencido: aPesos(vencido),
    proximo_vencimiento: proximo || null,
    compras: resultado,
  };
}
```

- [ ] **Paso 4: correr y ver que pasa**

Correr: `npm test -- proveedores-imputacion`. Esperado: PASS (8 tests).

---

### Tarea 5: Ficha del proveedor, lista con vencidos y CUIT sin repetir

**Archivos:**
- Crear: `server/src/modules/proveedores/deuda.service.js`
- Modificar: `server/src/modules/proveedores/proveedores.service.js` (CUIT repetido; `listar` con vencidos)
- Modificar: `server/src/modules/proveedores/cuenta.service.js` (`obtenerCuenta` → `ficha`)
- Modificar: `server/src/modules/proveedores/proveedores.routes.js` (`/:id/cuenta` → `/:id/ficha`; `listar` con saldos)
- Modificar: `server/test/fase2.test.js:249,269,275` (`/cuenta` → `/ficha`)
- Test: `server/test/proveedores.test.js`

**Interfaces que consume:** `imputar` (Tarea 4) y las columnas nuevas (Tarea 3).

**Interfaces que produce:**
- `estadoDeudas(conexion, proveedores: [{id, plazo_pago_dias}], hoyIso?) → Map<id, ResultadoImputar>`
- `GET /api/proveedores` (dueño): cada fila suma `saldo`, `vencido` y `proximo_vencimiento`; ordena primero por `vencido` (de mayor a menor) y después por nombre.
- `GET /api/proveedores/:id/ficha` → `{ proveedor, saldo, vencido, proximo_vencimiento, compras_pendientes, productos, movimientos }`
  - `productos`: `[{ producto_id, producto, unidad, costo_unitario, fecha, costo_anterior }]`
  - `movimientos`: los de antes, más `anulado: boolean`, `se_puede_anular: boolean` y los campos de cheque

- [ ] **Paso 1: escribir el test que falla** (agregar a `server/test/proveedores.test.js`)

```js
import { hoy, sumarDias } from '../src/lib/fechas.js';

describe('Proveedores · ficha y lista', () => {
  let admin;
  let merluza;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
  });

  it('guarda los datos nuevos, normaliza el CUIT y no deja repetirlo', async () => {
    const res = await admin.post('/api/proveedores').send({ nombre: 'Del Puerto', cuit: '20123456786', plazo_pago_dias: 15, dias_entrega: [1, 4], cbu_alias: 'puerto.pesca' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ cuit: '20-12345678-6', plazo_pago_dias: 15, dias_entrega: [1, 4], cbu_alias: 'puerto.pesca' });
    const otro = await admin.post('/api/proveedores').send({ nombre: 'Otro', cuit: '20-12345678-6' });
    expect(otro.status).toBe(409);
    expect(otro.body.error.mensaje).toBe('Ese CUIT ya lo tiene Del Puerto.');
    expect(otro.body.error.campos.cuit).toBeTruthy();
    // Editar el mismo proveedor con su propio CUIT no es "repetido"
    expect((await admin.put(`/api/proveedores/${res.body.id}`).send({ cuit: '20-12345678-6', nombre: 'Del Puerto SA' })).status).toBe(200);
  });

  it('la ficha muestra compras sin pagar, vencidas, productos con su último precio y el próximo vencimiento', async () => {
    const prov = (await admin.post('/api/proveedores').send({ nombre: 'Del Puerto', plazo_pago_dias: 10 })).body;
    const vieja = sumarDias(hoy(), -20);
    const nueva = sumarDias(hoy(), -2);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '10', costo_unitario: '6000' }], { fecha: vieja, numero_documento: 'R-1' });
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '5', costo_unitario: '7000' }], { fecha: nueva, numero_documento: 'R-2' });
    await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '20000', medio_pago: 'TRANSFERENCIA' });

    const f = (await admin.get(`/api/proveedores/${prov.id}/ficha`)).body;
    expect(f.saldo).toBe('75000.00');
    expect(f.vencido).toBe('40000.00');
    expect(f.compras_pendientes.map((c) => [c.numero_documento, c.estado, c.pendiente])).toEqual([
      ['R-1', 'VENCIDA', '40000.00'],
      ['R-2', 'PENDIENTE', '35000.00'],
    ]);
    expect(f.proximo_vencimiento).toEqual({ fecha: sumarDias(nueva, 10), importe: '35000.00' });
    expect(f.productos).toEqual([
      expect.objectContaining({ producto: 'Merluza filet', costo_unitario: '7000.0000', costo_anterior: '6000.0000', fecha: nueva }),
    ]);
    expect(f.movimientos[0]).toMatchObject({ tipo: 'PAGO', anulado: false, se_puede_anular: true });
  });

  it('la lista pone primero a los que tienen deuda vencida; el cajero no ve saldos', async () => {
    const a = (await admin.post('/api/proveedores').send({ nombre: 'Aaa al día', plazo_pago_dias: 30 })).body;
    const z = (await admin.post('/api/proveedores').send({ nombre: 'Zzz vencido' })).body;
    await ingresarMercaderia(admin, a.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '1000' }], { fecha: hoy() });
    await ingresarMercaderia(admin, z.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '2000' }], { fecha: sumarDias(hoy(), -3) });

    const lista = (await admin.get('/api/proveedores?activo=todos')).body;
    expect(lista.map((p) => p.nombre)).toEqual(['Zzz vencido', 'Aaa al día']);
    expect(lista[0]).toMatchObject({ saldo: '2000.00', vencido: '2000.00' });
    expect(lista[1]).toMatchObject({ vencido: '0.00', proximo_vencimiento: { fecha: sumarDias(hoy(), 30), importe: '1000.00' } });

    const cajero = await crearCajero();
    const suya = (await cajero.get('/api/proveedores')).body;
    expect(suya[0].saldo).toBeUndefined();
    expect(suya[0].vencido).toBeUndefined();
    expect((await cajero.get(`/api/proveedores/${z.id}/ficha`)).status).toBe(403);
  });

  it('la compra de contado figura pagada aunque haya deuda vieja (de punta a punta)', async () => {
    const prov = (await admin.post('/api/proveedores').send({ nombre: 'Del Puerto' })).body;
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '9000' }], { fecha: sumarDias(hoy(), -5), numero_documento: 'VIEJA' });
    await abrirCaja(admin, '50000');
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '4000' }], {
      fecha: hoy(), numero_documento: 'CONTADO', condicion: 'CONTADO', medio_pago: 'EFECTIVO_CAJA', caja_id: 1,
    });
    const f = (await admin.get(`/api/proveedores/${prov.id}/ficha`)).body;
    expect(f.compras_pendientes.map((c) => c.numero_documento)).toEqual(['VIEJA']);
    expect(f.movimientos.find((m) => m.tipo === 'PAGO').se_puede_anular).toBe(false);
  });
});
```

Sumar `crearCajero` al `import` de `./helpers.js` al principio del archivo.

- [ ] **Paso 2: correr y ver que falla**

Correr: `npm test -- proveedores.test`. Esperado: FAIL (404 en `/ficha`; el CUIT no se valida como repetido).

- [ ] **Paso 3: escribir `deuda.service.js`**

```js
// server/src/modules/proveedores/deuda.service.js
import { db } from '../../config/db.js';
import { hoy } from '../../lib/fechas.js';
import { imputar } from './imputacion.js';

const agrupar = (filas) => filas.reduce((m, f) => m.set(f.proveedor_id, [...(m.get(f.proveedor_id) ?? []), f]), new Map());

/** Estado de deuda (saldo, vencido, próximo vencimiento, compras) de varios proveedores con dos consultas. */
export async function estadoDeudas(conexion, proveedores, hoyIso = hoy()) {
  if (!proveedores.length) return new Map();
  const ids = proveedores.map((p) => p.id);
  const [movimientos, compras] = await Promise.all([
    conexion('cc_proveedores_movimientos').whereIn('proveedor_id', ids).select('id', 'proveedor_id', 'tipo', 'importe', 'compra_id', 'anula_movimiento_id'),
    conexion('compras').whereIn('proveedor_id', ids).select('id', 'proveedor_id', 'fecha', 'total', 'estado', 'tipo_documento', 'numero_documento'),
  ]);
  const movs = agrupar(movimientos);
  const comps = agrupar(compras);
  return new Map(
    proveedores.map((p) => [p.id, imputar({ movimientos: movs.get(p.id) ?? [], compras: comps.get(p.id) ?? [], plazoDias: p.plazo_pago_dias, hoy: hoyIso })]),
  );
}

export async function estadoDeuda(proveedor, conexion = db) {
  return (await estadoDeudas(conexion, [proveedor])).get(proveedor.id);
}
```

- [ ] **Paso 4: CUIT sin repetir y lista con vencidos** (`proveedores.service.js`)

Reemplazar el archivo:

```js
import { db } from '../../config/db.js';
import { ErrorApp, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import { estadoDeudas } from './deuda.service.js';

/** conSaldos: solo el dueño ve cuánto se le debe y qué está vencido. */
export async function listar({ q, activo = 'true' }, { conSaldos = false } = {}) {
  const query = db('proveedores as p').select('p.*').orderBy('p.nombre');
  if (activo !== 'todos') query.where('p.activo', activo === 'true');
  if (q) query.whereILike('p.nombre', `%${q}%`);
  const lista = await query;
  if (!conSaldos) return lista;
  const estados = await estadoDeudas(db, lista);
  return lista
    .map((p) => {
      const e = estados.get(p.id);
      return { ...p, saldo: e.saldo, vencido: e.vencido, proximo_vencimiento: e.proximo_vencimiento };
    })
    .sort((a, b) => Number(b.vencido) - Number(a.vencido) || a.nombre.localeCompare(b.nombre, 'es'));
}

export async function obtener(id) {
  const p = await db('proveedores').where({ id }).first();
  if (!p) throw new ErrorNoEncontrado('El proveedor');
  return p;
}

async function verificarCuitLibre(trx, cuit, idPropio = null) {
  if (!cuit) return;
  const query = trx('proveedores').whereRaw("regexp_replace(cuit, '[^0-9]', '', 'g') = ?", [cuit.replace(/\D/g, '')]);
  if (idPropio) query.whereNot({ id: idPropio });
  const otro = await query.first('nombre');
  if (otro) {
    const mensaje = `Ese CUIT ya lo tiene ${otro.nombre}.`;
    throw new ErrorApp(mensaje, { codigo: 'CUIT_REPETIDO', status: 409, campos: { cuit: mensaje } });
  }
}

export async function crear(ctx, datos) {
  return db.transaction(async (trx) => {
    await verificarCuitLibre(trx, datos.cuit);
    const [p] = await trx('proveedores').insert(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'PROVEEDOR_CREADO', entidad: 'proveedor', entidadId: p.id, despues: p });
    return p;
  });
}

export async function actualizar(ctx, id, datos) {
  return db.transaction(async (trx) => {
    const antes = await trx('proveedores').where({ id }).first();
    if (!antes) throw new ErrorNoEncontrado('El proveedor');
    await verificarCuitLibre(trx, datos.cuit, id);
    const [p] = await trx('proveedores').where({ id }).update(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'PROVEEDOR_MODIFICADO', entidad: 'proveedor', entidadId: id, antes, despues: p });
    return p;
  });
}
```

`Number(b.vencido)` se usa solo para ordenar, no para operar plata. Se acepta.

- [ ] **Paso 5: la ficha** (`cuenta.service.js`: reemplazar `obtenerCuenta` por `ficha`)

```js
import { estadoDeuda } from './deuda.service.js';

const ANULABLES = ['PAGO', 'NOTA_CREDITO'];

/** Todo lo del proveedor en una sola consulta para la pantalla: saldo, vencimientos, compras sin pagar, productos y movimientos. */
export async function ficha(id, limite = 200) {
  const proveedor = await db('proveedores').where({ id }).first();
  if (!proveedor) throw new ErrorNoEncontrado('El proveedor');
  const acumulados = db('cc_proveedores_movimientos as m')
    .join('usuarios as u', 'u.id', 'm.usuario_id')
    .where('m.proveedor_id', id)
    .select(
      'm.id', 'm.tipo', 'm.importe', 'm.compra_id', 'm.medio_pago', 'm.referencia', 'm.fecha', 'm.descripcion', 'm.creado_en',
      'm.anula_movimiento_id', 'm.cheque_numero', 'm.cheque_banco', 'm.cheque_fecha_cobro',
      'u.nombre as usuario_nombre',
      db.raw('SUM(m.importe) OVER (ORDER BY m.id) AS saldo_acumulado'),
      db.raw('EXISTS (SELECT 1 FROM cc_proveedores_movimientos a WHERE a.anula_movimiento_id = m.id) AS anulado'),
    )
    .as('x');
  const [movimientos, estado, productos] = await Promise.all([
    db.select('*').from(acumulados).orderBy('id', 'desc').limit(limite),
    estadoDeuda(proveedor),
    db
      .select('producto_id', 'producto', 'unidad', 'costo_unitario', 'fecha', 'costo_anterior')
      .from(
        db('compra_items as ci')
          .join('compras as c', 'c.id', 'ci.compra_id')
          .join('productos as p', 'p.id', 'ci.producto_id')
          .where({ 'c.proveedor_id': id, 'c.estado': 'CONFIRMADA' })
          .select(
            'ci.producto_id', 'p.nombre as producto', 'p.unidad', 'ci.costo_unitario', 'c.fecha',
            db.raw('LAG(ci.costo_unitario) OVER (PARTITION BY ci.producto_id ORDER BY c.fecha, c.id, ci.id) AS costo_anterior'),
            db.raw('ROW_NUMBER() OVER (PARTITION BY ci.producto_id ORDER BY c.fecha DESC, c.id DESC, ci.id DESC) AS n'),
          )
          .as('y'),
      )
      .where('n', 1)
      .orderBy('producto'),
  ]);
  return {
    proveedor,
    saldo: estado.saldo,
    vencido: estado.vencido,
    proximo_vencimiento: estado.proximo_vencimiento,
    compras_pendientes: estado.compras.filter((c) => c.estado !== 'PAGADA'),
    productos,
    movimientos: movimientos.map((m) => ({
      ...m,
      se_puede_anular: ANULABLES.includes(m.tipo) && !m.anulado && !(m.tipo === 'PAGO' && m.compra_id),
    })),
  };
}
```

Borrar los imports que queden sin usar (`aPesos` sigue usándose en `registrarPago`).

- [ ] **Paso 6: las rutas** (`proveedores.routes.js`)

```js
proveedoresRouter.get('/', validar(esquemaListado, 'query'), async (req, res) => {
  res.json(await service.listar(req.datos, { conSaldos: puede(req, 'proveedores.editar') }));
});

// Reemplaza a /:id/cuenta. Es información del dueño
proveedoresRouter.get('/:id/ficha', editar, async (req, res) => {
  res.json(await cuenta.ficha(Number(req.params.id)));
});
```

Borrar la ruta `/:id/cuenta`. En `server/test/fase2.test.js`, cambiar las tres apariciones de `/cuenta` por `/ficha` (líneas 249, 269 y 275).

- [ ] **Paso 7: correr y ver que pasa**

Correr: `npm test -- proveedores fase2`. Esperado: PASS.

---

### Tarea 6: Pago con cheque y anular pagos y notas de crédito

**Archivos:**
- Modificar: `server/src/modules/proveedores/cuenta.service.js` (`registrarPago` con cheque; nuevo `anularMovimiento`)
- Modificar: `server/src/modules/proveedores/proveedores.routes.js` (ruta de anulación)
- Test: `server/test/proveedores.test.js`

**Interfaces que produce:**
- `POST /api/proveedores/:id/movimientos/:movId/anular` con body `{ motivo, caja_id? }`. Respuestas: `201` con el movimiento de anulación; `409 NO_ANULABLE | PAGO_DE_COMPRA | YA_ANULADO`; `400 ELEGIR_CAJA`.

- [ ] **Paso 1: escribir el test que falla**

```js
describe('Proveedores · cheques y anulaciones', () => {
  let admin;
  let prov;
  let merluza;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
    prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '10', costo_unitario: '10000' }], { fecha: hoy() }); // 100.000
  });

  const ficha = async () => (await admin.get(`/api/proveedores/${prov.id}/ficha`)).body;
  const efectivoCaja = async () => (await admin.get('/api/cajas/1/actual')).body.totales_por_medio.EFECTIVO;

  it('guarda los datos del cheque', async () => {
    const res = await admin.post(`/api/proveedores/${prov.id}/pagos`).send({
      importe: '30000', medio_pago: 'CHEQUE', cheque_numero: '00123', cheque_banco: 'Nación', cheque_fecha_cobro: sumarDias(hoy(), 5),
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ cheque_numero: '00123', cheque_banco: 'Nación', cheque_fecha_cobro: sumarDias(hoy(), 5) });
  });

  it('anula un pago en efectivo: la plata vuelve a la caja y la deuda vuelve a lo que era', async () => {
    await abrirCaja(admin, '50000');
    const pago = (await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '40000', medio_pago: 'EFECTIVO_CAJA', caja_id: 1 })).body;
    expect(await efectivoCaja()).toBe('10000.00');

    const res = await admin.post(`/api/proveedores/${prov.id}/movimientos/${pago.id}/anular`).send({ motivo: 'Lo cargué dos veces' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tipo: 'ANULACION_PAGO', importe: '40000.00', anula_movimiento_id: pago.id });
    expect(await efectivoCaja()).toBe('50000.00');
    const f = await ficha();
    expect(f.saldo).toBe('100000.00');
    expect(f.movimientos.find((m) => m.id === pago.id)).toMatchObject({ anulado: true, se_puede_anular: false });

    const otraVez = await admin.post(`/api/proveedores/${prov.id}/movimientos/${pago.id}/anular`).send({ motivo: 'De nuevo' });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error.codigo).toBe('YA_ANULADO');
  });

  it('si el turno del pago ya cerró, pide a qué caja vuelve la plata', async () => {
    await abrirCaja(admin, '50000');
    const pago = (await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '20000', medio_pago: 'EFECTIVO_CAJA', caja_id: 1 })).body;
    await admin.post('/api/caja-sesiones/1/cerrar').send({ efectivo_contado: '30000' });

    const sinCaja = await admin.post(`/api/proveedores/${prov.id}/movimientos/${pago.id}/anular`).send({ motivo: 'Error de importe' });
    expect(sinCaja.status).toBe(400);
    expect(sinCaja.body.error.codigo).toBe('ELEGIR_CAJA');
    expect((await ficha()).saldo).toBe('80000.00');

    await abrirCaja(admin, '1000');
    const conCaja = await admin.post(`/api/proveedores/${prov.id}/movimientos/${pago.id}/anular`).send({ motivo: 'Error de importe', caja_id: 1 });
    expect(conCaja.status).toBe(201);
    expect(await efectivoCaja()).toBe('21000.00');
  });

  it('anula una nota de crédito; no anula compras ni el pago de contado de una compra', async () => {
    const nc = (await admin.post(`/api/proveedores/${prov.id}/notas-credito`).send({ importe: '5000', descripcion: 'Devolución' })).body;
    expect((await admin.post(`/api/proveedores/${prov.id}/movimientos/${nc.id}/anular`).send({ motivo: 'No correspondía' })).status).toBe(201);
    expect((await ficha()).saldo).toBe('100000.00');

    const compra = (await ficha()).movimientos.find((m) => m.tipo === 'COMPRA');
    const r1 = await admin.post(`/api/proveedores/${prov.id}/movimientos/${compra.id}/anular`).send({ motivo: 'Probando' });
    expect(r1.body.error.codigo).toBe('NO_ANULABLE');

    await abrirCaja(admin, '50000');
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '1000' }], { fecha: hoy(), condicion: 'CONTADO', medio_pago: 'EFECTIVO_CAJA', caja_id: 1 });
    const pagoContado = (await ficha()).movimientos.find((m) => m.tipo === 'PAGO' && m.compra_id);
    const r2 = await admin.post(`/api/proveedores/${prov.id}/movimientos/${pagoContado.id}/anular`).send({ motivo: 'Probando' });
    expect(r2.status).toBe(409);
    expect(r2.body.error.codigo).toBe('PAGO_DE_COMPRA');
  });

  it('el cajero no puede anular', async () => {
    const pago = (await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '1000', medio_pago: 'OTRO' })).body;
    const cajero = await crearCajero();
    expect((await cajero.post(`/api/proveedores/${prov.id}/movimientos/${pago.id}/anular`).send({ motivo: 'Probando' })).status).toBe(403);
  });
});
```

- [ ] **Paso 2: correr y ver que falla**

Correr: `npm test -- proveedores.test`. Esperado: FAIL (no se guardan los datos del cheque; 404 en `/anular`).

- [ ] **Paso 3: cheque en `registrarPago`** (`cuenta.service.js`)

En el `insert` de `registrarPago`, después de `descripcion`, agregar:

```js
        ...(datos.medio_pago === 'CHEQUE'
          ? { cheque_numero: datos.cheque_numero ?? null, cheque_banco: datos.cheque_banco ?? null, cheque_fecha_cobro: datos.cheque_fecha_cobro }
          : {}),
```

En la auditoría del pago, sumar `cheque_fecha_cobro: datos.cheque_fecha_cobro ?? null` al objeto `despues`.

- [ ] **Paso 4: `anularMovimiento`** (`cuenta.service.js`)

Agregar `ErrorNegocio` al import de `../../lib/errores.js`.

```js
/**
 * Anula un pago o una nota de crédito cargados por error. No se borra nada: se agrega el movimiento contrario.
 * Si el pago salió de la caja, la plata vuelve al turno original si sigue abierto; si no, a la caja que se indique.
 */
export async function anularMovimiento(ctx, proveedorId, movimientoId, { motivo, caja_id }) {
  return db.transaction(async (trx) => {
    const proveedor = await trx('proveedores').where({ id: proveedorId }).forUpdate().first('id', 'nombre');
    if (!proveedor) throw new ErrorNoEncontrado('El proveedor');
    const mov = await trx('cc_proveedores_movimientos').where({ id: movimientoId, proveedor_id: proveedorId }).first();
    if (!mov) throw new ErrorNoEncontrado('El movimiento');
    if (!ANULABLES.includes(mov.tipo)) throw new ErrorNegocio('Este movimiento no se puede anular.', 'NO_ANULABLE');
    if (mov.tipo === 'PAGO' && mov.compra_id) {
      throw new ErrorNegocio(`Este pago se hizo al cargar el ingreso de mercadería #${mov.compra_id}. Para anularlo, anulá ese ingreso.`, 'PAGO_DE_COMPRA');
    }
    if (await trx('cc_proveedores_movimientos').where({ anula_movimiento_id: mov.id }).first('id')) {
      throw new ErrorNegocio('Este movimiento ya estaba anulado.', 'YA_ANULADO');
    }

    let cajaMovimientoId = null;
    if (mov.medio_pago === 'EFECTIVO_CAJA') {
      const original = await trx('caja_movimientos').where({ id: mov.caja_movimiento_id }).first('caja_sesion_id');
      let sesion = await trx('caja_sesiones').where({ id: original.caja_sesion_id, estado: 'ABIERTA' }).forShare().first();
      if (!sesion) {
        if (!caja_id) throw new ErrorNegocio('El turno de caja de ese pago ya cerró. Elegí a qué caja abierta vuelve la plata.', 'ELEGIR_CAJA', 400);
        sesion = await caja.sesionAbiertaParaOperar(trx, caja_id);
      }
      const cm = await caja.registrarMovimiento(trx, {
        sesionId: sesion.id,
        tipo: 'ANULACION_PAGO_PROVEEDOR',
        medio: 'EFECTIVO',
        importe: dec(mov.importe).neg(),
        descripcion: `Pago a ${proveedor.nombre} anulado: ${motivo}`,
        usuarioId: ctx.usuario.id,
      });
      cajaMovimientoId = cm.id;
    }

    const [anulacion] = await trx('cc_proveedores_movimientos')
      .insert({
        proveedor_id: proveedorId,
        tipo: mov.tipo === 'PAGO' ? 'ANULACION_PAGO' : 'ANULACION_NOTA_CREDITO',
        importe: aPesos(dec(mov.importe).neg()),
        anula_movimiento_id: mov.id,
        caja_movimiento_id: cajaMovimientoId,
        referencia: mov.referencia,
        descripcion: `Anulación: ${motivo}`,
        usuario_id: ctx.usuario.id,
      })
      .returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: mov.tipo === 'PAGO' ? 'PROVEEDOR_PAGO_ANULADO' : 'PROVEEDOR_NOTA_CREDITO_ANULADA',
      entidad: 'proveedor',
      entidadId: proveedorId,
      motivo,
      antes: { movimiento_id: mov.id, tipo: mov.tipo, importe: mov.importe, medio_pago: mov.medio_pago },
    });
    return anulacion;
  });
}
```

Revisar en `server/src/modules/auditoria/auditoria.service.js` que `registrar` acepte `motivo` y `antes` (`ventas.anular` y `compras.anular` ya los usan).

- [ ] **Paso 5: la ruta** (`proveedores.routes.js`)

```js
proveedoresRouter.post(
  '/:id/movimientos/:movId/anular',
  requierePermiso('proveedores.pagar'),
  validar(esquemaAnularMovimientoProveedor),
  async (req, res) => {
    res.status(201).json(await cuenta.anularMovimiento(ctx(req), Number(req.params.id), Number(req.params.movId), req.datos));
  },
);
```

Sumar `esquemaAnularMovimientoProveedor` al import de `@pescaderia/shared`.

- [ ] **Paso 6: correr y ver que pasa**

Correr: `npm test -- proveedores caja fase2`. Esperado: PASS. Si `caja.test.js` arma el resumen de cierre recorriendo los tipos de movimiento, que el tipo nuevo salga con su etiqueta (`TIPOS_MOV_CAJA_ETIQUETA`, Tarea 2).

---

### Tarea 7: Resumen de cuenta en PDF

**Archivos:**
- Crear: `server/src/modules/proveedores/resumen.service.js`
- Modificar: `server/src/modules/proveedores/proveedores.routes.js`
- Test: `server/test/proveedores.test.js`

**Interfaces que consume:** `estadoDeuda` (Tarea 5) y `fechaCorta`/`formatearCelda` de `reportes.exportar.js`.

**Interfaces que produce:**
- `GET /api/proveedores/:id/resumen.pdf?desde=&hasta=` → `application/pdf`, que se descarga como `resumen-<id>-<hasta>.pdf`.
- `datosResumen(proveedorId, { desde, hasta }) → { proveedor, desde, hasta, saldo_anterior, movimientos: [{ fecha, detalle, importe, saldo }], saldo_final, compras_pendientes }`. Se exporta aparte para poder testearla.

- [ ] **Paso 1: escribir el test que falla**

```js
import { datosResumen } from '../src/modules/proveedores/resumen.service.js';

describe('Proveedores · resumen de cuenta', () => {
  it('arma el saldo anterior, los movimientos del período y el PDF', async () => {
    await reiniciarBase();
    const admin = await login();
    const merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
    const prov = await crearProveedor(admin, 'Del Puerto');
    const antes = sumarDias(hoy(), -40);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '10000' }], { fecha: antes });
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '5000' }], { fecha: hoy() });
    await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '3000', medio_pago: 'TRANSFERENCIA', fecha: hoy() });

    const desde = sumarDias(hoy(), -7);
    const d = await datosResumen(prov.id, { desde, hasta: hoy() });
    expect(d.saldo_anterior).toBe('10000.00');
    expect(d.movimientos.map((m) => [m.importe, m.saldo])).toEqual([['5000.00', '15000.00'], ['-3000.00', '12000.00']]);
    expect(d.saldo_final).toBe('12000.00');

    const res = await admin.get(`/api/proveedores/${prov.id}/resumen.pdf?desde=${desde}&hasta=${hoy()}`).buffer(true).parse((r, cb) => {
      const partes = [];
      r.on('data', (p) => partes.push(p));
      r.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });
});
```

- [ ] **Paso 2: correr y ver que falla**

Correr: `npm test -- proveedores.test`. Esperado: FAIL (no existe `resumen.service.js`).

- [ ] **Paso 3: implementar** (`resumen.service.js`)

```js
// server/src/modules/proveedores/resumen.service.js
// Resumen de cuenta para mandarle al proveedor: saldo anterior, movimientos del período y compras sin pagar.
import PDFDocument from 'pdfkit';
import { LEYENDA_COMPROBANTE_INTERNO, TIPOS_DOCUMENTO_COMPRA_ETIQUETA, TIPOS_MOV_CC_PROVEEDOR_ETIQUETA, aPesos, dec } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNoEncontrado } from '../../lib/errores.js';
import { hoy } from '../../lib/fechas.js';
import { fechaCorta, formatearCelda } from '../reportes/reportes.exportar.js';
import * as configuracion from '../configuracion/configuracion.service.js';
import { estadoDeuda } from './deuda.service.js';

export async function datosResumen(proveedorId, { desde, hasta }) {
  const proveedor = await db('proveedores').where({ id: proveedorId }).first();
  if (!proveedor) throw new ErrorNoEncontrado('El proveedor');
  const h = hasta ?? hoy();
  const d = desde ?? `${h.slice(0, 7)}-01`;
  const [anterior, filas, estado] = await Promise.all([
    db('cc_proveedores_movimientos').where({ proveedor_id: proveedorId }).where('fecha', '<', d).sum('importe as total').first(),
    db('cc_proveedores_movimientos').where({ proveedor_id: proveedorId }).whereBetween('fecha', [d, h]).orderBy([{ column: 'fecha' }, { column: 'id' }]),
    estadoDeuda(proveedor),
  ]);
  let saldo = dec(anterior?.total ?? 0);
  const movimientos = filas.map((m) => {
    saldo = saldo.plus(m.importe);
    const extra = [m.descripcion, m.referencia && `Ref. ${m.referencia}`, m.cheque_numero && `Cheque ${m.cheque_numero}`].filter(Boolean).join(' · ');
    return {
      fecha: m.fecha,
      detalle: `${TIPOS_MOV_CC_PROVEEDOR_ETIQUETA[m.tipo] ?? m.tipo}${extra ? ` — ${extra}` : ''}`,
      importe: aPesos(m.importe),
      saldo: aPesos(saldo),
    };
  });
  return {
    proveedor,
    desde: d,
    hasta: h,
    saldo_anterior: aPesos(anterior?.total ?? 0),
    movimientos,
    saldo_final: aPesos(saldo),
    compras_pendientes: estado.compras.filter((c) => c.estado !== 'PAGADA'),
  };
}

const MARGEN = 40;
const ALTO_FILA = 18;

function tabla(doc, y, columnas, filas) {
  const ancho = doc.page.width - MARGEN * 2;
  const anchos = columnas.map((c) => c.ancho * ancho);
  const fila = (valores, negrita, fondo) => {
    if (y + ALTO_FILA > doc.page.height - MARGEN - 30) {
      doc.addPage();
      y = MARGEN;
    }
    if (fondo) doc.rect(MARGEN, y, ancho, ALTO_FILA).fill(fondo);
    doc.fillColor(fondo === '#0b5c8e' ? '#ffffff' : '#111111').font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    let x = MARGEN;
    valores.forEach((v, i) => {
      doc.text(v, x + 4, y + 5, { width: anchos[i] - 8, lineBreak: false, ellipsis: true, align: columnas[i].derecha ? 'right' : 'left' });
      x += anchos[i];
    });
    y += ALTO_FILA;
  };
  fila(columnas.map((c) => c.titulo), true, '#0b5c8e');
  filas.forEach((f, i) => fila(f, false, i % 2 ? '#f2f6f9' : null));
  return y;
}

export async function resumenPdf(proveedorId, filtros) {
  const datos = await datosResumen(proveedorId, filtros);
  const config = await configuracion.obtenerTodo();
  const negocio = config.negocio?.nombre || 'Pescadería';
  const p = datos.proveedor;

  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGEN, info: { Title: `Resumen de cuenta — ${p.nombre}`, Author: negocio } });
    const partes = [];
    doc.on('data', (x) => partes.push(x));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(16).text('Resumen de cuenta', MARGEN, MARGEN);
    doc.font('Helvetica').fontSize(10).fillColor('#444444')
      .text(negocio)
      .text(`Proveedor: ${p.nombre}${p.cuit ? ` · CUIT ${p.cuit}` : ''}`)
      .text(`Del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}`);

    let y = doc.y + 12;
    y = tabla(doc, y, [
      { titulo: 'Fecha', ancho: 0.14 },
      { titulo: 'Detalle', ancho: 0.5 },
      { titulo: 'Importe', ancho: 0.18, derecha: true },
      { titulo: 'Saldo', ancho: 0.18, derecha: true },
    ], [
      ['', 'Saldo anterior', '', formatearCelda(datos.saldo_anterior, 'pesos')],
      ...datos.movimientos.map((m) => [fechaCorta(m.fecha), m.detalle, formatearCelda(m.importe, 'pesos'), formatearCelda(m.saldo, 'pesos')]),
    ]);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111')
      .text(`Saldo al ${fechaCorta(datos.hasta)}: ${formatearCelda(datos.saldo_final, 'pesos')}`, MARGEN, y + 10);

    if (datos.compras_pendientes.length) {
      doc.font('Helvetica-Bold').fontSize(12).text('Compras sin pagar', MARGEN, doc.y + 16);
      tabla(doc, doc.y + 6, [
        { titulo: 'Fecha', ancho: 0.16 },
        { titulo: 'Comprobante', ancho: 0.36 },
        { titulo: 'Vence', ancho: 0.16 },
        { titulo: 'Falta pagar', ancho: 0.32, derecha: true },
      ], datos.compras_pendientes.map((c) => [
        fechaCorta(c.fecha),
        `${TIPOS_DOCUMENTO_COMPRA_ETIQUETA[c.tipo_documento] ?? c.tipo_documento} ${c.numero_documento ?? ''}`.trim(),
        fechaCorta(c.vence),
        formatearCelda(c.pendiente, 'pesos'),
      ]));
    }

    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777777').text(LEYENDA_COMPROBANTE_INTERNO, MARGEN, doc.page.height - MARGEN - 12, { lineBreak: false });
    doc.end();
  });
  return { buffer, nombre: `resumen-${proveedorId}-${datos.hasta}.pdf` };
}
```

- [ ] **Paso 4: la ruta** (`proveedores.routes.js`)

```js
proveedoresRouter.get('/:id/resumen.pdf', editar, validar(esquemaResumenProveedor, 'query'), async (req, res) => {
  const archivo = await resumen.resumenPdf(Number(req.params.id), req.datos);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(archivo.buffer);
});
```

Agregar `import * as resumen from './resumen.service.js';` y sumar `esquemaResumenProveedor` al import de shared.

- [ ] **Paso 5: correr y ver que pasa**

Correr: `npm test -- proveedores.test`. Esperado: PASS.

---

### Tarea 8: Avisos en el Inicio y antigüedad de la deuda en el reporte

**Archivos:**
- Modificar: `server/src/modules/reportes/reportes.service.js` (`panel`)
- Modificar: `server/src/modules/reportes/reportes.definiciones.js` (`cuentas-proveedores`)
- Test: `server/test/proveedores.test.js`

**Interfaces que produce** (campos nuevos de `GET /api/reportes/panel`):
- `proveedores_a_pagar: [{ id, nombre, vencido, proximo_vencimiento }]`: hasta 5; los vencidos primero, después por fecha del próximo vencimiento.
- `cheques_semana: [{ id, proveedor_id, proveedor, importe, fecha_cobro, numero, banco }]`
- El reporte `cuentas-proveedores` suma las columnas `al_dia`, `vencido_30`, `vencido_60` y `vencido_mas` (tipo `pesos`).

- [ ] **Paso 1: escribir el test que falla**

```js
describe('Proveedores · avisos del Inicio y reporte', () => {
  it('avisa vencidos, lo que vence esta semana y cheques; no avisa saldos a favor', async () => {
    await reiniciarBase();
    const admin = await login();
    const merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
    const vencido = (await admin.post('/api/proveedores').send({ nombre: 'Vencido', plazo_pago_dias: 5 })).body;
    const semana = (await admin.post('/api/proveedores').send({ nombre: 'Vence pronto', plazo_pago_dias: 3 })).body;
    const lejos = (await admin.post('/api/proveedores').send({ nombre: 'Vence lejos', plazo_pago_dias: 30 })).body;
    const aFavor = (await admin.post('/api/proveedores').send({ nombre: 'A favor' })).body;
    await ingresarMercaderia(admin, vencido.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '1000' }], { fecha: sumarDias(hoy(), -45) });
    await ingresarMercaderia(admin, semana.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '2000' }], { fecha: hoy() });
    await ingresarMercaderia(admin, lejos.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '3000' }], { fecha: hoy() });
    await admin.post(`/api/proveedores/${aFavor.id}/pagos`).send({ importe: '500', medio_pago: 'OTRO' });
    await admin.post(`/api/proveedores/${lejos.id}/pagos`).send({ importe: '1000', medio_pago: 'CHEQUE', cheque_numero: '77', cheque_fecha_cobro: sumarDias(hoy(), 2) });
    await admin.post(`/api/proveedores/${lejos.id}/pagos`).send({ importe: '1000', medio_pago: 'CHEQUE', cheque_fecha_cobro: sumarDias(hoy(), 20) });

    const panel = (await admin.get('/api/reportes/panel')).body;
    expect(panel.proveedores_a_pagar.map((p) => p.nombre)).toEqual(['Vencido', 'Vence pronto']);
    expect(panel.proveedores_a_pagar[0].vencido).toBe('1000.00');
    expect(panel.cheques_semana).toEqual([expect.objectContaining({ proveedor: 'Vence lejos', importe: '1000.00', numero: '77', fecha_cobro: sumarDias(hoy(), 2) })]);

    const rep = (await admin.get('/api/reportes/cuentas-proveedores')).body;
    const fila = rep.filas.find((f) => f.proveedor === 'Vencido');
    expect(fila).toMatchObject({ al_dia: '0.00', vencido_30: '0.00', vencido_60: '1000.00', vencido_mas: '0.00' });
    expect(rep.filas.find((f) => f.proveedor === 'A favor')).toMatchObject({ saldo: '-500.00', al_dia: '-500.00' });
  });
});
```

(El plazo es de 5 días y la compra tiene 45, así que lleva 40 días de atraso y cae en "31 a 60".)

- [ ] **Paso 2: correr y ver que falla**

Correr: `npm test -- proveedores.test`. Esperado: FAIL (`proveedores_a_pagar` es `undefined`).

- [ ] **Paso 3: el panel** (`reportes.service.js`)

Agregar `import { estadoDeudas } from '../proveedores/deuda.service.js';`. Al final de `panel()`, antes del `return`:

```js
  const conDeuda = await db('proveedores as p').join('v_saldos_proveedores as s', 's.id', 'p.id').where('s.saldo', '>', 0).select('p.id', 'p.nombre', 'p.plazo_pago_dias');
  const estados = await estadoDeudas(db, conDeuda, fechaHoy);
  const enUnaSemana = sumarDias(fechaHoy, 7);
  const proveedoresAPagar = conDeuda
    .map((p) => ({ id: p.id, nombre: p.nombre, vencido: estados.get(p.id).vencido, proximo_vencimiento: estados.get(p.id).proximo_vencimiento }))
    .filter((p) => dec(p.vencido).gt(0) || (p.proximo_vencimiento && p.proximo_vencimiento.fecha <= enUnaSemana))
    .sort((a, b) => Number(b.vencido) - Number(a.vencido) || (a.proximo_vencimiento?.fecha ?? '').localeCompare(b.proximo_vencimiento?.fecha ?? ''))
    .slice(0, 5);
  const cheques = await db('cc_proveedores_movimientos as m')
    .join('proveedores as p', 'p.id', 'm.proveedor_id')
    .where({ 'm.tipo': 'PAGO', 'm.medio_pago': 'CHEQUE' })
    .whereBetween('m.cheque_fecha_cobro', [fechaHoy, enUnaSemana])
    .whereNotExists(db('cc_proveedores_movimientos as a').whereRaw('a.anula_movimiento_id = m.id'))
    .orderBy('m.cheque_fecha_cobro')
    .select('m.id', 'm.proveedor_id', 'p.nombre as proveedor', 'm.importe', 'm.cheque_fecha_cobro as fecha_cobro', 'm.cheque_numero as numero', 'm.cheque_banco as banco');
```

Y en el objeto que devuelve:

```js
    proveedores_a_pagar: proveedoresAPagar,
    cheques_semana: cheques.map((c) => ({ ...c, importe: aPesos(dec(c.importe).neg()) })),
```

- [ ] **Paso 4: el reporte** (`reportes.definiciones.js`, entrada `cuentas-proveedores`)

Agregar `import { estadoDeudas } from '../proveedores/deuda.service.js';`.

```js
    columnas: [
      { clave: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
      { clave: 'telefono', titulo: 'Teléfono', tipo: 'texto' },
      { clave: 'al_dia', titulo: 'Al día', tipo: 'pesos' },
      { clave: 'vencido_30', titulo: 'Vencido hasta 30 días', tipo: 'pesos' },
      { clave: 'vencido_60', titulo: '31 a 60 días', tipo: 'pesos' },
      { clave: 'vencido_mas', titulo: 'Más de 60 días', tipo: 'pesos' },
      { clave: 'saldo', titulo: 'Le debemos', tipo: 'pesos' },
    ],
    async ejecutar() {
      const rows = await db('v_saldos_proveedores as s').join('proveedores as p', 'p.id', 's.id')
        .whereNot('s.saldo', 0).orderBy('s.saldo', 'desc').select('s.*', 'p.plazo_pago_dias');
      const estados = await estadoDeudas(db, rows);
      const filas = rows.map((f) => {
        const vencidas = estados.get(f.id).compras.filter((c) => c.estado === 'VENCIDA');
        const tramo = (desde, hasta) => aPesos(sumar(vencidas.filter((c) => -c.dias_para_vencer >= desde && -c.dias_para_vencer <= hasta).map((c) => c.pendiente)));
        const vencido = sumar(vencidas.map((c) => c.pendiente));
        return {
          proveedor: f.nombre,
          telefono: f.telefono ?? '',
          al_dia: aPesos(dec(f.saldo).minus(vencido)),
          vencido_30: tramo(1, 30),
          vencido_60: tramo(31, 60),
          vencido_mas: tramo(61, Infinity),
          saldo: aPesos(f.saldo),
        };
      });
      const totales = Object.fromEntries(['al_dia', 'vencido_30', 'vencido_60', 'vencido_mas', 'saldo'].map((k) => [k, aPesos(suma(filas, k))]));
      return { filas, totales };
    },
```

Se saca la columna "Último movimiento" para que el PDF no quede tan ancho. La descripción pasa a ser `'Saldo con cada proveedor a hoy, separado por cuánto hace que venció.'`.

- [ ] **Paso 5: correr toda la suite**

Correr: `npm test`. Esperado: PASS en todo (incluido `reportes.test.js`, que solo mira `totales.saldo`).

---

### Tarea 9: Lista de proveedores y el formulario con los datos nuevos

**Archivos:**
- Crear: `client/src/lib/proveedores.js`, `client/src/componentes/Contacto.jsx`
- Crear: `client/src/paginas/proveedores/Proveedores.jsx` (reemplaza `client/src/paginas/Proveedores.jsx`, que se borra)
- Crear: `client/src/paginas/proveedores/ModalProveedor.jsx`
- Modificar: `client/src/App.jsx:13` (import)

**Interfaces que consume:** `GET /api/proveedores?activo=todos` (Tarea 5), `numeroWhatsApp`, `cuitValido`, `DIAS_SEMANA` y `ORDEN_DIAS_SEMANA` (Tareas 1 y 2).

**Interfaces que produce:**
- `enlaceWhatsApp(telefono, texto?) → string|null`, `enlaceLlamar(telefono) → string|null`, `vieneHoy(dias: number[]) → boolean`, `textoVencimiento(dias: number) → string`, `nombresDias(dias: number[]) → string`
- `<BotonesContacto telefono tamanio="normal|grande" mensaje? />`
- `<ModalProveedor proveedor? onCerrar />`

- [ ] **Paso 1: helpers** (`client/src/lib/proveedores.js`)

```js
import { DIAS_SEMANA, ORDEN_DIAS_SEMANA, numeroWhatsApp } from '@pescaderia/shared';
import { hoyIso } from './formato.js';

export function enlaceWhatsApp(telefono, texto) {
  const n = numeroWhatsApp(telefono);
  if (!n) return null;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

export const enlaceLlamar = (telefono) => {
  const t = String(telefono ?? '').replace(/[^\d+]/g, '');
  return t ? `tel:${t}` : null;
};

export const vieneHoy = (dias) => (dias ?? []).includes(new Date(`${hoyIso()}T12:00:00Z`).getUTCDay());

export const nombresDias = (dias) => ORDEN_DIAS_SEMANA.filter((d) => (dias ?? []).includes(d)).map((d) => DIAS_SEMANA[d]).join(', ');

export function textoVencimiento(dias) {
  if (dias < 0) return `Vencida hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
  if (dias === 0) return 'Vence hoy';
  return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`;
}
```

- [ ] **Paso 2: botones de contacto** (`client/src/componentes/Contacto.jsx`)

```jsx
import { MessageCircle, Phone } from 'lucide-react';
import { clasesBoton } from './Boton.jsx';
import { enlaceLlamar, enlaceWhatsApp } from '../lib/proveedores.js';

/** Llamar y WhatsApp como botones con texto. Si el número no sirve para WhatsApp, lo dice en vez de abrir un link roto. */
export function BotonesContacto({ telefono, tamanio = 'normal', mensaje, className = '' }) {
  if (!telefono) return <span className="text-texto-tenue">Sin teléfono</span>;
  const wa = enlaceWhatsApp(telefono, mensaje);
  const tamIcono = tamanio === 'grande' ? 22 : 18;
  return (
    <span className={`flex flex-wrap gap-2 ${className}`} onClick={(e) => e.stopPropagation()}>
      <a href={enlaceLlamar(telefono)} className={clasesBoton({ variante: 'secundario', tamanio })}>
        <Phone size={tamIcono} aria-hidden /> Llamar
      </a>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamanio })}>
          <MessageCircle size={tamIcono} aria-hidden /> WhatsApp
        </a>
      ) : (
        <span className={`${clasesBoton({ variante: 'secundario', tamanio })} pointer-events-none opacity-60`} title="El teléfono no tiene característica o está mal escrito">
          <MessageCircle size={tamIcono} aria-hidden /> Revisá el teléfono
        </span>
      )}
    </span>
  );
}
```

- [ ] **Paso 3: el formulario** (`client/src/paginas/proveedores/ModalProveedor.jsx`)

Se parte del `ModalProveedor` actual de `client/src/paginas/Proveedores.jsx` y se le suman los campos nuevos:

```jsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Landmark, Phone, Truck } from 'lucide-react';
import { DIAS_SEMANA, ORDEN_DIAS_SEMANA, cuitValido } from '@pescaderia/shared';
import { post, put } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { AreaTexto, Campo, Interruptor } from '../../componentes/Formulario.jsx';

export function ModalProveedor({ proveedor, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const [d, setD] = useState({
    nombre: proveedor?.nombre ?? '',
    contacto: proveedor?.contacto ?? '',
    telefono: proveedor?.telefono ?? '',
    email: proveedor?.email ?? '',
    cuit: proveedor?.cuit ?? '',
    cbu_alias: proveedor?.cbu_alias ?? '',
    plazo_pago_dias: String(proveedor?.plazo_pago_dias ?? 0),
    dias_entrega: proveedor?.dias_entrega ?? [],
    direccion: proveedor?.direccion ?? '',
    notas: proveedor?.notas ?? '',
    activo: proveedor?.activo ?? true,
  });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const set = (c) => setD((x) => ({ ...x, ...c }));
  const alternarDia = (dia) => set({ dias_entrega: d.dias_entrega.includes(dia) ? d.dias_entrega.filter((x) => x !== dia) : [...d.dias_entrega, dia] });
  const revisarCuit = () => setErrores((e) => ({ ...e, cuit: d.cuit && !cuitValido(d.cuit) ? 'El CUIT no es válido. Revisá los números.' : undefined }));

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      const datos = { ...d, plazo_pago_dias: d.plazo_pago_dias === '' ? 0 : d.plazo_pago_dias };
      if (proveedor) await put(`/proveedores/${proveedor.id}`, datos);
      else await post('/proveedores', datos);
      avisar('Proveedor guardado.');
      ['proveedores', 'ficha-proveedor'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'} icono={Truck} onCerrar={onCerrar} ancho="sm:max-w-2xl">
      <form onSubmit={guardar} className="grid gap-4 md:grid-cols-2">
        <Campo className="md:col-span-2" etiqueta="Nombre" autoFocus value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} error={errores.nombre} />
        <Campo etiqueta="Persona de contacto" value={d.contacto} onChange={(e) => set({ contacto: e.target.value })} />
        <Campo etiqueta="Teléfono" icono={Phone} inputMode="tel" placeholder="Ej: 223 555-0101" value={d.telefono} onChange={(e) => set({ telefono: e.target.value })} ayuda="Con la característica, para que funcione WhatsApp" />
        <Campo etiqueta="CUIT" inputMode="numeric" placeholder="20-12345678-6" value={d.cuit} onChange={(e) => set({ cuit: e.target.value })} onBlur={revisarCuit} error={errores.cuit} />
        <Campo etiqueta="Email" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} error={errores.email} />
        <Campo etiqueta="CBU o alias para transferirle" icono={Landmark} value={d.cbu_alias} onChange={(e) => set({ cbu_alias: e.target.value })} error={errores.cbu_alias} />
        <Campo etiqueta="¿En cuántos días hay que pagarle?" inputMode="numeric" value={d.plazo_pago_dias} onChange={(e) => set({ plazo_pago_dias: e.target.value.replace(/\D/g, '') })} error={errores.plazo_pago_dias} ayuda="0 = se le paga en el día" />
        <fieldset className="md:col-span-2">
          <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-texto"><CalendarDays size={16} aria-hidden /> ¿Qué días entrega?</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {ORDEN_DIAS_SEMANA.map((dia) => {
              const activo = d.dias_entrega.includes(dia);
              return (
                <button
                  key={dia}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => alternarDia(dia)}
                  className={`min-h-12 rounded-xl border-2 text-[15px] font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-anillo ${activo ? 'border-primario bg-primario-suave text-primario-texto' : 'border-borde bg-superficie text-texto-suave hover:border-borde-fuerte'}`}
                >
                  {DIAS_SEMANA[dia]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Campo className="md:col-span-2" etiqueta="Dirección" value={d.direccion} onChange={(e) => set({ direccion: e.target.value })} />
        <AreaTexto className="md:col-span-2" etiqueta="Notas" value={d.notas} onChange={(e) => set({ notas: e.target.value })} placeholder="Condiciones, horarios, lo que haga falta recordar" />
        {proveedor && <Interruptor etiqueta="Activo" checked={d.activo} onChange={(v) => set({ activo: v })} />}
        <div className="flex gap-3 border-t border-borde pt-4 md:col-span-2 md:justify-end">
          <Boton variante="secundario" tamanio="grande" onClick={onCerrar} className="flex-1 md:flex-none">Cancelar</Boton>
          <Boton type="submit" tamanio="grande" cargando={enviando} className="flex-1 md:flex-none">Guardar</Boton>
        </div>
      </form>
    </Modal>
  );
}
```

Revisar en `client/src/componentes/Formulario.jsx` que `Campo` le pase `onBlur` al `<input>` (usa `...props`, así que sí).

- [ ] **Paso 4: la lista** (`client/src/paginas/proveedores/Proveedores.jsx`)

La búsqueda y el filtro se hacen en el navegador: son pocos proveedores y el resultado aparece al instante, sin esperar al servidor.

```jsx
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search, Truck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { dec } from '@pescaderia/shared';
import { get } from '../../api/cliente.js';
import { useSesion } from '../../contexto/Sesion.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Campo, SelectorBotones } from '../../componentes/Formulario.jsx';
import { BotonesContacto } from '../../componentes/Contacto.jsx';
import { Cargando, Encabezado, ErrorCarga, Etiqueta, Tabla } from '../../componentes/Varios.jsx';
import { pesos } from '../../lib/formato.js';
import { vieneHoy } from '../../lib/proveedores.js';
import { ModalProveedor } from './ModalProveedor.jsx';

const FILTROS = [
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'baja', etiqueta: 'De baja' },
  { valor: 'todos', etiqueta: 'Todos' },
];

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Proveedores() {
  const { puede } = useSesion();
  const navigate = useNavigate();
  const esDueno = puede('proveedores.editar');
  const [nuevo, setNuevo] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('activos');
  const q = useQuery({ queryKey: ['proveedores', 'todos'], queryFn: () => get('/proveedores', { activo: 'todos' }) });

  const filas = useMemo(() => {
    const texto = sinAcentos(buscar.trim());
    const digitos = buscar.replace(/\D/g, '');
    return (q.data ?? [])
      .filter((p) => (filtro === 'todos' ? true : filtro === 'activos' ? p.activo : !p.activo))
      .filter((p) => !texto || sinAcentos(p.nombre).includes(texto) || sinAcentos(p.contacto).includes(texto) || (digitos.length >= 3 && String(p.cuit ?? '').replace(/\D/g, '').includes(digitos)));
  }, [q.data, buscar, filtro]);

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Proveedores" icono={Truck}>
        {esDueno && <Boton icono={Plus} tamanio="grande" onClick={() => setNuevo(true)}>Nuevo proveedor</Boton>}
      </Encabezado>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Campo etiqueta="Buscar" icono={Search} placeholder="Nombre, CUIT o contacto" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <div className="md:w-96">
          <SelectorBotones etiqueta="Mostrar" columnas={3} valor={filtro} onCambio={setFiltro} opciones={FILTROS} />
        </div>
      </div>

      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorCarga error={q.error} reintentar={q.refetch} />
      ) : (
        <Tabla
          filas={filas}
          alTocarFila={esDueno ? (p) => navigate(`/proveedores/${p.id}`) : undefined}
          vacio={buscar ? 'No hay proveedores que coincidan con la búsqueda.' : 'Todavía no hay proveedores.'}
          iconoVacio={Truck}
          columnas={[
            {
              clave: 'nombre',
              titulo: 'Proveedor',
              render: (p) => (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.nombre}</span>
                  {p.activo && vieneHoy(p.dias_entrega) && <Etiqueta tono="azul" icono={Truck}>Viene hoy</Etiqueta>}
                  {!p.activo && <Etiqueta>De baja</Etiqueta>}
                  {p.contacto && <span className="block w-full text-sm text-texto-suave">{p.contacto}</span>}
                </span>
              ),
            },
            { clave: 'contacto', titulo: 'Contacto', render: (p) => <BotonesContacto telefono={p.telefono} /> },
            ...(esDueno
              ? [
                  { clave: 'saldo', titulo: 'Le debemos', derecha: true, render: (p) => (dec(p.saldo).gt(0) ? <strong>{pesos(p.saldo)}</strong> : <span className="text-texto-tenue">{pesos(p.saldo)}</span>) },
                  { clave: 'vencido', titulo: 'Vencido', derecha: true, render: (p) => (dec(p.vencido).gt(0) ? <strong className="text-peligro-texto">{pesos(p.vencido)}</strong> : <span className="text-texto-tenue">—</span>) },
                  { clave: 'ver', titulo: '', render: () => <span className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-primario-texto">Ver proveedor <ChevronRight size={16} aria-hidden /></span> },
                ]
              : []),
          ]}
        />
      )}
      {nuevo && <ModalProveedor onCerrar={() => setNuevo(false)} />}
    </div>
  );
}
```

- [ ] **Paso 5: la ruta** (`client/src/App.jsx`)

Cambiar `import { Proveedores } from './paginas/Proveedores.jsx';` por `import { Proveedores } from './paginas/proveedores/Proveedores.jsx';` y borrar `client/src/paginas/Proveedores.jsx`.

- [ ] **Paso 6: compilar**

Correr: `npm run build`. Esperado: compila sin errores. (Lo visual se revisa en la Tarea 12.)

---

### Tarea 10: La página del proveedor

**Archivos:**
- Crear: `client/src/paginas/proveedores/FichaProveedor.jsx`, `client/src/paginas/proveedores/ModalesCuenta.jsx`
- Modificar: `client/src/componentes/CuentaCorriente.jsx` (columna de acción opcional y anulados tachados)
- Modificar: `client/src/App.jsx:21,52`
- Borrar: `client/src/paginas/CuentaProveedor.jsx`

**Interfaces que consume:** `GET /ficha` (Tarea 5), `POST /anular` con `ELEGIR_CAJA` (Tarea 6), `/resumen.pdf` (Tarea 7), `BotonesContacto`, `ModalProveedor`, `textoVencimiento` y `nombresDias` (Tarea 9).

- [ ] **Paso 1: `MovimientosCuenta` con acción y anulados** (`CuentaCorriente.jsx`)

Firma nueva: `MovimientosCuenta({ movimientos, etiquetas, vacio, extra, accion })`. En la columna `tipo`, después del nombre del tipo, sumar `{m.anulado && <> <Etiqueta>Anulado</Etiqueta></>}`. En la columna `importe`, sumar la clase `line-through opacity-60` cuando `m.anulado`. Al final de `columnas`:

```jsx
        ...(accion ? [{ clave: 'accion', titulo: '', render: (m) => accion(m) }] : []),
```

Importar `Etiqueta` desde `./Varios.jsx`. Para clientes no cambia nada: no traen `anulado` ni pasan `accion`.

- [ ] **Paso 2: modales** (`ModalesCuenta.jsx`)

Mover `ModalPago`, `ModalNotaCredito`, `useRefresco` e `ICONOS_MEDIO` desde `CuentaProveedor.jsx`, con estos cambios:
- `useRefresco` invalida `['ficha-proveedor', 'proveedores', 'caja-actual', 'caja-movimientos', 'panel']`.
- En `ModalPago`, el estado inicial suma `cheque_numero: ''`, `cheque_banco: ''` y `cheque_fecha_cobro: ''`. El `post` manda esos tres campos solo si `d.medio_pago === 'CHEQUE'`. Debajo del selector de medio:

```jsx
        {d.medio_pago === 'CHEQUE' && (
          <div className="grid gap-4 rounded-xl bg-superficie-2 p-4 sm:grid-cols-3">
            <Campo etiqueta="N° de cheque" inputMode="numeric" value={d.cheque_numero} onChange={(e) => set({ cheque_numero: e.target.value })} />
            <Campo etiqueta="Banco" value={d.cheque_banco} onChange={(e) => set({ cheque_banco: e.target.value })} />
            <Campo etiqueta="¿Cuándo se cobra?" type="date" min={hoyIso()} value={d.cheque_fecha_cobro} onChange={(e) => set({ cheque_fecha_cobro: e.target.value })} error={errores.cheque_fecha_cobro} />
          </div>
        )}
```

  Y `valido` suma `&& (d.medio_pago !== 'CHEQUE' || d.cheque_fecha_cobro)`.

Modales nuevos:

```jsx
export function ModalAnular({ proveedor, movimiento, onCerrar }) {
  const refrescar = useRefresco();
  const { avisar } = useDialogos();
  const caja = useCaja();
  const [motivo, setMotivo] = useState('');
  const [pedirCaja, setPedirCaja] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const que = movimiento.tipo === 'PAGO' ? 'este pago' : 'esta nota de crédito';
  const importe = pesos(dec(movimiento.importe).abs().toFixed(2));

  const anular = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await post(`/proveedores/${proveedor.id}/movimientos/${movimiento.id}/anular`, { motivo, caja_id: pedirCaja ? caja.cajaId : undefined });
      avisar(movimiento.tipo === 'PAGO' ? 'Pago anulado.' : 'Nota de crédito anulada.');
      refrescar();
      onCerrar();
    } catch (err) {
      if (err.codigo === 'ELEGIR_CAJA') setPedirCaja(true);
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={`Anular ${movimiento.tipo === 'PAGO' ? 'pago' : 'nota de crédito'}`} descripcion={proveedor.nombre} icono={Undo2} onCerrar={onCerrar} ancho="sm:max-w-md">
      <form onSubmit={anular} className="space-y-4">
        <p className="text-lg text-texto">¿Seguro que querés anular {que} de <strong>{importe}</strong> del {fecha(movimiento.fecha)}?</p>
        <Campo etiqueta="¿Por qué?" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Lo cargué dos veces" />
        {movimiento.medio_pago === 'EFECTIVO_CAJA' && <p className="text-sm text-texto-suave">La plata vuelve a la caja.</p>}
        {pedirCaja && (
          caja.abierta ? (
            caja.cajas.length > 1 && <Selector etiqueta="¿A qué caja vuelve la plata?" value={caja.cajaId ?? ''} onChange={(e) => caja.setCajaId(Number(e.target.value))} opciones={caja.cajas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
              <TriangleAlert size={18} className="shrink-0" aria-hidden /> No hay ninguna caja abierta. Abrí la caja para que vuelva la plata.
            </p>
          )
        )}
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" className="flex-1" onClick={onCerrar}>No, volver</Boton>
          <Boton type="submit" variante="peligro" tamanio="grande" className="flex-1" cargando={enviando} disabled={motivo.trim().length < 3 || (pedirCaja && !caja.abierta)}>Sí, anular</Boton>
        </div>
      </form>
    </Modal>
  );
}

export function ModalResumen({ proveedor, onCerrar }) {
  const [desde, setDesde] = useState(inicioMesIso());
  const [hasta, setHasta] = useState(hoyIso());
  const wa = enlaceWhatsApp(proveedor.telefono, `Hola${proveedor.contacto ? ` ${proveedor.contacto}` : ''}, te paso el resumen de cuenta.`);
  return (
    <Modal titulo="Resumen de cuenta" descripcion={proveedor.nombre} icono={FileText} onCerrar={onCerrar} ancho="sm:max-w-md">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          <Campo etiqueta="Hasta" type="date" value={hasta} min={desde} max={hoyIso()} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <a href={`/api/proveedores/${proveedor.id}/resumen.pdf?desde=${desde}&hasta=${hasta}`} download className={clasesBoton({ tamanio: 'grande', className: 'w-full' })}>
          <Download size={22} aria-hidden /> Descargar PDF
        </a>
        {wa && (
          <>
            <a href={wa} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamanio: 'grande', className: 'w-full' })}>
              <MessageCircle size={22} aria-hidden /> Abrir WhatsApp
            </a>
            <p className="text-sm text-texto-suave">Primero descargá el PDF. Después, en el chat de WhatsApp, tocá el clip 📎 y elegí el archivo.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
```

Imports de `ModalesCuenta.jsx`:

```jsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Download, FileMinus2, FileText, HandCoins, Landmark, MessageCircle, ReceiptText, TriangleAlert, Undo2 } from 'lucide-react';
import { MEDIOS_PAGO_PROVEEDOR, MEDIOS_PAGO_PROVEEDOR_ETIQUETA, dec } from '@pescaderia/shared';
import { post } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { useCaja } from '../../hooks/useCaja.js';
import { Boton, clasesBoton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { Campo, Selector, SelectorBotones } from '../../componentes/Formulario.jsx';
import { fecha, hoyIso, inicioMesIso, normalizarNumero, pesos } from '../../lib/formato.js';
import { enlaceWhatsApp } from '../../lib/proveedores.js';
```

Exportar `ModalPago`, `ModalNotaCredito`, `ModalAnular` y `ModalResumen`.

- [ ] **Paso 3: la página** (`FichaProveedor.jsx`)

```jsx
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, FileMinus2, FileText, HandCoins, Package, Pencil, ReceiptText, Truck, Undo2 } from 'lucide-react';
import { MEDIOS_PAGO_PROVEEDOR_ETIQUETA, TIPOS_DOCUMENTO_COMPRA_ETIQUETA, TIPOS_MOV_CC_PROVEEDOR_ETIQUETA, UNIDADES_ETIQUETA, dec } from '@pescaderia/shared';
import { get } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { BotonesContacto } from '../../componentes/Contacto.jsx';
import { MovimientosCuenta, TarjetaSaldo } from '../../componentes/CuentaCorriente.jsx';
import { Cargando, Dato, Encabezado, ErrorCarga, Etiqueta, Tabla, Tarjeta } from '../../componentes/Varios.jsx';
import { fecha, pesos } from '../../lib/formato.js';
import { nombresDias, textoVencimiento } from '../../lib/proveedores.js';
import { ModalProveedor } from './ModalProveedor.jsx';
import { ModalAnular, ModalNotaCredito, ModalPago, ModalResumen } from './ModalesCuenta.jsx';

const fmtDia = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const diaLargo = (iso) => fmtDia.format(new Date(`${iso}T12:00:00Z`));

function EtiquetaEstado({ compra }) {
  if (compra.estado === 'VENCIDA') return <Etiqueta tono="rojo">{textoVencimiento(compra.dias_para_vencer)}</Etiqueta>;
  const pronto = compra.dias_para_vencer <= 3;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Etiqueta tono={pronto ? 'amarillo' : 'azul'}>{textoVencimiento(compra.dias_para_vencer)}</Etiqueta>
      {compra.estado === 'PARCIAL' && <Etiqueta>Pagada a medias</Etiqueta>}
    </span>
  );
}

export function FichaProveedor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { avisar } = useDialogos();
  const [modal, setModal] = useState(null); // 'pago' | 'nota' | 'resumen' | 'editar' | { anular: movimiento }
  const q = useQuery({ queryKey: ['ficha-proveedor', id], queryFn: () => get(`/proveedores/${id}/ficha`) });

  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCarga error={q.error} reintentar={q.refetch} />;
  const { proveedor: p, saldo, vencido, proximo_vencimiento: proximo, compras_pendientes: pendientes, productos, movimientos } = q.data;

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      avisar('Copiado. Ya lo podés pegar en el home banking.');
    } catch {
      avisar('No se pudo copiar. Seleccionalo y copialo a mano.', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/proveedores" className="mb-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primario-texto hover:underline">
        <ArrowLeft size={18} aria-hidden /> Volver a Proveedores
      </Link>
      <Encabezado titulo={p.nombre} icono={Truck} subtitulo={[p.contacto, p.telefono].filter(Boolean).join(' · ') || 'Proveedor'} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Boton variante="exito" tamanio="grande" icono={HandCoins} onClick={() => setModal('pago')}>Registrar pago</Boton>
        <BotonesContacto telefono={p.telefono} tamanio="grande" className="col-span-2 grid grid-cols-2 [&>*]:w-full" />
        <Boton variante="secundario" tamanio="grande" icono={FileText} onClick={() => setModal('resumen')}>Resumen de cuenta</Boton>
      </div>

      <TarjetaSaldo
        saldo={saldo}
        textoDeuda="Le debemos"
        textoAFavor="Le pagamos de más (saldo a favor nuestro)"
        textoCero="Estamos al día"
        detalle={
          dec(saldo).gt(0) && (
            <span className="mt-2 block space-y-1 text-base">
              <span className="block font-semibold">{dec(vencido).gt(0) ? `Ya vencido: ${pesos(vencido)}` : 'Nada vencido'}</span>
              {proximo && <span className="block">Próximo vencimiento: <span className="capitalize">{diaLargo(proximo.fecha)}</span> — {pesos(proximo.importe)}</span>}
            </span>
          )
        }
      >
        <Boton variante="secundario" tamanio="grande" icono={FileMinus2} onClick={() => setModal('nota')}>Nota de crédito</Boton>
      </TarjetaSaldo>

      <h2 className="mb-3 text-lg font-bold text-texto">Compras sin pagar</h2>
      <div className="mb-8">
        <Tabla
          filas={pendientes}
          claveFila={(c) => c.compra_id}
          alTocarFila={(c) => navigate(`/mercaderia?ver=${c.compra_id}`)}
          vacio="No hay compras sin pagar."
          iconoVacio={ReceiptText}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', render: (c) => fecha(c.fecha) },
            { clave: 'doc', titulo: 'Comprobante', render: (c) => `${TIPOS_DOCUMENTO_COMPRA_ETIQUETA[c.tipo_documento]} ${c.numero_documento ?? ''}`.trim() },
            { clave: 'total', titulo: 'Total', derecha: true, render: (c) => pesos(c.total) },
            { clave: 'pendiente', titulo: 'Falta pagar', derecha: true, render: (c) => <strong>{pesos(c.pendiente)}</strong> },
            { clave: 'estado', titulo: '¿Cuándo vence?', render: (c) => <EtiquetaEstado compra={c} /> },
          ]}
        />
      </div>

      <h2 className="mb-3 text-lg font-bold text-texto">Productos que te vende</h2>
      <div className="mb-8">
        <Tabla
          filas={productos}
          claveFila={(x) => x.producto_id}
          vacio="Todavía no le compraste nada."
          iconoVacio={Package}
          columnas={[
            { clave: 'producto', titulo: 'Producto', render: (x) => <span className="font-semibold">{x.producto}</span> },
            { clave: 'costo', titulo: 'Último precio', derecha: true, render: (x) => `${pesos(x.costo_unitario)} / ${UNIDADES_ETIQUETA[x.unidad]}` },
            { clave: 'fecha', titulo: 'Fecha', render: (x) => fecha(x.fecha) },
            {
              clave: 'cambio',
              titulo: 'Comparado con la compra anterior',
              render: (x) => {
                if (!x.costo_anterior) return <span className="text-texto-tenue">Primera compra</span>;
                const dif = dec(x.costo_unitario).minus(x.costo_anterior);
                if (dif.isZero()) return <span className="text-texto-suave">Igual</span>;
                return dif.gt(0)
                  ? <span className="inline-flex items-center gap-1 font-semibold text-peligro-texto"><ArrowUp size={16} aria-hidden /> Subió {pesos(dif.toFixed(2))}</span>
                  : <span className="inline-flex items-center gap-1 font-semibold text-exito-texto"><ArrowDown size={16} aria-hidden /> Bajó {pesos(dif.abs().toFixed(2))}</span>;
              },
            },
          ]}
        />
      </div>

      <h2 className="mb-3 text-lg font-bold text-texto">Movimientos</h2>
      <MovimientosCuenta
        movimientos={movimientos}
        etiquetas={TIPOS_MOV_CC_PROVEEDOR_ETIQUETA}
        extra={(m) => (
          <span className="text-texto-suave">
            {m.medio_pago && ` · ${MEDIOS_PAGO_PROVEEDOR_ETIQUETA[m.medio_pago]}`}
            {m.referencia && ` (${m.referencia})`}
            {m.cheque_fecha_cobro && ` · Cheque ${m.cheque_numero ?? ''} ${m.cheque_banco ?? ''} · se cobra el ${fecha(m.cheque_fecha_cobro)}`}
          </span>
        )}
        accion={(m) => m.se_puede_anular && (
          <Boton variante="peligro-suave" icono={Undo2} onClick={() => setModal({ anular: m })}>Anular</Boton>
        )}
      />

      <Tarjeta className="mt-8" titulo="Datos del proveedor" icono={Truck} accion={<Boton variante="secundario" icono={Pencil} onClick={() => setModal('editar')}>Editar datos</Boton>}>
        <div className="space-y-3">
          <Dato etiqueta="CUIT">{p.cuit || '—'}</Dato>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-texto-suave">CBU o alias</span>
            {p.cbu_alias ? (
              <span className="flex items-center gap-2">
                <span className="font-mono font-semibold">{p.cbu_alias}</span>
                <Boton variante="secundario" icono={Copy} onClick={() => copiar(p.cbu_alias)}>Copiar</Boton>
              </span>
            ) : <span className="font-semibold">—</span>}
          </div>
          <Dato etiqueta="Plazo para pagarle">{p.plazo_pago_dias ? `${p.plazo_pago_dias} días` : 'Se le paga en el día'}</Dato>
          <Dato etiqueta="Días que entrega">{nombresDias(p.dias_entrega) || '—'}</Dato>
          <Dato etiqueta="Email">{p.email || '—'}</Dato>
          <Dato etiqueta="Dirección">{p.direccion || '—'}</Dato>
          {p.notas && <p className="whitespace-pre-line rounded-xl bg-superficie-2 p-3 text-texto">{p.notas}</p>}
        </div>
      </Tarjeta>

      {modal === 'pago' && <ModalPago proveedor={p} saldo={saldo} onCerrar={() => setModal(null)} />}
      {modal === 'nota' && <ModalNotaCredito proveedor={p} onCerrar={() => setModal(null)} />}
      {modal === 'resumen' && <ModalResumen proveedor={p} onCerrar={() => setModal(null)} />}
      {modal === 'editar' && <ModalProveedor proveedor={p} onCerrar={() => setModal(null)} />}
      {modal?.anular && <ModalAnular proveedor={p} movimiento={modal.anular} onCerrar={() => setModal(null)} />}
    </div>
  );
}
```

`BotonesContacto` sin teléfono devuelve "Sin teléfono" ocupando su celda: se acepta. En pantallas angostas, la botonera queda así: Registrar pago | Resumen arriba y Llamar | WhatsApp en la fila del medio. Si se ve desprolijo, ordenar con `order-*` en la Tarea 12.

- [ ] **Paso 4: rutas** (`App.jsx`)

Reemplazar `import { CuentaProveedor } from './paginas/CuentaProveedor.jsx';` por `import { FichaProveedor } from './paginas/proveedores/FichaProveedor.jsx';`, y en la ruta `proveedores/:id` usar `<FichaProveedor />`. Borrar `client/src/paginas/CuentaProveedor.jsx`.

- [ ] **Paso 5: compilar**

Correr: `npm run build`. Esperado: sin errores.

---

### Tarea 11: Avisos en el Inicio

**Archivos:**
- Modificar: `client/src/paginas/Inicio.jsx`

**Interfaces que consume:** `panel.proveedores_a_pagar` y `panel.cheques_semana` (Tarea 8).

- [ ] **Paso 1: tarjetas nuevas**

Debajo de la grilla "Para tener en cuenta" y antes de "Lo que va del mes", agregar:

```jsx
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <Tarjeta titulo="Pagos a proveedores vencidos o que vencen esta semana" icono={Truck}>
          {p.proveedores_a_pagar.length ? (
            <div className="space-y-2">
              {p.proveedores_a_pagar.map((x) => (
                <Link key={x.id} to={`/proveedores/${x.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-superficie-2 px-4 py-2 hover:ring-2 hover:ring-primario focus-visible:ring-4 focus-visible:ring-anillo">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-texto">{x.nombre}</span>
                    <span className="block text-sm text-texto-suave">
                      {dec(x.vencido).gt(0) ? <span className="font-semibold text-peligro-texto">Vencido {pesos(x.vencido)}</span> : `Vence el ${fecha(x.proximo_vencimiento.fecha)} — ${pesos(x.proximo_vencimiento.importe)}`}
                    </span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-texto-tenue" aria-hidden />
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-texto-suave">Nada para esta semana.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Cheques que se cobran esta semana" icono={Receipt}>
          {p.cheques_semana.length ? (
            <div className="space-y-2">
              {p.cheques_semana.map((c) => (
                <Link key={c.id} to={`/proveedores/${c.proveedor_id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-superficie-2 px-4 py-2 hover:ring-2 hover:ring-primario focus-visible:ring-4 focus-visible:ring-anillo">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-texto">{c.proveedor}</span>
                    <span className="block text-sm text-texto-suave">Se cobra el {fecha(c.fecha_cobro)}{c.numero ? ` · Cheque ${c.numero}` : ''}{c.banco ? ` · ${c.banco}` : ''}</span>
                  </span>
                  <strong className="shrink-0 tabular-nums">{pesos(c.importe)}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-texto-suave">No hay cheques para cubrir esta semana.</p>
          )}
        </Tarjeta>
      </div>
```

Sumar `fecha` al import de `../lib/formato.js`. Los íconos `Receipt`, `Truck` y `ChevronRight` ya están importados.

- [ ] **Paso 2: compilar**

Correr: `npm run build`. Esperado: sin errores.

---

### Tarea 12: Verificación de punta a punta

- [ ] **Paso 1:** `npm test`. Esperado: todo PASS (los 74 de antes, ahora todos en verde, más los nuevos).
- [ ] **Paso 2:** con el local levantado (`npm run dev`), la API se reinicia sola al cambiar `server/src` y aplica la migración al arrancar. Revisar en el log `Servidor escuchando` sin errores. Si la migración se trabó por la conexión única de PGlite, cortar `dev`, correr `npm run db:migrar` y volver a levantar.
- [ ] **Paso 3:** en el navegador, entrando como admin, revisar:
  - Lista: buscador, filtros, "Viene hoy", Llamar y WhatsApp, Vencido.
  - Proveedor nuevo con CUIT malo (muestra el error) y bueno (lo guarda con guiones).
  - Página del proveedor: los 4 botones, el saldo con vencido y el próximo vencimiento, compras sin pagar (al tocarla abre el ingreso), productos con ↑/↓, movimientos.
  - Pago con cheque (sin fecha no deja guardar).
  - Anular un pago en efectivo (vuelve a la caja) y anular dos veces (no deja).
  - Descargar el PDF y abrirlo.
  - Inicio: las dos tarjetas nuevas.
  - Celular (ancho de 390 px): no hay scroll horizontal de la página y los botones se pueden tocar.
- [ ] **Paso 4:** entrar como cajero: la lista se ve sin saldos y no entra a la página del proveedor.
