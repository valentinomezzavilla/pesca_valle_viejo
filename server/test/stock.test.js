import { describe, it, expect, beforeEach } from 'vitest';
import {
  db, reiniciarBase, login, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja, vender, lotes, stockDe, esperarConsistencia,
} from './helpers.js';

describe('stock por lotes (FIFO)', () => {
  let admin;
  let producto;
  let proveedor;

  beforeEach(async () => {
    await reiniciarBase();
    admin = await login();
    producto = await crearProducto(admin, { precio_venta: '10000' });
    proveedor = await crearProveedor(admin);
    await abrirCaja(admin);
  });

  it('cada ingreso crea un lote y suma stock', async () => {
    const r1 = await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '2.000', costo_unitario: '6000' }]);
    expect(r1.status).toBe(201);
    await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '3.000', costo_unitario: '6500' }]);
    expect(await stockDe(producto.id)).toBe('5.000');
    const ls = await lotes(producto.id);
    expect(ls.map((l) => l.cantidad_actual)).toEqual(['2.000', '3.000']);
    await esperarConsistencia();
  });

  it('una venta consume primero el lote más viejo y guarda el costo real', async () => {
    await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '2.000', costo_unitario: '6000' }]);
    await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '3.000', costo_unitario: '6500' }]);

    // 3 kg = 2 kg del lote viejo (6000) + 1 kg del nuevo (6500) → costo 18500
    const res = await vender(admin, [{ producto_id: producto.id, cantidad: '3' }], [{ medio: 'EFECTIVO', monto: '30000' }]);
    expect(res.status).toBe(201);
    expect(res.body.venta.costo_total).toBe('18500.00');
    expect(res.body.items[0].costo_total).toBe('18500.00');

    const ls = await lotes(producto.id);
    expect(ls.map((l) => l.cantidad_actual)).toEqual(['0.000', '2.000']);
    const movs = await db('movimientos_stock').where({ tipo: 'VENTA' }).orderBy('id');
    expect(movs.map((m) => [m.cantidad, m.costo_unitario])).toEqual([
      ['-2.000', '6000.0000'],
      ['-1.000', '6500.0000'],
    ]);
    await esperarConsistencia();
  });

  it('permite vender sin stock registrado y el próximo ingreso cubre el faltante', async () => {
    await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '1.000', costo_unitario: '6000' }]);
    const res = await vender(admin, [{ producto_id: producto.id, cantidad: '1.500' }], [{ medio: 'EFECTIVO', monto: '15000' }]);
    expect(res.status).toBe(201);
    expect(res.body.faltantes).toEqual([{ producto: 'Merluza filet', cantidad: '0.500' }]);
    expect(await stockDe(producto.id)).toBe('-0.500');
    // El faltante se valoriza al último costo (6000): 1 kg * 6000 + 0.5 * 6000
    expect(res.body.venta.costo_total).toBe('9000.00');
    await esperarConsistencia();

    await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '2.000', costo_unitario: '7000' }]);
    expect(await stockDe(producto.id)).toBe('1.500');
    const ultimo = (await lotes(producto.id)).at(-1);
    expect(ultimo.cantidad_inicial).toBe('2.000');
    expect(ultimo.cantidad_actual).toBe('1.500'); // 0.5 tapó el faltante
    await esperarConsistencia();
  });

  it('el vencimiento se sugiere con los días de vida útil del producto', async () => {
    const p = await crearProducto(admin, { nombre: 'Langostinos', dias_vida_util: 3 });
    await ingresarMercaderia(admin, proveedor.id, [{ producto_id: p.id, cantidad: '1', costo_unitario: '100' }]);
    const [lote] = await lotes(p.id);
    expect(lote.fecha_vencimiento).toBe('2026-10-16');
  });

  it('acepta el total de la línea del remito y calcula el costo unitario', async () => {
    await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '3.000', subtotal: '20000' }]);
    const [lote] = await lotes(producto.id);
    expect(lote.costo_unitario).toBe('6666.6667');
    const ci = await db('compra_items').first();
    expect(ci.subtotal).toBe('20000.00');
  });

  it('no deja anular un ingreso cuya mercadería ya se vendió', async () => {
    const r = await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '2', costo_unitario: '6000' }]);
    await vender(admin, [{ producto_id: producto.id, cantidad: '0.5' }], [{ medio: 'EFECTIVO', monto: '5000' }]);
    const res = await admin.post(`/api/compras/${r.body.id}/anular`).send({ motivo: 'Error de carga' });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('LOTE_CONSUMIDO');
  });

  it('anular un ingreso intacto revierte stock y deuda', async () => {
    const r = await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '2', costo_unitario: '6000' }]);
    const res = await admin.post(`/api/compras/${r.body.id}/anular`).send({ motivo: 'Error de carga' });
    expect(res.status).toBe(200);
    expect(await stockDe(producto.id)).toBe('0.000');
    const saldo = await db('v_saldos_proveedores').where({ id: proveedor.id }).first();
    expect(saldo.saldo).toBe('0.00');
    await esperarConsistencia();
  });

  it('el cajero no ve costos en el listado de stock', async () => {
    await ingresarMercaderia(admin, proveedor.id, [{ producto_id: producto.id, cantidad: '2', costo_unitario: '6000' }]);
    const { crearCajero } = await import('./helpers.js');
    const cajero = await crearCajero();
    const res = await cajero.get('/api/stock');
    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty('valor_stock');
    expect(res.body[0]).not.toHaveProperty('costo_referencia');
    const resDueno = await admin.get('/api/stock');
    expect(resDueno.body[0].valor_stock).toBe('12000.00');
  });
});
