import { aPesos, dec, MEDIOS_PAGO } from '@pescaderia/shared';
import { db } from '../../config/db.js';
import { ErrorNegocio, ErrorNoEncontrado } from '../../lib/errores.js';
import { filtroDias } from '../../lib/fechas.js';
import * as auditoria from '../auditoria/auditoria.service.js';
import * as auth from '../auth/auth.service.js';
import * as repo from './caja.repository.js';

// ---------- Cajas y rubros ----------
export const listarCajas = () => repo.listarCajas(db);

export async function crearCaja(ctx, datos) {
  return db.transaction(async (trx) => {
    const [fila] = await trx('cajas').insert(datos).returning('*');
    await auditoria.registrar(trx, ctx, { accion: 'CAJA_CREADA', entidad: 'caja', entidadId: fila.id, despues: fila });
    return fila;
  });
}

export async function actualizarCaja(ctx, id, datos) {
  return db.transaction(async (trx) => {
    if (datos.activa === false && (await repo.sesionAbiertaDeCaja(trx, id))) {
      throw new ErrorNegocio('Cerrá la caja antes de desactivarla.');
    }
    const [fila] = await trx('cajas').where({ id }).update(datos).returning('*');
    if (!fila) throw new ErrorNoEncontrado('La caja');
    await auditoria.registrar(trx, ctx, { accion: 'CAJA_MODIFICADA', entidad: 'caja', entidadId: id, despues: fila });
    return fila;
  });
}

export const listarCategoriasGasto = () => db('categorias_gasto').select('*').orderBy('nombre');

export async function guardarCategoriaGasto(id, datos) {
  if (id) {
    const [fila] = await db('categorias_gasto').where({ id }).update(datos).returning('*');
    if (!fila) throw new ErrorNoEncontrado('El rubro');
    return fila;
  }
  const [fila] = await db('categorias_gasto').insert(datos).returning('*');
  return fila;
}

// ---------- Sesiones ----------

/** Turno abierto de una caja, bloqueado para la transacción. Lo usan ventas y compras. */
export async function sesionAbiertaParaOperar(trx, cajaId) {
  const sesion = await trx('caja_sesiones').where({ caja_id: cajaId, estado: 'ABIERTA' }).forShare().first();
  if (!sesion) throw new ErrorNegocio('La caja está cerrada. Abrila para poder operar.', 'CAJA_CERRADA');
  return sesion;
}

/** Registra un movimiento validando que no quede efectivo negativo cuando sale plata. */
export async function registrarMovimiento(trx, { sesionId, tipo, medio, importe, ventaId = null, categoriaGastoId = null, descripcion = null, usuarioId }) {
  const monto = dec(importe);
  if (monto.isZero()) return null;
  if (monto.lt(0) && medio === 'EFECTIVO' && tipo !== 'ANULACION_VENTA') {
    const disponible = dec(await repo.efectivoEnCaja(trx, sesionId));
    if (disponible.plus(monto).lt(0)) {
      throw new ErrorNegocio(`No hay suficiente efectivo en la caja (hay $${aPesos(disponible)}).`, 'EFECTIVO_INSUFICIENTE');
    }
  }
  return repo.insertarMovimiento(trx, {
    caja_sesion_id: sesionId,
    tipo,
    medio,
    importe: aPesos(monto),
    venta_id: ventaId,
    categoria_gasto_id: categoriaGastoId,
    descripcion,
    usuario_id: usuarioId,
  });
}

export async function abrir(ctx, cajaId, { monto_inicial }) {
  return db.transaction(async (trx) => {
    const caja = await trx('cajas').where({ id: cajaId }).first();
    if (!caja || !caja.activa) throw new ErrorNoEncontrado('La caja');
    if (await repo.sesionAbiertaDeCaja(trx, cajaId)) throw new ErrorNegocio('Esa caja ya está abierta.', 'CAJA_YA_ABIERTA');
    const sesion = await repo.insertarSesion(trx, { caja_id: cajaId, abierta_por_id: ctx.usuario.id, monto_inicial });
    await registrarMovimiento(trx, { sesionId: sesion.id, tipo: 'APERTURA', medio: 'EFECTIVO', importe: monto_inicial, usuarioId: ctx.usuario.id });
    await auditoria.registrar(trx, ctx, { accion: 'CAJA_ABIERTA', entidad: 'caja_sesion', entidadId: sesion.id, despues: { caja: caja.nombre, monto_inicial } });
    return sesion;
  });
}

async function armarResumen(trx, sesion) {
  // En secuencia: dentro de una transacción todas las consultas comparten una sola conexión
  const porMedio = await repo.totalesPorMedio(trx, sesion.id);
  const porTipo = await repo.totalesPorTipo(trx, sesion.id);
  const ventas = await repo.resumenVentas(trx, sesion.id);
  const totales = Object.fromEntries(MEDIOS_PAGO.map((m) => [m, '0.00']));
  for (const f of porMedio) totales[f.medio] = aPesos(f.total);
  return {
    sesion,
    totales_por_medio: totales,
    efectivo_esperado: totales.EFECTIVO,
    por_tipo: porTipo,
    ventas: { cantidad: Number(ventas.cantidad), total: aPesos(ventas.total), anuladas: Number(ventas.anuladas), fiado: aPesos(ventas.fiado) },
  };
}

export async function actualDeCaja(cajaId) {
  const sesion = await repo.sesionAbiertaDeCaja(db, cajaId);
  if (!sesion) return null;
  const completa = await repo.buscarSesion(db, sesion.id);
  return armarResumen(db, completa);
}

export async function detalleSesion(id) {
  const sesion = await repo.buscarSesion(db, id);
  if (!sesion) throw new ErrorNoEncontrado('El turno de caja');
  const resumen = await armarResumen(db, sesion);
  resumen.movimientos = await repo.movimientos(db, id);
  return resumen;
}

export const movimientos = (sesionId) => repo.movimientos(db, sesionId);

export function listarSesiones(filtros) {
  return repo.listarSesiones(db, filtros, filtroDias);
}

export async function movimientoManual(ctx, sesionId, { tipo, importe, medio, categoria_gasto_id, descripcion, pinAutorizacion }) {
  return db.transaction(async (trx) => {
    const sesion = await trx('caja_sesiones').where({ id: sesionId }).forShare().first();
    if (!sesion) throw new ErrorNoEncontrado('El turno de caja');
    if (sesion.estado !== 'ABIERTA') throw new ErrorNegocio('Ese turno de caja ya está cerrado.', 'CAJA_CERRADA');
    let autorizadoPorId = null;
    if (tipo === 'RETIRO') autorizadoPorId = await auth.autorizar(trx, ctx, 'caja.retiro', pinAutorizacion);
    const signo = tipo === 'INGRESO' ? 1 : -1;
    const mov = await registrarMovimiento(trx, {
      sesionId,
      tipo,
      medio,
      importe: dec(importe).times(signo),
      categoriaGastoId: tipo === 'GASTO' ? categoria_gasto_id : null,
      descripcion,
      usuarioId: ctx.usuario.id,
    });
    if (tipo !== 'INGRESO') {
      await auditoria.registrar(trx, ctx, {
        accion: tipo === 'RETIRO' ? 'CAJA_RETIRO' : 'CAJA_GASTO',
        entidad: 'caja_sesion',
        entidadId: sesionId,
        despues: { importe: mov.importe, medio, descripcion, categoria_gasto_id },
        autorizadoPorId,
      });
    }
    return mov;
  });
}

export async function cerrar(ctx, sesionId, { efectivo_contado, detalle_arqueo, observaciones }) {
  return db.transaction(async (trx) => {
    // FOR UPDATE espera a que terminen las ventas en curso (que toman FOR SHARE) y bloquea nuevas
    const sesion = await trx('caja_sesiones').where({ id: sesionId }).forUpdate().first();
    if (!sesion) throw new ErrorNoEncontrado('El turno de caja');
    if (sesion.estado !== 'ABIERTA') throw new ErrorNegocio('Ese turno de caja ya está cerrado.', 'CAJA_CERRADA');
    const { totales_por_medio, efectivo_esperado } = await armarResumen(trx, sesion);
    const diferencia = dec(efectivo_contado).minus(efectivo_esperado);
    const [cerrada] = await trx('caja_sesiones')
      .where({ id: sesionId })
      .update({
        estado: 'CERRADA',
        cerrada_por_id: ctx.usuario.id,
        cerrada_en: trx.fn.now(),
        efectivo_esperado,
        efectivo_contado,
        diferencia: aPesos(diferencia),
        totales_por_medio: JSON.stringify(totales_por_medio),
        detalle_arqueo: detalle_arqueo ? JSON.stringify(detalle_arqueo) : null,
        observaciones,
      })
      .returning('*');
    await auditoria.registrar(trx, ctx, {
      accion: 'CAJA_CERRADA',
      entidad: 'caja_sesion',
      entidadId: sesionId,
      despues: { efectivo_esperado, efectivo_contado, diferencia: cerrada.diferencia },
      motivo: observaciones,
    });
    return cerrada;
  });
}

export async function resumenCierre(sesionId) {
  const sesion = await repo.buscarSesion(db, sesionId);
  if (!sesion) throw new ErrorNoEncontrado('El turno de caja');
  return armarResumen(db, sesion);
}
