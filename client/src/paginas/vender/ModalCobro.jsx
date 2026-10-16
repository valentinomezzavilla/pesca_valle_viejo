import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, Banknote, BookUser, CreditCard, Layers, Plus, Smartphone, TriangleAlert, X } from 'lucide-react';
import { MEDIOS_PAGO, MEDIOS_PAGO_ETIQUETA, dec, sumar } from '@pescaderia/shared';
import { conPin, put } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Campo, clasesInput } from '../../componentes/Formulario.jsx';
import { SelectorCliente } from '../../componentes/Selectores.jsx';
import { TecladoNumerico, Visor, tecladoANumero } from '../../componentes/TecladoNumerico.jsx';
import { normalizarNumero, pesos } from '../../lib/formato.js';

const ICONOS = { EFECTIVO: Banknote, TRANSFERENCIA: Smartphone, TARJETA_DEBITO: CreditCard, TARJETA_CREDITO: CreditCard };

// Billetes "redondos" por encima del total para cobrar rápido
function sugerenciasEfectivo(total) {
  const t = Number(total);
  const opciones = new Set([t]);
  for (const m of [1000, 2000, 5000, 10000, 20000]) {
    const v = Math.ceil(t / m) * m;
    if (v > t) opciones.add(v);
  }
  return [...opciones].sort((a, b) => a - b).slice(0, 4);
}

function Total({ total }) {
  return (
    <div className="mb-4 rounded-2xl bg-lateral px-5 py-4 text-center text-white">
      <div className="text-xs font-semibold uppercase tracking-wider text-lateral-texto">Total a cobrar</div>
      <div className="mt-0.5 text-4xl font-bold tabular-nums tracking-tight">{pesos(total)}</div>
    </div>
  );
}

function Acciones({ onVolver, children }) {
  return (
    <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
      <Boton variante="secundario" tamanio="grande" icono={ArrowLeft} onClick={onVolver} aria-label="Volver a elegir medio de pago" />
      {children}
    </div>
  );
}

export function ModalCobro({ total, onCobrar, onCerrar }) {
  const [medio, setMedio] = useState(null);
  const [recibido, setRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [pagosMixtos, setPagosMixtos] = useState([{ medio: 'EFECTIVO', monto: '' }]);
  const [cliente, setCliente] = useState(null);
  const [entrega, setEntrega] = useState('');
  const [medioEntrega, setMedioEntrega] = useState('EFECTIVO');
  const [enviando, setEnviando] = useState(false);
  const [habilitando, setHabilitando] = useState(false);
  const { avisar, pedirPin } = useDialogos();
  const queryClient = useQueryClient();

  // Abrirle la cuenta corriente sin salir de la venta (el cajero necesita el PIN del dueño)
  const habilitarCuenta = async () => {
    setHabilitando(true);
    try {
      const r = await conPin(pedirPin, (pin) => put(`/clientes/${cliente.id}`, { cuenta_corriente: true, pinAutorizacion: pin }));
      if (!r) return;
      setCliente({ ...cliente, cuenta_corriente: true });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      avisar(`${cliente.nombre} ya tiene cuenta corriente.`);
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setHabilitando(false);
    }
  };

  const cobrar = async (pagos, efectivoRecibido, clienteId) => {
    setEnviando(true);
    try {
      await onCobrar(pagos, efectivoRecibido, clienteId);
    } finally {
      setEnviando(false);
    }
  };

  if (dec(total).isZero()) {
    return (
      <Modal titulo="Cobrar" onCerrar={onCerrar} ancho="sm:max-w-md">
        <p className="mb-4 text-lg text-texto-suave">El total es $0 (descuento del 100%).</p>
        <Boton variante="exito" tamanio="grande" className="w-full" cargando={enviando} onClick={() => cobrar([], undefined)}>Confirmar venta</Boton>
      </Modal>
    );
  }

  // Paso 1: elegir el medio
  if (!medio) {
    return (
      <Modal titulo="¿Cómo paga?" onCerrar={onCerrar} ancho="sm:max-w-lg">
        <Total total={total} />
        <div className="grid grid-cols-2 gap-3">
          {MEDIOS_PAGO.map((m) => {
            const Icono = ICONOS[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMedio(m)}
                className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-superficie text-lg font-bold text-texto ring-1 ring-borde transition-all hover:-translate-y-px hover:shadow-suave hover:ring-2 hover:ring-primario focus-visible:ring-4 focus-visible:ring-anillo"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-primario-suave text-primario-texto">
                  <Icono size={24} aria-hidden />
                </span>
                {MEDIOS_PAGO_ETIQUETA[m]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMedio('MIXTO')}
            className="col-span-2 flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-borde-fuerte font-semibold text-texto-suave transition-colors hover:border-primario hover:text-primario-texto"
          >
            <Layers size={20} aria-hidden /> Pago mixto (varios medios)
          </button>
          <button
            type="button"
            onClick={() => setMedio('FIADO')}
            className="col-span-2 flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-borde-fuerte font-semibold text-texto-suave transition-colors hover:border-primario hover:text-primario-texto"
          >
            <BookUser size={20} aria-hidden /> Cuenta corriente (paga después)
          </button>
        </div>
      </Modal>
    );
  }

  // Efectivo: con cuánto paga y vuelto
  if (medio === 'EFECTIVO') {
    const recibidoNum = dec(tecladoANumero(recibido) || 0);
    const vuelto = recibidoNum.minus(total);
    const alcanza = recibido === '' || vuelto.gte(0);
    return (
      <Modal titulo="Cobro en efectivo" icono={Banknote} onCerrar={onCerrar} ancho="sm:max-w-md">
        <Total total={total} />
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {sugerenciasEfectivo(total).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setRecibido(String(v).replace('.', ','))}
              className="min-h-11 rounded-lg bg-exito-suave text-sm font-bold text-exito-texto transition hover:brightness-95 dark:hover:brightness-125"
            >
              {v === Number(total) ? 'Justo' : pesos(v).replace(',00', '')}
            </button>
          ))}
        </div>
        <Visor etiqueta="Paga con" valor={recibido} prefijo="$" />
        <div className="mt-3">
          <TecladoNumerico valor={recibido} onCambio={setRecibido} maxDecimales={2} />
        </div>
        <div
          aria-live="polite"
          className={`mt-3 rounded-2xl px-4 py-3 text-center ${recibido === '' ? 'bg-superficie-2 text-texto-suave' : alcanza ? 'bg-exito-suave text-exito-texto' : 'bg-peligro-suave text-peligro-texto'}`}
        >
          {recibido === '' ? (
            'Ingresá con cuánto paga (opcional)'
          ) : alcanza ? (
            <span className="text-2xl font-bold">Vuelto: {pesos(vuelto.toString())}</span>
          ) : (
            <span className="text-xl font-bold">Faltan {pesos(vuelto.neg().toString())}</span>
          )}
        </div>
        <Acciones onVolver={() => setMedio(null)}>
          <Boton variante="exito" tamanio="grande" cargando={enviando} disabled={!alcanza} onClick={() => cobrar([{ medio: 'EFECTIVO', monto: total }], recibido ? recibidoNum.toFixed(2) : undefined)}>
            Confirmar venta
          </Boton>
        </Acciones>
      </Modal>
    );
  }

  // Cuenta corriente: queda como deuda del cliente, con una entrega opcional
  if (medio === 'FIADO') {
    const entregaTexto = normalizarNumero(entrega) || '0';
    const entregaValida = /^\d+(\.\d{1,2})?$/.test(entregaTexto) && dec(entregaTexto).lt(total);
    const aCuenta = entregaValida ? dec(total).minus(entregaTexto) : dec(total);
    const deudaNueva = dec(cliente?.saldo ?? 0).plus(aCuenta);
    const pasaLimite = !!cliente && cliente.limite_credito !== null && deudaNueva.gt(cliente.limite_credito);
    const sinCuenta = !!cliente && !cliente.cuenta_corriente;
    const tieneVencido = !!cliente && dec(cliente.vencido ?? 0).gt(0);
    const hayEntrega = entregaValida && dec(entregaTexto).gt(0);
    const confirmarFiado = () => {
      const pagos = hayEntrega
        ? [{ medio: medioEntrega, monto: dec(entregaTexto).toFixed(2) }, { medio: 'CUENTA_CORRIENTE', monto: aCuenta.toFixed(2) }]
        : [{ medio: 'CUENTA_CORRIENTE', monto: dec(total).toFixed(2) }];
      return cobrar(pagos, hayEntrega && medioEntrega === 'EFECTIVO' ? dec(entregaTexto).toFixed(2) : undefined, cliente.id);
    };
    return (
      <Modal titulo="Cuenta corriente" descripcion="La venta queda anotada en la cuenta del cliente y la paga después." icono={BookUser} onCerrar={onCerrar} ancho="sm:max-w-lg">
        <Total total={total} />
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-sm font-semibold text-texto">¿A qué cliente?</div>
            <SelectorCliente valor={cliente} onElegir={setCliente} autoFocus />
          </div>
          {sinCuenta && (
            <div className="space-y-3 rounded-2xl bg-alerta-suave p-4 text-alerta-texto">
              <p className="flex items-start gap-2 font-medium">
                <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden /> {cliente.nombre} no tiene cuenta corriente. Para venderle a cuenta hay que habilitarla (si sos cajero, con el PIN del dueño).
              </p>
              <Boton tamanio="grande" icono={BookUser} className="w-full" cargando={habilitando} onClick={habilitarCuenta}>Habilitar cuenta corriente</Boton>
            </div>
          )}
          {cliente && !sinCuenta && (
            <>
              {tieneVencido && (
                <p className="flex items-start gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
                  <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden /> Ojo: tiene {pesos(cliente.vencido)} vencido sin pagar.
                </p>
              )}
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Campo etiqueta="Entrega ahora (opcional)" inputMode="decimal" placeholder="$ 0" value={entrega} onChange={(e) => setEntrega(e.target.value)} error={entrega && !entregaValida ? 'Tiene que ser menos que el total' : undefined} />
                <select aria-label="Medio de la entrega" value={medioEntrega} onChange={(e) => setMedioEntrega(e.target.value)} className={`${clasesInput} w-36`}>
                  {MEDIOS_PAGO.map((m) => <option key={m} value={m}>{MEDIOS_PAGO_ETIQUETA[m]}</option>)}
                </select>
              </div>
              <div className="space-y-1 rounded-2xl bg-superficie-2 px-4 py-3">
                <div className="flex justify-between"><span className="text-texto-suave">Queda a cuenta</span><strong className="tabular-nums">{pesos(aCuenta.toFixed(2))}</strong></div>
                <div className="flex justify-between"><span className="text-texto-suave">Su deuda total pasa a ser</span><strong className="tabular-nums">{pesos(deudaNueva.toFixed(2))}</strong></div>
                {cliente.limite_credito !== null && <div className="flex justify-between text-sm"><span className="text-texto-suave">Límite de crédito</span><span className="tabular-nums">{pesos(cliente.limite_credito)}</span></div>}
              </div>
              {pasaLimite && (
                <p className="flex items-start gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
                  <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden /> Se pasa del límite. Para fiar igual hace falta el PIN del dueño.
                </p>
              )}
            </>
          )}
        </div>
        <Acciones onVolver={() => setMedio(null)}>
          <Boton variante="exito" tamanio="grande" cargando={enviando} disabled={!cliente || sinCuenta || (!!entrega && !entregaValida)} onClick={confirmarFiado}>
            Anotar {pesos(aCuenta.toFixed(2))} en su cuenta
          </Boton>
        </Acciones>
      </Modal>
    );
  }

  // Transferencia / tarjetas
  if (medio !== 'MIXTO') {
    return (
      <Modal titulo={`Cobro con ${MEDIOS_PAGO_ETIQUETA[medio].toLowerCase()}`} icono={ICONOS[medio]} onCerrar={onCerrar} ancho="sm:max-w-md">
        <Total total={total} />
        <Campo etiqueta="Referencia (opcional)" placeholder="N° de operación, últimos 4 números..." value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        <Acciones onVolver={() => setMedio(null)}>
          <Boton variante="exito" tamanio="grande" cargando={enviando} onClick={() => cobrar([{ medio, monto: total, referencia: referencia || undefined }])}>
            Confirmar venta
          </Boton>
        </Acciones>
      </Modal>
    );
  }

  // Mixto
  const montos = pagosMixtos.map((p) => normalizarNumero(p.monto) || '0');
  const montosValidos = montos.every((m) => /^\d+(\.\d{1,2})?$/.test(m));
  const cargado = montosValidos ? sumar(montos) : dec(0);
  const falta = dec(total).minus(cargado);
  const actualizar = (i, cambios) => setPagosMixtos((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambios } : p)));

  return (
    <Modal titulo="Pago mixto" icono={ArrowRightLeft} onCerrar={onCerrar} ancho="sm:max-w-lg">
      <Total total={total} />
      <div className="space-y-2.5">
        {pagosMixtos.map((p, i) => (
          <div key={i} className="flex gap-2">
            <select aria-label="Medio de pago" value={p.medio} onChange={(e) => actualizar(i, { medio: e.target.value })} className={`${clasesInput} w-36 shrink-0 sm:w-40`}>
              {MEDIOS_PAGO.map((m) => <option key={m} value={m}>{MEDIOS_PAGO_ETIQUETA[m]}</option>)}
            </select>
            <input aria-label="Monto" inputMode="decimal" placeholder="$ 0" value={p.monto} onChange={(e) => actualizar(i, { monto: e.target.value })} className={`${clasesInput} min-w-0 flex-1 text-right font-semibold tabular-nums`} />
            {falta.gt(0) && (
              <button
                type="button"
                onClick={() => actualizar(i, { monto: dec(normalizarNumero(p.monto) || 0).plus(falta).toFixed(2).replace('.', ',') })}
                className="shrink-0 rounded-xl bg-primario-suave px-3 text-sm font-semibold text-primario-texto"
              >
                Resto
              </button>
            )}
            {pagosMixtos.length > 1 && (
              <button type="button" onClick={() => setPagosMixtos((ps) => ps.filter((_, j) => j !== i))} className="flex w-11 shrink-0 items-center justify-center rounded-xl text-texto-suave hover:bg-superficie-2" aria-label="Quitar este pago">
                <X size={20} />
              </button>
            )}
          </div>
        ))}
        {pagosMixtos.length < 4 && (
          <Boton variante="fantasma" icono={Plus} onClick={() => setPagosMixtos((ps) => [...ps, { medio: 'TRANSFERENCIA', monto: '' }])}>Agregar otro medio</Boton>
        )}
      </div>
      <div
        aria-live="polite"
        className={`mt-3 rounded-2xl px-4 py-3 text-center text-lg font-bold ${!montosValidos ? 'bg-peligro-suave text-peligro-texto' : falta.isZero() ? 'bg-exito-suave text-exito-texto' : 'bg-alerta-suave text-alerta-texto'}`}
      >
        {!montosValidos ? 'Revisá los montos' : falta.isZero() ? 'Completo ✓' : falta.gt(0) ? `Falta cargar ${pesos(falta.toString())}` : `Sobran ${pesos(falta.neg().toString())}`}
      </div>
      <Acciones onVolver={() => setMedio(null)}>
        <Boton
          variante="exito"
          tamanio="grande"
          cargando={enviando}
          disabled={!montosValidos || !falta.isZero()}
          onClick={() => cobrar(pagosMixtos.map((p, i) => ({ medio: p.medio, monto: montos[i] })).filter((p) => dec(p.monto).gt(0)))}
        >
          Confirmar venta
        </Boton>
      </Acciones>
    </Modal>
  );
}
