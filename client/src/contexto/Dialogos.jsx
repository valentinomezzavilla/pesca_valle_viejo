// Avisos (toasts), confirmaciones, pedido de PIN y de texto. Todo con promesas:
//   if (await confirmar({ titulo, mensaje })) { ... }
//   const pin = await pedirPin('Motivo...');
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CircleCheck, CircleX, KeyRound, TriangleAlert, X } from 'lucide-react';
import { Modal } from '../componentes/Modal.jsx';
import { Boton } from '../componentes/Boton.jsx';
import { AreaTexto } from '../componentes/Formulario.jsx';
import { TecladoNumerico } from '../componentes/TecladoNumerico.jsx';

const DialogosContexto = createContext(null);

const ESTILO_AVISO = {
  ok: { icono: CircleCheck, clase: 'text-exito' },
  alerta: { icono: TriangleAlert, clase: 'text-alerta' },
  error: { icono: CircleX, clase: 'text-peligro' },
};

export function DialogosProvider({ children }) {
  const [avisos, setAvisos] = useState([]);
  const [dialogo, setDialogo] = useState(null);
  const resolver = useRef(null);
  const idAviso = useRef(0);

  const quitarAviso = useCallback((id) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = ++idAviso.current;
    setAvisos((a) => [...a.slice(-3), { id, texto, tipo }]);
    setTimeout(() => quitarAviso(id), tipo === 'error' ? 7000 : 3500);
  }, [quitarAviso]);

  const abrir = useCallback((d) => new Promise((resolve) => {
    resolver.current = resolve;
    setDialogo(d);
  }), []);

  const cerrar = (valor) => {
    resolver.current?.(valor);
    resolver.current = null;
    setDialogo(null);
  };

  const confirmar = useCallback((opciones) => abrir({ tipo: 'confirmar', ...opciones }), [abrir]);
  const pedirPin = useCallback((mensaje) => abrir({ tipo: 'pin', mensaje }), [abrir]);
  const pedirTexto = useCallback((opciones) => abrir({ tipo: 'texto', ...opciones }), [abrir]);

  return (
    <DialogosContexto.Provider value={{ avisar, confirmar, pedirPin, pedirTexto }}>
      {children}

      {dialogo?.tipo === 'confirmar' && (
        <Modal titulo={dialogo.titulo ?? '¿Confirmás?'} icono={dialogo.peligro ? TriangleAlert : undefined} onCerrar={() => cerrar(false)} ancho="sm:max-w-md">
          {dialogo.mensaje && <p className="text-[17px] leading-relaxed text-texto-suave">{dialogo.mensaje}</p>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Boton variante="secundario" tamanio="grande" onClick={() => cerrar(false)}>{dialogo.textoCancelar ?? 'Cancelar'}</Boton>
            <Boton variante={dialogo.peligro ? 'peligro' : 'primario'} tamanio="grande" onClick={() => cerrar(true)} autoFocus>
              {dialogo.textoConfirmar ?? 'Confirmar'}
            </Boton>
          </div>
        </Modal>
      )}

      {dialogo?.tipo === 'pin' && <DialogoPin mensaje={dialogo.mensaje} onListo={cerrar} />}
      {dialogo?.tipo === 'texto' && <DialogoTexto {...dialogo} onListo={cerrar} />}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-5">
        {avisos.map((a) => {
          const { icono: Icono, clase } = ESTILO_AVISO[a.tipo] ?? ESTILO_AVISO.ok;
          return (
            <div
              key={a.id}
              role={a.tipo === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm animate-entrar items-start gap-3 rounded-2xl bg-superficie px-4 py-3.5 shadow-alta ring-1 ring-borde"
            >
              <Icono size={22} className={`mt-px shrink-0 ${clase}`} aria-hidden />
              <p className="flex-1 font-medium text-texto">{a.texto}</p>
              <button type="button" onClick={() => quitarAviso(a.id)} className="-mr-1 rounded-lg p-1 text-texto-tenue hover:text-texto" aria-label="Cerrar aviso">
                <X size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </DialogosContexto.Provider>
  );
}

function DialogoPin({ mensaje, onListo }) {
  const [pin, setPin] = useState('');
  return (
    <Modal titulo="Autorización del dueño" icono={KeyRound} onCerrar={() => onListo(null)} ancho="sm:max-w-sm">
      <p className="mb-4 text-texto-suave">{mensaje}</p>
      <div className="mb-4 flex h-16 items-center justify-center gap-3 rounded-2xl bg-superficie-2 ring-1 ring-inset ring-borde" aria-label={`${pin.length} números ingresados`}>
        {pin.length === 0 ? (
          <span className="text-texto-tenue">Ingresá el PIN</span>
        ) : (
          Array.from({ length: pin.length }).map((_, i) => <span key={i} className="size-3.5 rounded-full bg-texto" />)
        )}
      </div>
      <TecladoNumerico valor={pin} onCambio={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))} sinDecimales onConfirmar={() => pin.length >= 4 && onListo(pin)} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Boton variante="secundario" tamanio="grande" onClick={() => onListo(null)}>Cancelar</Boton>
        <Boton tamanio="grande" onClick={() => onListo(pin)} disabled={pin.length < 4}>Autorizar</Boton>
      </div>
    </Modal>
  );
}

function DialogoTexto({ titulo, etiqueta, mensaje, textoConfirmar, peligro, onListo }) {
  const [texto, setTexto] = useState('');
  return (
    <Modal titulo={titulo} icono={peligro ? TriangleAlert : undefined} onCerrar={() => onListo(null)} ancho="sm:max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim()) onListo(texto.trim());
        }}
      >
        {mensaje && <p className="mb-4 leading-relaxed text-texto-suave">{mensaje}</p>}
        <AreaTexto etiqueta={etiqueta} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Boton variante="secundario" tamanio="grande" onClick={() => onListo(null)}>Cancelar</Boton>
          <Boton type="submit" tamanio="grande" variante={peligro ? 'peligro' : 'primario'} disabled={!texto.trim()}>{textoConfirmar ?? 'Aceptar'}</Boton>
        </div>
      </form>
    </Modal>
  );
}

export const useDialogos = () => useContext(DialogosContexto);
