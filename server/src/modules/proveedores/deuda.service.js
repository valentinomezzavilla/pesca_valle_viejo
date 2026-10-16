import { db } from '../../config/db.js';
import { hoy } from '../../lib/fechas.js';
import { imputar } from './imputacion.js';

const agrupar = (filas) => filas.reduce((m, f) => m.set(f.proveedor_id, [...(m.get(f.proveedor_id) ?? []), f]), new Map());

/** Estado de deuda (saldo, vencido, próximo vencimiento, compras) de varios proveedores con dos consultas. */
export async function estadoDeudas(conexion, proveedores, hoyIso = hoy()) {
  if (!proveedores.length) return new Map();
  const ids = proveedores.map((p) => p.id);
  const [movimientos, compras] = await Promise.all([
    conexion('cc_proveedores_movimientos').whereIn('proveedor_id', ids).select('id', 'proveedor_id', 'tipo', 'importe', 'compra_id', 'anula_movimiento_id'),
    conexion('compras').whereIn('proveedor_id', ids).select('id', 'proveedor_id', 'fecha', 'total', 'estado', 'tipo_documento', 'numero_documento'),
  ]);
  const movs = agrupar(movimientos);
  const comps = agrupar(compras);
  return new Map(
    proveedores.map((p) => [p.id, imputar({ movimientos: movs.get(p.id) ?? [], compras: comps.get(p.id) ?? [], plazoDias: p.plazo_pago_dias, hoy: hoyIso })]),
  );
}

export async function estadoDeuda(proveedor, conexion = db) {
  return (await estadoDeudas(conexion, [proveedor])).get(proveedor.id);
}
