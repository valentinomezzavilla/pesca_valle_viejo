import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Banknote, Calculator, Clock, Coins, CreditCard, History, Lock, LockOpen, ReceiptText, Smartphone, Wallet,
} from 'lucide-react';
import { MEDIOS_PAGO, MEDIOS_PAGO_ETIQUETA, TIPOS_MOV_CAJA_ETIQUETA, dec, sumar } from '@pescaderia/shared';
import { conPin, get, post } from '../../api/cliente.js';
import { useCaja } from '../../hooks/useCaja.js';
import { useSesion } from '../../contexto/Sesion.jsx';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { AreaTexto, Campo, Selector, SelectorBotones } from '../../componentes/Formulario.jsx';
import { Cargando, Dato, Encabezado, Etiqueta, Indicador, Tabla, Tarjeta } from '../../componentes/Varios.jsx';
import { fechaHora, hora, normalizarNumero, pesos } from '../../lib/formato.js';

const BILLETES = ['20000', '10000', '2000', '1000', '500', '200', '100', '50', '20', '10'];
const ICONO_MEDIO = { EFECTIVO: Banknote, TRANSFERENCIA: Smartphone, TARJETA_DEBITO: CreditCard, TARJETA_CREDITO: CreditCard };

const columnasMovimientos = [
  { clave: 'hora', titulo: 'Hora', render: (m) => <span className="tabular-nums text-texto-suave">{hora(m.creado_en)}</span> },
  {
    clave: 'tipo',
    titulo: 'Movimiento',
    render: (m) => (
      <span className="font-medium">
        {TIPOS_MOV_CAJA_ETIQUETA[m.tipo]}
        {m.venta_id && <span className="text-texto-suave"> #{m.venta_id}</span>}
      </span>
    ),
  },
  { clave: 'detalle', titulo: 'Detalle', render: (m) => <span className="text-texto-suave">{[m.categoria_gasto, m.descripcion].filter(Boolean).join(' — ')}</span> },
  { clave: 'medio', titulo: 'Medio', render: (m) => MEDIOS_PAGO_ETIQUETA[m.medio] },
  {
    clave: 'importe',
    titulo: 'Importe',
    derecha: true,
    render: (m) => <span className={`font-semibold ${Number(m.importe) < 0 ? 'text-peligro-texto' : 'text-exito-texto'}`}>{pesos(m.importe)}</span>,
  },
  { clave: 'usuario', titulo: 'Usuario', render: (m) => m.usuario_nombre },
];

export function Caja() {
  const { puede } = useSesion();
  const caja = useCaja();
  const [vista, setVista] = useState('actual');

  if (caja.cargando) return <Cargando />;

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo={vista === 'historial' ? 'Historial de cajas' : 'Caja'} subtitulo={caja.caja && vista === 'actual' ? caja.caja.nombre : undefined} icono={vista === 'historial' ? History : Wallet}>
        {caja.cajas.length > 1 && vista === 'actual' && (
          <Selector value={caja.cajaId ?? ''} onChange={(e) => caja.setCajaId(Number(e.target.value))} opciones={caja.cajas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
        )}
        {puede('caja.historial') && (
          <Boton variante="secundario" icono={vista === 'historial' ? ArrowLeft : History} onClick={() => setVista(vista === 'historial' ? 'actual' : 'historial')}>
            {vista === 'historial' ? 'Volver a la caja' : 'Historial'}
          </Boton>
        )}
      </Encabezado>
      {vista === 'historial' ? <Historial /> : caja.abierta ? <CajaAbierta caja={caja} /> : <AbrirCaja caja={caja} />}
    </div>
  );
}

function AbrirCaja({ caja }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const [monto, setMonto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const abrir = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await post(`/cajas/${caja.cajaId}/abrir`, { monto_inicial: normalizarNumero(monto) || '0' });
      avisar('Caja abierta. ¡Buenas ventas!');
      queryClient.invalidateQueries({ queryKey: ['caja-actual'] });
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-md animate-entrar rounded-3xl bg-superficie p-7 shadow-suave ring-1 ring-borde sm:p-8">
      <form onSubmit={abrir} className="space-y-5">
        <div className="text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-exito-suave text-exito-texto">
            <LockOpen size={30} aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-bold">Abrir la caja</h2>
          <p className="mt-1 text-texto-suave">Contá el efectivo con el que arranca el turno (el cambio).</p>
        </div>
        <Campo etiqueta="Efectivo inicial" icono={Coins} inputMode="decimal" placeholder="0" autoFocus value={monto} onChange={(e) => setMonto(e.target.value)} />
        <Boton type="submit" tamanio="grande" variante="exito" className="w-full" icono={LockOpen} cargando={enviando}>Abrir caja</Boton>
      </form>
    </div>
  );
}

function CajaAbierta({ caja }) {
  const { resumen } = caja;
  const { sesion } = resumen;
  const [modal, setModal] = useState(null);
  const movimientos = useQuery({ queryKey: ['caja-movimientos', sesion.id], queryFn: () => get(`/caja-sesiones/${sesion.id}`) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-exito-suave px-5 py-3.5 text-exito-texto">
        <span className="flex items-center gap-2 font-bold">
          <span className="size-2.5 rounded-full bg-exito" aria-hidden /> Caja abierta
        </span>
        <span className="flex items-center gap-1.5"><Clock size={16} aria-hidden /> {sesion.abierta_por} · desde las {hora(sesion.abierta_en)}</span>
        <span className="font-semibold">
          {resumen.ventas.cantidad} {resumen.ventas.cantidad === 1 ? 'venta' : 'ventas'} · {pesos(resumen.ventas.total)}
        </span>
        {resumen.ventas.anuladas > 0 && <Etiqueta tono="rojo">{resumen.ventas.anuladas} anuladas</Etiqueta>}
        {Number(resumen.ventas.fiado) > 0 && <Etiqueta tono="amarillo">{pesos(resumen.ventas.fiado)} fiado (no entra a la caja)</Etiqueta>}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {MEDIOS_PAGO.map((m) => (
          <Indicador key={m} icono={ICONO_MEDIO[m]} tono={m === 'EFECTIVO' ? 'bueno' : 'normal'} etiqueta={m === 'EFECTIVO' ? 'Efectivo en caja' : MEDIOS_PAGO_ETIQUETA[m]} valor={pesos(resumen.totales_por_medio[m])} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Boton variante="secundario" tamanio="grande" className="text-base" icono={ReceiptText} onClick={() => setModal('GASTO')}>Gasto</Boton>
        <Boton variante="secundario" tamanio="grande" className="text-base" icono={ArrowUpFromLine} onClick={() => setModal('RETIRO')}>Retiro</Boton>
        <Boton variante="secundario" tamanio="grande" className="text-base" icono={ArrowDownToLine} onClick={() => setModal('INGRESO')}>
          <span className="sm:hidden">Cambio</span>
          <span className="hidden sm:inline">Agregar cambio</span>
        </Boton>
        <Boton variante="peligro" tamanio="grande" className="text-base" icono={Lock} onClick={() => setModal('cerrar')}>
          <span className="sm:hidden">Cerrar</span>
          <span className="hidden sm:inline">Cerrar caja</span>
        </Boton>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">Movimientos del turno</h2>
        {movimientos.isLoading ? <Cargando /> : <Tabla filas={movimientos.data?.movimientos} columnas={columnasMovimientos} />}
      </div>

      {['GASTO', 'RETIRO', 'INGRESO'].includes(modal) && <ModalMovimiento tipo={modal} sesionId={sesion.id} efectivo={resumen.efectivo_esperado} onCerrar={() => setModal(null)} />}
      {modal === 'cerrar' && <ModalCierre sesionId={sesion.id} onCerrar={() => setModal(null)} />}
    </div>
  );
}

const DATOS_MOVIMIENTO = {
  GASTO: { titulo: 'Registrar un gasto', icono: ReceiptText },
  RETIRO: { titulo: 'Retirar efectivo', icono: ArrowUpFromLine },
  INGRESO: { titulo: 'Agregar cambio', icono: ArrowDownToLine },
};

function ModalMovimiento({ tipo, sesionId, efectivo, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar, pedirPin } = useDialogos();
  const rubros = useQuery({ queryKey: ['categorias-gasto'], queryFn: () => get('/categorias-gasto'), enabled: tipo === 'GASTO' });
  const [datos, setDatos] = useState({ importe: '', categoria_gasto_id: '', descripcion: '', medio: 'EFECTIVO' });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      const r = await conPin(pedirPin, (pin) =>
        post(`/caja-sesiones/${sesionId}/movimientos`, {
          tipo,
          importe: normalizarNumero(datos.importe),
          medio: datos.medio,
          categoria_gasto_id: datos.categoria_gasto_id || undefined,
          descripcion: datos.descripcion,
          pinAutorizacion: pin,
        }),
      );
      if (!r) return;
      avisar('Movimiento registrado.');
      queryClient.invalidateQueries({ queryKey: ['caja-actual'] });
      queryClient.invalidateQueries({ queryKey: ['caja-movimientos'] });
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={DATOS_MOVIMIENTO[tipo].titulo} icono={DATOS_MOVIMIENTO[tipo].icono} descripcion={tipo !== 'INGRESO' ? `Efectivo disponible: ${pesos(efectivo)}` : undefined} onCerrar={onCerrar} ancho="sm:max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <Campo etiqueta="Importe" icono={Coins} inputMode="decimal" autoFocus value={datos.importe} onChange={(e) => setDatos({ ...datos, importe: e.target.value })} error={errores.importe} />
        {tipo === 'GASTO' && (
          <>
            <Selector
              etiqueta="Rubro"
              vacio="Elegí un rubro..."
              value={datos.categoria_gasto_id}
              onChange={(e) => setDatos({ ...datos, categoria_gasto_id: e.target.value })}
              opciones={(rubros.data ?? []).filter((r) => r.activa).map((r) => ({ valor: r.id, etiqueta: r.nombre }))}
              error={errores.categoria_gasto_id}
            />
            <div>
              <span className="mb-1.5 block text-sm font-semibold">¿Cómo se pagó?</span>
              <SelectorBotones
                etiqueta="Cómo se pagó"
                valor={datos.medio}
                onCambio={(m) => setDatos({ ...datos, medio: m })}
                opciones={[{ valor: 'EFECTIVO', etiqueta: 'Efectivo', icono: Banknote }, { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia', icono: Smartphone }]}
              />
            </div>
          </>
        )}
        <Campo etiqueta="Detalle (opcional)" value={datos.descripcion} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} placeholder={tipo === 'GASTO' ? 'Ej: 2 bolsas de hielo' : ''} />
        <Boton type="submit" tamanio="grande" className="w-full" cargando={enviando} disabled={!datos.importe}>Guardar</Boton>
      </form>
    </Modal>
  );
}

function ModalCierre({ sesionId, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar, confirmar } = useDialogos();
  const resumen = useQuery({ queryKey: ['resumen-cierre', sesionId], queryFn: () => get(`/caja-sesiones/${sesionId}/resumen-cierre`) });
  const [modo, setModo] = useState('billetes');
  const [billetes, setBilletes] = useState({});
  const [monedas, setMonedas] = useState('');
  const [total, setTotal] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const contadoBilletes = sumar(BILLETES.map((b) => dec(b).times(Number(billetes[b]) || 0))).plus(dec(normalizarNumero(monedas) || 0));
  const contado = modo === 'billetes' ? contadoBilletes : dec(normalizarNumero(total) || 0);
  const esperado = dec(resumen.data?.efectivo_esperado ?? 0);
  const diferencia = contado.minus(esperado);
  const tonoDif = diferencia.isZero() ? 'bueno' : diferencia.lt(0) ? 'malo' : 'alerta';

  const cerrar = async () => {
    const texto = diferencia.isZero()
      ? 'La caja cierra justa.'
      : diferencia.lt(0)
        ? `Faltan ${pesos(diferencia.neg().toString())} en la caja.`
        : `Sobran ${pesos(diferencia.toString())} en la caja.`;
    if (!(await confirmar({ titulo: '¿Cerrar la caja?', mensaje: `${texto} Después de cerrar no se puede seguir vendiendo en este turno.`, textoConfirmar: 'Cerrar caja' }))) return;
    setEnviando(true);
    try {
      const detalle = modo === 'billetes' ? Object.fromEntries(Object.entries(billetes).filter(([, n]) => Number(n) > 0).map(([b, n]) => [b, Number(n)])) : undefined;
      const r = await post(`/caja-sesiones/${sesionId}/cerrar`, { efectivo_contado: contado.toFixed(2), detalle_arqueo: detalle, observaciones });
      setResultado(r);
      queryClient.invalidateQueries({ queryKey: ['caja-actual'] });
      queryClient.invalidateQueries({ queryKey: ['cajas'] });
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (resultado) {
    const dif = Number(resultado.diferencia);
    return (
      <Modal titulo="Caja cerrada" icono={Lock} onCerrar={onCerrar} ancho="sm:max-w-md">
        <div className="space-y-2.5">
          <Dato etiqueta="Efectivo esperado">{pesos(resultado.efectivo_esperado)}</Dato>
          <Dato etiqueta="Efectivo contado">{pesos(resultado.efectivo_contado)}</Dato>
          <div className={`rounded-xl px-4 py-3 ${dif === 0 ? 'bg-exito-suave' : dif < 0 ? 'bg-peligro-suave' : 'bg-alerta-suave'}`}>
            <Dato etiqueta={dif === 0 ? 'Cerró justa' : dif < 0 ? 'Faltante' : 'Sobrante'} fuerte tono={dif === 0 ? 'bueno' : dif < 0 ? 'malo' : 'alerta'}>
              {pesos(Math.abs(dif))}
            </Dato>
          </div>
          <div className="space-y-1.5 border-t border-borde pt-3">
            {MEDIOS_PAGO.filter((m) => m !== 'EFECTIVO').map((m) => (
              <Dato key={m} etiqueta={MEDIOS_PAGO_ETIQUETA[m]}>{pesos(resultado.totales_por_medio[m])}</Dato>
            ))}
          </div>
        </div>
        <Boton tamanio="grande" className="mt-6 w-full" onClick={onCerrar}>Listo</Boton>
      </Modal>
    );
  }

  return (
    <Modal titulo="Cerrar caja" icono={Calculator} descripcion="Contá el efectivo y el sistema te muestra la diferencia." onCerrar={onCerrar} ancho="sm:max-w-xl">
      {resumen.isLoading ? (
        <Cargando />
      ) : (
        <div className="space-y-4">
          <SelectorBotones etiqueta="Forma de contar" valor={modo} onCambio={setModo} opciones={[{ valor: 'billetes', etiqueta: 'Por billete', icono: Banknote }, { valor: 'total', etiqueta: 'Total directo', icono: Calculator }]} />
          {modo === 'billetes' ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BILLETES.map((b) => {
                const subtotal = dec(b).times(Number(billetes[b]) || 0);
                return (
                  <label key={b} className="flex items-center gap-3 rounded-xl bg-superficie-2 px-3 py-2 ring-1 ring-inset ring-borde">
                    <span className="w-20 font-bold tabular-nums">${Number(b).toLocaleString('es-AR')}</span>
                    <span className="text-texto-tenue" aria-hidden>×</span>
                    <input
                      inputMode="numeric"
                      aria-label={`Cantidad de billetes de ${b}`}
                      value={billetes[b] ?? ''}
                      onChange={(e) => setBilletes({ ...billetes, [b]: e.target.value.replace(/\D/g, '') })}
                      className="h-11 w-16 min-w-0 rounded-lg border border-borde-fuerte bg-superficie px-2 text-center text-lg font-semibold tabular-nums focus:border-primario focus:outline-none focus:ring-4 focus:ring-anillo"
                      placeholder="0"
                    />
                    <span className="ml-auto text-sm tabular-nums text-texto-suave">{subtotal.gt(0) ? pesos(subtotal.toString()) : ''}</span>
                  </label>
                );
              })}
              <label className="flex items-center gap-3 rounded-xl bg-superficie-2 px-3 py-2 ring-1 ring-inset ring-borde sm:col-span-2">
                <Coins size={18} className="text-texto-suave" aria-hidden />
                <span className="font-semibold">Monedas y sueltos</span>
                <input
                  inputMode="decimal"
                  value={monedas}
                  onChange={(e) => setMonedas(e.target.value)}
                  className="ml-auto h-11 w-32 min-w-0 rounded-lg border border-borde-fuerte bg-superficie px-3 text-right text-lg font-semibold tabular-nums focus:border-primario focus:outline-none focus:ring-4 focus:ring-anillo"
                  placeholder="$ 0"
                />
              </label>
            </div>
          ) : (
            <Campo etiqueta="Total de efectivo contado" icono={Coins} inputMode="decimal" autoFocus value={total} onChange={(e) => setTotal(e.target.value)} />
          )}
          <div className="space-y-2 rounded-2xl bg-superficie-2 p-4 ring-1 ring-inset ring-borde">
            <Dato etiqueta="Contado">{pesos(contado.toString())}</Dato>
            <Dato etiqueta="Debería haber">{pesos(esperado.toString())}</Dato>
            <div className="border-t border-borde pt-2">
              <Dato etiqueta={diferencia.isZero() ? 'Cierra justa' : diferencia.lt(0) ? 'Falta' : 'Sobra'} fuerte tono={tonoDif}>
                {pesos(diferencia.abs().toString())}
              </Dato>
            </div>
          </div>
          <AreaTexto etiqueta="Observaciones (opcional)" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Si hay diferencia, anotá por qué" />
          <Boton variante="peligro" tamanio="grande" className="w-full" icono={Lock} cargando={enviando} onClick={cerrar}>Cerrar caja</Boton>
        </div>
      )}
    </Modal>
  );
}

function Historial() {
  const [detalle, setDetalle] = useState(null);
  const sesiones = useQuery({ queryKey: ['caja-sesiones'], queryFn: () => get('/caja-sesiones', { porPagina: 100 }) });
  if (sesiones.isLoading) return <Cargando />;
  return (
    <>
      <Tabla
        filas={sesiones.data}
        alTocarFila={(s) => setDetalle(s.id)}
        vacio="Todavía no hay turnos de caja."
        iconoVacio={History}
        columnas={[
          { clave: 'caja', titulo: 'Caja', render: (s) => <span className="font-semibold">{s.caja}</span> },
          { clave: 'abierta', titulo: 'Apertura', render: (s) => <span>{fechaHora(s.abierta_en)} <span className="text-texto-suave">· {s.abierta_por}</span></span> },
          {
            clave: 'cerrada',
            titulo: 'Cierre',
            render: (s) => (s.estado === 'ABIERTA' ? <Etiqueta tono="verde">Abierta</Etiqueta> : <span>{fechaHora(s.cerrada_en)} <span className="text-texto-suave">· {s.cerrada_por}</span></span>),
          },
          { clave: 'esperado', titulo: 'Esperado', derecha: true, render: (s) => (s.efectivo_esperado ? pesos(s.efectivo_esperado) : '—') },
          { clave: 'contado', titulo: 'Contado', derecha: true, render: (s) => (s.efectivo_contado ? pesos(s.efectivo_contado) : '—') },
          {
            clave: 'diferencia',
            titulo: 'Diferencia',
            derecha: true,
            render: (s) => (s.diferencia === null ? '—' : <Etiqueta tono={Number(s.diferencia) === 0 ? 'verde' : Number(s.diferencia) < 0 ? 'rojo' : 'amarillo'}>{pesos(s.diferencia)}</Etiqueta>),
          },
        ]}
      />
      {detalle && <DetalleSesion id={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}

function DetalleSesion({ id, onCerrar }) {
  const q = useQuery({ queryKey: ['caja-sesion', id], queryFn: () => get(`/caja-sesiones/${id}`) });
  const d = q.data;
  return (
    <Modal titulo={`Turno de caja #${id}`} icono={Wallet} descripcion={d ? `${d.sesion.caja} · ${fechaHora(d.sesion.abierta_en)}` : undefined} onCerrar={onCerrar} ancho="sm:max-w-4xl">
      {!d ? (
        <Cargando />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MEDIOS_PAGO.map((m) => <Indicador key={m} icono={ICONO_MEDIO[m]} etiqueta={MEDIOS_PAGO_ETIQUETA[m]} valor={pesos(d.totales_por_medio[m])} />)}
          </div>
          {d.sesion.observaciones && <Tarjeta className="!bg-alerta-suave !text-alerta-texto !ring-0">{d.sesion.observaciones}</Tarjeta>}
          <Tabla filas={d.movimientos} columnas={columnasMovimientos} />
        </div>
      )}
    </Modal>
  );
}
