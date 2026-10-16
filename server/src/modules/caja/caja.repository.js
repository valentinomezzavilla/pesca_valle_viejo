export function listarCajas(trx) {
  return trx('cajas as c')
    .leftJoin('caja_sesiones as s', function unir() {
      this.on('s.caja_id', 'c.id').andOnVal('s.estado', 'ABIERTA');
    })
    .leftJoin('usuarios as u', 'u.id', 's.abierta_por_id')
    .select('c.*', 's.id as sesion_id', 's.abierta_en', 'u.nombre as abierta_por')
    .orderBy('c.id');
}

export function sesionAbiertaDeCaja(trx, cajaId) {
  return trx('caja_sesiones').where({ caja_id: cajaId, estado: 'ABIERTA' }).first();
}

export function buscarSesion(trx, id) {
  return trx('caja_sesiones as s')
    .join('cajas as c', 'c.id', 's.caja_id')
    .join('usuarios as ua', 'ua.id', 's.abierta_por_id')
    .leftJoin('usuarios as uc', 'uc.id', 's.cerrada_por_id')
    .select('s.*', 'c.nombre as caja', 'ua.nombre as abierta_por', 'uc.nombre as cerrada_por')
    .where('s.id', id)
    .first();
}

export async function insertarSesion(trx, datos) {
  const [fila] = await trx('caja_sesiones').insert(datos).returning('*');
  return fila;
}

export async function insertarMovimiento(trx, datos) {
  const [fila] = await trx('caja_movimientos').insert(datos).returning('*');
  return fila;
}

export function totalesPorMedio(trx, sesionId) {
  return trx('caja_movimientos').where('caja_sesion_id', sesionId).select('medio').sum('importe as total').groupBy('medio');
}

export function totalesPorTipo(trx, sesionId) {
  return trx('caja_movimientos')
    .where('caja_sesion_id', sesionId)
    .select('tipo', 'medio')
    .sum('importe as total')
    .count('* as cantidad')
    .groupBy('tipo', 'medio')
    .orderBy(['tipo', 'medio']);
}

export async function efectivoEnCaja(trx, sesionId) {
  const fila = await trx('caja_movimientos').where({ caja_sesion_id: sesionId, medio: 'EFECTIVO' }).sum('importe as total').first();
  return fila?.total ?? '0';
}

export function movimientos(trx, sesionId) {
  return trx('caja_movimientos as m')
    .join('usuarios as u', 'u.id', 'm.usuario_id')
    .leftJoin('categorias_gasto as g', 'g.id', 'm.categoria_gasto_id')
    .where('m.caja_sesion_id', sesionId)
    .select('m.*', 'u.nombre as usuario_nombre', 'g.nombre as categoria_gasto')
    .orderBy('m.id', 'desc');
}

export async function resumenVentas(trx, sesionId) {
  return trx('ventas')
    .where('caja_sesion_id', sesionId)
    .select(
      trx.raw("COUNT(*) FILTER (WHERE estado = 'CONFIRMADA') AS cantidad"),
      trx.raw("COALESCE(SUM(total) FILTER (WHERE estado = 'CONFIRMADA'), 0) AS total"),
      trx.raw("COUNT(*) FILTER (WHERE estado = 'ANULADA') AS anuladas"),
      trx.raw(
        `COALESCE((SELECT SUM(vp.monto) FROM venta_pagos vp JOIN ventas v2 ON v2.id = vp.venta_id
                   WHERE v2.caja_sesion_id = ? AND v2.estado = 'CONFIRMADA' AND vp.medio = 'CUENTA_CORRIENTE'), 0) AS fiado`,
        [sesionId],
      ),
    )
    .first();
}

export function listarSesiones(trx, { desde, hasta, pagina, porPagina }, filtroDias) {
  const q = trx('caja_sesiones as s')
    .join('cajas as c', 'c.id', 's.caja_id')
    .join('usuarios as ua', 'ua.id', 's.abierta_por_id')
    .leftJoin('usuarios as uc', 'uc.id', 's.cerrada_por_id')
    .select('s.*', 'c.nombre as caja', 'ua.nombre as abierta_por', 'uc.nombre as cerrada_por')
    .orderBy('s.id', 'desc')
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);
  filtroDias(q, 's.abierta_en', { desde, hasta });
  return q;
}
