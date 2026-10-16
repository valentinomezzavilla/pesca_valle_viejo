import { aPesos, dec } from '@pescaderia/shared';
import { diasEntre, sumarDias } from './fechas.js';

const menor = (a, b) => (a.lt(b) ? a : b);

/**
 * Qué deudas están pagadas, a medias o vencidas, aplicando los créditos solos. Función pura: no toca la base.
 * Sirve para proveedores (compras) y clientes (ventas a cuenta).
 *
 * deudas:   [{ clave, fecha 'YYYY-MM-DD', importe, orden?, ...extra }] — lo que se debe por cada una
 * creditos: [{ importe > 0, clave? }] — con clave va primero a esa deuda; el resto, de la deuda más vieja a la más nueva
 */
export function imputarDeudas({ deudas, creditos, plazoDias = 0, hoy }) {
  const ordenadas = [...deudas].sort((a, b) => (a.fecha === b.fecha ? Number(a.orden ?? 0) - Number(b.orden ?? 0) : a.fecha < b.fecha ? -1 : 1));
  const falta = new Map(ordenadas.map((d) => [d.clave, dec(d.importe)]));

  let pozo = dec(0);
  for (const c of creditos) {
    let credito = dec(c.importe);
    if (c.clave != null && falta.has(c.clave) && credito.gt(0)) {
      const aplica = menor(credito, falta.get(c.clave));
      falta.set(c.clave, falta.get(c.clave).minus(aplica));
      credito = credito.minus(aplica);
    }
    pozo = pozo.plus(credito);
  }

  const resultado = ordenadas.map((d) => {
    let pendiente = falta.get(d.clave);
    if (pozo.gt(0) && pendiente.gt(0)) {
      const aplica = menor(pozo, pendiente);
      pendiente = pendiente.minus(aplica);
      pozo = pozo.minus(aplica);
    }
    const vence = sumarDias(d.fecha, plazoDias);
    const diasParaVencer = diasEntre(hoy, vence);
    let estado = 'PENDIENTE';
    if (pendiente.lte(0)) estado = 'PAGADA';
    else if (diasParaVencer < 0) estado = 'VENCIDA';
    else if (pendiente.lt(d.importe)) estado = 'PARCIAL';
    return {
      ...d,
      vence,
      total: aPesos(d.importe),
      pagado: aPesos(dec(d.importe).minus(pendiente)),
      pendiente: aPesos(pendiente),
      estado,
      dias_para_vencer: diasParaVencer,
    };
  });

  const vencido = resultado.filter((d) => d.estado === 'VENCIDA').reduce((a, d) => a.plus(d.pendiente), dec(0));
  const porVencer = resultado.filter((d) => d.estado === 'PENDIENTE' || d.estado === 'PARCIAL');
  const fechaProxima = porVencer.reduce((min, d) => (min === null || d.vence < min ? d.vence : min), null);
  const proximo = fechaProxima && {
    fecha: fechaProxima,
    importe: aPesos(porVencer.filter((d) => d.vence === fechaProxima).reduce((a, d) => a.plus(d.pendiente), dec(0))),
  };

  return { vencido: aPesos(vencido), proximo_vencimiento: proximo || null, deudas: resultado };
}

/** Tramos de antigüedad de lo vencido (para los reportes). saldo > vencido → la diferencia está "al día". */
export function tramosDeuda(saldo, deudas) {
  const vencidas = deudas.filter((d) => d.estado === 'VENCIDA');
  const tramo = (desde, hasta) => aPesos(vencidas.filter((d) => -d.dias_para_vencer >= desde && -d.dias_para_vencer <= hasta).reduce((a, d) => a.plus(d.pendiente), dec(0)));
  const vencido = vencidas.reduce((a, d) => a.plus(d.pendiente), dec(0));
  const alDia = dec(saldo).minus(vencido);
  return {
    // Con saldo a favor no hay nada "al día" para pagar
    al_dia: aPesos(alDia.lt(0) ? 0 : alDia),
    vencido_30: tramo(1, 30),
    vencido_60: tramo(31, 60),
    vencido_mas: tramo(61, Infinity),
  };
}
