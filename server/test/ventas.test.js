import { describe, it, expect, beforeEach } from 'vitest';
import {
  db, reiniciarBase, login, crearCajero, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja, vender, lotes, stockDe, esperarConsistencia,
} from './helpers.js';

describe('ventas', () => {
  let admin;
  let merluza;
  let empanada;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '9500' });
    empanada = await crearProducto(admin, { nombre: 'Empanada', unidad: 'UNIDAD', precio_venta: '1500' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [
      { producto_id: merluza.id, cantidad: '10', costo_unitario: '6000' },
      { producto_id: empanada.id, cantidad: '24', costo_unitario: '800' },
    ]);
    await abrirCaja(admin, '20000');
  });

  it('registra una venta con pago mixto, mueve la caja y emite el ticket interno', async () => {
    const res = await vender(
      admin,
      [
        { producto_id: merluza.id, cantidad: '1,250' },
        { producto_id: empanada.id, cantidad: '6' },
      ],
      [
        { medio: 'EFECTIVO', monto: '10000' },
        { medio: 'TRANSFERENCIA', monto: '10875' },
      ],
      { efectivo_recibido: '12000' },
    );
    expect(res.status).toBe(201);
    expect(res.body.venta.total).toBe('20875.00'); // 1.25*9500 + 6*1500
    expect(res.body.venta.vuelto).toBe('2000.00');
    expect(res.body.comprobante.tipo).toBe('TICKET_INTERNO');
    expect(res.body.comprobante.numero_formateado).toBe('0001-00000001');
    expect(res.body.comprobante.leyenda).toBe('Comprobante no válido como factura');

    const caja = await admin.get('/api/cajas/1/actual');
    expect(caja.body.totales_por_medio.EFECTIVO).toBe('30000.00');
    expect(caja.body.totales_por_medio.TRANSFERENCIA).toBe('10875.00');

    // Ticket imprimible
    const ticket = await admin.get(`/api/comprobantes/${res.body.comprobante.id}`);
    expect(ticket.body.items).toHaveLength(2);
    expect(ticket.body.comprobante.leyenda).toMatch(/no válido como factura/);

    // Segunda venta → número correlativo
    const res2 = await vender(admin, [{ producto_id: empanada.id, cantidad: '1' }], [{ medio: 'TARJETA_DEBITO', monto: '1500' }]);
    expect(res2.body.comprobante.numero).toBe(2);
    await esperarConsistencia();
  });

  it('usa el precio de la base, no el que mande el cliente', async () => {
    const res = await vender(
      admin,
      [{ producto_id: merluza.id, cantidad: '1', precio_unitario: '1' }],
      [{ medio: 'EFECTIVO', monto: '9500' }],
    );
    expect(res.status).toBe(201);
    expect(res.body.items[0].precio_unitario).toBe('9500.00');
  });

  it('rechaza pagos que no suman el total', async () => {
    const res = await vender(admin, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '9000' }]);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('PAGOS_NO_COINCIDEN');
    expect(await stockDe(merluza.id)).toBe('10.000'); // nada se guardó (transacción)
    const { count } = await db('ventas').count('* as count').first();
    expect(count).toBe(0);
  });

  it('rechaza cantidades con decimales en productos por unidad', async () => {
    const res = await vender(admin, [{ producto_id: empanada.id, cantidad: '1.5' }], [{ medio: 'EFECTIVO', monto: '2250' }]);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toMatch(/por unidad/);
  });

  it('no deja vender con la caja cerrada', async () => {
    const actual = await admin.get('/api/cajas/1/actual');
    await admin.post(`/api/caja-sesiones/${actual.body.sesion.id}/cerrar`).send({ efectivo_contado: '20000' });
    const res = await vender(admin, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '9500' }]);
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('CAJA_CERRADA');
  });

  it('prorratea el descuento global entre los ítems', async () => {
    const res = await vender(
      admin,
      [
        { producto_id: merluza.id, cantidad: '1' },
        { producto_id: empanada.id, cantidad: '1' },
      ],
      [{ medio: 'EFECTIVO', monto: '10000' }],
      { descuento_global: '1000' },
    );
    expect(res.status).toBe(201);
    const items = await db('venta_items').orderBy('id');
    const suma = items.reduce((a, i) => a + Number(i.descuento_prorrateado), 0);
    expect(suma).toBeCloseTo(1000, 2);
    expect(items.reduce((a, i) => a + Number(i.total), 0)).toBeCloseTo(10000, 2);
  });

  describe('descuentos del cajero', () => {
    let cajero;
    beforeEach(async () => {
      cajero = await crearCajero();
    });

    it('puede descontar hasta el máximo configurado (10%)', async () => {
      const res = await vender(cajero, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '8550' }], { descuento_global: '950' });
      expect(res.status).toBe(201);
    });

    it('por encima del máximo necesita el PIN del dueño', async () => {
      const sinPin = await vender(cajero, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '7500' }], { descuento_global: '2000' });
      expect(sinPin.status).toBe(403);
      expect(sinPin.body.error.codigo).toBe('REQUIERE_PIN');

      const pinMalo = await vender(cajero, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '7500' }], { descuento_global: '2000', pinAutorizacion: '9999' });
      expect(pinMalo.status).toBe(403);
      expect(pinMalo.body.error.codigo).toBe('PIN_INCORRECTO');

      const conPin = await vender(cajero, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '7500' }], { descuento_global: '2000', pinAutorizacion: '1234' });
      expect(conPin.status).toBe(201);
      const audit = await db('auditoria').where({ accion: 'DESCUENTO_AUTORIZADO' }).first();
      expect(audit.autorizado_por_id).toBe(1);
    });

    it('el cajero no recibe costos en la respuesta', async () => {
      const res = await vender(cajero, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '9500' }]);
      expect(res.body.venta).not.toHaveProperty('costo_total');
      expect(res.body.items[0]).not.toHaveProperty('costo_total');
    });
  });
});

describe('anulación de ventas', () => {
  let admin;
  let merluza;
  let prov;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '10000' });
    prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '2', costo_unitario: '6000' }]);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '3', costo_unitario: '6500' }]);
    await abrirCaja(admin, '5000');
  });

  it('devuelve la mercadería a los mismos lotes y la plata a la caja', async () => {
    const venta = await vender(admin, [{ producto_id: merluza.id, cantidad: '3' }], [
      { medio: 'EFECTIVO', monto: '20000' },
      { medio: 'TARJETA_CREDITO', monto: '10000' },
    ]);
    const res = await admin.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'El cliente se arrepintió' });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ANULADA');

    expect((await lotes(merluza.id)).map((l) => l.cantidad_actual)).toEqual(['2.000', '3.000']);
    expect(await stockDe(merluza.id)).toBe('5.000');

    const caja = await admin.get('/api/cajas/1/actual');
    expect(caja.body.totales_por_medio.EFECTIVO).toBe('5000.00');
    expect(caja.body.totales_por_medio.TARJETA_CREDITO).toBe('0.00');

    const comp = await db('comprobantes').where({ venta_id: venta.body.venta.id }).first();
    expect(comp.estado).toBe('ANULADO');
    const audit = await db('auditoria').where({ accion: 'VENTA_ANULADA' }).first();
    expect(audit.motivo).toBe('El cliente se arrepintió');
    await esperarConsistencia();
  });

  it('el cajero necesita PIN y queda registrado quién autorizó', async () => {
    const cajero = await crearCajero();
    const venta = await vender(cajero, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '10000' }]);
    const sinPin = await cajero.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'Error' });
    expect(sinPin.status).toBe(403);
    expect(sinPin.body.error.codigo).toBe('REQUIERE_PIN');

    const conPin = await cajero.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'Error', pinAutorizacion: '1234' });
    expect(conPin.status).toBe(200);
    const v = await db('ventas').where({ id: venta.body.venta.id }).first();
    expect(v.anulada_por_id).toBe(2);
    expect(v.anulacion_autorizada_por_id).toBe(1);
  });

  it('bloquea el PIN después de 5 intentos fallidos', async () => {
    const cajero = await crearCajero();
    const venta = await vender(cajero, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '10000' }]);
    for (let i = 0; i < 5; i++) {
      await cajero.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'x', pinAutorizacion: '0000' });
    }
    const res = await cajero.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'x', pinAutorizacion: '1234' });
    expect(res.status).toBe(429);
    expect(res.body.error.codigo).toBe('PIN_BLOQUEADO');
  });

  it('no se puede anular dos veces', async () => {
    const venta = await vender(admin, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '10000' }]);
    await admin.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'Error' });
    const res = await admin.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'Error' });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('YA_ANULADA');
  });

  it('anular una venta con faltante respeta las invariantes de stock', async () => {
    // Stock 5; vendo 7 → faltante 2. Luego ingresan 4 (tapa el faltante). Anulo la venta.
    const venta = await vender(admin, [{ producto_id: merluza.id, cantidad: '7' }], [{ medio: 'EFECTIVO', monto: '70000' }]);
    expect(await stockDe(merluza.id)).toBe('-2.000');
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '4', costo_unitario: '7000' }]);
    await esperarConsistencia();
    const res = await admin.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'Error' });
    expect(res.status).toBe(200);
    expect(await stockDe(merluza.id)).toBe('9.000');
    await esperarConsistencia();
  });

  it('si el turno ya cerró, devuelve la plata desde la caja abierta que se indique', async () => {
    const venta = await vender(admin, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '10000' }]);
    const actual = await admin.get('/api/cajas/1/actual');
    await admin.post(`/api/caja-sesiones/${actual.body.sesion.id}/cerrar`).send({ efectivo_contado: '15000' });
    const nueva = await abrirCaja(admin, '20000');

    const sinCaja = await admin.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'Error' });
    expect(sinCaja.status).toBe(400);
    expect(sinCaja.body.error.codigo).toBe('ELEGIR_CAJA');

    const res = await admin.post(`/api/ventas/${venta.body.venta.id}/anular`).send({ motivo: 'Error', caja_id: 1 });
    expect(res.status).toBe(200);
    const mov = await db('caja_movimientos').where({ tipo: 'ANULACION_VENTA' }).first();
    expect(mov.caja_sesion_id).toBe(nueva.id);
    expect(mov.importe).toBe('-10000.00');
  });
});
