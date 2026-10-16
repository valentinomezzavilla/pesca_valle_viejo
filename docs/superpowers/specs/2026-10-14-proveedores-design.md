# Proveedores completo — diseño

Fecha: 2026-10-14 · Estado: aprobado en charla, pendiente revisión del documento

## Objetivo

Que la parte de proveedores tenga todo lo que necesita una pescadería para manejar a quién le compra y cuánto le debe:
ficha completa, datos para pagar, control de vencimientos y cheques, corrección de errores y un resumen para mandar.

**Restricción principal:** los usuarios casi no usan computadora. Cada acción es un botón grande, con texto, a la vista
(sin menús de tres puntitos, sin pestañas, sin íconos solos). Palabras simples, nada de jerga contable. Lo peligroso pide
confirmación en lenguaje llano.

**Fuera de alcance:** imputación manual de pagos a compras, órdenes de compra/pedidos, integración con bancos o AFIP,
envío automático de archivos por WhatsApp (no es posible desde un link).

## 1. Base de datos (migración `20261014000001_proveedores_completo.js`)

### `proveedores` (columnas nuevas)

| Columna | Tipo | Regla |
|---|---|---|
| `cbu_alias` | `TEXT` | opcional |
| `plazo_pago_dias` | `INTEGER NOT NULL DEFAULT 0` | `CHECK (plazo_pago_dias BETWEEN 0 AND 365)`; 0 = vence el mismo día |
| `dias_entrega` | `SMALLINT[] NOT NULL DEFAULT '{}'` | valores 0–6 (0 = domingo) |

El CUIT se valida y normaliza en la aplicación (ver §2). La unicidad del CUIT entre proveedores se controla en el servicio
con un mensaje claro, no con un índice: así la migración no falla si hoy hay datos repetidos.

### `cc_proveedores_movimientos`

- Tipos nuevos: `ANULACION_PAGO` (importe > 0) y `ANULACION_NOTA_CREDITO` (importe > 0).
- Columna `anula_movimiento_id BIGINT UNIQUE REFERENCES cc_proveedores_movimientos(id)`: obligatoria en los dos tipos
  nuevos y prohibida en el resto. `UNIQUE` impide anular dos veces lo mismo.
- Columnas de cheque: `cheque_numero TEXT`, `cheque_banco TEXT`, `cheque_fecha_cobro DATE`. Solo se permiten cuando
  `medio_pago = 'CHEQUE'`. En la base quedan opcionales (hay cheques viejos sin estos datos); para pagos nuevos con cheque,
  la validación exige la fecha de cobro.
- `compra_id` pasa a estar permitido también en un `PAGO`: es el pago de contado que se genera al cargar una compra de
  contado. Las constraints quedan así:
  - `ck_cc_prov_compra`: `COMPRA` y `ANULACION_COMPRA` exigen `compra_id`; `PAGO` lo admite opcional; el resto no lo admite.
  - `ck_cc_prov_caja`: en un `ANULACION_PAGO`, `caja_movimiento_id` es opcional (lo trae solo si el pago anulado era en
    efectivo de caja; eso lo controla el servicio). En el resto de los tipos sigue la regla actual: hay
    `caja_movimiento_id` si y solo si `medio_pago = 'EFECTIVO_CAJA'`.
  - `ck_cc_prov_signo`: se agregan los dos tipos nuevos, siempre con importe > 0.
- **Backfill:** los `PAGO` con descripción `Pago de la compra #N` reciben `compra_id = N`. Como la tabla es de solo
  inserción, la migración desactiva el trigger `trg_cc_prov_inmutable` solo durante ese `UPDATE` y lo vuelve a activar.
- `compras.service.crear` pasa a guardar `compra_id` en el pago de contado.

### `caja_movimientos`

- Tipo nuevo `ANULACION_PAGO_PROVEEDOR` (la plata vuelve a la caja, importe > 0). Etiqueta: "Pago a proveedor anulado".

## 2. Lógica compartida (`shared/`)

- `cuit.js`: `normalizarCuit(texto)` devuelve `XX-XXXXXXXX-X` o `null`, y `cuitValido(texto)` revisa el dígito
  verificador (pesos 5,4,3,2,7,6,5,4,3,2, módulo 11). Se usa en el esquema zod (error: "El CUIT no es válido. Revisá los
  números.") y en el formulario.
- `telefono.js`: `numeroWhatsApp(telefono)` devuelve dígitos para `wa.me` (formato `549…`) o `null`. Reglas: quita lo que
  no sea número; si empieza con `549`, lo deja; si empieza con `54` seguido de 10 dígitos, agrega el 9; quita el 0 inicial;
  si quedan 12 dígitos con `15` en la posición 2, 3 o 4 (después de la característica), lo saca; con 10 dígitos antepone
  `549`. En cualquier otro caso devuelve `null` y el botón muestra "Revisá el teléfono".
- Constantes: etiquetas para los tipos nuevos ("Pago anulado", "Nota de crédito anulada") y `DIAS_SEMANA` (Dom…Sáb).
- Esquemas: `esquemaProveedor` suma `cbu_alias`, `plazo_pago_dias`, `dias_entrega` y el CUIT validado.
  `esquemaPagoProveedor` suma los datos del cheque, con la fecha de cobro obligatoria cuando el medio es `CHEQUE`.
  Esquema nuevo `esquemaAnularMovimientoProveedor` = `{ motivo (obligatorio, mín. 3), caja_id? }`.

## 3. Estado de las compras: imputación automática (`server/src/modules/proveedores/imputacion.js`)

Es una función pura, sin base de datos, que se prueba sola:
`imputar(movimientos, compras, hoy) → { compras: [{ compra_id, fecha, vence, total, pagado, pendiente, estado, dias }], saldo, vencido, proximoVencimiento }`

1. Descarta los movimientos anulados (los referenciados por `anula_movimiento_id`) y sus anulaciones.
2. Descarta las compras `ANULADA` con sus `COMPRA` y `ANULACION_COMPRA`.
3. Un `PAGO` con `compra_id` de una compra confirmada se aplica primero a esa compra. Si sobra, o si la compra está
   anulada, el pago va al pozo común.
4. Pozo = suma, en positivo, del resto de los créditos (pagos, notas de crédito, ajustes). Se aplica a las compras de la
   más vieja a la más nueva (`fecha`, `id`).
5. Vencimiento de cada compra = `fecha + plazo_pago_dias`. Estados: `PAGADA`, `PARCIAL` (pagada a medias, no vencida),
   `PENDIENTE` y `VENCIDA` (con pendiente y `vence < hoy`). `dias` = días de atraso o días que faltan.
6. Invariante (se prueba en los tests): `Σ pendiente = max(saldo, 0)`. Si el saldo es negativo (saldo a favor nuestro),
   todas las compras quedan pagadas.

`proveedores.service` arma la ficha completa con esta función; el listado, el Inicio y el reporte la reutilizan
(cargan los movimientos de los proveedores con saldo > 0; son pocos).

## 4. API (todo con permiso `proveedores.editar`, salvo lo indicado)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/proveedores?activo=` | Para el dueño suma `vencido` y `proximo_vencimiento` y ordena primero los vencidos. El cajero ve lo mismo que hoy, sin saldos. La búsqueda por nombre, CUIT o contacto se hace en el navegador: son pocos proveedores y así aparece al instante. |
| GET | `/proveedores/:id/ficha` | Proveedor + `saldo`, `vencido`, `proximoVencimiento`, compras sin pagar (de §3), productos que vende y últimos 200 movimientos. |
| POST | `/proveedores/:id/pagos` | Igual que hoy, más los datos del cheque. Permiso `proveedores.pagar`. |
| POST | `/proveedores/:id/movimientos/:movId/anular` | Anula un `PAGO` o una `NOTA_CREDITO`. Permiso `proveedores.pagar`. |
| GET | `/proveedores/:id/resumen.pdf?desde=&hasta=` | PDF del resumen de cuenta. Por defecto, el mes corriente. |

La ruta `/proveedores/:id/cuenta` se reemplaza por `/ficha`. Su único consumidor es `CuentaProveedor.jsx`, que se
reescribe en este mismo cambio.

**Productos que vende:** se sacan de `compra_items` + `compras` confirmadas del proveedor. Por producto: último costo
unitario, fecha y costo anterior (`LAG`), para mostrar ↑ o ↓.

**Anular un movimiento** (en una transacción):
- Solo se anulan `PAGO` y `NOTA_CREDITO` que no estén anulados. Los demás tipos devuelven el error "Este movimiento no se
  puede anular".
- Un `PAGO` con `compra_id` (pago de contado de una compra) no se anula desde acá: el mensaje pide anular el ingreso de
  mercadería.
- Si el pago fue `EFECTIVO_CAJA`, la plata vuelve a la sesión de caja original si sigue abierta. Si no, va a `caja_id`; si
  falta, devuelve el error `ELEGIR_CAJA` ("El turno de ese pago ya cerró. Elegí a qué caja abierta vuelve la plata"),
  igual que la anulación de ventas.
- Inserta `ANULACION_PAGO` o `ANULACION_NOTA_CREDITO` con importe positivo y la descripción `Anulación: <motivo>`, y
  deja registro en la auditoría (`PROVEEDOR_PAGO_ANULADO` / `PROVEEDOR_NOTA_CREDITO_ANULADA`).

**Resumen PDF:** se arma con pdfkit, reutilizando `fechaCorta` y `formatearCelda` de `reportes.exportar.js`. Lleva:
- datos del negocio y del proveedor;
- el período y el saldo anterior (movimientos con `fecha < desde`);
- la tabla de movimientos con saldo acumulado y el saldo al cierre;
- las compras sin pagar con su vencimiento;
- la leyenda de comprobante interno.

## 5. Inicio y reportes

- `reportes.service.panel()` suma:
  - `proveedores_a_pagar`: hasta 5 proveedores con deuda vencida o que vence en los próximos 7 días
    (`{ id, nombre, vencido, proximo_vencimiento }`), ordenados por fecha;
  - `cheques_semana`: cheques no anulados con `cheque_fecha_cobro` entre hoy y hoy + 7
    (`{ proveedor_id, proveedor, importe, fecha_cobro, numero, banco }`).
- Inicio muestra dos tarjetas: "Pagos vencidos o que vencen esta semana" (cada fila es un botón grande que lleva al
  proveedor) y "Cheques que se cobran esta semana". Si no hay nada, la tarjeta dice "Nada para esta semana".
- El reporte `cuentas-proveedores` suma las columnas **Al día**, **Vencido hasta 30 días**, **31 a 60 días** y
  **Más de 60 días**.

## 6. Pantallas

### Lista (`Proveedores.jsx`)
- Arriba: buscador grande ("Buscar por nombre, CUIT o contacto") y tres botones de filtro: **Activos** (por defecto),
  **De baja** y **Todos**.
- Cada fila muestra el nombre, la marca **"Viene hoy"** si corresponde, y los botones **Llamar** y **WhatsApp** con texto.
  El dueño ve además "Le debemos", "Vencido" (en rojo) y el botón **Ver proveedor**.
- Tocar la fila: el dueño va a la página del proveedor; el cajero no tiene acción. Editar los datos se hace desde la
  página del proveedor.
- El modal de alta y edición suma CBU/alias, plazo de pago (campo numérico que dice "días"; 0 = "paga en el día") y los
  días de entrega (siete botones grandes que se prenden y apagan). El CUIT se valida al salir del campo.

### Página del proveedor (`CuentaProveedor.jsx` → `FichaProveedor.jsx`, ruta `/proveedores/:id`)
Una sola columna que se recorre bajando:
1. Volver a Proveedores · nombre · teléfono.
2. Botonera fija con botones grandes y texto: **Registrar pago** · **Llamar** · **WhatsApp** · **Resumen de cuenta**.
   En el celular quedan de a dos por fila.
3. Recuadro de saldo: "Le debemos $X" · "Ya vencido $Y" en rojo, o "Nada vencido" en verde · "Próximo vencimiento:
   jueves 16/10 — $Z". Botón secundario **Nota de crédito**.
4. **Compras sin pagar:** fecha, comprobante, total, falta pagar y una etiqueta de color ("Vencida hace 5 días",
   "Vence en 3 días", "Vence hoy", "Pagada a medias").
5. **Productos que te vende:** producto, último precio, fecha, ↑/↓ respecto del anterior.
6. **Movimientos:** la lista actual. Los pagos y las notas de crédito que se pueden anular llevan el botón **Anular**
   con texto. Los anulados se ven tachados con la etiqueta "Anulado".
7. **Datos:** CUIT, CBU/alias con botón **Copiar**, días de entrega, plazo, dirección, notas y el botón **Editar datos**.

**Modales:**
- **Registrar pago:** al elegir "Cheque" aparecen número, banco y fecha de cobro (obligatoria).
- **Anular:** "¿Seguro que querés anular este pago de $ 50.000 del 10/10?", un campo obligatorio "¿Por qué?" y, si el
  servidor pide caja, el selector "¿A qué caja vuelve la plata?". Botones **No, volver** y **Sí, anular**, este en rojo.
- **Resumen de cuenta:** dos fechas (el mes corriente por defecto), **Descargar PDF** y **Abrir WhatsApp**, que abre
  `wa.me/<número>?text=Hola, te paso el resumen de cuenta de <negocio>.`

## 7. Pruebas

Tests nuevos en `server/test/proveedores.test.js`, con vitest y el Postgres embebido, como los existentes:
- `imputar`: aplica a la compra más vieja primero; el pago de contado se aplica a su propia compra aunque haya deuda
  vieja; descarta las compras anuladas; respeta el saldo a favor; calcula los vencimientos y los estados; cumple la
  invariante `Σ pendiente = max(saldo, 0)`.
- Anular pago: en efectivo con el turno abierto, la plata vuelve a esa caja; con el turno cerrado y sin `caja_id`, da
  error `ELEGIR_CAJA`; anular dos veces da error; un pago de contado de una compra no se anula; el saldo vuelve a lo que era.
- CUIT: válido, inválido, normalización y repetido entre proveedores.
- `numeroWhatsApp`: los formatos del demo (`223 555-0101`, `11 4555-0202`, `0351 15 1234567`, `+54 9 11 …`).
- Panel: aparecen los cheques de la semana y los proveedores con vencidos.

Al final se corre `npm test` completo y se revisa en el navegador con el local levantado: lista, página del proveedor,
pago con cheque, anulación y PDF.
