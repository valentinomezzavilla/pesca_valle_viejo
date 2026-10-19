// Impresión del ticket interno. Se renderiza en #area-impresion (lo único visible al imprimir).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MEDIOS_PAGO_ETIQUETA, dec, sumar } from '@pescaderia/shared';
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

  // Imprime cuando el ticket ya está en pantalla y el logo terminó de cargar (si no, sale el ticket sin logo)
  useEffect(() => {
    if (!ticket) return;
    let cancelado = false;
    const imagenes = [...document.querySelectorAll('#area-impresion img')];
    const cargadas = Promise.all(imagenes.map((img) => img.decode().catch(() => {})));
    const limite = new Promise((listo) => setTimeout(listo, 1500));
    Promise.race([cargadas, limite]).then(() => !cancelado && window.print());
    return () => {
      cancelado = true;
    };
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
  const angosto = ancho === '58';
  const papel = angosto ? '58mm' : '80mm';
  // Ancho realmente imprimible del rollo (el cabezal no llega a los bordes del papel)
  const imprimible = angosto ? '48mm' : '72mm';
  const fila = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: '8px' };
  const derecha = { marginLeft: 'auto', whiteSpace: 'nowrap' };
  const vuelto = dec(venta.vuelto);
  const pagoCon = sumar(pagos.filter((p) => p.medio === 'EFECTIVO').map((p) => p.monto)).plus(vuelto);
  return (
    <div style={{ width: imprimible, margin: '0 auto', padding: '2mm 0 4mm', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: angosto ? '10px' : '12px', color: '#000', lineHeight: 1.35 }}>
      <style>{`@page { size: ${papel} auto; margin: 0; }`}</style>
      <div style={{ textAlign: 'center' }}>
        <img src="/logo-ticket.png" alt="" style={{ display: 'block', width: angosto ? '24mm' : '30mm', height: 'auto', margin: '0 auto 4px' }} />
        <div style={{ fontSize: '1.3em', fontWeight: 700 }}>{negocio?.nombre}</div>
        {negocio?.direccion && <div>{negocio.direccion}</div>}
        {negocio?.telefono && <div>Tel: {negocio.telefono}</div>}
        {negocio?.cuit && <div>CUIT: {negocio.cuit}</div>}
      </div>
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ textAlign: 'center', fontWeight: 700 }}>COMPROBANTE INTERNO</div>
      <div>N° {comprobante.numero_formateado}</div>
      <div>{fechaHora(venta.fecha)}</div>
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
            <span style={derecha}>{pesos(it.subtotal)}</span>
          </div>
          {Number(it.descuento) > 0 && <div style={fila}><span style={{ paddingLeft: '1em' }}>Descuento</span><span style={derecha}>-{pesos(it.descuento)}</span></div>}
        </div>
      ))}
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      {(Number(venta.descuento_items) > 0 || Number(venta.descuento_global) > 0) && (
        <>
          <div style={fila}><span>Subtotal</span><span style={derecha}>{pesos(venta.subtotal)}</span></div>
          {Number(venta.descuento_global) > 0 && <div style={fila}><span>Descuento</span><span style={derecha}>-{pesos(venta.descuento_global)}</span></div>}
        </>
      )}
      <div style={{ ...fila, fontSize: '1.4em', fontWeight: 700 }}><span>TOTAL</span><span style={derecha}>{pesos(venta.total)}</span></div>
      {pagos.map((p, i) => (
        <div key={i} style={fila}><span>{MEDIOS_PAGO_ETIQUETA[p.medio]}</span><span style={derecha}>{pesos(p.monto)}</span></div>
      ))}
      {vuelto.gt(0) && (
        <>
          <div style={fila}><span>Pagó con</span><span style={derecha}>{pesos(pagoCon.toFixed(2))}</span></div>
          <div style={{ ...fila, fontWeight: 700 }}><span>Su vuelto</span><span style={derecha}>{pesos(venta.vuelto)}</span></div>
        </>
      )}
      <hr style={{ border: 0, borderTop: '1px dashed #000', margin: '6px 0' }} />
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{comprobante.leyenda}</div>
      {negocio?.mensaje_ticket && <div style={{ textAlign: 'center', marginTop: '4px' }}>{negocio.mensaje_ticket}</div>}
    </div>
  );
}
