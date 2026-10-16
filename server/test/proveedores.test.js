import { describe, it, expect, beforeEach } from 'vitest';
import { db, reiniciarBase, login, crearCajero, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja } from './helpers.js';
import { hoy, sumarDias } from '../src/lib/fechas.js';
import { datosResumen } from '../src/modules/proveedores/resumen.service.js';
import { atarPagosDeContado } from '../src/db/migraciones/20261014000001_proveedores_completo.js';

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

  it('el pago de contado se puede anular recién cuando se anuló su compra, y la plata vuelve a la caja', async () => {
    await abrirCaja(admin, '50000');
    const compra = (await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '1000' }], {
      fecha: hoy(), condicion: 'CONTADO', medio_pago: 'EFECTIVO_CAJA', caja_id: 1,
    })).body;
    expect(await efectivoCaja()).toBe('49000.00');
    const pago = (await ficha()).movimientos.find((m) => m.tipo === 'PAGO' && m.compra_id === compra.id);
    const antes = await admin.post(`/api/proveedores/${prov.id}/movimientos/${pago.id}/anular`).send({ motivo: 'Cargado por error' });
    expect(antes.body.error.mensaje).toBe(`Primero anulá el ingreso de mercadería #${compra.id}; después vas a poder anular este pago.`);

    expect((await admin.post(`/api/compras/${compra.id}/anular`).send({ motivo: 'Cargado por error' })).status).toBe(200);
    expect((await ficha()).movimientos.find((m) => m.id === pago.id).se_puede_anular).toBe(true);
    const res = await admin.post(`/api/proveedores/${prov.id}/movimientos/${pago.id}/anular`).send({ motivo: 'Cargado por error' });
    expect(res.status).toBe(201);
    expect(await efectivoCaja()).toBe('50000.00');
    expect((await ficha()).saldo).toBe('100000.00');
  });

  it('el cajero no puede anular', async () => {
    const pago = (await admin.post(`/api/proveedores/${prov.id}/pagos`).send({ importe: '1000', medio_pago: 'OTRO' })).body;
    const cajero = await crearCajero();
    expect((await cajero.post(`/api/proveedores/${prov.id}/movimientos/${pago.id}/anular`).send({ motivo: 'Probando' })).status).toBe(403);
  });
});

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
    // El archivo lleva el nombre del proveedor, para encontrarlo fácil al adjuntarlo
    expect(res.headers['content-disposition']).toBe(`attachment; filename="resumen-del-puerto-${hoy()}.pdf"`);
  });

  it('las compras sin pagar del resumen son las de la fecha "hasta", no las de hoy', async () => {
    await reiniciarBase();
    const admin = await login();
    const merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
    const prov = await crearProveedor(admin, 'Del Puerto');
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '10000' }], { fecha: sumarDias(hoy(), -40), numero_documento: 'VIEJA' });
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '5000' }], { fecha: hoy(), numero_documento: 'NUEVA' });
    const d = await datosResumen(prov.id, { desde: sumarDias(hoy(), -60), hasta: sumarDias(hoy(), -10) });
    expect(d.saldo_final).toBe('10000.00');
    expect(d.compras_pendientes.map((c) => c.numero_documento)).toEqual(['VIEJA']);
  });

  it('rechaza un período al revés y toma las fechas vacías como "sin fecha"', async () => {
    await reiniciarBase();
    const admin = await login();
    const prov = await crearProveedor(admin, 'Del Puerto');
    const alReves = await admin.get(`/api/proveedores/${prov.id}/resumen.pdf?desde=${hoy()}&hasta=${sumarDias(hoy(), -5)}`);
    expect(alReves.status).toBe(400);
    expect(alReves.body.error.mensaje).toMatch(/desde/i);
    const vacias = await admin.get(`/api/proveedores/${prov.id}/resumen.pdf?desde=&hasta=`).buffer(true).parse((r, cb) => {
      const partes = [];
      r.on('data', (x) => partes.push(x));
      r.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(vacias.status).toBe(200);
  });
});

describe('Proveedores · migración', () => {
  it('ata a su compra los pagos de contado cargados antes de la migración', async () => {
    await reiniciarBase();
    const admin = await login();
    const merluza = await crearProducto(admin, { nombre: 'Merluza filet' });
    const prov = await crearProveedor(admin, 'Del Puerto');
    const otro = await crearProveedor(admin, 'Otro');
    const compra = (await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '1', costo_unitario: '1000' }])).body;
    const usuario = await db('usuarios').first('id');
    // Como quedaban antes: sin compra_id, solo con la descripción
    const [viejo] = await db('cc_proveedores_movimientos').insert({
      proveedor_id: prov.id, tipo: 'PAGO', importe: '-1000.00', medio_pago: 'TRANSFERENCIA', descripcion: `Pago de la compra #${compra.id}`, usuario_id: usuario.id,
    }).returning('id');
    const [ajeno] = await db('cc_proveedores_movimientos').insert({
      proveedor_id: otro.id, tipo: 'PAGO', importe: '-1000.00', medio_pago: 'TRANSFERENCIA', descripcion: `Pago de la compra #${compra.id}`, usuario_id: usuario.id,
    }).returning('id');

    await db.transaction((trx) => atarPagosDeContado(trx));

    expect((await db('cc_proveedores_movimientos').where({ id: viejo.id }).first()).compra_id).toBe(compra.id);
    expect((await db('cc_proveedores_movimientos').where({ id: ajeno.id }).first()).compra_id).toBe(null); // otro proveedor: no se toca
  });
});

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
    expect(rep.filas.find((f) => f.proveedor === 'A favor')).toMatchObject({ saldo: '-500.00', al_dia: '0.00' }); // a favor: nada "al día" que pagar
  });
});
