import { describe, it, expect, beforeAll } from 'vitest';
import {
  reiniciarBase, login, crearCajero, crearProducto, crearProveedor, ingresarMercaderia, abrirCaja, vender,
} from './helpers.js';
import { hoy } from '../src/lib/fechas.js';

const binario = (res, cb) => {
  const partes = [];
  res.on('data', (p) => partes.push(p));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

describe('Fase 3 · reportes y panel', () => {
  let admin;
  let desdeHasta;

  beforeAll(async () => {
    await reiniciarBase();
    admin = await login();
    const merluza = await crearProducto(admin, { nombre: 'Merluza filet', precio_venta: '10000' });
    const prov = await crearProveedor(admin);
    await ingresarMercaderia(admin, prov.id, [{ producto_id: merluza.id, cantidad: '10', costo_unitario: '6000' }], { fecha: hoy() });
    await abrirCaja(admin, '20000');
    const cliente = (await admin.post('/api/clientes').send({ nombre: 'Doña Marta', cuenta_corriente: true })).body;

    await vender(admin, [{ producto_id: merluza.id, cantidad: '2' }], [{ medio: 'EFECTIVO', monto: '20000' }]);
    await vender(admin, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'TRANSFERENCIA', monto: '10000' }]);
    await vender(admin, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'CUENTA_CORRIENTE', monto: '10000' }], { cliente_id: cliente.id });
    const anulada = await vender(admin, [{ producto_id: merluza.id, cantidad: '1' }], [{ medio: 'EFECTIVO', monto: '10000' }]);
    await admin.post(`/api/ventas/${anulada.body.venta.id}/anular`).send({ motivo: 'Prueba' });

    await admin.post('/api/mermas').send({ producto_id: merluza.id, cantidad: '1', motivo: 'VENCIDO' });
    const rubros = (await admin.get('/api/categorias-gasto')).body;
    await admin.post('/api/caja-sesiones/1/movimientos').send({ tipo: 'GASTO', importe: '3000', categoria_gasto_id: rubros[0].id, descripcion: 'Hielo' });
    desdeHasta = `desde=${hoy()}&hasta=${hoy()}`;
  });

  const reporte = async (id) => {
    const res = await admin.get(`/api/reportes/${id}?${desdeHasta}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body;
  };

  it('lista el catálogo y solo el dueño entra', async () => {
    const lista = await admin.get('/api/reportes');
    expect(lista.body.length).toBeGreaterThanOrEqual(12);
    expect(lista.body.find((r) => r.id === 'ventas-por-dia').grupo).toBe('Ventas');
    const cajero = await crearCajero();
    expect((await cajero.get('/api/reportes')).status).toBe(403);
    expect((await cajero.get('/api/reportes/panel')).status).toBe(403);
  });

  it('ventas por día: ignora las anuladas y calcula costo, ganancia y margen', async () => {
    const r = await reporte('ventas-por-dia');
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({ fecha: hoy(), ventas: 3, total: '40000.00', costo: '24000.00', ganancia: '16000.00', margen: '40.00', ticket_promedio: '13333.33' });
    expect(r.totales).toMatchObject({ ventas: 3, total: '40000.00', ganancia: '16000.00', margen: '40.00' });
  });

  it('ventas por producto, categoría, medio de pago y cajero', async () => {
    const prod = await reporte('ventas-por-producto');
    expect(prod.filas[0]).toMatchObject({ producto: 'Merluza filet', cantidad: '4.000', unidad: 'kg', total: '40000.00' });
    const cat = await reporte('ventas-por-categoria');
    expect(cat.filas[0].participacion).toBe('100.00');
    const medios = await reporte('ventas-por-medio-pago');
    expect(Object.fromEntries(medios.filas.map((f) => [f.medio, f.monto]))).toEqual({
      Efectivo: '20000.00',
      Transferencia: '10000.00',
      'Cuenta corriente': '10000.00',
    });
    expect(medios.totales.monto).toBe('40000.00');
    const usuarios = await reporte('ventas-por-usuario');
    expect(usuarios.filas[0]).toMatchObject({ usuario: 'Dueño', ventas: 3, anuladas: 1 });
    const detalle = await reporte('ventas-detalle');
    expect(detalle.filas).toHaveLength(3);
    expect(detalle.filas[0].comprobante).toBe('0001-00000001');
    expect(detalle.filas[2].cliente).toBe('Doña Marta');
  });

  it('mermas, stock valorizado, cuentas, gastos y cierres', async () => {
    const mermas = await reporte('mermas');
    expect(mermas.filas[0]).toMatchObject({ motivo: 'Vencido', cantidad: '1.000', costo_total: '6000.00' });
    expect(mermas.totales.costo_total).toBe('6000.00');

    const stock = await reporte('stock-valorizado');
    // 10 − 2 − 1 − 1 (fiado) − 1 (merma) = 5 (la venta anulada volvió al stock)
    expect(stock.filas[0]).toMatchObject({ stock: '5.000', valor_costo: '30000.00', valor_venta: '50000.00' });

    const clientes = await reporte('cuentas-clientes');
    expect(clientes.filas[0]).toMatchObject({ cliente: 'Doña Marta', saldo: '10000.00' });
    const proveedores = await reporte('cuentas-proveedores');
    expect(proveedores.totales.saldo).toBe('60000.00');

    const gastos = await reporte('gastos');
    expect(gastos.totales).toMatchObject({ cantidad: 1, total: '3000.00' });

    const compras = await reporte('compras');
    expect(compras.totales.total).toBe('60000.00');

    await admin.post('/api/caja-sesiones/1/cerrar').send({ efectivo_contado: '36000' }); // 20.000 + 20.000 − 3.000 = 37.000
    const cierres = await reporte('cierres-caja');
    expect(cierres.filas[0]).toMatchObject({ esperado: '37000.00', contado: '36000.00', diferencia: '-1000.00' });
  });

  it('exporta a Excel y a PDF', async () => {
    const xlsx = await admin.get(`/api/reportes/ventas-por-dia?${desdeHasta}&formato=xlsx`).buffer(true).parse(binario);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    expect(xlsx.headers['content-disposition']).toMatch(/ventas-por-dia-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx/);
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK'); // un .xlsx es un zip

    const pdf = await admin.get(`/api/reportes/ventas-por-producto?${desdeHasta}&formato=pdf`).buffer(true).parse(binario);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');

    // también con muchas columnas (apaisado) y sin fechas
    for (const id of ['ventas-detalle', 'stock-valorizado', 'mermas', 'cierres-caja']) {
      const r = await admin.get(`/api/reportes/${id}?${desdeHasta}&formato=pdf`).buffer(true).parse(binario);
      expect(r.status, id).toBe(200);
      const x = await admin.get(`/api/reportes/${id}?${desdeHasta}&formato=xlsx`).buffer(true).parse(binario);
      expect(x.status, id).toBe(200);
    }
  });

  it('valida el período', async () => {
    const invertido = await admin.get('/api/reportes/ventas-por-dia?desde=2026-10-10&hasta=2026-10-01');
    expect(invertido.status).toBe(400);
    const largo = await admin.get('/api/reportes/ventas-por-dia?desde=2024-01-01&hasta=2026-10-01');
    expect(largo.status).toBe(400);
    const noExiste = await admin.get('/api/reportes/inventado');
    expect(noExiste.status).toBe(404);
  });

  it('el panel resume el día, el mes, las deudas y las alertas', async () => {
    const res = await admin.get('/api/reportes/panel');
    expect(res.status).toBe(200);
    expect(res.body.hoy).toMatchObject({ ventas: 3, total: '40000.00', ganancia: '16000.00' });
    expect(res.body.ayer.ventas).toBe(0);
    expect(res.body.ultimos_7_dias).toHaveLength(7);
    expect(res.body.ultimos_7_dias[6]).toMatchObject({ fecha: hoy(), total: '40000.00' });
    expect(res.body.top_productos[0].producto).toBe('Merluza filet');
    expect(res.body.por_medio.map((m) => m.medio).sort()).toEqual(['CUENTA_CORRIENTE', 'EFECTIVO', 'TRANSFERENCIA']);
    expect(res.body.deuda_clientes).toEqual({ clientes: 1, total: '10000.00' });
    expect(res.body.deuda_proveedores.total).toBe('60000.00');
    expect(res.body.mermas_mes).toBe('6000.00');
    expect(res.body.mes.total).toBe('40000.00');
  });
});
