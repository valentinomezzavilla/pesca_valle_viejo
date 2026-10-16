// Datos de ejemplo para probar el sistema (NO correr en producción con datos reales).
import bcrypt from 'bcryptjs';
import { hoy, sumarDias } from '../lib/fechas.js';
import * as compras from '../modules/compras/compras.service.js';

export async function seedDemo(knex) {
  const { count } = await knex('productos').count('* as count').first();
  if (count > 0) {
    console.log('Ya hay productos cargados: no se cargan datos de demo.');
    return;
  }
  const dueno = await knex('usuarios').where({ rol: 'DUENO' }).orderBy('id').first();
  const cat = Object.fromEntries((await knex('categorias').select('id', 'nombre')).map((c) => [c.nombre, c.id]));

  await knex('usuarios')
    .insert({
      nombre: 'Cajero de prueba',
      usuario: 'cajero',
      password_hash: await bcrypt.hash('cajero1234', 10),
      rol: 'CAJERO',
    })
    .onConflict()
    .ignore();

  const productos = [
    ['MER', 'Merluza filet', 'Pescado fresco', 'KG', '9500', 3, true, 4],
    ['MERE', 'Merluza entera', 'Pescado fresco', 'KG', '5200', 2, false, 4],
    ['ABA', 'Abadejo filet', 'Pescado fresco', 'KG', '14500', 2, true, 4],
    ['SAL', 'Salmón rosado', 'Pescado fresco', 'KG', '32000', 1, true, 5],
    ['LEN', 'Lenguado filet', 'Pescado fresco', 'KG', '16800', 1, false, 4],
    ['LAN', 'Langostinos', 'Mariscos', 'KG', '21000', 2, true, 3],
    ['CAL', 'Calamar', 'Mariscos', 'KG', '12500', 1, true, 3],
    ['MEJ', 'Mejillones', 'Mariscos', 'KG', '7800', 1, false, 2],
    ['RAB', 'Rabas congeladas 1kg', 'Congelados', 'UNIDAD', '13500', 5, true, 180],
    ['KAN', 'Kanikama 250g', 'Congelados', 'UNIDAD', '3900', 10, false, 180],
    ['MIL', 'Milanesas de merluza', 'Elaborados', 'KG', '11500', 2, true, 3],
    ['EMP', 'Empanada de atún', 'Elaborados', 'UNIDAD', '1500', 12, true, 3],
  ];
  const ids = {};
  for (const [codigo, nombre, categoria, unidad, precio, minimo, favorito, vida] of productos) {
    const [p] = await knex('productos')
      .insert({ codigo, nombre, categoria_id: cat[categoria], unidad, precio_venta: precio, stock_minimo: minimo, favorito, dias_vida_util: vida })
      .returning('id');
    ids[codigo] = p.id;
  }

  const [puerto] = await knex('proveedores').insert({ nombre: 'Distribuidora del Puerto', telefono: '223 555-0101', contacto: 'Raúl' }).returning('id');
  const [frio] = await knex('proveedores').insert({ nombre: 'Frigorífico Sur', telefono: '11 4555-0202' }).returning('id');

  const ctx = { usuario: { id: dueno.id, rol: 'DUENO' }, ip: null };
  const fecha = hoy();
  await compras.crear(ctx, {
    proveedor_id: puerto.id,
    fecha,
    tipo_documento: 'REMITO',
    numero_documento: '0001-00001234',
    condicion: 'CUENTA_CORRIENTE',
    items: [
      { producto_id: ids.MER, cantidad: '15.000', costo_unitario: '6100' },
      { producto_id: ids.MERE, cantidad: '20.000', costo_unitario: '3300' },
      { producto_id: ids.ABA, cantidad: '6.500', costo_unitario: '9800' },
      { producto_id: ids.SAL, cantidad: '4.200', costo_unitario: '23500' },
      { producto_id: ids.LEN, cantidad: '3.000', costo_unitario: '11200' },
      { producto_id: ids.LAN, cantidad: '5.000', costo_unitario: '14000' },
      { producto_id: ids.CAL, cantidad: '4.000', costo_unitario: '8000' },
      { producto_id: ids.MEJ, cantidad: '3.000', costo_unitario: '4500', fecha_vencimiento: sumarDias(fecha, 1) },
    ],
  });
  await compras.crear(ctx, {
    proveedor_id: frio.id,
    fecha,
    tipo_documento: 'FACTURA',
    numero_documento: 'A-0003-00055501',
    condicion: 'CUENTA_CORRIENTE',
    items: [
      { producto_id: ids.RAB, cantidad: '20', costo_unitario: '8900' },
      { producto_id: ids.KAN, cantidad: '30', costo_unitario: '2400' },
      { producto_id: ids.MIL, cantidad: '5.000', costo_unitario: '7200' },
      { producto_id: ids.EMP, cantidad: '48', costo_unitario: '850' },
    ],
  });
  await knex('clientes').insert([
    { nombre: 'Doña Marta', telefono: '223 555-1111', limite_credito: '50000', cuenta_corriente: true, plazo_pago_dias: 7, notas: 'Compra los viernes' },
    { nombre: 'Restaurante El Muelle', telefono: '223 555-2222', limite_credito: '300000', cuenta_corriente: true, plazo_pago_dias: 15, documento: '30-71234567-8' },
    { nombre: 'Carlos Pérez', telefono: '223 555-3333' },
  ]);
  console.log('Datos de demo cargados. Usuarios: admin / admin1234 (PIN 1234) y cajero / cajero1234.');
}
