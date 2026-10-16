import { describe, it, expect, beforeEach } from 'vitest';
import { db, reiniciarBase, login, crearCajero, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja, vender } from './helpers.js';

describe('caja', () => {
  let admin;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
  });

  it('abre, registra gastos y cierra calculando la diferencia', async () => {
    const sesion = await abrirCaja(admin, '10000');
    const p = await crearProducto(admin, { precio_venta: '5000' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: p.id, cantidad: '10', costo_unitario: '3000' }]);
    await vender(admin, [{ producto_id: p.id, cantidad: '2' }], [{ medio: 'EFECTIVO', monto: '10000' }]);
    await vender(admin, [{ producto_id: p.id, cantidad: '1' }], [{ medio: 'TRANSFERENCIA', monto: '5000' }]);

    const gasto = await admin.post(`/api/caja-sesiones/${sesion.id}/movimientos`).send({ tipo: 'GASTO', importe: '1500', categoria_gasto_id: 1, descripcion: 'Bolsa de hielo' });
    expect(gasto.status).toBe(201);
    expect(gasto.body.importe).toBe('-1500.00');

    const resumen = await admin.get(`/api/caja-sesiones/${sesion.id}/resumen-cierre`);
    expect(resumen.body.efectivo_esperado).toBe('18500.00'); // 10000 + 10000 - 1500
    expect(resumen.body.totales_por_medio.TRANSFERENCIA).toBe('5000.00');
    expect(resumen.body.ventas.cantidad).toBe(2);

    const cierre = await admin.post(`/api/caja-sesiones/${sesion.id}/cerrar`).send({ efectivo_contado: '18000', observaciones: 'Faltan 500' });
    expect(cierre.status).toBe(200);
    expect(cierre.body.estado).toBe('CERRADA');
    expect(cierre.body.diferencia).toBe('-500.00');
    expect(cierre.body.totales_por_medio.EFECTIVO).toBe('18500.00');

    const otra = await admin.post(`/api/caja-sesiones/${sesion.id}/cerrar`).send({ efectivo_contado: '1' });
    expect(otra.status).toBe(409);
  });

  it('no deja abrir dos veces la misma caja', async () => {
    await abrirCaja(admin, '0');
    const res = await admin.post('/api/cajas/1/abrir').send({ monto_inicial: '100' });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toMatch(/ya está abierta/);
  });

  it('un gasto exige rubro y no puede superar el efectivo de la caja', async () => {
    const sesion = await abrirCaja(admin, '1000');
    const sinRubro = await admin.post(`/api/caja-sesiones/${sesion.id}/movimientos`).send({ tipo: 'GASTO', importe: '100' });
    expect(sinRubro.status).toBe(400);
    expect(sinRubro.body.error.campos.categoria_gasto_id).toBeDefined();

    const excedido = await admin.post(`/api/caja-sesiones/${sesion.id}/movimientos`).send({ tipo: 'GASTO', importe: '1500', categoria_gasto_id: 1 });
    expect(excedido.status).toBe(409);
    expect(excedido.body.error.codigo).toBe('EFECTIVO_INSUFICIENTE');
  });

  it('el retiro del cajero necesita PIN', async () => {
    const sesion = await abrirCaja(admin, '5000');
    const cajero = await crearCajero();
    const sinPin = await cajero.post(`/api/caja-sesiones/${sesion.id}/movimientos`).send({ tipo: 'RETIRO', importe: '1000' });
    expect(sinPin.status).toBe(403);
    expect(sinPin.body.error.codigo).toBe('REQUIERE_PIN');
    const conPin = await cajero.post(`/api/caja-sesiones/${sesion.id}/movimientos`).send({ tipo: 'RETIRO', importe: '1000', pinAutorizacion: '1234' });
    expect(conPin.status).toBe(201);
  });

  it('el cajero no puede ver el historial de cajas', async () => {
    const cajero = await crearCajero();
    const res = await cajero.get('/api/caja-sesiones');
    expect(res.status).toBe(403);
  });

  it('los movimientos de caja no se pueden modificar ni borrar', async () => {
    await abrirCaja(admin, '1000');
    await expect(db('caja_movimientos').update({ importe: '1' })).rejects.toThrow(/solo inserción/);
    await expect(db('caja_movimientos').del()).rejects.toThrow(/solo inserción/);
  });

  it('pagar mercadería en efectivo sale de la caja', async () => {
    const sesion = await abrirCaja(admin, '50000');
    const p = await crearProducto(admin);
    const prov = await crearProveedor(admin);
    const res = await ingresarMercaderia(admin, prov.id, [{ producto_id: p.id, cantidad: '5', costo_unitario: '6000' }], {
      condicion: 'CONTADO',
      medio_pago: 'EFECTIVO_CAJA',
      caja_id: 1,
    });
    expect(res.status).toBe(201);
    const resumen = await admin.get(`/api/caja-sesiones/${sesion.id}/resumen-cierre`);
    expect(resumen.body.efectivo_esperado).toBe('20000.00');
    const saldo = await db('v_saldos_proveedores').where({ id: prov.id }).first();
    expect(saldo.saldo).toBe('0.00'); // compra + pago
  });
});

describe('auth y permisos', () => {
  beforeEach(async () => {
    await reiniciarBase();
  });

  it('login incorrecto da un mensaje claro', async () => {
    const { default: request } = await import('supertest');
    const { app } = await import('./helpers.js');
    const res = await request(app).post('/api/auth/login').send({ usuario: 'admin', password: 'mala' });
    expect(res.status).toBe(401);
    expect(res.body.error.mensaje).toBe('Usuario o contraseña incorrectos.');
  });

  it('sin sesión no se accede a la API', async () => {
    const { default: request } = await import('supertest');
    const { app } = await import('./helpers.js');
    const res = await request(app).get('/api/productos');
    expect(res.status).toBe(401);
  });

  it('el cajero no puede cambiar precios ni gestionar usuarios', async () => {
    const admin = await login();
    const p = await crearProducto(admin);
    const cajero = await crearCajero();
    expect((await cajero.patch(`/api/productos/${p.id}/precio`).send({ precio_venta: '1' })).status).toBe(403);
    expect((await cajero.get('/api/usuarios')).status).toBe(403);
  });

  it('un cambio de precio deja historial y auditoría', async () => {
    const admin = await login();
    const p = await crearProducto(admin, { precio_venta: '9000' });
    const res = await admin.patch(`/api/productos/${p.id}/precio`).send({ precio_venta: '9500' });
    expect(res.body.precio_venta).toBe('9500.00');
    const hist = await db('productos_precios_historial').where({ producto_id: p.id }).first();
    expect([hist.precio_anterior, hist.precio_nuevo]).toEqual(['9000.00', '9500.00']);
    expect(await db('auditoria').where({ accion: 'PRECIO_MODIFICADO' }).first()).toBeDefined();
  });

  it('aumento masivo por categoría con redondeo', async () => {
    const admin = await login();
    const p1 = await crearProducto(admin, { nombre: 'A', precio_venta: '9530' });
    const p2 = await crearProducto(admin, { nombre: 'B', precio_venta: '12000' });
    const res = await admin.patch('/api/productos/precios').send({ categoria_id: 1, porcentaje: 10, redondeo: 100 });
    expect(res.status).toBe(200);
    const precios = await db('productos').whereIn('id', [p1.id, p2.id]).orderBy('id').pluck('precio_venta');
    expect(precios).toEqual(['10500.00', '13200.00']); // 10483 → 10500
  });

  it('desactivar un usuario corta su sesión al instante', async () => {
    const admin = await login();
    const cajero = await crearCajero();
    expect((await cajero.get('/api/auth/yo')).status).toBe(200);
    await admin.put('/api/usuarios/2').send({ activo: false });
    expect((await cajero.get('/api/auth/yo')).status).toBe(401);
  });

  it('no se puede quedar sin dueños activos', async () => {
    const admin = await login();
    const res = await admin.put('/api/usuarios/1').send({ activo: false });
    expect(res.status).toBe(409);
  });

  it('la auditoría no se puede borrar', async () => {
    await login();
    await db('auditoria').insert({ accion: 'X', entidad: 'y' });
    await expect(db('auditoria').del()).rejects.toThrow(/solo inserción/);
  });
});
