import { describe, it, expect, beforeEach } from 'vitest';
import {
  db, reiniciarBase, login, crearCajero, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja, vender, esperarConsistencia,
} from './helpers.js';

describe('Fase 3 · clientes y fiado', () => {
  let admin;
  let cajero;
  let merluza;
  let cliente;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    cajero = await crearCajero();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '10000' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '30', costo_unitario: '6000' }]);
    await abrirCaja(admin, '10000');
    const res = await admin.post('/api/clientes').send({ nombre: 'Doña Marta', telefono: '223 555-1111', limite_credito: '50000', cuenta_corriente: true });
    expect(res.status).toBe(201);
    cliente = res.body;
  });

  const fiar = (agente, kilos, extra = {}) =>
    vender(agente, [{ producto_id: merluza.id, cantidad: String(kilos) }], [{ medio: 'CUENTA_CORRIENTE', monto: String(kilos * 10000) }], { cliente_id: cliente.id, ...extra });

  const saldo = async () => (await admin.get(`/api/clientes/${cliente.id}`)).body.saldo;

  it('una venta a cuenta no mueve la caja, queda como deuda y el ticket lleva el nombre del cliente', async () => {
    const res = await fiar(cajero, 2);
    expect(res.status).toBe(201);
    expect(await saldo()).toBe('20000.00');

    const caja = await admin.get('/api/cajas/1/actual');
    expect(caja.body.totales_por_medio.EFECTIVO).toBe('10000.00'); // solo la apertura
    expect(caja.body.ventas.total).toBe('20000.00');
    expect(caja.body.ventas.fiado).toBe('20000.00');

    const ticket = await admin.get(`/api/comprobantes/${res.body.comprobante.id}`);
    expect(ticket.body.cliente.nombre).toBe('Doña Marta');
    expect(ticket.body.pagos).toEqual([{ medio: 'CUENTA_CORRIENTE', monto: '20000.00' }]);
    await esperarConsistencia();
  });

  it('permite pagar una parte en el momento y fiar el resto', async () => {
    const res = await vender(
      cajero,
      [{ producto_id: merluza.id, cantidad: '3' }],
      [{ medio: 'EFECTIVO', monto: '10000' }, { medio: 'CUENTA_CORRIENTE', monto: '20000' }],
      { cliente_id: cliente.id, efectivo_recibido: '10000' },
    );
    expect(res.status).toBe(201);
    expect(await saldo()).toBe('20000.00');
    const caja = await admin.get('/api/cajas/1/actual');
    expect(caja.body.totales_por_medio.EFECTIVO).toBe('20000.00');
  });

  it('no se puede fiar sin elegir cliente', async () => {
    const res = await vender(cajero, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'CUENTA_CORRIENTE', monto: '10000' }]);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('FIADO_SIN_CLIENTE');
  });

  it('pasarse del límite de crédito necesita el PIN del dueño (el dueño pasa directo)', async () => {
    await fiar(cajero, 4); // 40.000 de 50.000
    const pasado = await fiar(cajero, 2); // 60.000
    expect(pasado.status).toBe(403);
    expect(pasado.body.error.codigo).toBe('REQUIERE_PIN');
    expect(await saldo()).toBe('40000.00');

    const conPin = await fiar(cajero, 2, { pinAutorizacion: '1234' });
    expect(conPin.status).toBe(201);
    expect(await saldo()).toBe('60000.00');
    const audit = await db('auditoria').where({ accion: 'FIADO_LIMITE_EXCEDIDO' }).first();
    expect(audit.autorizado_por_id).not.toBeNull();

    const dueno = await fiar(admin, 1);
    expect(dueno.status).toBe(201);
    expect(await saldo()).toBe('70000.00');
  });

  it('cobra la deuda (la plata entra a la caja) pero no más de lo que debe', async () => {
    await fiar(cajero, 2);
    const cobro = await cajero.post(`/api/clientes/${cliente.id}/cobros`).send({ importe: '5000', medio: 'TRANSFERENCIA', caja_id: 1 });
    expect(cobro.status).toBe(201);
    expect(cobro.body.saldo).toBe('15000.00');
    const caja = await admin.get('/api/cajas/1/actual');
    expect(caja.body.totales_por_medio.TRANSFERENCIA).toBe('5000.00');

    const demas = await cajero.post(`/api/clientes/${cliente.id}/cobros`).send({ importe: '15000.01', medio: 'EFECTIVO', caja_id: 1 });
    expect(demas.status).toBe(409);
    expect(demas.body.error.codigo).toBe('COBRO_EXCEDE_DEUDA');

    await cajero.post(`/api/clientes/${cliente.id}/cobros`).send({ importe: '15000', medio: 'EFECTIVO', caja_id: 1 });
    expect(await saldo()).toBe('0.00');
    const sinDeuda = await cajero.post(`/api/clientes/${cliente.id}/cobros`).send({ importe: '1', medio: 'EFECTIVO', caja_id: 1 });
    expect(sinDeuda.body.error.codigo).toBe('SIN_DEUDA');

    const cuenta = await admin.get(`/api/clientes/${cliente.id}/ficha`);
    expect(cuenta.body.movimientos.map((m) => m.tipo)).toEqual(['PAGO', 'PAGO', 'VENTA']);
    expect(cuenta.body.movimientos.map((m) => m.saldo_acumulado)).toEqual(['0.00', '15000.00', '20000.00']);
  });

  it('no cobra con la caja cerrada', async () => {
    await fiar(cajero, 1);
    await admin.post('/api/caja-sesiones/1/cerrar').send({ efectivo_contado: '10000' });
    const res = await cajero.post(`/api/clientes/${cliente.id}/cobros`).send({ importe: '1000', medio: 'EFECTIVO', caja_id: 1 });
    expect(res.body.error.codigo).toBe('CAJA_CERRADA');
  });

  it('al anular la venta a cuenta se cancela la deuda', async () => {
    const venta = await fiar(cajero, 2);
    expect(await saldo()).toBe('20000.00');
    const anulada = await admin.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'Se equivocó el pedido' });
    expect(anulada.status).toBe(200);
    expect(await saldo()).toBe('0.00');
    const caja = await admin.get('/api/cajas/1/actual');
    expect(caja.body.totales_por_medio.EFECTIVO).toBe('10000.00'); // no se devolvió plata: nunca entró
    await esperarConsistencia();
  });

  it('solo el dueño ajusta la cuenta, y no se da de baja un cliente con deuda', async () => {
    await fiar(cajero, 2);
    const noPuede = await cajero.post(`/api/clientes/${cliente.id}/ajustes`).send({ importe: '1000', sentido: 'BAJAR', motivo: 'Perdón' });
    expect(noPuede.status).toBe(403);
    const ok = await admin.post(`/api/clientes/${cliente.id}/ajustes`).send({ importe: '5000', sentido: 'BAJAR', motivo: 'Se le perdonó una parte' });
    expect(ok.body.saldo).toBe('15000.00');
    const subir = await admin.post(`/api/clientes/${cliente.id}/ajustes`).send({ importe: '2000', sentido: 'SUBIR', motivo: 'Deuda anterior' });
    expect(subir.body.saldo).toBe('17000.00');

    const baja = await admin.put(`/api/clientes/${cliente.id}`).send({ activo: false });
    expect(baja.status).toBe(409);
    expect(baja.body.error.codigo).toBe('CLIENTE_CON_DEUDA');
  });

  it('el listado trae el saldo y se puede filtrar por deuda', async () => {
    await cajero.post('/api/clientes').send({ nombre: 'Juan sin deuda' });
    await fiar(cajero, 1);
    const todos = await cajero.get('/api/clientes');
    expect(todos.body).toHaveLength(2);
    const deben = await cajero.get('/api/clientes?con_deuda=true');
    expect(deben.body.map((c) => c.nombre)).toEqual(['Doña Marta']);
    const buscar = await cajero.get('/api/clientes?q=marta');
    expect(buscar.body).toHaveLength(1);
  });
});
