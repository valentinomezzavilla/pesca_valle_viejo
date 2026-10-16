import { aPesos, dec } from '@pescaderia/shared';
import { imputarDeudas } from '../../lib/imputacion.js';

const ANULACIONES = new Set(['ANULACION_PAGO', 'ANULACION_NOTA_CREDITO']);
const DE_COMPRA = new Set(['COMPRA', 'ANULACION_COMPRA']);

/**
 * Qué compras de un proveedor están pagadas, a medias o vencidas.
 * Regla: el pago de contado (PAGO con compra_id) va a su compra; todo lo demás que baja la deuda
 * (pagos, notas de crédito) se aplica a las compras de la más vieja a la más nueva.
 * Las compras anuladas y los movimientos anulados (con su anulación) no cuentan.
 */
export function imputar({ movimientos, compras, plazoDias = 0, hoy }) {
  const anulados = new Set(movimientos.filter((m) => ANULACIONES.has(m.tipo)).map((m) => Number(m.anula_movimiento_id)));
  const vigentes = movimientos.filter((m) => !ANULACIONES.has(m.tipo) && !anulados.has(Number(m.id)));
  const confirmadas = new Map(compras.filter((c) => c.estado === 'CONFIRMADA').map((c) => [Number(c.id), c]));

  // Lo que se debe por cada compra confirmada
  const debe = new Map();
  for (const m of vigentes) {
    if (m.tipo === 'COMPRA' && confirmadas.has(Number(m.compra_id))) {
      debe.set(Number(m.compra_id), (debe.get(Number(m.compra_id)) ?? dec(0)).plus(m.importe));
    }
  }
  const deudas = [...confirmadas.values()].map((c) => ({
    clave: Number(c.id),
    orden: Number(c.id),
    fecha: c.fecha,
    importe: debe.get(Number(c.id)) ?? dec(0),
    compra_id: Number(c.id),
    tipo_documento: c.tipo_documento,
    numero_documento: c.numero_documento ?? null,
  }));
  // El pago de contado va primero a su compra; el resto de los créditos, al pozo común
  const creditos = vigentes
    .filter((m) => !DE_COMPRA.has(m.tipo))
    .map((m) => ({ importe: dec(m.importe).neg(), clave: m.tipo === 'PAGO' && m.compra_id != null ? Number(m.compra_id) : null }));

  const r = imputarDeudas({ deudas, creditos, plazoDias, hoy });
  return {
    saldo: aPesos(movimientos.reduce((a, m) => a.plus(m.importe), dec(0))),
    vencido: r.vencido,
    proximo_vencimiento: r.proximo_vencimiento,
    compras: r.deudas.map(({ clave, orden, importe, ...c }) => c),
  };
}
