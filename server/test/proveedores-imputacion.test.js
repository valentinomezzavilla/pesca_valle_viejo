import { describe, it, expect } from 'vitest';
import { imputar } from '../src/modules/proveedores/imputacion.js';
import { diasEntre, fechaVencimiento } from '../src/lib/fechas.js';

const compra = (id, fecha, total, extra = {}) => ({ id, fecha, total, estado: 'CONFIRMADA', tipo_documento: 'REMITO', numero_documento: String(id), ...extra });
let n = 0;
const mov = (tipo, importe, extra = {}) => ({ id: ++n, tipo, importe, compra_id: null, anula_movimiento_id: null, ...extra });
const sumaPendiente = (r) => r.compras.reduce((a, c) => a + Number(c.pendiente), 0);

describe('diasEntre', () => {
  it('cuenta días de calendario', () => {
    expect(diasEntre('2026-10-01', '2026-10-14')).toBe(13);
    expect(diasEntre('2026-10-14', '2026-10-01')).toBe(-13);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('fechaVencimiento', () => {
  it('por días suma el plazo', () => {
    expect(fechaVencimiento('2026-10-14', { dias: 10 })).toBe('2026-10-24');
    expect(fechaVencimiento('2026-10-14')).toBe('2026-10-14');
  });
  it('al finalizar la semana vence el domingo (de lunes a domingo)', () => {
    expect(fechaVencimiento('2026-10-12', { periodo: 'SEMANA' })).toBe('2026-10-18'); // lunes
    expect(fechaVencimiento('2026-10-14', { periodo: 'SEMANA', dias: 30 })).toBe('2026-10-18'); // los días no cuentan
    expect(fechaVencimiento('2026-10-18', { periodo: 'SEMANA' })).toBe('2026-10-18'); // domingo
    expect(fechaVencimiento('2026-12-30', { periodo: 'SEMANA' })).toBe('2027-01-03');
  });
  it('al finalizar la quincena vence el 15 o el último día del mes', () => {
    expect(fechaVencimiento('2026-10-01', { periodo: 'QUINCENA' })).toBe('2026-10-15');
    expect(fechaVencimiento('2026-10-15', { periodo: 'QUINCENA' })).toBe('2026-10-15');
    expect(fechaVencimiento('2026-10-16', { periodo: 'QUINCENA' })).toBe('2026-10-31');
    expect(fechaVencimiento('2026-02-20', { periodo: 'QUINCENA' })).toBe('2026-02-28');
    expect(fechaVencimiento('2028-02-20', { periodo: 'QUINCENA' })).toBe('2028-02-29');
    expect(fechaVencimiento('2026-11-30', { periodo: 'QUINCENA' })).toBe('2026-11-30');
  });
});

describe('imputar', () => {
  const hoy = '2026-10-14';

  it('con plazo por quincena, las compras de la quincena vencen juntas', () => {
    const compras = [compra(1, '2026-09-20', '1000.00'), compra(2, '2026-10-02', '2000.00'), compra(3, '2026-10-10', '3000.00')];
    const movimientos = compras.map((c) => mov('COMPRA', c.total, { compra_id: c.id }));
    const r = imputar({ movimientos, compras, plazoDias: 0, plazoPeriodo: 'QUINCENA', hoy });
    expect(r.compras.map((c) => [c.vence, c.estado])).toEqual([['2026-09-30', 'VENCIDA'], ['2026-10-15', 'PENDIENTE'], ['2026-10-15', 'PENDIENTE']]);
    expect(r.vencido).toBe('1000.00');
    expect(r.proximo_vencimiento).toEqual({ fecha: '2026-10-15', importe: '5000.00' });
  });

  it('el pago cancela primero la compra más vieja y marca vencidas según el plazo', () => {
    const compras = [compra(1, '2026-09-01', '100000.00'), compra(2, '2026-10-10', '50000.00')];
    const movimientos = [
      mov('COMPRA', '100000.00', { compra_id: 1 }),
      mov('COMPRA', '50000.00', { compra_id: 2 }),
      mov('PAGO', '-120000.00'),
    ];
    const r = imputar({ movimientos, compras, plazoDias: 15, hoy });
    expect(r.saldo).toBe('30000.00');
    expect(r.compras.map((c) => c.estado)).toEqual(['PAGADA', 'PARCIAL']);
    expect(r.compras[1]).toMatchObject({ pendiente: '30000.00', pagado: '20000.00', vence: '2026-10-25', dias_para_vencer: 11 });
    expect(r.vencido).toBe('0.00');
    expect(r.proximo_vencimiento).toEqual({ fecha: '2026-10-25', importe: '30000.00' });
    expect(sumaPendiente(r)).toBe(30000);
  });

  it('una compra impaga después del plazo está vencida, con los días de atraso', () => {
    const r = imputar({ movimientos: [mov('COMPRA', '80000.00', { compra_id: 1 })], compras: [compra(1, '2026-09-20', '80000.00')], plazoDias: 10, hoy });
    expect(r.compras[0]).toMatchObject({ estado: 'VENCIDA', vence: '2026-09-30', dias_para_vencer: -14 });
    expect(r.vencido).toBe('80000.00');
    expect(r.proximo_vencimiento).toBe(null);
  });

  it('el pago de contado se aplica a su propia compra aunque haya deuda vieja', () => {
    const compras = [compra(1, '2026-09-01', '100000.00'), compra(2, '2026-10-12', '30000.00')];
    const movimientos = [
      mov('COMPRA', '100000.00', { compra_id: 1 }),
      mov('COMPRA', '30000.00', { compra_id: 2 }),
      mov('PAGO', '-30000.00', { compra_id: 2 }),
    ];
    const r = imputar({ movimientos, compras, plazoDias: 0, hoy });
    expect(r.compras.find((c) => c.compra_id === 2).estado).toBe('PAGADA');
    expect(r.compras.find((c) => c.compra_id === 1)).toMatchObject({ estado: 'VENCIDA', pendiente: '100000.00' });
    expect(sumaPendiente(r)).toBe(Number(r.saldo));
  });

  it('las compras anuladas no cuentan; si era de contado su pago queda a favor', () => {
    const compras = [compra(1, '2026-10-01', '40000.00', { estado: 'ANULADA' }), compra(2, '2026-10-05', '25000.00')];
    const movimientos = [
      mov('COMPRA', '40000.00', { compra_id: 1 }),
      mov('PAGO', '-40000.00', { compra_id: 1 }),
      mov('ANULACION_COMPRA', '-40000.00', { compra_id: 1 }),
      mov('COMPRA', '25000.00', { compra_id: 2 }),
    ];
    const r = imputar({ movimientos, compras, plazoDias: 30, hoy });
    expect(r.compras).toHaveLength(1);
    expect(r.saldo).toBe('-15000.00');
    expect(r.compras[0].estado).toBe('PAGADA');
    expect(r.vencido).toBe('0.00');
    expect(r.proximo_vencimiento).toBe(null);
  });

  it('un pago anulado no paga nada', () => {
    const pago = mov('PAGO', '-50000.00');
    const movimientos = [mov('COMPRA', '50000.00', { compra_id: 1 }), pago, mov('ANULACION_PAGO', '50000.00', { anula_movimiento_id: pago.id })];
    const r = imputar({ movimientos, compras: [compra(1, '2026-10-14', '50000.00')], plazoDias: 0, hoy });
    expect(r.saldo).toBe('50000.00');
    expect(r.compras[0]).toMatchObject({ estado: 'PENDIENTE', pendiente: '50000.00', dias_para_vencer: 0 });
    expect(r.proximo_vencimiento).toEqual({ fecha: '2026-10-14', importe: '50000.00' });
  });

  it('las notas de crédito también bajan la deuda más vieja', () => {
    const movimientos = [mov('COMPRA', '10000.00', { compra_id: 1 }), mov('NOTA_CREDITO', '-4000.00')];
    const r = imputar({ movimientos, compras: [compra(1, '2026-10-01', '10000.00')], plazoDias: 30, hoy });
    expect(r.compras[0]).toMatchObject({ estado: 'PARCIAL', pendiente: '6000.00' });
  });

  it('sin movimientos no hay deuda', () => {
    expect(imputar({ movimientos: [], compras: [], plazoDias: 0, hoy })).toEqual({ saldo: '0.00', vencido: '0.00', proximo_vencimiento: null, compras: [] });
  });
});
