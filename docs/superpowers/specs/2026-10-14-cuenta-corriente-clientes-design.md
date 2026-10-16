# Cuenta corriente de clientes — diseño

Fecha: 2026-10-14 · Estado: aprobado en la charla ("hacé lo que creas mejor para un negocio chico")

## Objetivo

Que solo los clientes con **cuenta corriente habilitada** puedan comprar "a cuenta". Cada uno tiene su plazo de pago, se sabe qué compras vencieron y se le puede sacar un resumen o el detalle de lo que debe en PDF para mandárselo.

**Restricción principal** (igual que en proveedores): los usuarios casi no usan computadora. Todo se hace con botones grandes, con texto y a la vista, y con palabras simples.

**Fuera de alcance:**
- cierres o liquidaciones numeradas por período (el usuario eligió "resumen cuando lo pido");
- intereses por mora;
- envío automático por WhatsApp;
- elegir a mano a qué compra va cada cobro.

## 1. Habilitación

- `clientes` suma `cuenta_corriente BOOLEAN NOT NULL DEFAULT false` y `plazo_pago_dias INTEGER NOT NULL DEFAULT 0` (entre 0 y 365).
- Permiso nuevo **`clientes.administrar_cuenta`**: lo tiene el dueño, y el cajero con el PIN del dueño (está en `PERMISOS_CON_PIN`). Hace falta para:
  - crear un cliente con cuenta corriente, límite o plazo;
  - cambiar `cuenta_corriente`, `limite_credito` o `plazo_pago_dias` de un cliente existente;
  - anular un cobro.
- El cajero sigue pudiendo crear y editar nombre, teléfono, documento, dirección y notas sin PIN.
- **Migración:** quedan habilitados los clientes que ya tienen movimientos en su cuenta o un límite de crédito cargado. Así nadie que hoy fía se queda sin poder hacerlo.
- **Quitar la cuenta corriente:** no borra la deuda. Solo impide fiar de nuevo; los cobros siguen funcionando.

## 2. Venta a cuenta

- El servidor rechaza un pago `CUENTA_CORRIENTE` si el cliente no tiene la cuenta habilitada. Código `SIN_CUENTA_CORRIENTE`, mensaje "<Nombre> no tiene cuenta corriente. Habilitala desde Clientes."
- En la pantalla de cobro, el botón "Fiado" pasa a llamarse **"Cuenta corriente"**.
- En el buscador de clientes, los que no tienen cuenta muestran "Sin cuenta corriente" y un botón **Habilitar** (pide el PIN si es el cajero).
- Si el cliente tiene deuda vencida, aparece un aviso amarillo: "Tiene $X vencido". La venta se permite igual.

## 3. Estado de la deuda (imputación automática)

- **Función común:** el cálculo FIFO de proveedores (`imputar`) pasa a `server/src/lib/imputacion.js` como `imputarDeudas({ deudas, creditos, plazoDias, hoy })`. Proveedores y clientes usan cada uno un adaptador propio. La salida de proveedores no cambia y sus tests la cuidan.
- **Qué cuenta como deuda del cliente:**
  - cada `VENTA` de una venta confirmada, por el monto que quedó a cuenta, con la fecha de la venta;
  - cada `AJUSTE` positivo ("deuda cargada a mano"), con la fecha del movimiento.
- **Qué baja la deuda:** los `PAGO` no anulados y los `AJUSTE` negativos. Se aplican de la compra más vieja a la más nueva.
- **Qué no cuenta:** una venta anulada, junto con su `ANULACION_VENTA`, y un cobro anulado, junto con su anulación.
- **Vencimiento:** fecha de la deuda + `plazo_pago_dias`. Estados: PAGADA, PARCIAL, PENDIENTE, VENCIDA, igual que en proveedores.

## 4. Anular un cobro

- **Base:** tipo nuevo `ANULACION_PAGO` en `cc_clientes_movimientos` (importe > 0), con `anula_movimiento_id` único.
- **Caja:** tipo nuevo `ANULACION_COBRO_CLIENTE` en `caja_movimientos` (importe < 0). La plata sale por el mismo medio del cobro original.
- **Turno:** el original si sigue abierto; si cerró, la caja que se indique (`ELEGIR_CAJA`).
- **Efectivo:** si no alcanza el efectivo de la caja, da error, como cualquier egreso.
- **Auditoría:** se registra con el motivo, que es obligatorio.

## 5. API (`/api/clientes`, permiso `clientes.operar` salvo lo indicado)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | Suma `vencido` a cada cliente |
| POST / PUT | `/`, `/:id` | Acepta `cuenta_corriente`, `plazo_pago_dias` y `pinAutorizacion`; sin permiso responde `REQUIERE_PIN` |
| GET | `/:id/ficha` | Cliente, saldo, vencido, próximo vencimiento, compras sin pagar (con N° de ticket) y movimientos (con `anulado` y `se_puede_anular`) |
| POST | `/:id/movimientos/:movId/anular` | Anula un cobro (`{ motivo, caja_id?, pinAutorizacion? }`) |
| GET | `/:id/resumen.pdf?desde=&hasta=` | Resumen de cuenta del período (saldo anterior, movimientos, saldo final, compras sin pagar a la fecha "hasta") |
| GET | `/:id/detalle-deuda.pdf` | Lo que debe hoy, compra por compra, con los productos de cada ticket, el vencimiento y el total |

`/:id/cuenta` se reemplaza por `/:id/ficha`.

El encabezado, las tablas y la leyenda de los PDF salen de una pieza común (`server/src/lib/pdf.js`) que también usa el resumen de proveedores.

## 6. Pantallas

- **Clientes (lista):**
  - buscador;
  - filtros con botones: **Todos / Con cuenta corriente / Con deuda / Con deuda vencida**;
  - columnas: Debe, Vencido y Llamar/WhatsApp;
  - en el celular, tarjetas.
- **Formulario de cliente:**
  - un interruptor grande **"Tiene cuenta corriente"**;
  - si está prendido, se ven "Límite de crédito" y "¿En cuántos días tiene que pagar?";
  - al guardar, si hace falta el PIN, se pide.
- **Página del cliente:**
  - botonera: **Cobrar**, **Llamar**, **WhatsApp**, **Resumen y detalle (PDF)**;
  - saldo con lo vencido y el próximo vencimiento;
  - compras sin pagar, que al tocarlas muestran lo que llevó (usa `GET /api/ventas/:id`);
  - movimientos, con **Anular** en los cobros;
  - datos del cliente con **Editar datos**;
  - **Ajustar cuenta**, solo para el dueño.
- **Inicio:** tarjeta "Clientes con deuda vencida" con los 5 que más deben vencido.
- **Reporte "Lo que nos deben los clientes":** suma las columnas Al día / Vencido hasta 30 / 31 a 60 / más de 60 días.

## 7. Pruebas

- **Función común de imputación:** los tests de proveedores siguen igual y se suman casos de clientes (ajuste positivo como deuda, venta anulada, cobro anulado).
- **Venta:** a cuenta sin cuenta corriente, rechazada; con cuenta, aceptada.
- **Habilitación:** el cajero sin PIN no puede; con PIN sí; el cajero edita el teléfono sin PIN.
- **Anular cobro:** con la caja abierta, la plata sale; con el turno cerrado pide caja; no se anula dos veces.
- **Ficha y PDF:** la ficha devuelve vencidos; los dos PDF salen con el nombre del cliente.
- **Panel y reporte:** el Inicio trae los clientes vencidos y el reporte trae los tramos.
- **Migración:** habilita a quien ya tenía movimientos o límite.
