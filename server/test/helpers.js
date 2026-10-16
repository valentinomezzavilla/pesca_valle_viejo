import request from 'supertest';
import bcrypt from 'bcryptjs';
import { db } from '../src/config/db.js';
import { crearApp } from '../src/app.js';
import { seedBase } from '../src/db/seeds.js';
import { _reiniciarBloqueos } from '../src/modules/auth/auth.service.js';
import { verificarConsistencia } from '../src/modules/stock/stock.service.js';

export { db };
export const app = crearApp();

let migrado = false;

/** Deja la base limpia con los datos base (usuario admin, categorías, Caja 1, etc.). */
export async function reiniciarBase() {
  if (!migrado) {
    await db.migrate.latest();
    migrado = true;
  }
  const tablas = await db('pg_tables').where({ schemaname: 'public' }).whereNot('tablename', 'like', 'knex_%').pluck('tablename');
  await db.raw(`TRUNCATE ${tablas.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await seedBase(db);
  _reiniciarBloqueos();
}

export async function login(usuario = 'admin', password = 'admin1234') {
  const agente = request.agent(app);
  const res = await agente.post('/api/auth/login').send({ usuario, password });
  if (res.status !== 200) throw new Error(`Login falló: ${res.status} ${JSON.stringify(res.body)}`);
  return agente;
}

export async function crearCajero() {
  await db('usuarios').insert({ nombre: 'Cajero', usuario: 'cajero', password_hash: await bcrypt.hash('cajero1234', 4), rol: 'CAJERO' });
  return login('cajero', 'cajero1234');
}

export async function crearProducto(agente, datos = {}) {
  const res = await agente.post('/api/productos').send({
    nombre: datos.nombre ?? 'Merluza filet',
    categoria_id: 1,
    unidad: datos.unidad ?? 'KG',
    precio_venta: datos.precio_venta ?? '10000',
    ...datos,
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body;
}

export async function crearProveedor(agente, nombre = 'Proveedor Test') {
  const res = await agente.post('/api/proveedores').send({ nombre });
  return res.body;
}

export async function ingresarMercaderia(agente, proveedorId, items, extra = {}) {
  const res = await agente.post('/api/compras').send({
    proveedor_id: proveedorId,
    fecha: '2026-10-13',
    tipo_documento: 'REMITO',
    condicion: 'CUENTA_CORRIENTE',
    items,
    ...extra,
  });
  return res;
}

export async function abrirCaja(agente, monto = '10000', cajaId = 1) {
  const res = await agente.post(`/api/cajas/${cajaId}/abrir`).send({ monto_inicial: monto });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body;
}

export function vender(agente, items, pagos, extra = {}) {
  return agente.post('/api/ventas').send({ caja_id: 1, items, pagos, ...extra });
}

export async function lotes(productoId) {
  return db('lotes').where({ producto_id: productoId }).orderBy('id');
}

export async function stockDe(productoId) {
  const p = await db('productos').where({ id: productoId }).first('stock_actual');
  return p.stock_actual;
}

export async function esperarConsistencia() {
  const problemas = await verificarConsistencia(db);
  if (problemas.length) throw new Error(`Inconsistencia de stock: ${JSON.stringify(problemas)}`);
}
