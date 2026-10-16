import { describe, it, expect, beforeEach } from 'vitest';
import {
  db, reiniciarBase, login, crearCajero, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja, vender, lotes, stockDe, esperarConsistencia,
} from './helpers.js';
import { sumarDias, hoy } from '../src/lib/fechas.js';

describe('Fase 2 · mermas', () => {
  let admin;
  let merluza;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '9500' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '10', costo_unitario: '6000' }]);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '5', costo_unitario: '7000' }], { fecha: '2026-10-14' });
  });

  it('descuenta por FIFO y calcula la plata perdida con el costo real de cada lote', async () => {
    const res = await admin.post('/api/mermas').send({ producto_id: merluza.id, cantidad: '12', motivo: 'VENCIDO' });
    expect(res.status).toBe(201);
    expect(res.body.costo_total).toBe('74000.00'); // 10 kg a 6000 + 2 kg a 7000
    expect(await stockDe(merluza.id)).toBe('3.000');
    const [l1, l2] = await lotes(merluza.id);
    expect(l1.cantidad_actual).toBe('0.000');
    expect(l2.cantidad_actual).toBe('3.000');
    await esperarConsistencia();

    const lista = await admin.get('/api/mermas');
    expect(lista.body.mermas).toHaveLength(1);
    expect(lista.body.resumen.costo_total).toBe('74000.00');
    expect(lista.body.resumen.por_motivo[0].motivo).toBe('VENCIDO');
  });

  it('puede descartar de un lote puntual (el que se venció)', async () => {
    const [, l2] = await lotes(merluza.id);
    const res = await admin.post('/api/mermas').send({ producto_id: merluza.id, cantidad: '2', motivo: 'VENCIDO', lote_id: l2.id });
    expect(res.status).toBe(201);
    expect(res.body.costo_total).toBe('14000.00');
    const [l1b, l2b] = await lotes(merluza.id);
    expect(l1b.cantidad_actual).toBe('10.000');
    expect(l2b.cantidad_actual).toBe('3.000');
    // más de lo que tiene ese lote
    const demas = await admin.post('/api/mermas').send({ producto_id: merluza.id, cantidad: '4', motivo: 'VENCIDO', lote_id: l2.id });
    expect(demas.status).toBe(409);
    await esperarConsistencia();
  });

  it('no deja descartar más de lo que hay y pide detalle cuando el motivo es "otro"', async () => {
    const demas = await admin.post('/api/mermas').send({ producto_id: merluza.id, cantidad: '16', motivo: 'ROTURA' });
    expect(demas.status).toBe(409);
    expect(demas.body.error.codigo).toBe('SIN_STOCK');
    expect(await stockDe(merluza.id)).toBe('15.000');

    const sinDetalle = await admin.post('/api/mermas').send({ producto_id: merluza.id, cantidad: '1', motivo: 'OTRO' });
    expect(sinDetalle.status).toBe(400);
    await esperarConsistencia();
  });

  it('el cajero registra mermas pero no ve cuánta plata se perdió', async () => {
    const cajero = await crearCajero();
    const res = await cajero.post('/api/mermas').send({ producto_id: merluza.id, cantidad: '1', motivo: 'MAL_ESTADO' });
    expect(res.status).toBe(201);
    expect(res.body.costo_total).toBeUndefined();
    const lista = await cajero.get('/api/mermas');
    expect(JSON.stringify(lista.body)).not.toMatch(/costo/);
  });
});

describe('Fase 2 · ajustes de stock', () => {
  let admin;
  let merluza;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '10', costo_unitario: '6000' }]);
  });

  it('corrige hacia abajo (sale por FIFO) y hacia arriba (entra un lote nuevo)', async () => {
    const baja = await admin.post('/api/stock/ajustes').send({ producto_id: merluza.id, cantidad_real: '8,5', motivo: 'Se pesó mal el remito' });
    expect(baja.status).toBe(201);
    expect(baja.body.diferencia).toBe('-1.500');
    expect(await stockDe(merluza.id)).toBe('8.500');

    const sube = await admin.post('/api/stock/ajustes').send({ producto_id: merluza.id, cantidad_real: '9', motivo: 'Apareció una caja' });
    expect(sube.body.diferencia).toBe('0.500');
    const ls = await lotes(merluza.id);
    expect(ls).toHaveLength(2);
    expect(ls[1].origen).toBe('AJUSTE');
    expect(ls[1].costo_unitario).toBe('6000.0000'); // al último costo conocido
    await esperarConsistencia();

    const igual = await admin.post('/api/stock/ajustes').send({ producto_id: merluza.id, cantidad_real: '9', motivo: 'Otra vez' });
    expect(igual.status).toBe(409);
    expect(igual.body.error.codigo).toBe('SIN_DIFERENCIA');

    const movs = await admin.get(`/api/stock/productos/${merluza.id}/movimientos`);
    expect(movs.body.map((m) => m.tipo)).toEqual(['AJUSTE', 'AJUSTE', 'COMPRA']);
  });

  it('el cajero necesita el PIN del dueño', async () => {
    const cajero = await crearCajero();
    const sinPin = await cajero.post('/api/stock/ajustes').send({ producto_id: merluza.id, cantidad_real: '9', motivo: 'Conteo' });
    expect(sinPin.status).toBe(403);
    expect(sinPin.body.error.codigo).toBe('REQUIERE_PIN');
    const conPin = await cajero.post('/api/stock/ajustes').send({ producto_id: merluza.id, cantidad_real: '9', motivo: 'Conteo', pinAutorizacion: '1234' });
    expect(conPin.status).toBe(201);
    const audit = await db('auditoria').where({ accion: 'STOCK_AJUSTADO' }).first();
    expect(audit.autorizado_por_id).not.toBeNull();
  });
});

describe('Fase 2 · inventario', () => {
  let admin;
  let merluza;
  let calamar;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '9500' });
    calamar = await crearProducto(admin, { nombre: 'Calamar', precio_venta: '12000' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [
      { producto_id: merluza.id, cantidad: '10', costo_unitario: '6000' },
      { producto_id: calamar.id, cantidad: '4', costo_unitario: '8000' },
    ]);
    await abrirCaja(admin);
  });

  it('las ventas durante el conteo no generan diferencias falsas', async () => {
    const inv = await admin.post('/api/inventarios').send({});
    expect(inv.status).toBe(201);

    // Se cuenta la merluza: hay 9 (el sistema dice 10 → falta 1)
    const conteo = await admin.put(`/api/inventarios/${inv.body.id}/items/${merluza.id}`).send({ cantidad_contada: '9' });
    expect(conteo.status).toBe(200);
    expect(conteo.body.diferencia).toBe('-1.000');

    // Mientras tanto se vende 2 kg
    await vender(admin, [{ producto_id: merluza.id, cantidad: '2' }], [{ medio: 'EFECTIVO', monto: '19000' }]);
    expect(await stockDe(merluza.id)).toBe('8.000');

    const cierre = await admin.post(`/api/inventarios/${inv.body.id}/cerrar`).send({});
    expect(cierre.status).toBe(200);
    expect(cierre.body.resumen).toMatchObject({ contados: 1, sin_contar: 1, ajustados: 1, costo_diferencia: '-6000.00' });
    // 10 - 2 vendidos - 1 de diferencia detectada
    expect(await stockDe(merluza.id)).toBe('7.000');
    expect(await stockDe(calamar.id)).toBe('4.000'); // lo no contado no se toca
    await esperarConsistencia();

    const movs = await db('movimientos_stock').where({ tipo: 'INVENTARIO' });
    expect(movs).toHaveLength(1);
    expect(movs[0].inventario_item_id).not.toBeNull();
  });

  it('sobrante entra como lote nuevo; solo puede haber un inventario abierto', async () => {
    const inv = await admin.post('/api/inventarios').send({});
    const otro = await admin.post('/api/inventarios').send({});
    expect(otro.status).toBe(409);
    expect(otro.body.error.codigo).toBe('INVENTARIO_ABIERTO');

    const vacio = await admin.post(`/api/inventarios/${inv.body.id}/cerrar`).send({});
    expect(vacio.body.error.codigo).toBe('SIN_CONTEOS');

    await admin.put(`/api/inventarios/${inv.body.id}/items/${calamar.id}`).send({ cantidad_contada: '5,5' });
    await admin.post(`/api/inventarios/${inv.body.id}/cerrar`).send({});
    expect(await stockDe(calamar.id)).toBe('5.500');
    const ls = await lotes(calamar.id);
    expect(ls[1].origen).toBe('INVENTARIO');
    await esperarConsistencia();

    // ya cerrado: no se puede seguir contando
    const tarde = await admin.put(`/api/inventarios/${inv.body.id}/items/${calamar.id}`).send({ cantidad_contada: '1' });
    expect(tarde.status).toBe(409);
  });

  it('se puede deshacer un conteo y cancelar el inventario sin tocar el stock', async () => {
    const inv = await admin.post('/api/inventarios').send({ categoria_id: 1 });
    await admin.put(`/api/inventarios/${inv.body.id}/items/${merluza.id}`).send({ cantidad_contada: '3' });
    const deshecho = await admin.put(`/api/inventarios/${inv.body.id}/items/${merluza.id}`).send({ cantidad_contada: '' });
    expect(deshecho.body.cantidad_contada).toBeNull();
    const cancelado = await admin.post(`/api/inventarios/${inv.body.id}/cancelar`).send({});
    expect(cancelado.body.estado).toBe('CANCELADO');
    expect(await stockDe(merluza.id)).toBe('10.000');
  });

  it('el cajero cuenta pero no puede cerrar', async () => {
    const cajero = await crearCajero();
    const inv = await cajero.post('/api/inventarios').send({});
    const conteo = await cajero.put(`/api/inventarios/${inv.body.id}/items/${merluza.id}`).send({ cantidad_contada: '9' });
    expect(conteo.status).toBe(200);
    expect(conteo.body.costo_unitario).toBeUndefined();
    const cierre = await cajero.post(`/api/inventarios/${inv.body.id}/cerrar`).send({});
    expect(cierre.status).toBe(403);
  });
});

describe('Fase 2 · alertas', () => {
  it('avisa lo que hay que reponer, lo que vence y lo vendido sin stock', async () => {
    await reiniciarBase();
    const admin = await login();
    const merluza = await crearProducto(admin, { nombre: 'Merluza', stock_minimo: '5' });
    const calamar = await crearProducto(admin, { nombre: 'Calamar', stock_minimo: '2' });
    const sinStock = await crearProducto(admin, { nombre: 'Salmón' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [
      { producto_id: merluza.id, cantidad: '4', costo_unitario: '6000', fecha_vencimiento: sumarDias(hoy(), 1) },
      { producto_id: calamar.id, cantidad: '10', costo_unitario: '8000', fecha_vencimiento: sumarDias(hoy(), 30) },
    ]);
    await abrirCaja(admin);
    await vender(admin, [{ producto_id: sinStock.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '10000' }]);

    const res = await admin.get('/api/stock/alertas');
    expect(res.status).toBe(200);
    expect(res.body.bajo_minimo.map((p) => p.nombre)).toEqual(['Merluza']);
    expect(res.body.vencimientos.map((v) => v.producto)).toEqual(['Merluza']);
    expect(res.body.vencimientos[0].dias_restantes).toBe(1);
    expect(res.body.negativos.map((p) => p.nombre)).toEqual(['Salmón']);
    expect(res.body.total).toBe(3);
  });
});

describe('Fase 2 · cuenta corriente de proveedores', () => {
  let admin;
  let prov;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    const merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
    prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '10', costo_unitario: '10000' }]); // debemos 100.000
  });

  it('muestra el saldo con el acumulado y registra pagos y notas de crédito', async () => {
    await abrirCaja(admin, '50000');
    const pago = await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '40000', medio_pago: 'EFECTIVO_CAJA', caja_id: 1, referencia: 'Recibo 12' });
    expect(pago.status).toBe(201);
    const transf = await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '20000', medio_pago: 'TRANSFERENCIA', referencia: 'Op 998' });
    expect(transf.status).toBe(201);
    const nc = await admin.post(`/api/proveedores/${prov.id}/notas-credito`).send({ importe: '5000', descripcion: 'Devolución de 0,5 kg en mal estado' });
    expect(nc.status).toBe(201);

    const cuenta = await admin.get(`/api/proveedores/${prov.id}/ficha`);
    expect(cuenta.body.saldo).toBe('35000.00');
    expect(cuenta.body.movimientos.map((m) => m.tipo)).toEqual(['NOTA_CREDITO', 'PAGO', 'PAGO', 'COMPRA']);
    expect(cuenta.body.movimientos.map((m) => m.saldo_acumulado)).toEqual(['35000.00', '40000.00', '60000.00', '100000.00']);

    // El pago en efectivo salió de la caja (50.000 − 40.000)
    const caja = await admin.get('/api/cajas/1/actual');
    expect(caja.body.totales_por_medio.EFECTIVO).toBe('10000.00');

    const lista = await admin.get('/api/proveedores');
    expect(lista.body.find((p) => p.id === prov.id).saldo).toBe('35000.00');
  });

  it('no paga en efectivo si la caja está cerrada o no alcanza el efectivo', async () => {
    const cerrada = await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '1000', medio_pago: 'EFECTIVO_CAJA', caja_id: 1 });
    expect(cerrada.status).toBe(409);
    expect(cerrada.body.error.codigo).toBe('CAJA_CERRADA');
    await abrirCaja(admin, '500');
    const pocoEfectivo = await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '1000', medio_pago: 'EFECTIVO_CAJA', caja_id: 1 });
    expect(pocoEfectivo.body.error.codigo).toBe('EFECTIVO_INSUFICIENTE');
    const cuenta = await admin.get(`/api/proveedores/${prov.id}/ficha`);
    expect(cuenta.body.saldo).toBe('100000.00');
  });

  it('el cajero no ve ni toca las cuentas con los proveedores', async () => {
    const cajero = await crearCajero();
    expect((await cajero.get(`/api/proveedores/${prov.id}/ficha`)).status).toBe(403);
    expect((await cajero.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '1', medio_pago: 'OTRO' })).status).toBe(403);
  });
});
