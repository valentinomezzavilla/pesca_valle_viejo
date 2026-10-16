import { describe, it, expect } from 'vitest';
import {
  esquemaCliente, esquemaAnularCobroCliente, esquemaResumenCuenta, tienePermiso, PERMISOS_CON_PIN, MEDIOS_PAGO_ETIQUETA,
} from '@pescaderia/shared';

describe('esquemas de cuenta corriente de clientes', () => {
  it('el cliente acepta cuenta corriente, plazo y PIN', () => {
    const c = esquemaCliente.parse({ nombre: 'Doña Marta', cuenta_corriente: true, plazo_pago_dias: '15', pinAutorizacion: '1234' });
    expect(c).toMatchObject({ cuenta_corriente: true, plazo_pago_dias: 15, pinAutorizacion: '1234' });
    expect(esquemaCliente.safeParse({ nombre: 'X', plazo_pago_dias: '400' }).success).toBe(false);
  });

  it('anular un cobro pide el motivo', () => {
    expect(esquemaAnularCobroCliente.safeParse({ motivo: '' }).success).toBe(false);
    expect(esquemaAnularCobroCliente.parse({ motivo: 'Cobrado dos veces', caja_id: '1' })).toMatchObject({ motivo: 'Cobrado dos veces', caja_id: 1 });
  });

  it('el período del resumen no puede ir al revés', () => {
    expect(esquemaResumenCuenta.safeParse({ desde: '2026-10-10', hasta: '2026-10-01' }).success).toBe(false);
    expect(esquemaResumenCuenta.safeParse({ desde: '', hasta: '' }).success).toBe(true);
  });

  it('administrar la cuenta es del dueño, y el cajero puede con PIN', () => {
    expect(tienePermiso('DUENO', 'clientes.administrar_cuenta')).toBe(true);
    expect(tienePermiso('CAJERO', 'clientes.administrar_cuenta')).toBe(false);
    expect(PERMISOS_CON_PIN).toContain('clientes.administrar_cuenta');
    expect(MEDIOS_PAGO_ETIQUETA.CUENTA_CORRIENTE).toBe('Cuenta corriente');
  });
});
