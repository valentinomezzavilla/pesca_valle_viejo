import { aPesos, dec } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as auth from '../auth/auth.service.js';
import * as caja from '../caja/caja.service.js';
import { estadoDeudaCliente, estadoDeudasClientes } from './deuda.js';

/** Saldo de la cuenta: > 0 = el cliente nos debe; < 0 = tiene plata a favor. */
export async function saldoDe(trx, clienteId) {
  const fila = await trx('cc_clientes_movimientos').where({ cliente_id: clienteId }).sum('importe as saldo').first();
  return dec(fila?.saldo ?? 0);
}

/** Cliente activo con la fila bloqueada: serializa los fiados / cobros del mismo cliente. */
export async function bloquearCliente(trx, clienteId) {
  const cliente = await trx('clientes').where({ id: clienteId }).forUpdate().first();
  if (!cliente || !cliente.activo) throw new ErrorNoEncontrado('El cliente');
  return cliente;
}

export async function listar({ q, activo = 'true', con_deuda }) {
  const query = db('clientes as c')
    .leftJoin('v_saldos_clientes as s', 's.id', 'c.id')
    .select('c.*', 's.saldo', 's.ultimo_movimiento')
    .orderBy('c.nombre');
  if (activo !== 'todos') query.where('c.activo', activo === 'true');
  if (q) query.where((w) => w.whereILike('c.nombre', `%${q}%`).orWhereILike('c.telefono', `%${q}%`).orWhereILike('c.documento', `%${q}%`));
  if (con_deuda === 'true') query.where('s.saldo', '>', 0);
  const lista = await query.limit(500);
  // Lo vencido solo se calcula para los que deben
  const estados = await estadoDeudasClientes(db, lista.filter((c) => dec(c.saldo ?? 0).gt(0)));
  return lista.map((c) => ({ ...c, vencido: estados.get(c.id)?.vencido ?? '0.00' }));
}

export async function obtener(id) {
  const cliente = await db('clientes as c').leftJoin('v_saldos_clientes as s', 's.id', 'c.id').select('c.*', 's.saldo').where('c.id', id).first();
  if (!cliente) throw new ErrorNoEncontrado('El cliente');
  return cliente;
}

const MENSAJE_PIN_CUENTA = 'Abrir o cambiar la cuenta corriente (límite o plazo) necesita el PIN del dueño.';
const limiteNormalizado = (v) => (v === null || v === undefined || v === '' ? null : aPesos(v));

/** ¿Estos datos tocan la cuenta corriente respecto de como está el cliente? (sin cliente = alta) */
function cambiaLaCuenta(datos, antes = null) {
  if (!antes) return datos.cuenta_corriente === true || limiteNormalizado(datos.limite_credito) !== null || Number(datos.plazo_pago_dias ?? 0) > 0;
  return (
    (datos.cuenta_corriente !== undefined && datos.cuenta_corriente !== antes.cuenta_corriente) ||
    (datos.limite_credito !== undefined && limiteNormalizado(datos.limite_credito) !== limiteNormalizado(antes.limite_credito)) ||
    (datos.plazo_pago_dias !== undefined && Number(datos.plazo_pago_dias) !== Number(antes.plazo_pago_dias))
  );
}

export async function crear(ctx, { pinAutorizacion, ...datos }) {
  return db.transaction(async (trx) => {
    const autorizadoPorId = cambiaLaCuenta(datos) ? await auth.autorizar(trx, ctx, 'clientes.administrar_cuenta', pinAutorizacion, MENSAJE_PIN_CUENTA) : null;
    const [cliente] = await trx('clientes').insert(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'CLIENTE_CREADO', entidad: 'cliente', entidadId: cliente.id, despues: cliente, autorizadoPorId });
    return { ...cliente, saldo: '0.00' };
  });
}

export async function actualizar(ctx, id, { pinAutorizacion, ...datos }) {
  return db.transaction(async (trx) => {
    const antes = await trx('clientes').where({ id }).forUpdate().first();
    if (!antes) throw new ErrorNoEncontrado('El cliente');
    const autorizadoPorId = cambiaLaCuenta(datos, antes) ? await auth.autorizar(trx, ctx, 'clientes.administrar_cuenta', pinAutorizacion, MENSAJE_PIN_CUENTA) : null;
    if (datos.activo === false && (await saldoDe(trx, id)).gt(0)) {
      throw new ErrorNegocio('Este cliente todavía tiene deuda. Cobrale o ajustá la cuenta antes de darlo de baja.', 'CLIENTE_CON_DEUDA');
    }
    const [cliente] = await trx('clientes').where({ id }).update(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'CLIENTE_MODIFICADO', entidad: 'cliente', entidadId: id, antes, despues: cliente, autorizadoPorId });
    return cliente;
  });
}

/**
 * Todo lo del cliente para su pantalla: saldo, vencido, próximo vencimiento, compras sin pagar y movimientos
 * (de lo más nuevo a lo más viejo, con saldo acumulado).
 */
export async function ficha(id, limite = 200) {
  const cliente = await obtener(id);
  const acumulados = db('cc_clientes_movimientos as m')
    .join('usuarios as u', 'u.id', 'm.usuario_id')
    .leftJoin('comprobantes as cp', function unir() {
      this.on('cp.venta_id', 'm.venta_id').andOnVal('cp.tipo', 'TICKET_INTERNO');
    })
    .leftJoin('caja_movimientos as cm', 'cm.id', 'm.caja_movimiento_id')
    .where('m.cliente_id', id)
    .select(
      'm.id', 'm.tipo', 'm.importe', 'm.venta_id', 'm.descripcion', 'm.creado_en', 'm.anula_movimiento_id',
      'u.nombre as usuario_nombre', 'cp.punto_venta', 'cp.numero', 'cm.medio as medio_cobro',
      db.raw('SUM(m.importe) OVER (ORDER BY m.id) AS saldo_acumulado'),
      db.raw('EXISTS (SELECT 1 FROM cc_clientes_movimientos a WHERE a.anula_movimiento_id = m.id) AS anulado'),
    )
    .as('x');
  const [movimientos, estado] = await Promise.all([
    db.select('*').from(acumulados).orderBy('id', 'desc').limit(limite),
    estadoDeudaCliente(cliente),
  ]);
  return {
    cliente,
    saldo: aPesos(cliente.saldo ?? 0),
    vencido: estado.vencido,
    proximo_vencimiento: estado.proximo_vencimiento,
    compras_pendientes: estado.deudas.filter((d) => d.estado !== 'PAGADA'),
    movimientos: movimientos.map((m) => ({ ...m, se_puede_anular: m.tipo === 'PAGO' && !m.anulado })),
  };
}

/**
 * El cliente paga (parte de) lo que debe. La plata entra a la caja abierta, por el medio con que pagó.
 * No se cobra más de lo que debe: si hay un error de tipeo, que se note.
 */
export async function registrarCobro(ctx, id, { importe, medio, caja_id, descripcion }) {
  return db.transaction(async (trx) => {
    const cliente = await bloquearCliente(trx, id);
    const saldo = await saldoDe(trx, id);
    if (saldo.lte(0)) throw new ErrorNegocio(`${cliente.nombre} no tiene deuda.`, 'SIN_DEUDA');
    if (dec(importe).gt(saldo)) {
      throw new ErrorNegocio(`${cliente.nombre} debe $${aPesos(saldo)}: no se puede cobrar más que eso.`, 'COBRO_EXCEDE_DEUDA');
    }
    const sesion = await caja.sesionAbiertaParaOperar(trx, caja_id);
    const cajaMov = await caja.registrarMovimiento(trx, {
      sesionId: sesion.id,
      tipo: 'COBRO_CLIENTE',
      medio,
      importe: dec(importe),
      descripcion: descripcion ?? `Cobro a ${cliente.nombre}`,
      usuarioId: ctx.usuario.id,
    });
    const [mov] = await trx('cc_clientes_movimientos')
      .insert({
        cliente_id: id,
        tipo: 'PAGO',
        importe: aPesos(dec(importe).neg()),
        caja_movimiento_id: cajaMov.id,
        descripcion: descripcion ?? null,
        usuario_id: ctx.usuario.id,
      })
      .returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: 'CLIENTE_COBRO',
      entidad: 'cliente',
      entidadId: id,
      despues: { importe: aPesos(importe), medio, saldo_nuevo: aPesos(saldo.minus(importe)) },
    });
    return { movimiento: mov, saldo: aPesos(saldo.minus(importe)) };
  });
}

/** Corrección manual de la cuenta (perdonar una deuda, cargar una deuda vieja). Solo el dueño. */
export async function ajustar(ctx, id, { importe, sentido, motivo }) {
  return db.transaction(async (trx) => {
    const cliente = await bloquearCliente(trx, id);
    const saldo = await saldoDe(trx, id);
    const firmado = sentido === 'BAJAR' ? dec(importe).neg() : dec(importe);
    const [mov] = await trx('cc_clientes_movimientos')
      .insert({ cliente_id: id, tipo: 'AJUSTE', importe: aPesos(firmado), descripcion: motivo, usuario_id: ctx.usuario.id })
      .returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: 'CLIENTE_AJUSTE',
      entidad: 'cliente',
      entidadId: id,
      antes: { saldo: aPesos(saldo) },
      despues: { saldo: aPesos(saldo.plus(firmado)), cliente: cliente.nombre },
      motivo,
    });
    return { movimiento: mov, saldo: aPesos(saldo.plus(firmado)) };
  });
}

/**
 * Anula un cobro cargado por error: la plata sale de la caja (por el mismo medio) y la deuda vuelve.
 * Sale del turno del cobro si sigue abierto; si no, de la caja que se indique. Dueño, o cajero con PIN.
 */
export async function anularCobro(ctx, clienteId, movimientoId, { motivo, caja_id, pinAutorizacion }) {
  return db.transaction(async (trx) => {
    // Sin exigir que esté activo: a un cliente dado de baja también se le puede corregir un cobro
    const cliente = await trx('clientes').where({ id: clienteId }).forUpdate().first('id', 'nombre');
    if (!cliente) throw new ErrorNoEncontrado('El cliente');
    const mov = await trx('cc_clientes_movimientos').where({ id: movimientoId, cliente_id: clienteId }).first();
    if (!mov) throw new ErrorNoEncontrado('El movimiento');
    if (mov.tipo !== 'PAGO') throw new ErrorNegocio('Desde acá solo se anulan cobros. Una venta se anula desde Ventas.', 'NO_ANULABLE');
    if (await trx('cc_clientes_movimientos').where({ anula_movimiento_id: mov.id }).first('id')) {
      throw new ErrorNegocio('Este cobro ya estaba anulado.', 'YA_ANULADO');
    }

    // Primero la caja y después el PIN: así, si el turno cerró, el cajero no tiene que poner el PIN dos veces
    const original = await trx('caja_movimientos').where({ id: mov.caja_movimiento_id }).first('caja_sesion_id', 'medio');
    let sesion = await trx('caja_sesiones').where({ id: original.caja_sesion_id, estado: 'ABIERTA' }).forShare().first();
    if (!sesion) {
      if (!caja_id) throw new ErrorNegocio('El turno de caja de ese cobro ya cerró. Elegí de qué caja abierta sale la plata.', 'ELEGIR_CAJA', 400);
      sesion = await caja.sesionAbiertaParaOperar(trx, caja_id);
    }
    const autorizadoPorId = await auth.autorizar(trx, ctx, 'clientes.administrar_cuenta', pinAutorizacion, 'Anular un cobro necesita el PIN del dueño.');
    const cajaMov = await caja.registrarMovimiento(trx, {
      sesionId: sesion.id,
      tipo: 'ANULACION_COBRO_CLIENTE',
      medio: original.medio,
      importe: dec(mov.importe), // el cobro fue negativo en la cuenta: sale esa plata de la caja
      descripcion: `Cobro a ${cliente.nombre} anulado: ${motivo}`,
      usuarioId: ctx.usuario.id,
    });
    const [anulacion] = await trx('cc_clientes_movimientos')
      .insert({
        cliente_id: clienteId,
        tipo: 'ANULACION_PAGO',
        importe: aPesos(dec(mov.importe).neg()),
        anula_movimiento_id: mov.id,
        caja_movimiento_id: cajaMov.id,
        descripcion: `Anulación: ${motivo}`,
        usuario_id: ctx.usuario.id,
      })
      .returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: 'CLIENTE_COBRO_ANULADO',
      entidad: 'cliente',
      entidadId: clienteId,
      motivo,
      autorizadoPorId,
      antes: { movimiento_id: mov.id, importe: mov.importe, medio: original.medio },
    });
    return anulacion;
  });
}
