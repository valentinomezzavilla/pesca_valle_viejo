import { aPesos, dec } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as caja from '../caja/caja.service.js';
import { estadoDeuda } from './deuda.service.js';

const ANULABLES = ['PAGO', 'NOTA_CREDITO'];

/**
 * Todo lo del proveedor para la pantalla: saldo, vencimientos, compras sin pagar, productos y movimientos.
 * Saldo > 0 = le debemos; < 0 = le pagamos de más.
 */
export async function ficha(id, limite = 200) {
  const proveedor = await db('proveedores').where({ id }).first();
  if (!proveedor) throw new ErrorNoEncontrado('El proveedor');
  const acumulados = db('cc_proveedores_movimientos as m')
    .join('usuarios as u', 'u.id', 'm.usuario_id')
    .where('m.proveedor_id', id)
    .select(
      'm.id', 'm.tipo', 'm.importe', 'm.compra_id', 'm.medio_pago', 'm.referencia', 'm.fecha', 'm.descripcion', 'm.creado_en',
      'm.anula_movimiento_id', 'm.cheque_numero', 'm.cheque_banco', 'm.cheque_fecha_cobro',
      'u.nombre as usuario_nombre',
      db.raw('SUM(m.importe) OVER (ORDER BY m.id) AS saldo_acumulado'),
      db.raw('EXISTS (SELECT 1 FROM cc_proveedores_movimientos a WHERE a.anula_movimiento_id = m.id) AS anulado'),
      db.raw('(SELECT c.estado FROM compras c WHERE c.id = m.compra_id) AS compra_estado'),
    )
    .as('x');
  const [movimientos, estado, productos] = await Promise.all([
    db.select('*').from(acumulados).orderBy('id', 'desc').limit(limite),
    estadoDeuda(proveedor),
    db
      .select('producto_id', 'producto', 'unidad', 'costo_unitario', 'fecha', 'costo_anterior')
      .from(
        db('compra_items as ci')
          .join('compras as c', 'c.id', 'ci.compra_id')
          .join('productos as p', 'p.id', 'ci.producto_id')
          .where({ 'c.proveedor_id': id, 'c.estado': 'CONFIRMADA' })
          .select(
            'ci.producto_id', 'p.nombre as producto', 'p.unidad', 'ci.costo_unitario', 'c.fecha',
            db.raw('LAG(ci.costo_unitario) OVER (PARTITION BY ci.producto_id ORDER BY c.fecha, c.id, ci.id) AS costo_anterior'),
            db.raw('ROW_NUMBER() OVER (PARTITION BY ci.producto_id ORDER BY c.fecha DESC, c.id DESC, ci.id DESC) AS n'),
          )
          .as('y'),
      )
      .where('n', 1)
      .orderBy('producto'),
  ]);
  return {
    proveedor,
    saldo: estado.saldo,
    vencido: estado.vencido,
    proximo_vencimiento: estado.proximo_vencimiento,
    compras_pendientes: estado.compras.filter((c) => c.estado !== 'PAGADA'),
    productos,
    movimientos: movimientos.map((m) => ({
      ...m,
      // El pago de contado de una compra se anula recién cuando se anuló la compra
      se_puede_anular: ANULABLES.includes(m.tipo) && !m.anulado && !(m.tipo === 'PAGO' && m.compra_id && m.compra_estado !== 'ANULADA'),
    })),
  };
}

/**
 * Pago a un proveedor. Si sale de la caja, queda como egreso en el turno abierto.
 * Se puede pagar más de lo que se debe (adelanto): el saldo queda a favor nuestro.
 */
export async function registrarPago(ctx, proveedorId, datos) {
  return db.transaction(async (trx) => {
    const proveedor = await trx('proveedores').where({ id: proveedorId }).first();
    if (!proveedor) throw new ErrorNoEncontrado('El proveedor');

    let cajaMov = null;
    if (datos.medio_pago === 'EFECTIVO_CAJA') {
      const sesion = await caja.sesionAbiertaParaOperar(trx, datos.caja_id);
      cajaMov = await caja.registrarMovimiento(trx, {
        sesionId: sesion.id,
        tipo: 'PAGO_PROVEEDOR',
        medio: 'EFECTIVO',
        importe: dec(datos.importe).neg(),
        descripcion: `Pago a ${proveedor.nombre}`,
        usuarioId: ctx.usuario.id,
      });
    }
    const [mov] = await trx('cc_proveedores_movimientos')
      .insert({
        proveedor_id: proveedorId,
        tipo: 'PAGO',
        importe: aPesos(dec(datos.importe).neg()),
        medio_pago: datos.medio_pago,
        caja_movimiento_id: cajaMov?.id ?? null,
        referencia: datos.referencia ?? null,
        ...(datos.fecha ? { fecha: datos.fecha } : {}),
        descripcion: datos.descripcion ?? null,
        ...(datos.medio_pago === 'CHEQUE'
          ? { cheque_numero: datos.cheque_numero ?? null, cheque_banco: datos.cheque_banco ?? null, cheque_fecha_cobro: datos.cheque_fecha_cobro }
          : {}),
        usuario_id: ctx.usuario.id,
      })
      .returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: 'PROVEEDOR_PAGO',
      entidad: 'proveedor',
      entidadId: proveedorId,
      despues: { importe: datos.importe, medio_pago: datos.medio_pago, referencia: datos.referencia ?? null, cheque_fecha_cobro: datos.cheque_fecha_cobro ?? null },
    });
    return mov;
  });
}

/** Nota de crédito: el proveedor nos baja la deuda (devolución, descuento, error en el remito). No mueve stock. */
export async function registrarNotaCredito(ctx, proveedorId, datos) {
  return db.transaction(async (trx) => {
    const proveedor = await trx('proveedores').where({ id: proveedorId }).first('id');
    if (!proveedor) throw new ErrorNoEncontrado('El proveedor');
    const [mov] = await trx('cc_proveedores_movimientos')
      .insert({
        proveedor_id: proveedorId,
        tipo: 'NOTA_CREDITO',
        importe: aPesos(dec(datos.importe).neg()),
        referencia: datos.referencia ?? null,
        ...(datos.fecha ? { fecha: datos.fecha } : {}),
        descripcion: datos.descripcion,
        usuario_id: ctx.usuario.id,
      })
      .returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: 'PROVEEDOR_NOTA_CREDITO',
      entidad: 'proveedor',
      entidadId: proveedorId,
      despues: { importe: datos.importe, descripcion: datos.descripcion },
    });
    return mov;
  });
}

/**
 * Anula un pago o una nota de crédito cargados por error. No se borra nada: se agrega el movimiento contrario.
 * Si el pago salió de la caja, la plata vuelve al turno original si sigue abierto; si no, a la caja que se indique.
 */
export async function anularMovimiento(ctx, proveedorId, movimientoId, { motivo, caja_id }) {
  return db.transaction(async (trx) => {
    const proveedor = await trx('proveedores').where({ id: proveedorId }).forUpdate().first('id', 'nombre');
    if (!proveedor) throw new ErrorNoEncontrado('El proveedor');
    const mov = await trx('cc_proveedores_movimientos').where({ id: movimientoId, proveedor_id: proveedorId }).first();
    if (!mov) throw new ErrorNoEncontrado('El movimiento');
    if (!ANULABLES.includes(mov.tipo)) throw new ErrorNegocio('Este movimiento no se puede anular.', 'NO_ANULABLE');
    if (mov.tipo === 'PAGO' && mov.compra_id) {
      const compra = await trx('compras').where({ id: mov.compra_id }).first('estado');
      if (compra.estado !== 'ANULADA') {
        throw new ErrorNegocio(`Primero anulá el ingreso de mercadería #${mov.compra_id}; después vas a poder anular este pago.`, 'PAGO_DE_COMPRA');
      }
    }
    if (await trx('cc_proveedores_movimientos').where({ anula_movimiento_id: mov.id }).first('id')) {
      throw new ErrorNegocio('Este movimiento ya estaba anulado.', 'YA_ANULADO');
    }

    let cajaMovimientoId = null;
    if (mov.medio_pago === 'EFECTIVO_CAJA') {
      const original = await trx('caja_movimientos').where({ id: mov.caja_movimiento_id }).first('caja_sesion_id');
      let sesion = await trx('caja_sesiones').where({ id: original.caja_sesion_id, estado: 'ABIERTA' }).forShare().first();
      if (!sesion) {
        if (!caja_id) throw new ErrorNegocio('El turno de caja de ese pago ya cerró. Elegí a qué caja abierta vuelve la plata.', 'ELEGIR_CAJA', 400);
        sesion = await caja.sesionAbiertaParaOperar(trx, caja_id);
      }
      const cm = await caja.registrarMovimiento(trx, {
        sesionId: sesion.id,
        tipo: 'ANULACION_PAGO_PROVEEDOR',
        medio: 'EFECTIVO',
        importe: dec(mov.importe).neg(),
        descripcion: `Pago a ${proveedor.nombre} anulado: ${motivo}`,
        usuarioId: ctx.usuario.id,
      });
      cajaMovimientoId = cm.id;
    }

    const [anulacion] = await trx('cc_proveedores_movimientos')
      .insert({
        proveedor_id: proveedorId,
        tipo: mov.tipo === 'PAGO' ? 'ANULACION_PAGO' : 'ANULACION_NOTA_CREDITO',
        importe: aPesos(dec(mov.importe).neg()),
        anula_movimiento_id: mov.id,
        caja_movimiento_id: cajaMovimientoId,
        referencia: mov.referencia,
        descripcion: `Anulación: ${motivo}`,
        usuario_id: ctx.usuario.id,
      })
      .returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: mov.tipo === 'PAGO' ? 'PROVEEDOR_PAGO_ANULADO' : 'PROVEEDOR_NOTA_CREDITO_ANULADA',
      entidad: 'proveedor',
      entidadId: proveedorId,
      motivo,
      antes: { movimiento_id: mov.id, tipo: mov.tipo, importe: mov.importe, medio_pago: mov.medio_pago },
    });
    return anulacion;
  });
}
