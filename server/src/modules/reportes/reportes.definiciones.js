/**
 * Catálogo de reportes. Cada uno devuelve la misma estructura —columnas + filas + totales— y de ahí salen
 * la tabla en pantalla, el Excel y el PDF. Agregar un reporte nuevo = agregar una entrada acá.
 *
 * Tipos de columna: texto | fecha | pesos | cantidad | entero | porcentaje
 * Las ventas anuladas nunca cuentan. Los días se toman en hora de Córdoba (la conexión ya trae esa zona).
 */
import {
  CONDICIONES_COMPRA_ETIQUETA, MEDIOS_PAGO_ETIQUETA, MOTIVOS_MERMA_ETIQUETA, TIPOS_DOCUMENTO_COMPRA_ETIQUETA,
  UNIDADES_ETIQUETA, aCantidad, aPesos, dec, redondear, sumar,
} from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { estadoDeudas } from '../proveedores/deuda.service.js';
import { estadoDeudasClientes } from '../clientes/deuda.js';
import { tramosDeuda } from '../../lib/imputacion.js';

const DIA_VENTA = 'v.fecha::date';
const enRango = (columna, { desde, hasta }) => ({
  sql: `${columna}::date BETWEEN ?::date AND ?::date`,
  bindings: [desde, hasta],
});

const pct = (parte, todo) => (dec(todo).isZero() ? '0.00' : redondear(dec(parte).div(todo).times(100), 2).toFixed(2));
const suma = (filas, clave) => sumar(filas.map((f) => f[clave] ?? 0));

function conRentabilidad(filas) {
  return filas.map((f) => {
    const ganancia = dec(f.total).minus(f.costo);
    return { ...f, total: aPesos(f.total), costo: aPesos(f.costo), ganancia: aPesos(ganancia), margen: pct(ganancia, f.total) };
  });
}

function totalesRentabilidad(filas, extra = {}) {
  const total = suma(filas, 'total');
  const costo = suma(filas, 'costo');
  return { ...extra, total: aPesos(total), costo: aPesos(costo), ganancia: aPesos(total.minus(costo)), margen: pct(total.minus(costo), total) };
}

const colRentabilidad = [
  { clave: 'total', titulo: 'Vendido', tipo: 'pesos' },
  { clave: 'costo', titulo: 'Costo', tipo: 'pesos' },
  { clave: 'ganancia', titulo: 'Ganancia', tipo: 'pesos' },
  { clave: 'margen', titulo: 'Margen', tipo: 'porcentaje' },
];

export const REPORTES = {
  'ventas-por-dia': {
    grupo: 'Ventas',
    titulo: 'Ventas por día',
    descripcion: 'Cuánto se vendió cada día, con el costo de la mercadería y la ganancia.',
    usaFechas: true,
    columnas: [
      { clave: 'fecha', titulo: 'Día', tipo: 'fecha' },
      { clave: 'ventas', titulo: 'Ventas', tipo: 'entero' },
      { clave: 'ticket_promedio', titulo: 'Ticket promedio', tipo: 'pesos' },
      ...colRentabilidad,
    ],
    async ejecutar(p) {
      const r = enRango(DIA_VENTA, p);
      const { rows } = await db.raw(
        `SELECT ${DIA_VENTA}::text AS fecha, COUNT(*)::int AS ventas, SUM(v.total) AS total, SUM(v.costo_total) AS costo
         FROM ventas v WHERE v.estado = 'CONFIRMADA' AND ${r.sql} GROUP BY 1 ORDER BY 1`,
        r.bindings,
      );
      const filas = conRentabilidad(rows).map((f) => ({ ...f, ticket_promedio: aPesos(dec(f.total).div(f.ventas)) }));
      const cant = rows.reduce((a, f) => a + f.ventas, 0);
      return {
        filas,
        totales: { ...totalesRentabilidad(rows.map((f) => ({ total: f.total, costo: f.costo })), { ventas: cant }), ticket_promedio: cant ? aPesos(suma(rows, 'total').div(cant)) : '0.00' },
      };
    },
  },

  'ventas-por-producto': {
    grupo: 'Ventas',
    titulo: 'Ventas por producto',
    descripcion: 'Qué productos se vendieron más, cuánto dejaron y con qué margen.',
    usaFechas: true,
    columnas: [
      { clave: 'producto', titulo: 'Producto', tipo: 'texto' },
      { clave: 'categoria', titulo: 'Categoría', tipo: 'texto' },
      { clave: 'cantidad', titulo: 'Cantidad', tipo: 'cantidad' },
      { clave: 'unidad', titulo: 'Unidad', tipo: 'texto' },
      ...colRentabilidad,
    ],
    async ejecutar(p) {
      const r = enRango(DIA_VENTA, p);
      const { rows } = await db.raw(
        `SELECT pr.nombre AS producto, c.nombre AS categoria, vi.unidad, SUM(vi.cantidad) AS cantidad,
                SUM(vi.total) AS total, SUM(vi.costo_total) AS costo
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id
         JOIN productos pr ON pr.id = vi.producto_id
         JOIN categorias c ON c.id = pr.categoria_id
         WHERE v.estado = 'CONFIRMADA' AND ${r.sql}
         GROUP BY pr.id, pr.nombre, c.nombre, vi.unidad ORDER BY SUM(vi.total) DESC`,
        r.bindings,
      );
      const filas = conRentabilidad(rows).map((f) => ({ ...f, cantidad: aCantidad(f.cantidad), unidad: UNIDADES_ETIQUETA[f.unidad] }));
      return { filas, totales: totalesRentabilidad(rows) };
    },
  },

  'ventas-por-categoria': {
    grupo: 'Ventas',
    titulo: 'Ventas por categoría',
    descripcion: 'Qué rubros mueven el negocio.',
    usaFechas: true,
    columnas: [{ clave: 'categoria', titulo: 'Categoría', tipo: 'texto' }, ...colRentabilidad, { clave: 'participacion', titulo: '% de las ventas', tipo: 'porcentaje' }],
    async ejecutar(p) {
      const r = enRango(DIA_VENTA, p);
      const { rows } = await db.raw(
        `SELECT c.nombre AS categoria, SUM(vi.total) AS total, SUM(vi.costo_total) AS costo
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id
         JOIN productos pr ON pr.id = vi.producto_id
         JOIN categorias c ON c.id = pr.categoria_id
         WHERE v.estado = 'CONFIRMADA' AND ${r.sql}
         GROUP BY c.id, c.nombre ORDER BY SUM(vi.total) DESC`,
        r.bindings,
      );
      const todo = suma(rows, 'total');
      return {
        filas: conRentabilidad(rows).map((f, i) => ({ ...f, participacion: pct(rows[i].total, todo) })),
        totales: { ...totalesRentabilidad(rows), participacion: todo.isZero() ? '0.00' : '100.00' },
      };
    },
  },

  'ventas-por-medio-pago': {
    grupo: 'Ventas',
    titulo: 'Ventas por medio de pago',
    descripcion: 'Cuánto entró en efectivo, transferencia, tarjetas y cuánto se fió.',
    usaFechas: true,
    columnas: [
      { clave: 'medio', titulo: 'Medio de pago', tipo: 'texto' },
      { clave: 'pagos', titulo: 'Pagos', tipo: 'entero' },
      { clave: 'monto', titulo: 'Monto', tipo: 'pesos' },
      { clave: 'participacion', titulo: '% del total', tipo: 'porcentaje' },
    ],
    async ejecutar(p) {
      const r = enRango(DIA_VENTA, p);
      const { rows } = await db.raw(
        `SELECT vp.medio, COUNT(*)::int AS pagos, SUM(vp.monto) AS monto
         FROM venta_pagos vp JOIN ventas v ON v.id = vp.venta_id
         WHERE v.estado = 'CONFIRMADA' AND ${r.sql} GROUP BY vp.medio ORDER BY SUM(vp.monto) DESC`,
        r.bindings,
      );
      const todo = suma(rows, 'monto');
      return {
        filas: rows.map((f) => ({ medio: MEDIOS_PAGO_ETIQUETA[f.medio] ?? f.medio, pagos: f.pagos, monto: aPesos(f.monto), participacion: pct(f.monto, todo) })),
        totales: { pagos: rows.reduce((a, f) => a + f.pagos, 0), monto: aPesos(todo), participacion: todo.isZero() ? '0.00' : '100.00' },
      };
    },
  },

  'ventas-por-usuario': {
    grupo: 'Ventas',
    titulo: 'Ventas por cajero',
    descripcion: 'Cuánto vendió cada persona.',
    usaFechas: true,
    columnas: [
      { clave: 'usuario', titulo: 'Cajero', tipo: 'texto' },
      { clave: 'ventas', titulo: 'Ventas', tipo: 'entero' },
      { clave: 'total', titulo: 'Vendido', tipo: 'pesos' },
      { clave: 'ticket_promedio', titulo: 'Ticket promedio', tipo: 'pesos' },
      { clave: 'anuladas', titulo: 'Anuladas', tipo: 'entero' },
    ],
    async ejecutar(p) {
      const r = enRango(DIA_VENTA, p);
      const { rows } = await db.raw(
        `SELECT u.nombre AS usuario,
                COUNT(*) FILTER (WHERE v.estado = 'CONFIRMADA')::int AS ventas,
                COALESCE(SUM(v.total) FILTER (WHERE v.estado = 'CONFIRMADA'), 0) AS total,
                COUNT(*) FILTER (WHERE v.estado = 'ANULADA')::int AS anuladas
         FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
         WHERE ${r.sql} GROUP BY u.id, u.nombre ORDER BY total DESC`,
        r.bindings,
      );
      const cant = rows.reduce((a, f) => a + f.ventas, 0);
      return {
        filas: rows.map((f) => ({ ...f, total: aPesos(f.total), ticket_promedio: f.ventas ? aPesos(dec(f.total).div(f.ventas)) : '0.00' })),
        totales: {
          ventas: cant,
          total: aPesos(suma(rows, 'total')),
          ticket_promedio: cant ? aPesos(suma(rows, 'total').div(cant)) : '0.00',
          anuladas: rows.reduce((a, f) => a + f.anuladas, 0),
        },
      };
    },
  },

  'ventas-detalle': {
    grupo: 'Ventas',
    titulo: 'Detalle de ventas',
    descripcion: 'Una fila por venta: ideal para pasarle al contador.',
    usaFechas: true,
    columnas: [
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
      { clave: 'hora', titulo: 'Hora', tipo: 'texto' },
      { clave: 'comprobante', titulo: 'Ticket', tipo: 'texto' },
      { clave: 'cajero', titulo: 'Cajero', tipo: 'texto' },
      { clave: 'cliente', titulo: 'Cliente', tipo: 'texto' },
      { clave: 'medios', titulo: 'Medios de pago', tipo: 'texto' },
      { clave: 'total', titulo: 'Total', tipo: 'pesos' },
    ],
    async ejecutar(p) {
      const r = enRango(DIA_VENTA, p);
      const { rows } = await db.raw(
        `SELECT v.fecha::date::text AS fecha, to_char(v.fecha, 'HH24:MI') AS hora,
                lpad(cp.punto_venta::text, 4, '0') || '-' || lpad(cp.numero::text, 8, '0') AS comprobante,
                u.nombre AS cajero, cl.nombre AS cliente, v.total,
                (SELECT string_agg(DISTINCT medio, ',') FROM venta_pagos WHERE venta_id = v.id) AS medios
         FROM ventas v
         JOIN usuarios u ON u.id = v.usuario_id
         LEFT JOIN clientes cl ON cl.id = v.cliente_id
         LEFT JOIN comprobantes cp ON cp.venta_id = v.id AND cp.tipo = 'TICKET_INTERNO'
         WHERE v.estado = 'CONFIRMADA' AND ${r.sql} ORDER BY v.fecha, v.id`,
        r.bindings,
      );
      return {
        filas: rows.map((f) => ({
          ...f,
          cliente: f.cliente ?? '',
          total: aPesos(f.total),
          medios: f.medios.split(',').map((m) => MEDIOS_PAGO_ETIQUETA[m] ?? m).join(' + '),
        })),
        totales: { total: aPesos(suma(rows, 'total')) },
      };
    },
  },

  mermas: {
    grupo: 'Mercadería y stock',
    titulo: 'Mermas',
    descripcion: 'Lo que se descartó y cuánta plata se perdió.',
    usaFechas: true,
    columnas: [
      { clave: 'fecha', titulo: 'Día', tipo: 'fecha' },
      { clave: 'producto', titulo: 'Producto', tipo: 'texto' },
      { clave: 'motivo', titulo: 'Motivo', tipo: 'texto' },
      { clave: 'cantidad', titulo: 'Cantidad', tipo: 'cantidad' },
      { clave: 'unidad', titulo: 'Unidad', tipo: 'texto' },
      { clave: 'costo_total', titulo: 'Plata perdida', tipo: 'pesos' },
      { clave: 'usuario', titulo: 'Registró', tipo: 'texto' },
      { clave: 'detalle', titulo: 'Detalle', tipo: 'texto' },
    ],
    async ejecutar(p) {
      const r = enRango('m.creado_en', p);
      const { rows } = await db.raw(
        `SELECT m.creado_en::date::text AS fecha, pr.nombre AS producto, m.motivo, m.cantidad, pr.unidad,
                m.costo_total, u.nombre AS usuario, COALESCE(m.detalle, '') AS detalle
         FROM mermas m JOIN productos pr ON pr.id = m.producto_id JOIN usuarios u ON u.id = m.usuario_id
         WHERE ${r.sql} ORDER BY m.id`,
        r.bindings,
      );
      return {
        filas: rows.map((f) => ({ ...f, motivo: MOTIVOS_MERMA_ETIQUETA[f.motivo], cantidad: aCantidad(f.cantidad), unidad: UNIDADES_ETIQUETA[f.unidad], costo_total: aPesos(f.costo_total) })),
        totales: { costo_total: aPesos(suma(rows, 'costo_total')) },
      };
    },
  },

  'stock-valorizado': {
    grupo: 'Mercadería y stock',
    titulo: 'Stock valorizado',
    descripcion: 'Cuánta mercadería hay hoy, lo que costó y lo que valdría vendida.',
    usaFechas: false,
    columnas: [
      { clave: 'producto', titulo: 'Producto', tipo: 'texto' },
      { clave: 'categoria', titulo: 'Categoría', tipo: 'texto' },
      { clave: 'stock', titulo: 'Stock', tipo: 'cantidad' },
      { clave: 'unidad', titulo: 'Unidad', tipo: 'texto' },
      { clave: 'valor_costo', titulo: 'Valor a costo', tipo: 'pesos' },
      { clave: 'valor_venta', titulo: 'Valor a precio de venta', tipo: 'pesos' },
    ],
    async ejecutar() {
      const rows = await db('v_stock_productos').where('stock_actual', '>', 0).select('nombre', 'categoria', 'unidad', 'stock_actual', 'valor_stock', 'precio_venta').orderBy('valor_stock', 'desc');
      const filas = rows.map((f) => ({
        producto: f.nombre,
        categoria: f.categoria,
        stock: aCantidad(f.stock_actual),
        unidad: UNIDADES_ETIQUETA[f.unidad],
        valor_costo: aPesos(f.valor_stock),
        valor_venta: aPesos(redondear(dec(f.stock_actual).times(f.precio_venta), 2)),
      }));
      return { filas, totales: { valor_costo: aPesos(suma(filas, 'valor_costo')), valor_venta: aPesos(suma(filas, 'valor_venta')) } };
    },
  },

  compras: {
    grupo: 'Mercadería y stock',
    titulo: 'Ingresos de mercadería',
    descripcion: 'Lo que se compró a cada proveedor.',
    usaFechas: true,
    columnas: [
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
      { clave: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
      { clave: 'documento', titulo: 'Documento', tipo: 'texto' },
      { clave: 'condicion', titulo: 'Condición', tipo: 'texto' },
      { clave: 'total', titulo: 'Total', tipo: 'pesos' },
    ],
    async ejecutar(p) {
      const r = enRango('c.fecha', p);
      const { rows } = await db.raw(
        `SELECT c.fecha::text AS fecha, pr.nombre AS proveedor, c.tipo_documento, COALESCE(c.numero_documento, '') AS numero, c.condicion, c.total
         FROM compras c JOIN proveedores pr ON pr.id = c.proveedor_id
         WHERE c.estado = 'CONFIRMADA' AND ${r.sql} ORDER BY c.fecha, c.id`,
        r.bindings,
      );
      return {
        filas: rows.map((f) => ({
          fecha: f.fecha,
          proveedor: f.proveedor,
          documento: `${TIPOS_DOCUMENTO_COMPRA_ETIQUETA[f.tipo_documento]} ${f.numero}`.trim(),
          condicion: CONDICIONES_COMPRA_ETIQUETA[f.condicion],
          total: aPesos(f.total),
        })),
        totales: { total: aPesos(suma(rows, 'total')) },
      };
    },
  },

  'cuentas-clientes': {
    grupo: 'Cuentas',
    titulo: 'Lo que nos deben los clientes',
    descripcion: 'Saldo de cada cliente con cuenta corriente a hoy, separado por cuánto hace que venció.',
    usaFechas: false,
    columnas: [
      { clave: 'cliente', titulo: 'Cliente', tipo: 'texto' },
      { clave: 'telefono', titulo: 'Teléfono', tipo: 'texto' },
      { clave: 'limite', titulo: 'Límite', tipo: 'pesos' },
      { clave: 'al_dia', titulo: 'Al día', tipo: 'pesos' },
      { clave: 'vencido_30', titulo: 'Vencido hasta 30 días', tipo: 'pesos' },
      { clave: 'vencido_60', titulo: '31 a 60 días', tipo: 'pesos' },
      { clave: 'vencido_mas', titulo: 'Más de 60 días', tipo: 'pesos' },
      { clave: 'saldo', titulo: 'Debe', tipo: 'pesos' },
    ],
    async ejecutar() {
      const rows = await db('v_saldos_clientes as s').join('clientes as c', 'c.id', 's.id')
        .whereNot('s.saldo', 0).orderBy('s.saldo', 'desc').select('s.*', 'c.plazo_pago_dias');
      const estados = await estadoDeudasClientes(db, rows);
      const filas = rows.map((f) => ({
        cliente: f.nombre,
        telefono: f.telefono ?? '',
        limite: f.limite_credito ?? '',
        ...tramosDeuda(f.saldo, estados.get(f.id).deudas),
        saldo: aPesos(f.saldo),
      }));
      const totales = Object.fromEntries(['al_dia', 'vencido_30', 'vencido_60', 'vencido_mas', 'saldo'].map((k) => [k, aPesos(suma(filas, k))]));
      return { filas, totales };
    },
  },

  'cuentas-proveedores': {
    grupo: 'Cuentas',
    titulo: 'Lo que le debemos a los proveedores',
    descripcion: 'Saldo con cada proveedor a hoy, separado por cuánto hace que venció.',
    usaFechas: false,
    columnas: [
      { clave: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
      { clave: 'telefono', titulo: 'Teléfono', tipo: 'texto' },
      { clave: 'al_dia', titulo: 'Al día', tipo: 'pesos' },
      { clave: 'vencido_30', titulo: 'Vencido hasta 30 días', tipo: 'pesos' },
      { clave: 'vencido_60', titulo: '31 a 60 días', tipo: 'pesos' },
      { clave: 'vencido_mas', titulo: 'Más de 60 días', tipo: 'pesos' },
      { clave: 'saldo', titulo: 'Le debemos', tipo: 'pesos' },
    ],
    async ejecutar() {
      const rows = await db('v_saldos_proveedores as s').join('proveedores as p', 'p.id', 's.id')
        .whereNot('s.saldo', 0).orderBy('s.saldo', 'desc').select('s.*', 'p.plazo_pago_dias');
      const estados = await estadoDeudas(db, rows);
      const filas = rows.map((f) => ({
        proveedor: f.nombre,
        telefono: f.telefono ?? '',
        ...tramosDeuda(f.saldo, estados.get(f.id).compras),
        saldo: aPesos(f.saldo),
      }));
      const totales = Object.fromEntries(['al_dia', 'vencido_30', 'vencido_60', 'vencido_mas', 'saldo'].map((k) => [k, aPesos(suma(filas, k))]));
      return { filas, totales };
    },
  },

  'cierres-caja': {
    grupo: 'Caja',
    titulo: 'Cierres de caja',
    descripcion: 'Cada turno cerrado, con lo que debía haber, lo que se contó y la diferencia.',
    usaFechas: true,
    columnas: [
      { clave: 'fecha', titulo: 'Cierre', tipo: 'fecha' },
      { clave: 'caja', titulo: 'Caja', tipo: 'texto' },
      { clave: 'abrio', titulo: 'Abrió', tipo: 'texto' },
      { clave: 'cerro', titulo: 'Cerró', tipo: 'texto' },
      { clave: 'esperado', titulo: 'Efectivo esperado', tipo: 'pesos' },
      { clave: 'contado', titulo: 'Efectivo contado', tipo: 'pesos' },
      { clave: 'diferencia', titulo: 'Diferencia', tipo: 'pesos' },
      { clave: 'observaciones', titulo: 'Observaciones', tipo: 'texto' },
    ],
    async ejecutar(p) {
      const r = enRango('s.cerrada_en', p);
      const { rows } = await db.raw(
        `SELECT s.cerrada_en::date::text AS fecha, c.nombre AS caja, ua.nombre AS abrio, uc.nombre AS cerro,
                s.efectivo_esperado AS esperado, s.efectivo_contado AS contado, s.diferencia, COALESCE(s.observaciones, '') AS observaciones
         FROM caja_sesiones s JOIN cajas c ON c.id = s.caja_id
         JOIN usuarios ua ON ua.id = s.abierta_por_id JOIN usuarios uc ON uc.id = s.cerrada_por_id
         WHERE s.estado = 'CERRADA' AND ${r.sql} ORDER BY s.cerrada_en`,
        r.bindings,
      );
      const filas = rows.map((f) => ({ ...f, esperado: aPesos(f.esperado), contado: aPesos(f.contado), diferencia: aPesos(f.diferencia) }));
      return { filas, totales: { esperado: aPesos(suma(rows, 'esperado')), contado: aPesos(suma(rows, 'contado')), diferencia: aPesos(suma(rows, 'diferencia')) } };
    },
  },

  gastos: {
    grupo: 'Caja',
    titulo: 'Gastos por rubro',
    descripcion: 'En qué se gastó la plata de la caja.',
    usaFechas: true,
    columnas: [
      { clave: 'rubro', titulo: 'Rubro', tipo: 'texto' },
      { clave: 'cantidad', titulo: 'Gastos', tipo: 'entero' },
      { clave: 'total', titulo: 'Total', tipo: 'pesos' },
    ],
    async ejecutar(p) {
      const r = enRango('m.creado_en', p);
      const { rows } = await db.raw(
        `SELECT g.nombre AS rubro, COUNT(*)::int AS cantidad, -SUM(m.importe) AS total
         FROM caja_movimientos m JOIN categorias_gasto g ON g.id = m.categoria_gasto_id
         WHERE m.tipo = 'GASTO' AND ${r.sql} GROUP BY g.id, g.nombre ORDER BY total DESC`,
        r.bindings,
      );
      return {
        filas: rows.map((f) => ({ ...f, total: aPesos(f.total) })),
        totales: { cantidad: rows.reduce((a, f) => a + f.cantidad, 0), total: aPesos(suma(rows, 'total')) },
      };
    },
  },
};
