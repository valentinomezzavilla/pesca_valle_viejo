import { ZONA_HORARIA, aPesos, dec } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import { hoy, sumarDias } from '../../lib/fechas.js';
import { slug } from '../../lib/texto.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as configuracion from '../configuracion/configuracion.service.js';
import * as stockAjustes from '../stock/ajustes.service.js';
import { estadoDeudas } from '../proveedores/deuda.service.js';
import { estadoDeudasClientes } from '../clientes/deuda.js';
import { REPORTES } from './reportes.definiciones.js';
import { aExcel, aPdf, fechaCorta } from './reportes.exportar.js';

const MAX_DIAS = 366;
const fmtGenerado = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_HORARIA, dateStyle: 'short', timeStyle: 'short' });

export function catalogo() {
  return Object.entries(REPORTES).map(([id, r]) => ({ id, grupo: r.grupo, titulo: r.titulo, descripcion: r.descripcion, usaFechas: r.usaFechas }));
}

function periodo({ desde, hasta }) {
  const d = desde ?? hasta ?? hoy();
  const h = hasta ?? desde ?? hoy();
  if (h < d) throw new ErrorNegocio('La fecha "hasta" no puede ser anterior a la fecha "desde".', 'PERIODO_INVALIDO', 400);
  const dias = (Date.parse(`${h}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000 + 1;
  if (dias > MAX_DIAS) throw new ErrorNegocio('Elegí un período de hasta un año.', 'PERIODO_INVALIDO', 400);
  return { desde: d, hasta: h };
}

export async function ejecutar(id, filtros) {
  const reporte = REPORTES[id];
  if (!reporte) throw new ErrorNoEncontrado('El reporte');
  const rango = reporte.usaFechas ? periodo(filtros) : null;
  const { filas, totales } = await reporte.ejecutar(rango ?? {});
  return {
    id,
    grupo: reporte.grupo,
    titulo: reporte.titulo,
    descripcion: reporte.descripcion,
    usaFechas: reporte.usaFechas,
    periodo: rango,
    columnas: reporte.columnas,
    filas,
    totales,
    generado: fmtGenerado.format(new Date()),
  };
}


export async function exportar(ctx, id, filtros, formato) {
  const r = await ejecutar(id, filtros);
  const config = await configuracion.obtenerTodo();
  const datos = {
    negocio: config.negocio?.nombre || 'Pescadería Valle Viejo',
    titulo: r.titulo,
    subtitulo: r.periodo ? (r.periodo.desde === r.periodo.hasta ? `Día ${fechaCorta(r.periodo.desde)}` : `Del ${fechaCorta(r.periodo.desde)} al ${fechaCorta(r.periodo.hasta)}`) : `Situación al ${fechaCorta(hoy())}`,
    columnas: r.columnas,
    filas: r.filas,
    totales: r.totales,
    generado: r.generado,
  };
  const buffer = formato === 'xlsx' ? await aExcel(datos) : await aPdf(datos);
  await auditoria.registrar(db, ctx, { accion: 'REPORTE_EXPORTADO', entidad: 'reporte', despues: { reporte: id, formato, periodo: r.periodo } });
  const sufijo = r.periodo ? `${r.periodo.desde}_${r.periodo.hasta}` : hoy();
  return {
    buffer,
    nombre: `${slug(r.titulo)}-${sufijo}.${formato}`,
    tipo: formato === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
  };
}

/** Datos del tablero de inicio del dueño. */
export async function panel() {
  const fechaHoy = hoy();
  const ayer = sumarDias(fechaHoy, -1);
  const semanaPasada = sumarDias(fechaHoy, -7);

  const comparacion = (await db.raw(
    `SELECT fecha::date::text AS dia, COUNT(*)::int AS ventas, SUM(total) AS total, SUM(costo_total) AS costo
     FROM ventas WHERE estado = 'CONFIRMADA' AND fecha::date IN (?::date, ?::date, ?::date) GROUP BY 1`,
    [fechaHoy, ayer, semanaPasada],
  )).rows;
  const dia = (f) => {
    const x = comparacion.find((c) => c.dia === f);
    return { ventas: x?.ventas ?? 0, total: aPesos(x?.total ?? 0), ganancia: aPesos(dec(x?.total ?? 0).minus(x?.costo ?? 0)) };
  };

  const [serie, porMedio, porHora, topProductos, mes, cajas, deudaClientes, deudaProveedores, mermasMes, alertas] = await Promise.all([
    db.raw(
      `SELECT d::date::text AS fecha, COALESCE(x.ventas, 0)::int AS ventas, COALESCE(x.total, 0) AS total
       FROM generate_series(current_date - 6, current_date, interval '1 day') d
       LEFT JOIN (SELECT fecha::date AS dia, COUNT(*) AS ventas, SUM(total) AS total FROM ventas
                  WHERE estado = 'CONFIRMADA' AND fecha::date >= current_date - 6 GROUP BY 1) x ON x.dia = d::date
       ORDER BY 1`,
    ),
    db.raw(
      `SELECT vp.medio, SUM(vp.monto) AS monto FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
       WHERE v.estado = 'CONFIRMADA' AND v.fecha::date = current_date GROUP BY vp.medio ORDER BY monto DESC`,
    ),
    db.raw(
      `SELECT EXTRACT(HOUR FROM fecha)::int AS hora, SUM(total) AS total FROM ventas
       WHERE estado = 'CONFIRMADA' AND fecha::date = current_date GROUP BY 1 ORDER BY 1`,
    ),
    db.raw(
      `SELECT vi.descripcion AS producto, vi.unidad, SUM(vi.cantidad) AS cantidad, SUM(vi.total) AS total
       FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
       WHERE v.estado = 'CONFIRMADA' AND v.fecha::date = current_date GROUP BY vi.descripcion, vi.unidad ORDER BY SUM(vi.total) DESC LIMIT 5`,
    ),
    db.raw(
      `SELECT COUNT(*)::int AS ventas, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(costo_total), 0) AS costo
       FROM ventas WHERE estado = 'CONFIRMADA' AND date_trunc('month', fecha) = date_trunc('month', now())`,
    ),
    db.raw(
      `SELECT COUNT(DISTINCT s.id)::int AS abiertas, COALESCE(SUM(m.importe) FILTER (WHERE m.medio = 'EFECTIVO'), 0) AS efectivo
       FROM caja_sesiones s LEFT JOIN caja_movimientos m ON m.caja_sesion_id = s.id WHERE s.estado = 'ABIERTA'`,
    ),
    db('v_saldos_clientes').where('saldo', '>', 0).count('* as clientes').sum('saldo as total').first(),
    db('v_saldos_proveedores').where('saldo', '>', 0).count('* as proveedores').sum('saldo as total').first(),
    db.raw(`SELECT COALESCE(SUM(costo_total), 0) AS total FROM mermas WHERE date_trunc('month', creado_en) = date_trunc('month', now())`),
    stockAjustes.alertas(),
  ]);

  // Proveedores con algo vencido o que vence en la semana, y cheques que se cobran en la semana
  const conDeuda = await db('proveedores as p').join('v_saldos_proveedores as s', 's.id', 'p.id').where('s.saldo', '>', 0).select('p.id', 'p.nombre', 'p.plazo_pago_dias', 'p.plazo_periodo');
  const estados = await estadoDeudas(db, conDeuda, fechaHoy);
  const enUnaSemana = sumarDias(fechaHoy, 7);
  const proveedoresAPagar = conDeuda
    .map((p) => ({ id: p.id, nombre: p.nombre, vencido: estados.get(p.id).vencido, proximo_vencimiento: estados.get(p.id).proximo_vencimiento }))
    .filter((p) => dec(p.vencido).gt(0) || (p.proximo_vencimiento && p.proximo_vencimiento.fecha <= enUnaSemana))
    .sort((a, b) => Number(b.vencido) - Number(a.vencido) || (a.proximo_vencimiento?.fecha ?? '').localeCompare(b.proximo_vencimiento?.fecha ?? ''))
    .slice(0, 5);
  const cheques = await db('cc_proveedores_movimientos as m')
    .join('proveedores as p', 'p.id', 'm.proveedor_id')
    .where({ 'm.tipo': 'PAGO', 'm.medio_pago': 'CHEQUE' })
    .whereBetween('m.cheque_fecha_cobro', [fechaHoy, enUnaSemana])
    .whereNotExists(db('cc_proveedores_movimientos as a').whereRaw('a.anula_movimiento_id = m.id'))
    .orderBy('m.cheque_fecha_cobro')
    .select('m.id', 'm.proveedor_id', 'p.nombre as proveedor', 'm.importe', 'm.cheque_fecha_cobro as fecha_cobro', 'm.cheque_numero as numero', 'm.cheque_banco as banco');

  // Clientes que deben algo vencido (los que más deben primero)
  const clientesConDeuda = await db('clientes as c').join('v_saldos_clientes as s', 's.id', 'c.id').where('s.saldo', '>', 0).select('c.id', 'c.nombre', 'c.plazo_pago_dias', 'c.plazo_periodo');
  const estadosClientes = await estadoDeudasClientes(db, clientesConDeuda, fechaHoy);
  const clientesVencidos = clientesConDeuda
    .map((c) => ({ id: c.id, nombre: c.nombre, vencido: estadosClientes.get(c.id).vencido }))
    .filter((c) => dec(c.vencido).gt(0))
    .sort((a, b) => Number(b.vencido) - Number(a.vencido))
    .slice(0, 5);

  const mesFila = mes.rows[0];
  return {
    fecha: fechaHoy,
    hoy: dia(fechaHoy),
    ayer: dia(ayer),
    semana_pasada: dia(semanaPasada),
    ultimos_7_dias: serie.rows.map((f) => ({ fecha: f.fecha, ventas: f.ventas, total: aPesos(f.total) })),
    por_medio: porMedio.rows.map((f) => ({ medio: f.medio, monto: aPesos(f.monto) })),
    por_hora: porHora.rows.map((f) => ({ hora: f.hora, total: aPesos(f.total) })),
    top_productos: topProductos.rows.map((f) => ({ producto: f.producto, unidad: f.unidad, cantidad: f.cantidad, total: aPesos(f.total) })),
    mes: { ventas: mesFila.ventas, total: aPesos(mesFila.total), ganancia: aPesos(dec(mesFila.total).minus(mesFila.costo)) },
    cajas: { abiertas: cajas.rows[0].abiertas, efectivo: aPesos(cajas.rows[0].efectivo) },
    deuda_clientes: { clientes: Number(deudaClientes.clientes), total: aPesos(deudaClientes.total ?? 0) },
    deuda_proveedores: { proveedores: Number(deudaProveedores.proveedores), total: aPesos(deudaProveedores.total ?? 0) },
    mermas_mes: aPesos(mermasMes.rows[0].total),
    proveedores_a_pagar: proveedoresAPagar,
    clientes_vencidos: clientesVencidos,
    cheques_semana: cheques.map((c) => ({ ...c, importe: aPesos(dec(c.importe).neg()) })),
    alertas: { total: alertas.total, bajo_minimo: alertas.bajo_minimo.length, vencimientos: alertas.vencimientos.length, negativos: alertas.negativos.length },
  };
}
