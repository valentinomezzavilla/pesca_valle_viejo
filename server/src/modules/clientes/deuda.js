import { aPesos, dec } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { hoy } from '../../lib/fechas.js';
import { imputarDeudas } from '../../lib/imputacion.js';

/**
 * Qué compras a cuenta de un cliente están pagadas, a medias o vencidas.
 * Deudas: lo que quedó a cuenta en cada venta confirmada, y las deudas cargadas a mano (ajuste positivo).
 * Lo que baja la deuda (cobros, ajustes negativos) se aplica de la más vieja a la más nueva.
 * No cuentan las ventas anuladas ni los cobros anulados (con su anulación).
 *
 * movimientos: { id, tipo, importe, venta_id, anula_movimiento_id, fecha, descripcion }
 * ventas: { id, fecha, estado, ticket }
 */
export function imputarCliente({ movimientos, ventas, plazoDias = 0, hoy: hoyIso }) {
  const anulados = new Set(movimientos.filter((m) => m.tipo === 'ANULACION_PAGO').map((m) => Number(m.anula_movimiento_id)));
  const vigentes = movimientos.filter((m) => m.tipo !== 'ANULACION_PAGO' && !anulados.has(Number(m.id)));
  const confirmadas = new Map(ventas.filter((v) => v.estado === 'CONFIRMADA').map((v) => [Number(v.id), v]));

  const deudas = [];
  const creditos = [];
  for (const m of vigentes) {
    if (m.tipo === 'VENTA') {
      const v = confirmadas.get(Number(m.venta_id));
      if (v) deudas.push({ clave: `v${v.id}`, orden: Number(m.id), fecha: v.fecha, importe: m.importe, origen: 'VENTA', venta_id: Number(v.id), ticket: v.ticket ?? null });
    } else if (m.tipo === 'AJUSTE' && dec(m.importe).gt(0)) {
      deudas.push({ clave: `a${m.id}`, orden: Number(m.id), fecha: m.fecha, importe: m.importe, origen: 'AJUSTE', movimiento_id: Number(m.id), descripcion: m.descripcion ?? null });
    } else if (m.tipo === 'PAGO' || m.tipo === 'AJUSTE') {
      creditos.push({ importe: dec(m.importe).neg() });
    }
    // ANULACION_VENTA: su venta está anulada y ya no figura como deuda
  }

  const r = imputarDeudas({ deudas, creditos, plazoDias, hoy: hoyIso });
  return {
    saldo: aPesos(movimientos.reduce((a, m) => a.plus(m.importe), dec(0))),
    vencido: r.vencido,
    proximo_vencimiento: r.proximo_vencimiento,
    deudas: r.deudas.map(({ clave, orden, importe, ...d }) => d),
  };
}

const agrupar = (filas) => filas.reduce((m, f) => m.set(f.cliente_id, [...(m.get(f.cliente_id) ?? []), f]), new Map());

/** Movimientos y ventas a cuenta de varios clientes, con fechas en hora local (la conexión ya está en hora de Córdoba). */
export async function cargarCuentas(conexion, ids, { hasta } = {}) {
  const movs = conexion('cc_clientes_movimientos as m')
    .whereIn('m.cliente_id', ids)
    .select('m.id', 'm.cliente_id', 'm.tipo', 'm.importe', 'm.venta_id', 'm.anula_movimiento_id', 'm.descripcion', conexion.raw('m.creado_en::date AS fecha'));
  const ventas = conexion('ventas as v')
    .leftJoin('comprobantes as cp', function unir() {
      this.on('cp.venta_id', 'v.id').andOnVal('cp.tipo', 'TICKET_INTERNO');
    })
    .whereIn('v.cliente_id', ids)
    .select('v.id', 'v.cliente_id', 'v.estado', conexion.raw('v.fecha::date AS fecha'), conexion.raw("lpad(cp.punto_venta::text, 4, '0') || '-' || lpad(cp.numero::text, 8, '0') AS ticket"));
  if (hasta) {
    movs.whereRaw('m.creado_en::date <= ?', [hasta]);
    ventas.whereRaw('v.fecha::date <= ?', [hasta]);
  }
  const [m, v] = await Promise.all([movs, ventas]);
  return { movimientos: agrupar(m), ventas: agrupar(v) };
}

/** Estado de deuda de varios clientes con dos consultas. clientes: [{ id, plazo_pago_dias }] */
export async function estadoDeudasClientes(conexion, clientes, hoyIso = hoy()) {
  if (!clientes.length) return new Map();
  const { movimientos, ventas } = await cargarCuentas(conexion, clientes.map((c) => c.id));
  return new Map(
    clientes.map((c) => [c.id, imputarCliente({ movimientos: movimientos.get(c.id) ?? [], ventas: ventas.get(c.id) ?? [], plazoDias: c.plazo_pago_dias, hoy: hoyIso })]),
  );
}

export async function estadoDeudaCliente(cliente, conexion = db) {
  return (await estadoDeudasClientes(conexion, [cliente])).get(cliente.id);
}
