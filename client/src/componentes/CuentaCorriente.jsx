// Piezas compartidas de las cuentas corrientes (clientes y proveedores).
// Convención de la base: importe > 0 = la deuda sube; importe < 0 = baja (pago, anulación, nota de crédito).
import { dec } from '@pescaderia/shared';
import { Etiqueta, Tabla } from './Varios.jsx';
import { fechaHora, pesos } from '../lib/formato.js';

export function TarjetaSaldo({ saldo, textoDeuda, textoAFavor, textoCero = 'Sin deuda', children, detalle }) {
  const s = dec(saldo);
  const tono = s.gt(0) ? 'bg-peligro-suave text-peligro-texto' : s.lt(0) ? 'bg-exito-suave text-exito-texto' : 'bg-exito-suave text-exito-texto';
  return (
    <div className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-5 ${tono}`}>
      <div>
        <div className="text-sm font-semibold uppercase tracking-wide opacity-80">{s.gt(0) ? textoDeuda : s.lt(0) ? textoAFavor : textoCero}</div>
        <div className="text-4xl font-bold tabular-nums tracking-tight">{pesos(s.abs().toFixed(2))}</div>
        {detalle && <div className="mt-1 text-sm opacity-90">{detalle}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/**
 * movimientos: de lo más nuevo a lo más viejo, con saldo_acumulado. etiquetas: { TIPO: 'Texto' }
 * accion(m): botón opcional debajo de la descripción de cada fila. Los movimientos con `anulado` se ven tachados.
 */
export function MovimientosCuenta({ movimientos, etiquetas, vacio = 'Todavía no hay movimientos.', extra, accion }) {
  return (
    <Tabla
      filas={movimientos}
      vacio={vacio}
      columnas={[
        { clave: 'fecha', titulo: 'Cuándo', render: (m) => <span className="text-texto-suave">{fechaHora(m.creado_en)}</span> },
        {
          clave: 'tipo',
          titulo: 'Qué pasó',
          render: (m) => {
            // El botón va acá (2da columna) y no al final: así en el celular se ve sin correr la tabla
            const boton = accion?.(m);
            return (
              <span>
                <span className="font-semibold">{etiquetas[m.tipo] ?? m.tipo}</span>
                {m.anulado && <> <Etiqueta>Anulado</Etiqueta></>}
                {extra?.(m)}
                {m.descripcion && <span className="block text-sm text-texto-suave">{m.descripcion}</span>}
                {boton && <span className="mt-2 block">{boton}</span>}
              </span>
            );
          },
        },
        {
          clave: 'importe',
          titulo: 'Importe',
          derecha: true,
          render: (m) => (
            <strong className={`${dec(m.importe).gt(0) ? 'text-peligro-texto' : 'text-exito-texto'} ${m.anulado ? 'line-through opacity-60' : ''}`}>
              {dec(m.importe).gt(0) ? '+' : '−'}
              {pesos(dec(m.importe).abs().toFixed(2))}
            </strong>
          ),
        },
        { clave: 'saldo', titulo: 'Saldo', derecha: true, render: (m) => <span className="font-medium">{pesos(m.saldo_acumulado)}</span> },
        { clave: 'usuario', titulo: 'Quién', render: (m) => <span className="text-texto-suave">{m.usuario_nombre}</span> },
      ]}
    />
  );
}
