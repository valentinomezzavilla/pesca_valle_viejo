// Impresión del ticket interno. Se renderiza en #area-impresion (lo único visible al imprimir).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MEDIOS_PAGO_ETIQUETA } from '@pescaderia/shared';
import { get, post } from '../api/cliente.js';
import { cantidad, fechaHora, pesos } from '../lib/formato.js';
import { useDialogos } from './Dialogos.jsx';

const ImpresionContexto = createContext(null);

export function ImpresionProvider({ children }) {
  const [ticket, setTicket] = useState(null);
  const { avisar } = useDialogos();

  const imprimirComprobante = useCallback(async (comprobanteId, { reimpresion = false } = {}) => {
    try {
      const datos = reimpresion ? await post(`/comprobantes/${comprobanteId}/reimpresion`) : await get(`/comprobantes/${comprobanteId}`);
      setTicket({ ...datos, reimpresion, clave: Date.now() });
    } catch (e) {
      avisar(e.message, 'error');
    }
  }, [avisar]);

  // Imprime cuando el ticket ya está en pantalla
  useEffect(() => {
    if (!ticket) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [ticket]);

  return (
    <ImpresionContexto.Provider value={{ imprimirComprobante }}>
      {children}
      {ticket && createPortal(<TicketInterno datos={ticket} />, document.getElementById('area-impresion'))}
    </ImpresionContexto.Provider>
  );
}

export const useImpresion = () => useContext(ImpresionContexto);

export function TicketInterno({ datos }) {
  const { comprobante, negocio, venta, items, pagos, ancho, reimpresion, cliente } = datos;
  const mm = ancho === '58' ? '58mm' : '80mm';
  const fila = { display: 'flex', justifyContent: 'space-between', gap: '8px' };
  return (
    <div style={{ width: mm, padding: '3mm', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: ancho === '58' ? '10px' : '12px', color: '#000', lineHeight: 1.35 }}>
      <style>{`@page { size: ${mm} auto; margin: 0; }`}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.4em', fontWeight: 700 }}>{negocio?.nombre}</div>
        {negocio?.direccion && <div>{negocio.direccion}</div>}
        {negocio?.telefono && <div>Tel: {negocio.telefono}</div>}
        {negocio?.cuit && <div>CUIT: {negocio.cuit}</div>}
      </div>
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ textAlign: 'center', fontWeight: 700 }}>COMPROBANTE INTERNO</div>
      <div style={fila}><span>N° {comprobante.numero_formateado}</span><span>{fechaHora(venta.fecha)}</span></div>
      <div>Atendió: {venta.cajero}</div>
      {cliente?.nombre && <div>Cliente: {cliente.nombre}</div>}
      {reimpresion && <div style={{ fontWeight: 700 }}>*** REIMPRESIÓN ***</div>}
      {venta.estado === 'ANULADA' && <div style={{ fontWeight: 700 }}>*** VENTA ANULADA ***</div>}
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      {items.map((it, i) => (
        <div key={i} style={{ marginBottom: '4px' }}>
          <div>{it.descripcion}</div>
          <div style={fila}>
            <span>{cantidad(it.cantidad, it.unidad)} x {pesos(it.precio_unitario)}</span>
            <span>{pesos(it.subtotal)}</span>
          </div>
          {Number(it.descuento) > 0 && <div style={fila}><span>  Descuento</span><span>-{pesos(it.descuento)}</span></div>}
        </div>
      ))}
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      {(Number(venta.descuento_items) > 0 || Number(venta.descuento_global) > 0) && (
        <>
          <div style={fila}><span>Subtotal</span><span>{pesos(venta.subtotal)}</span></div>
          {Number(venta.descuento_global) > 0 && <div style={fila}><span>Descuento</span><span>-{pesos(venta.descuento_global)}</span></div>}
        </>
      )}
      <div style={{ ...fila, fontSize: '1.4em', fontWeight: 700 }}><span>TOTAL</span><span>{pesos(venta.total)}</span></div>
      {pagos.map((p, i) => (
        <div key={i} style={fila}><span>{MEDIOS_PAGO_ETIQUETA[p.medio]}</span><span>{pesos(p.monto)}</span></div>
      ))}
      {Number(venta.vuelto) > 0 && <div style={fila}><span>Su vuelto</span><span>{pesos(venta.vuelto)}</span></div>}
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{comprobante.leyenda}</div>
      {negocio?.mensaje_ticket && <div style={{ textAlign: 'center', marginTop: '4px' }}>{negocio.mensaje_ticket}</div>}
    </div>
  );
}
