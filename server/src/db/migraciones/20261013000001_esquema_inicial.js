// El esquema inicial vive en SQL plano (más legible y revisable que el query builder para
// constraints, índices parciales y triggers). Las migraciones siguientes se escriben acá en JS.
import { readFile } from 'node:fs/promises';

export async function up(knex) {
  const sql = await readFile(new URL('../sql/001_esquema_inicial.sql', import.meta.url), 'utf8');
  await knex.raw(sql);
}

export async function down(knex) {
  await knex.raw(`
    DROP VIEW IF EXISTS v_saldos_proveedores, v_saldos_clientes, v_stock_productos;
    DROP TABLE IF EXISTS
      comprobantes, numeradores, movimientos_stock, inventario_items, inventarios, mermas,
      cc_proveedores_movimientos, cc_clientes_movimientos, caja_movimientos, venta_pagos,
      venta_items, ventas, caja_sesiones, categorias_gasto, cajas, clientes, lotes,
      compra_items, compras, proveedores, productos_precios_historial, productos, categorias,
      configuracion, auditoria, sesiones, usuarios
    CASCADE;
    DROP FUNCTION IF EXISTS fn_solo_insercion(), fn_set_actualizado_en();
  `);
}
