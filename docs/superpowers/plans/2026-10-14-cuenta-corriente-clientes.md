# Cuenta corriente de clientes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (elegido por el usuario en el plan anterior: ejecución en la misma sesión). Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** cuenta corriente habilitable por cliente (dueño, o cajero con PIN), con plazo y vencimientos, anulación de cobros, resumen y detalle de deuda en PDF, avisos y reporte.

**Arquitectura:**
- El cálculo FIFO pasa a `server/src/lib/imputacion.js` (`imputarDeudas`) y lo usan dos adaptadores: proveedores (sin cambios en su salida) y clientes.
- Una migración suma la habilitación, la anulación de cobros y el tipo de caja nuevo.
- Los PDF comparten encabezado y tablas en `server/src/lib/pdf.js`.
- El cliente reescribe la lista y la página del cliente con el mismo estilo que proveedores.

**Stack:** igual que el plan de proveedores.

**Spec:** `docs/superpowers/specs/2026-10-14-cuenta-corriente-clientes-design.md`

## Restricciones globales

- Botones grandes, con texto y a la vista; nada de menús escondidos. Palabras simples.
- La plata se opera con `dec()` / `aPesos()`.
- `cc_clientes_movimientos` y `caja_movimientos` son de solo inserción.
- La API usa `snake_case` y las fechas van como `'YYYY-MM-DD'`.
- Tests: `npm test` desde la raíz. Lo de pantalla se verifica con `npm run build` y el navegador.
- No es un repo git: no hay commits.

## Qué revisar con más cuidado

1. Cliente con la cuenta deshabilitada **que todavía debe**: se le sigue pudiendo cobrar y su deuda sigue figurando. Test en la Tarea 4.
2. Cajero que edita el teléfono de un cliente con cuenta: no le pide PIN, porque no cambió nada de la cuenta. Test en la Tarea 4.
3. Anular un cobro en efectivo cuando la caja ya no tiene ese efectivo: da error claro y no deja la caja en negativo. Test en la Tarea 5.
4. Venta con entrega parcial: la deuda es lo que quedó a cuenta, no el total de la venta. Test en la Tarea 3.
5. Deuda vieja cargada con un ajuste positivo: aparece como una "compra" más y vence. Test en la Tarea 3.

---

### Tarea 1: imputación común

**Archivos:**
- Crear: `server/src/lib/imputacion.js`
- Modificar: `server/src/modules/proveedores/imputacion.js` (pasa a ser un adaptador)
- Test: `server/test/proveedores-imputacion.test.js` (sin cambios: tiene que seguir en verde)

**Produce:**

```ts
imputarDeudas({ deudas, creditos, plazoDias, hoy }) → {
  vencido: string,
  proximo_vencimiento: { fecha, importe } | null,
  deudas: [{ ...deudaOriginal, vence, total, pagado, pendiente, estado, dias_para_vencer }],
}
// deudas: [{ clave, fecha, importe, ...extra }], de cualquier orden; se ordenan por (fecha, orden)
// creditos: [{ importe (> 0), clave? }]; con clave va primero a esa deuda, y lo que sobra va al pozo
```

- [ ] Mover el algoritmo de `proveedores/imputacion.js` a `lib/imputacion.js`, generalizado.
- [ ] Reescribir `imputar()` de proveedores para que arme `deudas` (con `clave = compra_id` y `orden = id`) y `creditos` (pagos con `compra_id` dirigidos a su compra), llame a `imputarDeudas` y devuelva lo mismo de siempre.
- [ ] `npm test -- proveedores`: tiene que pasar todo, igual que antes.

### Tarea 2: `shared/`

**Archivos:** `shared/src/permisos.js`, `shared/src/constantes.js`, `shared/src/esquemas.js`; test en `server/test/proveedores-utiles.test.js` → archivo nuevo `server/test/clientes-utiles.test.js`.

- **Permisos:** `'clientes.administrar_cuenta': ['DUENO']`, sumado a `PERMISOS_CON_PIN`.
- **Etiquetas:**
  - `TIPOS_MOV_CC_CLIENTE_ETIQUETA`: `VENTA: 'Compra a cuenta'`, sin cambios, y se suma `ANULACION_PAGO: 'Cobro anulado'`;
  - `TIPOS_MOV_CAJA_ETIQUETA`: se suma `ANULACION_COBRO_CLIENTE: 'Cobro de fiado anulado'`;
  - `MEDIOS_PAGO_ETIQUETA.CUENTA_CORRIENTE` pasa de `'Fiado'` a `'Cuenta corriente'`.
- **Esquemas:**
  - `esquemaCliente` suma `cuenta_corriente: z.boolean().optional()`, `plazo_pago_dias` (igual que proveedor) y `pinAutorizacion: pinOpcional`;
  - nuevo `esquemaAnularCobroCliente = { motivo (≥ 3), caja_id?, pinAutorizacion? }`;
  - nuevo `esquemaResumenCuenta`, que es el mismo de `esquemaResumenProveedor` renombrado; queda un alias con el nombre viejo.
- [ ] Test RED → GREEN: plazo, cuenta_corriente, motivo obligatorio para anular, y "desde" posterior a "hasta" rechazado.

### Tarea 3: migración y adaptador de clientes

**Archivos:**
- Crear: `server/src/db/migraciones/20261014000002_cuenta_corriente_clientes.js`
- Crear: `server/src/modules/clientes/deuda.js`, con `imputarCliente({ movimientos, ventas, plazoDias, hoy })` y `estadoDeudasClientes(conexion, clientes, hoy?)`
- Test: `server/test/clientes-cuenta.test.js` (unitario del adaptador y la migración)

**Migración (`up`):**
- `clientes`: `cuenta_corriente BOOLEAN NOT NULL DEFAULT false` y `plazo_pago_dias INTEGER NOT NULL DEFAULT 0 CHECK (BETWEEN 0 AND 365)`. Después, `UPDATE clientes SET cuenta_corriente = true WHERE limite_credito IS NOT NULL OR EXISTS (SELECT 1 FROM cc_clientes_movimientos m WHERE m.cliente_id = clientes.id)`. Esto va en la función exportada `habilitarClientesExistentes(knex)` para poder testearla.
- `cc_clientes_movimientos`:
  - `anula_movimiento_id BIGINT UNIQUE REFERENCES cc_clientes_movimientos(id)`;
  - el CHECK de `tipo` suma `ANULACION_PAGO`;
  - `ck_cc_cli_signo` suma `WHEN 'ANULACION_PAGO' THEN importe > 0`;
  - nuevo `ck_cc_cli_anula`: `(tipo = 'ANULACION_PAGO') = (anula_movimiento_id IS NOT NULL)`;
  - nuevo `ck_cc_cli_anula_caja`: `tipo <> 'ANULACION_PAGO' OR caja_movimiento_id IS NOT NULL`.
- `caja_movimientos`:
  - el CHECK de `tipo` suma `ANULACION_COBRO_CLIENTE`;
  - `ck_caja_mov_signo` suma `WHEN 'ANULACION_COBRO_CLIENTE' THEN importe < 0`.
  - La lista completa de tipos tiene que incluir también `ANULACION_PAGO_PROVEEDOR`, de la migración anterior.
- Mensaje de unicidad en `errores.js`: `cc_clientes_movimientos_anula_movimiento_id_key: 'Ese cobro ya estaba anulado.'`.

**Adaptador de clientes:**
- deudas = movimientos `VENTA` de ventas `CONFIRMADA`, con `clave: 'v' + venta_id`, `fecha` = fecha local de la venta, `importe` = importe del movimiento, y `venta_id` y `ticket` como extras; más los `AJUSTE` positivos, con `clave: 'a' + id`, `fecha` = `creado_en` local y `descripcion`;
- créditos = `PAGO` no anulados y `AJUSTE` negativos;
- se descartan las ventas anuladas (con su `VENTA` y su `ANULACION_VENTA`) y los cobros anulados (con su anulación).

**Tests (RED → GREEN):**
- un cobro cancela la compra más vieja;
- una venta con entrega parcial: la deuda es lo que quedó a cuenta;
- un ajuste positivo aparece como deuda y vence;
- una venta anulada no cuenta;
- un cobro anulado no paga;
- `habilitarClientesExistentes` habilita al que tiene movimientos o límite y no toca al resto.

### Tarea 4: reglas de habilitación y venta

**Archivos:** `server/src/modules/clientes/clientes.service.js` (crear, actualizar, listar), `server/src/modules/ventas/ventas.service.js`, y tests en `server/test/clientes.test.js` (el `beforeEach` pasa a crear el cliente con el admin y `cuenta_corriente: true`) y en `server/test/reportes.test.js` (igual).

- `crear`: si `cuenta_corriente`, `limite_credito` o `plazo_pago_dias` vienen con valor, llama a `auth.autorizar(trx, ctx, 'clientes.administrar_cuenta', pin, 'Para abrirle cuenta corriente hace falta el PIN del dueño.')`. Antes de insertar se saca `pinAutorizacion`.
- `actualizar`: lo mismo, pero solo si alguno de esos tres campos **cambia** respecto de lo guardado. Para comparar el límite se normaliza con `aPesos` o `null`.
- `listar`: suma `vencido` usando `estadoDeudasClientes` solo para los que tienen saldo > 0; el resto queda en `'0.00'`.
- `ventas.crear`: si hay `CUENTA_CORRIENTE` y `!cliente.cuenta_corriente`, lanza `ErrorNegocio('<nombre> no tiene cuenta corriente. Habilitala desde Clientes.', 'SIN_CUENTA_CORRIENTE')`.
- **Tests (RED → GREEN):**
  - fiar sin cuenta corriente da 409 `SIN_CUENTA_CORRIENTE`;
  - el cajero crea un cliente con cuenta: sin PIN da 403 `REQUIERE_PIN` y con PIN 201;
  - el cajero cambia el teléfono de un cliente con cuenta y límite sin PIN: 200;
  - a un cliente con la cuenta deshabilitada que debe se le puede cobrar;
  - la lista trae `vencido`.
- Ruling previsto: los tests existentes que fiaban sin cuenta corriente se actualizan, porque el cambio de comportamiento lo pide el spec.

### Tarea 5: ficha y anulación de cobro

**Archivos:** `clientes.service.js` (`ficha`, `anularCobro`), `clientes.routes.js` y test en `server/test/clientes-cuenta.test.js`.

- `ficha(id)`:
  - `{ cliente, saldo, vencido, proximo_vencimiento, compras_pendientes, movimientos }`;
  - `compras_pendientes` son las deudas no pagadas, con `ticket` (`'0001-00000012'`) cuando es una venta;
  - `movimientos` son los de `obtenerCuenta` más `anulado` y `se_puede_anular` (solo un `PAGO` no anulado).
- `anularCobro(ctx, clienteId, movId, { motivo, caja_id, pinAutorizacion })`:
  - pide el permiso `clientes.administrar_cuenta` (con PIN para el cajero);
  - bloquea el cliente sin exigir que esté activo;
  - valida que el movimiento sea un `PAGO` de ese cliente y que no esté anulado;
  - si el turno del cobro está abierto, usa ese; si no, usa `caja_id` o lanza `ELEGIR_CAJA` (400);
  - registra `ANULACION_COBRO_CLIENTE` con `-importe` y el mismo medio (el control de efectivo es el de siempre);
  - inserta `ANULACION_PAGO` y deja registro en la auditoría `CLIENTE_COBRO_ANULADO`.
- **Rutas:** `GET /:id/ficha` (reemplaza a `/:id/cuenta`) y `POST /:id/movimientos/:movId/anular`.
- **Tests:** turno abierto; turno cerrado con `ELEGIR_CAJA` y después con caja; no anular dos veces; efectivo insuficiente da `EFECTIVO_INSUFICIENTE`; cajero sin PIN da 403; la ficha marca vencidas según el plazo.

### Tarea 6: PDF

**Archivos:**
- Crear `server/src/lib/pdf.js`, con `documentoPdf(titulo, autor, dibujar) → Promise<Buffer>` y `tablaPdf(doc, y, columnas, filas)`, extraídos de `proveedores/resumen.service.js` (que pasa a usarlos).
- Crear `server/src/modules/clientes/resumen.service.js`, con `datosResumenCliente`, `resumenPdf`, `datosDetalleDeuda` y `detalleDeudaPdf`.
- Rutas `GET /:id/resumen.pdf` y `GET /:id/detalle-deuda.pdf`; los dos piden `esquemaResumenCuenta`.

**Contenido:**
- **Resumen:** igual que el de proveedores, con las fechas de los movimientos tomadas de `creado_en` en hora local.
- **Detalle de deuda:** por cada compra sin pagar, una fila de encabezado ("Ticket 0001-00000012 · 10/10/2026 · vence 25/10/2026 · falta $X") y debajo sus productos (descripción, cantidad, precio, total). Al final, "Total adeudado".
- **Nombre del archivo:** `resumen-<cliente>-<hasta>.pdf` y `deuda-<cliente>-<hoy>.pdf`.

**Tests:** `datosResumenCliente` (saldo anterior y final, pendientes a la fecha "hasta"), `datosDetalleDeuda` (items de cada venta), que los PDF empiecen con `%PDF` y el nombre del archivo; el resumen de proveedores tiene que seguir en verde.

### Tarea 7: Inicio y reporte

- `panel()` suma `clientes_vencidos: [{ id, nombre, vencido }]`: hasta 5, con vencido > 0, ordenados de mayor a menor.
- El reporte `cuentas-clientes` suma los tramos `al_dia`, `vencido_30`, `vencido_60` y `vencido_mas` (con el mismo criterio de proveedores; con saldo a favor, "al día" queda en 0) y conserva `limite`.
- **Test:** un cliente con una deuda de 40 días y plazo 5 aparece en el panel y en el tramo de 31 a 60.

### Tarea 8: lista y formulario de cliente (pantalla)

- `Clientes.jsx`:
  - los filtros pasan a `SelectorBotones` (Todos / Con cuenta corriente / Con deuda / Con deuda vencida);
  - columnas: Cliente (con la etiqueta "Cuenta corriente"), Contacto (`BotonesContacto`), Debe, Vencido y "Ver cliente";
  - en el celular, tarjetas (mismo patrón que proveedores).
- `ModalCliente`:
  - un `Interruptor` "Tiene cuenta corriente" y, si está prendido, límite y plazo;
  - al guardar usa `conPin(pedirPin, (pin) => put/post({...datos, pinAutorizacion: pin}))`.
- Build.

### Tarea 9: página del cliente (pantalla)

- `CuentaCliente.jsx` pasa a ser la ficha:
  - botonera **Cobrar** / **Llamar** / **WhatsApp** / **Resumen y detalle**;
  - `TarjetaSaldo` con lo vencido y el próximo vencimiento, y el botón **Ajustar cuenta** solo para el dueño;
  - "Compras sin pagar": al tocar una se abre un modal con los productos (`GET /ventas/:id`);
  - movimientos con **Anular** para los cobros (usa `conPin` y el selector de caja, como en proveedores);
  - datos del cliente con **Editar datos**.
- `ModalPdfCliente`: con fechas, **Descargar resumen**, **Descargar detalle de deuda** y **Abrir WhatsApp**.
- Build.

### Tarea 10: Vender e Inicio (pantalla)

- `ModalCobro`:
  - el botón y el título "Fiado" pasan a "Cuenta corriente";
  - si el cliente elegido no tiene cuenta, en vez de los datos de la cuenta se ve el aviso "No tiene cuenta corriente" y un botón **Habilitar cuenta corriente** (que hace `put` con `conPin`);
  - si `vencido > 0`, se ve el aviso amarillo.
- `SelectorCliente`: la lista muestra "Sin cuenta corriente" en gris para los que no la tienen.
- `Inicio.jsx`: tarjeta "Clientes con deuda vencida", con filas que llevan a `/clientes/:id`.
- Build.

### Tarea 11: verificación

- `npm test` completo, en verde.
- Navegador, si el local está levantado: lista, habilitación con PIN, venta a cuenta, ficha, PDF, Inicio y ancho de celular. Si el local no está corriendo (se apagó por falta de memoria), se avisa y no se levanta sin permiso.
