// PDF para mandarle al cliente: el resumen de cuenta de un período y el detalle de lo que debe hoy, ticket por ticket.
import { MEDIOS_PAGO_ETIQUETA, TIPOS_MOV_CC_CLIENTE_ETIQUETA, UNIDADES_ETIQUETA, aPesos, dec } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNoEncontrado } from '../../lib/errores.js';
import { hoy } from '../../lib/fechas.js';
import { slug } from '../../lib/texto.js';
import { MARGEN, crearPdf, encabezadoPdf, tablaPdf, totalPdf } from '../../lib/pdf.js';
import { fechaCorta, formatearCelda } from '../reportes/reportes.exportar.js';
import * as configuracion from '../configuracion/configuracion.service.js';
import { cargarCuentas, imputarCliente } from './deuda.js';

async function clienteONada(id) {
  const cliente = await db('clientes').where({ id }).first();
  if (!cliente) throw new ErrorNoEncontrado('El cliente');
  return cliente;
}

async function estadoAl(cliente, fecha) {
  const { movimientos, ventas } = await cargarCuentas(db, [cliente.id], { hasta: fecha });
  return imputarCliente({ movimientos: movimientos.get(cliente.id) ?? [], ventas: ventas.get(cliente.id) ?? [], plazoDias: cliente.plazo_pago_dias, hoy: fecha });
}

export async function datosResumenCliente(clienteId, { desde, hasta }) {
  const cliente = await clienteONada(clienteId);
  const h = hasta ?? hoy();
  const d = desde ?? `${h.slice(0, 7)}-01`;
  const [anterior, filas, estado] = await Promise.all([
    db('cc_clientes_movimientos').where({ cliente_id: clienteId }).whereRaw('creado_en::date < ?', [d]).sum('importe as total').first(),
    db('cc_clientes_movimientos as m')
      .leftJoin('comprobantes as cp', function unir() {
        this.on('cp.venta_id', 'm.venta_id').andOnVal('cp.tipo', 'TICKET_INTERNO');
      })
      .leftJoin('caja_movimientos as cm', 'cm.id', 'm.caja_movimiento_id')
      .where('m.cliente_id', clienteId)
      .whereRaw('m.creado_en::date BETWEEN ? AND ?', [d, h])
      .orderBy('m.id')
      .select('m.tipo', 'm.importe', 'm.descripcion', 'cm.medio', db.raw('m.creado_en::date AS fecha'), db.raw("lpad(cp.punto_venta::text, 4, '0') || '-' || lpad(cp.numero::text, 8, '0') AS ticket")),
    estadoAl(cliente, h),
  ]);
  let saldo = dec(anterior?.total ?? 0);
  const movimientos = filas.map((m) => {
    saldo = saldo.plus(m.importe);
    const extra = [m.ticket && `Ticket ${m.ticket}`, m.medio && MEDIOS_PAGO_ETIQUETA[m.medio], m.descripcion].filter(Boolean).join(' · ');
    return {
      fecha: m.fecha,
      detalle: `${TIPOS_MOV_CC_CLIENTE_ETIQUETA[m.tipo] ?? m.tipo}${extra ? ` — ${extra}` : ''}`,
      importe: aPesos(m.importe),
      saldo: aPesos(saldo),
    };
  });
  return {
    cliente,
    desde: d,
    hasta: h,
    saldo_anterior: aPesos(anterior?.total ?? 0),
    movimientos,
    saldo_final: aPesos(saldo),
    compras_pendientes: estado.deudas.filter((x) => x.estado !== 'PAGADA'),
  };
}

/** Lo que debe hoy, compra por compra, con los productos de cada ticket. */
export async function datosDetalleDeuda(clienteId) {
  const cliente = await clienteONada(clienteId);
  const fecha = hoy();
  const estado = await estadoAl(cliente, fecha);
  const pendientes = estado.deudas.filter((x) => x.estado !== 'PAGADA');
  const ventaIds = pendientes.filter((x) => x.venta_id).map((x) => x.venta_id);
  const items = ventaIds.length
    ? await db('venta_items').whereIn('venta_id', ventaIds).orderBy('id').select('venta_id', 'descripcion', 'unidad', 'cantidad', 'precio_unitario', 'total')
    : [];
  return {
    cliente,
    fecha,
    total: aPesos(pendientes.reduce((a, x) => a.plus(x.pendiente), dec(0))),
    vencido: estado.vencido,
    compras: pendientes.map((x) => ({
      ...x,
      items: items.filter((i) => i.venta_id === x.venta_id).map(({ venta_id, ...i }) => i),
    })),
  };
}

async function negocio() {
  const config = await configuracion.obtenerTodo();
  return config.negocio?.nombre || 'Pescadería';
}

const datosCliente = (c) => `Cliente: ${c.nombre}${c.documento ? ` · Doc. ${c.documento}` : ''}`;

export async function resumenPdf(clienteId, filtros) {
  const datos = await datosResumenCliente(clienteId, filtros);
  const autor = await negocio();
  const c = datos.cliente;
  const buffer = await crearPdf({ titulo: `Resumen de cuenta — ${c.nombre}`, autor }, (doc) => {
    let y = encabezadoPdf(doc, 'Resumen de cuenta', [autor, datosCliente(c), `Del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}`]);
    y = tablaPdf(doc, y, [
      { titulo: 'Fecha', ancho: 0.14 },
      { titulo: 'Detalle', ancho: 0.5 },
      { titulo: 'Importe', ancho: 0.18, derecha: true },
      { titulo: 'Saldo', ancho: 0.18, derecha: true },
    ], [
      ['', 'Saldo anterior', '', formatearCelda(datos.saldo_anterior, 'pesos')],
      ...datos.movimientos.map((m) => [fechaCorta(m.fecha), m.detalle, formatearCelda(m.importe, 'pesos'), formatearCelda(m.saldo, 'pesos')]),
    ]);
    totalPdf(doc, y, `Saldo al ${fechaCorta(datos.hasta)}: ${formatearCelda(datos.saldo_final, 'pesos')}`);
    if (datos.compras_pendientes.length) {
      doc.font('Helvetica-Bold').fontSize(12).text(`Compras sin pagar al ${fechaCorta(datos.hasta)}`, MARGEN, doc.y + 16);
      tablaPdf(doc, doc.y + 6, [
        { titulo: 'Fecha', ancho: 0.16 },
        { titulo: 'Compra', ancho: 0.36 },
        { titulo: 'Vence', ancho: 0.16 },
        { titulo: 'Falta pagar', ancho: 0.32, derecha: true },
      ], datos.compras_pendientes.map((x) => [
        fechaCorta(x.fecha),
        x.ticket ? `Ticket ${x.ticket}` : x.descripcion || 'Deuda cargada a mano',
        fechaCorta(x.vence),
        formatearCelda(x.pendiente, 'pesos'),
      ]));
    }
  });
  return { buffer, nombre: `resumen-${slug(c.nombre) || clienteId}-${datos.hasta}.pdf` };
}

export async function detalleDeudaPdf(clienteId) {
  const datos = await datosDetalleDeuda(clienteId);
  const autor = await negocio();
  const c = datos.cliente;
  const buffer = await crearPdf({ titulo: `Detalle de deuda — ${c.nombre}`, autor }, (doc) => {
    let y = encabezadoPdf(doc, 'Detalle de deuda', [autor, datosCliente(c), `Al ${fechaCorta(datos.fecha)}`]);
    const filas = datos.compras.flatMap((x) => [
      {
        destacada: true,
        celdas: [
          `${x.ticket ? `Ticket ${x.ticket}` : x.descripcion || 'Deuda cargada a mano'} · ${fechaCorta(x.fecha)} · vence ${fechaCorta(x.vence)}`,
          '',
          '',
          `Falta ${formatearCelda(x.pendiente, 'pesos')}`,
        ],
      },
      ...x.items.map((i) => [
        i.descripcion,
        `${formatearCelda(i.cantidad, 'cantidad')} ${UNIDADES_ETIQUETA[i.unidad] ?? ''}`,
        formatearCelda(i.precio_unitario, 'pesos'),
        formatearCelda(i.total, 'pesos'),
      ]),
    ]);
    y = tablaPdf(doc, y, [
      { titulo: 'Producto', ancho: 0.46 },
      { titulo: 'Cantidad', ancho: 0.16, derecha: true },
      { titulo: 'Precio', ancho: 0.19, derecha: true },
      { titulo: 'Total', ancho: 0.19, derecha: true },
    ], filas.length ? filas : [['No debe nada.', '', '', '']]);
    y = totalPdf(doc, y, `Total adeudado: ${formatearCelda(datos.total, 'pesos')}`);
    if (dec(datos.vencido).gt(0)) doc.font('Helvetica').fontSize(10).fillColor('#a11').text(`De eso, ya vencido: ${formatearCelda(datos.vencido, 'pesos')}`, MARGEN, y + 4);
  });
  return { buffer, nombre: `deuda-${slug(c.nombre) || clienteId}-${datos.fecha}.pdf` };
}
