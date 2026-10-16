import { describe, it, expect, beforeEach } from 'vitest';
import { imputarCliente } from '../src/modules/clientes/deuda.js';
import {
  db, reiniciarBase, login, crearCajero, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja, vender,
} from './helpers.js';
import { hoy, sumarDias } from '../src/lib/fechas.js';
import { datosResumenCliente, datosDetalleDeuda } from '../src/modules/clientes/resumen.service.js';
import { habilitarClientesExistentes } from '../src/db/migraciones/20261014000002_cuenta_corriente_clientes.js';

let n = 0;
const mov = (tipo, importe, extra = {}) => ({ id: ++n, tipo, importe, venta_id: null, anula_movimiento_id: null, fecha: '2026-10-01', descripcion: null, ...extra });
const venta = (id, fecha, extra = {}) => ({ id, fecha, estado: 'CONFIRMADA', ticket: `0001-${String(id).padStart(8, '0')}`, ...extra });
const HOY = '2026-10-14';

describe('imputarCliente', () => {
  it('el cobro cancela primero la compra más vieja; la deuda es lo que quedó a cuenta, no el total de la venta', () => {
    const r = imputarCliente({
      movimientos: [
        mov('VENTA', '20000.00', { venta_id: 1 }), // venta de 30.000 con 10.000 de entrega: a cuenta 20.000
        mov('VENTA', '5000.00', { venta_id: 2 }),
        mov('PAGO', '-22000.00'),
      ],
      ventas: [venta(1, '2026-09-20'), venta(2, '2026-10-10')],
      plazoDias: 10,
      hoy: HOY,
    });
    expect(r.saldo).toBe('3000.00');
    expect(r.deudas.map((d) => [d.ticket, d.total, d.pendiente, d.estado])).toEqual([
      ['0001-00000001', '20000.00', '0.00', 'PAGADA'],
      ['0001-00000002', '5000.00', '3000.00', 'PARCIAL'],
    ]);
    expect(r.proximo_vencimiento).toEqual({ fecha: '2026-10-20', importe: '3000.00' });
  });

  it('una deuda cargada con un ajuste positivo es una deuda más y vence', () => {
    const r = imputarCliente({
      movimientos: [mov('AJUSTE', '8000.00', { fecha: '2026-09-01', descripcion: 'Deuda anterior al sistema' })],
      ventas: [],
      plazoDias: 15,
      hoy: HOY,
    });
    expect(r.deudas[0]).toMatchObject({ origen: 'AJUSTE', descripcion: 'Deuda anterior al sistema', estado: 'VENCIDA', vence: '2026-09-16', pendiente: '8000.00' });
    expect(r.vencido).toBe('8000.00');
  });

  it('no cuentan las ventas anuladas ni los cobros anulados; un ajuste negativo baja la deuda', () => {
    const cobro = mov('PAGO', '-5000.00');
    const r = imputarCliente({
      movimientos: [
        mov('VENTA', '7000.00', { venta_id: 1 }),
        mov('ANULACION_VENTA', '-7000.00', { venta_id: 1 }),
        mov('VENTA', '9000.00', { venta_id: 2 }),
        cobro,
        mov('ANULACION_PAGO', '5000.00', { anula_movimiento_id: cobro.id }),
        mov('AJUSTE', '-1000.00'),
      ],
      ventas: [venta(1, '2026-10-01', { estado: 'ANULADA' }), venta(2, '2026-10-05')],
      plazoDias: 30,
      hoy: HOY,
    });
    expect(r.saldo).toBe('8000.00');
    expect(r.deudas).toHaveLength(1);
    expect(r.deudas[0]).toMatchObject({ venta_id: 2, pendiente: '8000.00', estado: 'PARCIAL' });
  });
});

describe('migración de cuenta corriente', () => {
  it('habilita a los clientes que ya fiaban o tenían límite, y no toca al resto', async () => {
    await reiniciarBase();
    await login();
    const usuario = await db('usuarios').first('id');
    const [conMov, conLimite, nada] = await db('clientes').insert([{ nombre: 'Con movimientos' }, { nombre: 'Con límite', limite_credito: '1000' }, { nombre: 'Nada' }]).returning('id');
    await db('cc_clientes_movimientos').insert({ cliente_id: conMov.id, tipo: 'AJUSTE', importe: '500.00', descripcion: 'Deuda vieja', usuario_id: usuario.id });
    await db('clientes').update({ cuenta_corriente: false });

    await habilitarClientesExistentes(db);

    const estado = Object.fromEntries((await db('clientes').select('id', 'cuenta_corriente', 'plazo_pago_dias')).map((c) => [c.id, [c.cuenta_corriente, c.plazo_pago_dias]]));
    // Con 30 días de plazo: si no, el primer día toda la deuda vieja figuraría vencida
    expect(estado).toEqual({ [conMov.id]: [true, 30], [conLimite.id]: [true, 30], [nada.id]: [false, 0] });
  });
});

describe('Cuenta corriente · habilitación y venta', () => {
  let admin;
  let cajero;
  let merluza;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    cajero = await crearCajero();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '10000' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '30', costo_unitario: '6000' }]);
    await abrirCaja(admin, '10000');
  });

  const fiar = (agente, clienteId, kilos = 1) =>
    vender(agente, [{ producto_id: merluza.id, cantidad: String(kilos) }], [{ medio: 'CUENTA_CORRIENTE', monto: String(kilos * 10000) }], { cliente_id: clienteId });

  it('no se puede vender a cuenta a un cliente sin cuenta corriente', async () => {
    const cliente = (await cajero.post('/api/clientes').send({ nombre: 'Juan' })).body;
    expect(cliente.cuenta_corriente).toBe(false);
    const res = await fiar(cajero, cliente.id);
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('SIN_CUENTA_CORRIENTE');
    expect(res.body.error.mensaje).toBe('Juan no tiene cuenta corriente. Habilitala desde Clientes.');
  });

  it('el cajero necesita el PIN para abrir la cuenta o cambiar límite y plazo; el teléfono no', async () => {
    const sinPin = await cajero.post('/api/clientes').send({ nombre: 'Restaurante', cuenta_corriente: true, limite_credito: '100000' });
    expect(sinPin.status).toBe(403);
    expect(sinPin.body.error.codigo).toBe('REQUIERE_PIN');
    const conPin = await cajero.post('/api/clientes').send({ nombre: 'Restaurante', cuenta_corriente: true, limite_credito: '100000', pinAutorizacion: '1234' });
    expect(conPin.status).toBe(201);
    const c = conPin.body;
    // El formulario manda todo: si la cuenta no cambió, no hace falta PIN
    const tel = await cajero.put(`/api/clientes/${c.id}`).send({ nombre: 'Restaurante', telefono: '223 555-9999', cuenta_corriente: true, limite_credito: '100000.00', plazo_pago_dias: 0 });
    expect(tel.status).toBe(200);
    const plazo = await cajero.put(`/api/clientes/${c.id}`).send({ plazo_pago_dias: 10 });
    expect(plazo.status).toBe(403);
    const periodo = await cajero.put(`/api/clientes/${c.id}`).send({ plazo_periodo: 'SEMANA' });
    expect(periodo.status).toBe(403);
    expect((await fiar(cajero, c.id)).status).toBe(201);
  });

  it('guarda el plazo al finalizar el período y no acepta períodos inventados', async () => {
    const c = (await admin.post('/api/clientes').send({ nombre: 'Restaurante', cuenta_corriente: true, plazo_periodo: 'QUINCENA' })).body;
    expect(c.plazo_periodo).toBe('QUINCENA');
    const vuelta = await admin.put(`/api/clientes/${c.id}`).send({ plazo_periodo: '', plazo_pago_dias: 7 });
    expect(vuelta.body).toMatchObject({ plazo_periodo: null, plazo_pago_dias: 7 });
    expect((await admin.put(`/api/clientes/${c.id}`).send({ plazo_periodo: 'MES' })).status).toBe(400);
  });

  it('con la cuenta deshabilitada se le sigue cobrando lo que debe, pero no se le fía más', async () => {
    const c = (await admin.post('/api/clientes').send({ nombre: 'Doña Marta', cuenta_corriente: true })).body;
    expect((await fiar(cajero, c.id)).status).toBe(201);
    expect((await admin.put(`/api/clientes/${c.id}`).send({ cuenta_corriente: false })).status).toBe(200);
    expect((await cajero.post(`/api/clientes/${c.id}/cobros`).send({ importe: '4000', medio: 'EFECTIVO', caja_id: 1 })).status).toBe(201);
    expect((await fiar(cajero, c.id)).body.error.codigo).toBe('SIN_CUENTA_CORRIENTE');
  });

  it('la lista trae lo vencido según el plazo de cada cliente', async () => {
    const c = (await admin.post('/api/clientes').send({ nombre: 'Restaurante', cuenta_corriente: true, plazo_pago_dias: 5 })).body;
    const usuario = await db('usuarios').first('id');
    await db('cc_clientes_movimientos').insert({ cliente_id: c.id, tipo: 'AJUSTE', importe: '5000.00', descripcion: 'Deuda vieja', usuario_id: usuario.id, creado_en: db.raw("now() - interval '10 days'") });
    expect((await fiar(cajero, c.id)).status).toBe(201);
    const fila = (await cajero.get('/api/clientes')).body.find((x) => x.id === c.id);
    expect(fila).toMatchObject({ saldo: '15000.00', vencido: '5000.00' });
  });
});

describe('Cuenta corriente · ficha y anulación de cobros', () => {
  let admin;
  let cajero;
  let merluza;
  let c;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    cajero = await crearCajero();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '10000' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '30', costo_unitario: '6000' }]);
    await abrirCaja(admin, '10000');
    c = (await admin.post('/api/clientes').send({ nombre: 'Restaurante', cuenta_corriente: true, plazo_pago_dias: 5, telefono: '223 555-2222' })).body;
    expect((await vender(cajero, [{ producto_id: merluza.id, cantidad: '2' }], [{ medio: 'CUENTA_CORRIENTE', monto: '20000' }], { cliente_id: c.id })).status).toBe(201);
  });

  const ficha = async () => (await admin.get(`/api/clientes/${c.id}/ficha`)).body;
  const efectivo = async () => (await admin.get('/api/cajas/1/actual')).body.totales_por_medio.EFECTIVO;
  const cobrar = async (importe = '4000') => (await cajero.post(`/api/clientes/${c.id}/cobros`).send({ importe, medio: 'EFECTIVO', caja_id: 1 })).body.movimiento;

  it('la ficha muestra lo vencido, las compras sin pagar con su ticket y el próximo vencimiento', async () => {
    const usuario = await db('usuarios').first('id');
    await db('cc_clientes_movimientos').insert({ cliente_id: c.id, tipo: 'AJUSTE', importe: '5000.00', descripcion: 'Deuda vieja', usuario_id: usuario.id, creado_en: db.raw("now() - interval '10 days'") });
    const f = await ficha();
    expect(f.saldo).toBe('25000.00');
    expect(f.vencido).toBe('5000.00');
    expect(f.compras_pendientes.map((d) => [d.origen, d.estado, d.pendiente])).toEqual([['AJUSTE', 'VENCIDA', '5000.00'], ['VENTA', 'PENDIENTE', '20000.00']]);
    expect(f.compras_pendientes[1].ticket).toBe('0001-00000001');
    expect(f.proximo_vencimiento).toEqual({ fecha: sumarDias(hoy(), 5), importe: '20000.00' });
    expect(f.movimientos.find((m) => m.tipo === 'VENTA').se_puede_anular).toBe(false);
    expect((await cajero.get(`/api/clientes/${c.id}/ficha`)).status).toBe(200); // el cajero también la ve
  });

  it('anula un cobro: la plata sale de la caja y la deuda vuelve; no se anula dos veces', async () => {
    const cobro = await cobrar();
    expect(await efectivo()).toBe('14000.00');
    const res = await admin.post(`/api/clientes/${c.id}/movimientos/${cobro.id}/anular`).send({ motivo: 'Se cargó dos veces' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tipo: 'ANULACION_PAGO', importe: '4000.00', anula_movimiento_id: cobro.id });
    expect(await efectivo()).toBe('10000.00');
    const f = await ficha();
    expect(f.saldo).toBe('20000.00');
    expect(f.movimientos.find((m) => m.id === cobro.id)).toMatchObject({ anulado: true, se_puede_anular: false });
    const otra = await admin.post(`/api/clientes/${c.id}/movimientos/${cobro.id}/anular`).send({ motivo: 'De nuevo' });
    expect(otra.status).toBe(409);
    expect(otra.body.error.codigo).toBe('YA_ANULADO');
  });

  it('si el turno del cobro cerró, pide la caja; y no deja la caja en negativo', async () => {
    const cobro = await cobrar();
    await admin.post('/api/caja-sesiones/1/cerrar').send({ efectivo_contado: '14000' });
    const sinCaja = await admin.post(`/api/clientes/${c.id}/movimientos/${cobro.id}/anular`).send({ motivo: 'Error' });
    expect(sinCaja.status).toBe(400);
    expect(sinCaja.body.error.codigo).toBe('ELEGIR_CAJA');
    await abrirCaja(admin, '1000');
    const poco = await admin.post(`/api/clientes/${c.id}/movimientos/${cobro.id}/anular`).send({ motivo: 'Error', caja_id: 1 });
    expect(poco.status).toBe(409);
    expect(poco.body.error.codigo).toBe('EFECTIVO_INSUFICIENTE');
    await admin.post('/api/caja-sesiones/2/movimientos').send({ tipo: 'INGRESO', importe: '5000', descripcion: 'Cambio' });
    const ok = await admin.post(`/api/clientes/${c.id}/movimientos/${cobro.id}/anular`).send({ motivo: 'Error', caja_id: 1 });
    expect(ok.status).toBe(201);
    expect(await efectivo()).toBe('2000.00');
  });

  it('el cajero anula un cobro solo con el PIN del dueño; una venta no se anula desde acá', async () => {
    const cobro = await cobrar();
    // Con el turno cerrado, primero se pregunta la caja: así el PIN se pide una sola vez
    await admin.post('/api/caja-sesiones/1/cerrar').send({ efectivo_contado: '14000' });
    const sinCaja = await cajero.post(`/api/clientes/${c.id}/movimientos/${cobro.id}/anular`).send({ motivo: 'Error' });
    expect(sinCaja.body.error.codigo).toBe('ELEGIR_CAJA');
    await abrirCaja(admin, '10000');
    const sinPin = await cajero.post(`/api/clientes/${c.id}/movimientos/${cobro.id}/anular`).send({ motivo: 'Error', caja_id: 1 });
    expect(sinPin.status).toBe(403);
    expect(sinPin.body.error.codigo).toBe('REQUIERE_PIN');
    expect((await cajero.post(`/api/clientes/${c.id}/movimientos/${cobro.id}/anular`).send({ motivo: 'Error', caja_id: 1, pinAutorizacion: '1234' })).status).toBe(201);
    const venta = (await ficha()).movimientos.find((m) => m.tipo === 'VENTA');
    const r = await admin.post(`/api/clientes/${c.id}/movimientos/${venta.id}/anular`).send({ motivo: 'Probando' });
    expect(r.body.error.codigo).toBe('NO_ANULABLE');
  });
});

const binario = (r, cb) => {
  const partes = [];
  r.on('data', (x) => partes.push(x));
  r.on('end', () => cb(null, Buffer.concat(partes)));
};

describe('Cuenta corriente · PDF', () => {
  let admin;
  let c;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    const merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '10000' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '30', costo_unitario: '6000' }]);
    await abrirCaja(admin, '10000');
    c = (await admin.post('/api/clientes').send({ nombre: 'Restaurante', cuenta_corriente: true, plazo_pago_dias: 5 })).body;
    await vender(admin, [{ producto_id: merluza.id, cantidad: '2' }], [{ medio: 'CUENTA_CORRIENTE', monto: '20000' }], { cliente_id: c.id });
    await admin.post(`/api/clientes/${c.id}/cobros`).send({ importe: '5000', medio: 'EFECTIVO', caja_id: 1 });
  });

  it('el resumen trae saldo anterior, movimientos con saldo y lo que quedaba sin pagar', async () => {
    const d = await datosResumenCliente(c.id, { desde: sumarDias(hoy(), -7), hasta: hoy() });
    expect(d.saldo_anterior).toBe('0.00');
    expect(d.movimientos.map((m) => [m.importe, m.saldo])).toEqual([['20000.00', '20000.00'], ['-5000.00', '15000.00']]);
    expect(d.movimientos[0].detalle).toMatch(/Ticket 0001-00000001/);
    expect(d.saldo_final).toBe('15000.00');
    expect(d.compras_pendientes.map((x) => x.pendiente)).toEqual(['15000.00']);
  });

  it('el detalle de deuda trae cada compra sin pagar con sus productos', async () => {
    const d = await datosDetalleDeuda(c.id);
    expect(d.total).toBe('15000.00');
    expect(d.compras).toHaveLength(1);
    expect(d.compras[0]).toMatchObject({ ticket: '0001-00000001', pendiente: '15000.00', vence: sumarDias(hoy(), 5) });
    expect(d.compras[0].items).toEqual([expect.objectContaining({ descripcion: 'Merluza filet', cantidad: '2.000', precio_unitario: '10000.00', total: '20000.00' })]);
  });

  it('los dos PDF se descargan con el nombre del cliente', async () => {
    const r1 = await admin.get(`/api/clientes/${c.id}/resumen.pdf`).buffer(true).parse(binario);
    expect(r1.status).toBe(200);
    expect(r1.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(r1.headers['content-disposition']).toBe(`attachment; filename="resumen-restaurante-${hoy()}.pdf"`);
    const r2 = await admin.get(`/api/clientes/${c.id}/detalle-deuda.pdf`).buffer(true).parse(binario);
    expect(r2.status).toBe(200);
    expect(r2.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(r2.headers['content-disposition']).toBe(`attachment; filename="deuda-restaurante-${hoy()}.pdf"`);
  });
});

describe('Cuenta corriente · Inicio y reporte', () => {
  it('el Inicio avisa quién debe vencido y el reporte separa por antigüedad', async () => {
    await reiniciarBase();
    const admin = await login();
    const usuario = await db('usuarios').first('id');
    const vencido = (await admin.post('/api/clientes').send({ nombre: 'Debe vencido', cuenta_corriente: true, plazo_pago_dias: 5 })).body;
    const alDia = (await admin.post('/api/clientes').send({ nombre: 'Al día', cuenta_corriente: true, plazo_pago_dias: 30 })).body;
    const deuda = (clienteId, importe, dias) => db('cc_clientes_movimientos').insert({
      cliente_id: clienteId, tipo: 'AJUSTE', importe, descripcion: 'Deuda', usuario_id: usuario.id, creado_en: db.raw(`now() - interval '${dias} days'`),
    });
    await deuda(vencido.id, '3000.00', 45); // venció hace 40 días
    await deuda(alDia.id, '1000.00', 2);

    const panel = (await admin.get('/api/reportes/panel')).body;
    expect(panel.clientes_vencidos).toEqual([{ id: vencido.id, nombre: 'Debe vencido', vencido: '3000.00' }]);

    const rep = (await admin.get('/api/reportes/cuentas-clientes')).body;
    expect(rep.filas.find((f) => f.cliente === 'Debe vencido')).toMatchObject({ al_dia: '0.00', vencido_30: '0.00', vencido_60: '3000.00', vencido_mas: '0.00', saldo: '3000.00' });
    expect(rep.filas.find((f) => f.cliente === 'Al día')).toMatchObject({ al_dia: '1000.00', vencido_60: '0.00' });
    expect(rep.totales).toMatchObject({ saldo: '4000.00', al_dia: '1000.00', vencido_60: '3000.00' });
  });
});
