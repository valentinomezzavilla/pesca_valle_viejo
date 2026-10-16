import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Download, FileMinus2, FileText, HandCoins, Landmark, MessageCircle, ReceiptText, TriangleAlert, Undo2 } from 'lucide-react';
import { MEDIOS_PAGO_PROVEEDOR, MEDIOS_PAGO_PROVEEDOR_ETIQUETA, dec } from '@pescaderia/shared';
import { post } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { useCaja } from '../../hooks/useCaja.js';
import { Boton, clasesBoton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { Campo, Selector, SelectorBotones } from '../../componentes/Formulario.jsx';
import { fecha, hoyIso, inicioMesIso, normalizarNumero, pesos } from '../../lib/formato.js';
import { enlaceWhatsApp } from '../../lib/proveedores.js';

const ICONOS_MEDIO = { EFECTIVO_CAJA: Banknote, TRANSFERENCIA: Landmark, CHEQUE: ReceiptText, OTRO: HandCoins };

function useRefresco() {
  const queryClient = useQueryClient();
  return () => ['ficha-proveedor', 'proveedores', 'caja-actual', 'caja-movimientos', 'panel'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
}

export function ModalPago({ proveedor, saldo, onCerrar }) {
  const refrescar = useRefresco();
  const { avisar } = useDialogos();
  const caja = useCaja();
  const [d, setD] = useState({
    importe: '', medio_pago: 'TRANSFERENCIA', referencia: '', fecha: hoyIso(), descripcion: '',
    cheque_numero: '', cheque_banco: '', cheque_fecha_cobro: '',
  });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const set = (c) => setD((x) => ({ ...x, ...c }));
  const deSuCaja = d.medio_pago === 'EFECTIVO_CAJA';
  const conCheque = d.medio_pago === 'CHEQUE';
  const importe = normalizarNumero(d.importe);
  const valido = /^\d+(\.\d{1,2})?$/.test(importe) && Number(importe) > 0 && (!conCheque || d.cheque_fecha_cobro);
  const bloqueadoPorCaja = deSuCaja && !caja.abierta;

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      await post(`/proveedores/${proveedor.id}/pagos`, {
        importe,
        medio_pago: d.medio_pago,
        caja_id: deSuCaja ? caja.cajaId : undefined,
        referencia: d.referencia,
        fecha: d.fecha,
        descripcion: d.descripcion,
        ...(conCheque ? { cheque_numero: d.cheque_numero, cheque_banco: d.cheque_banco, cheque_fecha_cobro: d.cheque_fecha_cobro } : {}),
      });
      avisar('Pago registrado.');
      refrescar();
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Registrar pago" descripcion={proveedor.nombre} icono={HandCoins} onCerrar={onCerrar} ancho="sm:max-w-lg">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <Campo etiqueta="¿Cuánto se pagó?" autoFocus inputMode="decimal" value={d.importe} onChange={(e) => set({ importe: e.target.value })} error={errores.importe} placeholder="$ 0,00" />
          {dec(saldo).gt(0) && (
            <button type="button" onClick={() => set({ importe: dec(saldo).toFixed(2).replace('.', ',') })} className="mt-1.5 min-h-11 text-sm font-semibold text-primario-texto hover:underline">
              Pagar todo lo que se debe ({pesos(saldo)})
            </button>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-sm font-semibold text-texto">¿Cómo se pagó?</div>
          <SelectorBotones
            etiqueta="Medio de pago"
            columnas={2}
            valor={d.medio_pago}
            onCambio={(v) => set({ medio_pago: v })}
            opciones={MEDIOS_PAGO_PROVEEDOR.map((m) => ({ valor: m, etiqueta: MEDIOS_PAGO_PROVEEDOR_ETIQUETA[m], icono: ICONOS_MEDIO[m] }))}
          />
        </div>
        {deSuCaja && (
          <>
            {caja.cajas.length > 1 && (
              <Selector etiqueta="¿De qué caja sale?" value={caja.cajaId ?? ''} onChange={(e) => caja.setCajaId(Number(e.target.value))} opciones={caja.cajas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
            )}
            {bloqueadoPorCaja ? (
              <p className="flex items-center gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
                <TriangleAlert size={18} className="shrink-0" aria-hidden /> La caja está cerrada. Abrila para pagar con su efectivo, o elegí otro medio de pago.
              </p>
            ) : (
              <p className="text-sm text-texto-suave">El efectivo sale de la caja abierta y queda anotado como "Pago a proveedor".</p>
            )}
          </>
        )}
        {conCheque && (
          <div className="grid gap-4 rounded-xl bg-superficie-2 p-4 sm:grid-cols-3">
            <Campo etiqueta="N° de cheque" inputMode="numeric" value={d.cheque_numero} onChange={(e) => set({ cheque_numero: e.target.value })} />
            <Campo etiqueta="Banco" value={d.cheque_banco} onChange={(e) => set({ cheque_banco: e.target.value })} />
            <Campo etiqueta="¿Cuándo se cobra?" type="date" value={d.cheque_fecha_cobro} onChange={(e) => set({ cheque_fecha_cobro: e.target.value })} error={errores.cheque_fecha_cobro} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Fecha" type="date" value={d.fecha} max={hoyIso()} onChange={(e) => set({ fecha: e.target.value })} error={errores.fecha} />
          <Campo etiqueta="Referencia (opcional)" placeholder="N° de recibo o transferencia" value={d.referencia} onChange={(e) => set({ referencia: e.target.value })} />
        </div>
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" className="flex-1" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="exito" tamanio="grande" className="flex-1" cargando={enviando} disabled={!valido || bloqueadoPorCaja}>Registrar pago</Boton>
        </div>
      </form>
    </Modal>
  );
}

export function ModalNotaCredito({ proveedor, onCerrar }) {
  const refrescar = useRefresco();
  const { avisar } = useDialogos();
  const [d, setD] = useState({ importe: '', descripcion: '', referencia: '' });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const importe = normalizarNumero(d.importe);
  const valido = /^\d+(\.\d{1,2})?$/.test(importe) && Number(importe) > 0 && d.descripcion.trim();

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      await post(`/proveedores/${proveedor.id}/notas-credito`, { importe, descripcion: d.descripcion, referencia: d.referencia });
      avisar('Nota de crédito registrada.');
      refrescar();
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Nota de crédito" descripcion={`${proveedor.nombre} nos baja la deuda`} icono={FileMinus2} onCerrar={onCerrar} ancho="sm:max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <Campo etiqueta="Importe" autoFocus inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} error={errores.importe} placeholder="$ 0,00" />
        <Campo etiqueta="¿Por qué?" value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} error={errores.descripcion} placeholder="Ej: Devolución de mercadería en mal estado" />
        <Campo etiqueta="N° de la nota (opcional)" value={d.referencia} onChange={(e) => setD({ ...d, referencia: e.target.value })} />
        <p className="text-sm text-texto-suave">Esto solo baja lo que se le debe al proveedor. Si devolviste mercadería, descontala también del stock con una merma o un ajuste.</p>
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" className="flex-1" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" tamanio="grande" className="flex-1" cargando={enviando} disabled={!valido}>Registrar</Boton>
        </div>
      </form>
    </Modal>
  );
}

export function ModalAnular({ proveedor, movimiento, onCerrar }) {
  const refrescar = useRefresco();
  const { avisar } = useDialogos();
  const caja = useCaja();
  const [motivo, setMotivo] = useState('');
  const [pedirCaja, setPedirCaja] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const esPago = movimiento.tipo === 'PAGO';
  const importe = pesos(dec(movimiento.importe).abs().toFixed(2));

  const anular = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await post(`/proveedores/${proveedor.id}/movimientos/${movimiento.id}/anular`, { motivo, caja_id: pedirCaja ? caja.cajaId : undefined });
      avisar(esPago ? 'Pago anulado.' : 'Nota de crédito anulada.');
      refrescar();
      onCerrar();
    } catch (err) {
      if (err.codigo === 'ELEGIR_CAJA') setPedirCaja(true);
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={esPago ? 'Anular pago' : 'Anular nota de crédito'} descripcion={proveedor.nombre} icono={Undo2} onCerrar={onCerrar} ancho="sm:max-w-md">
      <form onSubmit={anular} className="space-y-4">
        <p className="text-lg text-texto">
          ¿Seguro que querés anular {esPago ? 'este pago' : 'esta nota de crédito'} de <strong>{importe}</strong> del {fecha(movimiento.fecha)}?
        </p>
        <Campo etiqueta="¿Por qué?" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Lo cargué dos veces" />
        {movimiento.medio_pago === 'EFECTIVO_CAJA' && <p className="text-sm text-texto-suave">La plata vuelve a la caja.</p>}
        {pedirCaja && (
          <>
            {caja.cajas.length > 1 && (
              <Selector etiqueta="¿A qué caja vuelve la plata?" value={caja.cajaId ?? ''} onChange={(e) => caja.setCajaId(Number(e.target.value))} opciones={caja.cajas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
            )}
            {caja.abierta ? (
              <p className="text-sm text-texto-suave">La plata vuelve a {caja.caja?.nombre ?? 'la caja'}.</p>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
                <TriangleAlert size={18} className="shrink-0" aria-hidden />
                {caja.cajas.length > 1 ? 'Esa caja está cerrada. Elegí otra o abrila.' : 'La caja está cerrada. Abrila para que vuelva la plata.'}
              </p>
            )}
          </>
        )}
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" className="flex-1" onClick={onCerrar}>No, volver</Boton>
          <Boton type="submit" variante="peligro" tamanio="grande" className="flex-1" cargando={enviando} disabled={motivo.trim().length < 3 || (pedirCaja && !caja.abierta)}>
            Sí, anular
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

export function ModalResumen({ proveedor, onCerrar }) {
  const [desde, setDesde] = useState(inicioMesIso());
  const [hasta, setHasta] = useState(hoyIso());
  const wa = enlaceWhatsApp(proveedor.telefono, `Hola${proveedor.contacto ? ` ${proveedor.contacto}` : ''}, te paso el resumen de cuenta.`);
  const fechasValidas = desde && hasta && desde <= hasta;
  return (
    <Modal titulo="Resumen de cuenta" descripcion={proveedor.nombre} icono={FileText} onCerrar={onCerrar} ancho="sm:max-w-md">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          <Campo etiqueta="Hasta" type="date" value={hasta} min={desde} max={hoyIso()} onChange={(e) => setHasta(e.target.value)} />
        </div>
        {fechasValidas ? (
          <a href={`/api/proveedores/${proveedor.id}/resumen.pdf?desde=${desde}&hasta=${hasta}`} download className={clasesBoton({ tamanio: 'grande', className: 'w-full' })}>
            <Download size={22} aria-hidden /> Descargar PDF
          </a>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
            <TriangleAlert size={18} className="shrink-0" aria-hidden /> Completá las dos fechas. "Desde" tiene que ser anterior a "Hasta".
          </p>
        )}
        {wa && (
          <>
            <a href={wa} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamanio: 'grande', className: 'w-full' })}>
              <MessageCircle size={22} aria-hidden /> Abrir WhatsApp
            </a>
            <p className="text-sm text-texto-suave">Primero descargá el PDF. Después, en el chat de WhatsApp, tocá el clip 📎 y elegí el archivo.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
