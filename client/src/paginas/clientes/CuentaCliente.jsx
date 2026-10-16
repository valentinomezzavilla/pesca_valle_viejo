import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, BookUser, CreditCard, Download, FileText, HandCoins, MessageCircle, Pencil, ReceiptText, Scale, Smartphone, TriangleAlert, Undo2, UserRound } from 'lucide-react';
import { MEDIOS_PAGO, MEDIOS_PAGO_ETIQUETA, TIPOS_MOV_CC_CLIENTE_ETIQUETA, UNIDADES_ETIQUETA, dec } from '@pescaderia/shared';
import { conPin, get, post } from '../../api/cliente.js';
import { useSesion } from '../../contexto/Sesion.jsx';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { useCaja } from '../../hooks/useCaja.js';
import { Boton, clasesBoton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { Campo, Selector, SelectorBotones } from '../../componentes/Formulario.jsx';
import { BotonesContacto } from '../../componentes/Contacto.jsx';
import { MovimientosCuenta, TarjetaSaldo } from '../../componentes/CuentaCorriente.jsx';
import { Cargando, Dato, Encabezado, ErrorCarga, Etiqueta, Tabla, Tarjeta } from '../../componentes/Varios.jsx';
import { cantidad, fecha, hoyIso, inicioMesIso, normalizarNumero, pesos } from '../../lib/formato.js';
import { enlaceWhatsApp, textoVencimiento } from '../../lib/proveedores.js';
import { ModalCliente } from './Clientes.jsx';

const ICONOS_MEDIO = { EFECTIVO: Banknote, TRANSFERENCIA: Smartphone, TARJETA_DEBITO: CreditCard, TARJETA_CREDITO: CreditCard };
const fmtDia = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const diaLargo = (iso) => fmtDia.format(new Date(`${iso}T12:00:00Z`));

function useRefresco() {
  const queryClient = useQueryClient();
  return () => ['ficha-cliente', 'clientes', 'caja-actual', 'caja-movimientos', 'panel'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
}

function EtiquetaEstado({ deuda }) {
  if (deuda.estado === 'VENCIDA') return <Etiqueta tono="rojo">{textoVencimiento(deuda.dias_para_vencer)}</Etiqueta>;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Etiqueta tono={deuda.dias_para_vencer <= 3 ? 'amarillo' : 'azul'}>{textoVencimiento(deuda.dias_para_vencer)}</Etiqueta>
      {deuda.estado === 'PARCIAL' && <Etiqueta>Pagada a medias</Etiqueta>}
    </span>
  );
}

export function CuentaCliente() {
  const { id } = useParams();
  const { puede } = useSesion();
  const [modal, setModal] = useState(null); // 'cobro' | 'ajuste' | 'editar' | 'pdf' | { anular } | { venta }
  const q = useQuery({ queryKey: ['ficha-cliente', id], queryFn: () => get(`/clientes/${id}/ficha`) });

  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCarga error={q.error} reintentar={q.refetch} />;
  const { cliente: c, saldo, vencido, proximo_vencimiento: proximo, compras_pendientes: pendientes, movimientos } = q.data;
  const debe = dec(saldo).gt(0);
  const restante = c.limite_credito !== null ? dec(c.limite_credito).minus(saldo) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/clientes" className="mb-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primario-texto hover:underline">
        <ArrowLeft size={18} aria-hidden /> Volver a Clientes
      </Link>
      <Encabezado titulo={c.nombre} icono={UserRound} subtitulo={[c.telefono, c.documento && `Doc. ${c.documento}`, !c.activo && 'Dado de baja'].filter(Boolean).join(' · ') || 'Cliente'} />

      {!c.cuenta_corriente && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-alerta-suave px-4 py-3 text-alerta-texto">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert size={18} className="shrink-0" aria-hidden /> No tiene cuenta corriente: no se le puede vender a cuenta.
          </p>
          <Boton tamanio="grande" icono={BookUser} onClick={() => setModal('editar')}>Habilitar cuenta corriente</Boton>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Boton variante="exito" tamanio="grande" icono={HandCoins} onClick={() => setModal('cobro')} disabled={!debe || !c.activo}>Cobrar</Boton>
        <Boton variante="secundario" tamanio="grande" icono={FileText} onClick={() => setModal('pdf')} className="sm:order-last">Resumen y detalle</Boton>
        <BotonesContacto telefono={c.telefono} tamanio="grande" className="col-span-2 grid grid-cols-2 [&>*]:w-full" />
      </div>

      <TarjetaSaldo
        saldo={saldo}
        textoDeuda="Nos debe"
        textoAFavor="Tiene plata a favor"
        textoCero="No debe nada"
        detalle={
          <span className="mt-2 block space-y-1 text-base">
            {debe && <span className="block font-semibold">{dec(vencido).gt(0) ? `Ya vencido: ${pesos(vencido)}` : 'Nada vencido'}</span>}
            {proximo && <span className="block">Próximo vencimiento: <span className="capitalize">{diaLargo(proximo.fecha)}</span> — {pesos(proximo.importe)}</span>}
            {c.cuenta_corriente && (
              <span className="block text-sm opacity-90">
                {c.limite_credito !== null
                  ? restante.gte(0)
                    ? `Límite ${pesos(c.limite_credito)} · puede deber ${pesos(restante.toFixed(2))} más`
                    : `Límite ${pesos(c.limite_credito)} · se pasó por ${pesos(restante.abs().toFixed(2))}`
                  : 'Sin límite de crédito'}
                {` · paga a ${c.plazo_pago_dias ? `${c.plazo_pago_dias} días` : 'en el día'}`}
              </span>
            )}
          </span>
        }
      >
        {puede('clientes.ajustar') && <Boton variante="secundario" tamanio="grande" icono={Scale} onClick={() => setModal('ajuste')}>Ajustar cuenta</Boton>}
      </TarjetaSaldo>

      <h2 className="mb-3 text-lg font-bold text-texto">Compras sin pagar</h2>
      <p className="mb-2 text-sm text-texto-suave">Tocá una compra para ver qué llevó.</p>
      <div className="mb-8">
        <Tabla
          filas={pendientes}
          claveFila={(x) => x.venta_id ?? `a${x.movimiento_id}`}
          alTocarFila={(x) => x.venta_id && setModal({ venta: x })}
          vacio="No debe ninguna compra."
          iconoVacio={ReceiptText}
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', render: (x) => fecha(x.fecha) },
            { clave: 'que', titulo: 'Compra', render: (x) => (x.ticket ? `Ticket ${x.ticket}` : x.descripcion || 'Deuda cargada a mano') },
            { clave: 'pendiente', titulo: 'Falta pagar', derecha: true, render: (x) => <strong>{pesos(x.pendiente)}</strong> },
            { clave: 'estado', titulo: '¿Cuándo vence?', render: (x) => <EtiquetaEstado deuda={x} /> },
          ]}
        />
      </div>

      <h2 className="mb-3 text-lg font-bold text-texto">Movimientos</h2>
      <MovimientosCuenta
        movimientos={movimientos}
        etiquetas={TIPOS_MOV_CC_CLIENTE_ETIQUETA}
        vacio={'Todavía no hay movimientos. Para venderle a cuenta, al cobrar elegí "Cuenta corriente".'}
        extra={(m) => (
          <>
            {m.numero && <span className="text-texto-suave"> · ticket {String(m.punto_venta).padStart(4, '0')}-{String(m.numero).padStart(8, '0')}</span>}
            {m.medio_cobro && <span className="text-texto-suave"> · {MEDIOS_PAGO_ETIQUETA[m.medio_cobro]}</span>}
          </>
        )}
        accion={(m) => m.se_puede_anular && <Boton variante="peligro-suave" icono={Undo2} onClick={() => setModal({ anular: m })}>Anular cobro</Boton>}
      />

      <Tarjeta className="mt-8" titulo="Datos del cliente" icono={UserRound} accion={<Boton variante="secundario" icono={Pencil} onClick={() => setModal('editar')}>Editar datos</Boton>}>
        <div className="space-y-3">
          <Dato etiqueta="Cuenta corriente">{c.cuenta_corriente ? 'Sí' : 'No'}</Dato>
          <Dato etiqueta="Plazo para pagar">{c.plazo_pago_dias ? `${c.plazo_pago_dias} días` : 'En el día'}</Dato>
          <Dato etiqueta="Límite de crédito">{c.limite_credito !== null ? pesos(c.limite_credito) : 'Sin límite'}</Dato>
          <Dato etiqueta="DNI / CUIT">{c.documento || '—'}</Dato>
          <Dato etiqueta="Dirección">{c.direccion || '—'}</Dato>
          {c.notas && <p className="whitespace-pre-line rounded-xl bg-superficie-2 p-3 text-texto">{c.notas}</p>}
        </div>
      </Tarjeta>

      {modal === 'editar' && <ModalCliente cliente={{ ...c, saldo }} onCerrar={() => setModal(null)} />}
      {modal === 'cobro' && <ModalCobroCliente cliente={c} saldo={saldo} onCerrar={() => setModal(null)} />}
      {modal === 'ajuste' && <ModalAjusteCliente cliente={c} saldo={saldo} onCerrar={() => setModal(null)} />}
      {modal === 'pdf' && <ModalPdfCliente cliente={c} onCerrar={() => setModal(null)} />}
      {modal?.anular && <ModalAnularCobro cliente={c} movimiento={modal.anular} onCerrar={() => setModal(null)} />}
      {modal?.venta && <ModalVenta deuda={modal.venta} onCerrar={() => setModal(null)} />}
    </div>
  );
}

function ModalCobroCliente({ cliente, saldo, onCerrar }) {
  const refrescar = useRefresco();
  const { avisar } = useDialogos();
  const caja = useCaja();
  const [d, setD] = useState({ importe: dec(saldo).toFixed(2).replace('.', ','), medio: 'EFECTIVO' });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const importe = normalizarNumero(d.importe);
  const valido = /^\d+(\.\d{1,2})?$/.test(importe) && Number(importe) > 0 && dec(importe).lte(saldo);
  const restante = valido ? dec(saldo).minus(importe) : null;

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      const r = await post(`/clientes/${cliente.id}/cobros`, { importe, medio: d.medio, caja_id: caja.cajaId });
      avisar(dec(r.saldo).isZero() ? 'Cobrado. ¡La cuenta quedó saldada!' : `Cobrado. Todavía debe ${pesos(r.saldo)}.`);
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
    <Modal titulo="Cobrar" descripcion={`${cliente.nombre} debe ${pesos(saldo)}`} icono={HandCoins} onCerrar={onCerrar} ancho="sm:max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <Campo etiqueta="¿Cuánto paga?" autoFocus inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} error={errores.importe} />
        {restante && <p className="text-sm text-texto-suave">{restante.isZero() ? 'Con esto salda toda la deuda.' : `Va a quedar debiendo ${pesos(restante.toFixed(2))}.`}</p>}
        <p className="text-sm text-texto-suave">El pago cancela primero las compras más viejas.</p>
        <div>
          <div className="mb-1.5 text-sm font-semibold text-texto">¿Con qué paga?</div>
          <SelectorBotones etiqueta="Medio de pago" valor={d.medio} onCambio={(v) => setD({ ...d, medio: v })} opciones={MEDIOS_PAGO.map((m) => ({ valor: m, etiqueta: MEDIOS_PAGO_ETIQUETA[m], icono: ICONOS_MEDIO[m] }))} />
        </div>
        {caja.cajas.length > 1 && (
          <Selector etiqueta="¿En qué caja entra?" value={caja.cajaId ?? ''} onChange={(e) => caja.setCajaId(Number(e.target.value))} opciones={caja.cajas.map((x) => ({ valor: x.id, etiqueta: x.nombre }))} />
        )}
        {!caja.abierta && !caja.cargando && (
          <p className="flex items-center gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
            <TriangleAlert size={18} className="shrink-0" aria-hidden /> La caja está cerrada. Abrila para registrar el cobro.
          </p>
        )}
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" className="flex-1" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" variante="exito" tamanio="grande" className="flex-1" cargando={enviando} disabled={!valido || !caja.abierta}>Cobrar</Boton>
        </div>
      </form>
    </Modal>
  );
}

function ModalAjusteCliente({ cliente, saldo, onCerrar }) {
  const refrescar = useRefresco();
  const { avisar } = useDialogos();
  const [d, setD] = useState({ importe: '', sentido: 'BAJAR', motivo: '' });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const importe = normalizarNumero(d.importe);
  const valido = /^\d+(\.\d{1,2})?$/.test(importe) && Number(importe) > 0 && d.motivo.trim();
  const nuevo = valido ? dec(saldo).plus(d.sentido === 'BAJAR' ? dec(importe).neg() : importe) : null;

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      await post(`/clientes/${cliente.id}/ajustes`, { importe, sentido: d.sentido, motivo: d.motivo });
      avisar('Cuenta ajustada.');
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
    <Modal titulo="Ajustar la cuenta" descripcion={`${cliente.nombre} · hoy: ${pesos(saldo)}`} icono={Scale} onCerrar={onCerrar} ancho="sm:max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <SelectorBotones
          etiqueta="Qué hacer con la deuda"
          valor={d.sentido}
          onCambio={(v) => setD({ ...d, sentido: v })}
          opciones={[{ valor: 'BAJAR', etiqueta: 'Bajar la deuda' }, { valor: 'SUBIR', etiqueta: 'Subir la deuda' }]}
        />
        <Campo etiqueta="Importe" autoFocus inputMode="decimal" value={d.importe} onChange={(e) => setD({ ...d, importe: e.target.value })} error={errores.importe} placeholder="$ 0,00" />
        <Campo etiqueta="Motivo" value={d.motivo} onChange={(e) => setD({ ...d, motivo: e.target.value })} error={errores.motivo} placeholder="Ej: Se le perdonó una parte, deuda anterior al sistema" />
        {nuevo && <p className="rounded-xl bg-superficie-2 px-4 py-2.5 font-semibold text-texto">La deuda pasa a ser {pesos(nuevo.toFixed(2))}.</p>}
        <p className="text-sm text-texto-suave">Esto no mueve la caja: solo corrige lo que el cliente debe. Subir la deuda la carga como una compra de hoy (vence según su plazo).</p>
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" className="flex-1" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" tamanio="grande" className="flex-1" cargando={enviando} disabled={!valido}>Ajustar</Boton>
        </div>
      </form>
    </Modal>
  );
}

function ModalAnularCobro({ cliente, movimiento, onCerrar }) {
  const refrescar = useRefresco();
  const { avisar, pedirPin } = useDialogos();
  const caja = useCaja();
  const [motivo, setMotivo] = useState('');
  const [pedirCaja, setPedirCaja] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const importe = pesos(dec(movimiento.importe).abs().toFixed(2));

  const anular = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await conPin(pedirPin, (pin) =>
        post(`/clientes/${cliente.id}/movimientos/${movimiento.id}/anular`, { motivo, caja_id: pedirCaja ? caja.cajaId : undefined, pinAutorizacion: pin }),
      );
      if (!r) return;
      avisar('Cobro anulado. La deuda volvió a la cuenta.');
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
    <Modal titulo="Anular cobro" descripcion={cliente.nombre} icono={Undo2} onCerrar={onCerrar} ancho="sm:max-w-md">
      <form onSubmit={anular} className="space-y-4">
        <p className="text-lg text-texto">¿Seguro que querés anular este cobro de <strong>{importe}</strong>?</p>
        <p className="text-sm text-texto-suave">La plata sale de la caja ({MEDIOS_PAGO_ETIQUETA[movimiento.medio_cobro] ?? 'mismo medio'}) y la deuda vuelve a la cuenta.</p>
        <Campo etiqueta="¿Por qué?" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Se cargó dos veces" />
        {pedirCaja && (
          <>
            {caja.cajas.length > 1 && (
              <Selector etiqueta="¿De qué caja sale la plata?" value={caja.cajaId ?? ''} onChange={(e) => caja.setCajaId(Number(e.target.value))} opciones={caja.cajas.map((x) => ({ valor: x.id, etiqueta: x.nombre }))} />
            )}
            {caja.abierta ? (
              <p className="text-sm text-texto-suave">La plata sale de {caja.caja?.nombre ?? 'la caja'}.</p>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
                <TriangleAlert size={18} className="shrink-0" aria-hidden />
                {caja.cajas.length > 1 ? 'Esa caja está cerrada. Elegí otra o abrila.' : 'La caja está cerrada. Abrila para poder anular.'}
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

function ModalPdfCliente({ cliente, onCerrar }) {
  const [desde, setDesde] = useState(inicioMesIso());
  const [hasta, setHasta] = useState(hoyIso());
  const fechasValidas = desde && hasta && desde <= hasta;
  const wa = enlaceWhatsApp(cliente.telefono, `Hola${cliente.nombre ? ` ${cliente.nombre}` : ''}, te paso el detalle de tu cuenta.`);
  return (
    <Modal titulo="Resumen y detalle de deuda" descripcion={cliente.nombre} icono={FileText} onCerrar={onCerrar} ancho="sm:max-w-md">
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="font-bold text-texto">Lo que debe hoy, ticket por ticket</h3>
          <a href={`/api/clientes/${cliente.id}/detalle-deuda.pdf`} download className={clasesBoton({ tamanio: 'grande', className: 'w-full' })}>
            <Download size={22} aria-hidden /> Descargar detalle de deuda
          </a>
        </section>
        <section className="space-y-3 border-t border-borde pt-4">
          <h3 className="font-bold text-texto">Resumen de cuenta de un período</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
            <Campo etiqueta="Hasta" type="date" value={hasta} min={desde} max={hoyIso()} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {fechasValidas ? (
            <a href={`/api/clientes/${cliente.id}/resumen.pdf?desde=${desde}&hasta=${hasta}`} download className={clasesBoton({ variante: 'secundario', tamanio: 'grande', className: 'w-full' })}>
              <Download size={22} aria-hidden /> Descargar resumen
            </a>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-alerta-suave px-4 py-3 font-medium text-alerta-texto">
              <TriangleAlert size={18} className="shrink-0" aria-hidden /> Completá las dos fechas. "Desde" tiene que ser anterior a "Hasta".
            </p>
          )}
        </section>
        {cliente.telefono && (
          <section className="space-y-2 border-t border-borde pt-4">
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamanio: 'grande', className: 'w-full' })}>
                <MessageCircle size={22} aria-hidden /> Abrir WhatsApp
              </a>
            ) : (
              <p className="text-sm text-alerta-texto">El teléfono no sirve para WhatsApp: revisá que tenga la característica.</p>
            )}
            <p className="text-sm text-texto-suave">Primero descargá el PDF. Después, en el chat de WhatsApp, tocá el clip 📎 y elegí el archivo.</p>
          </section>
        )}
      </div>
    </Modal>
  );
}

function ModalVenta({ deuda, onCerrar }) {
  const q = useQuery({ queryKey: ['venta', deuda.venta_id], queryFn: () => get(`/ventas/${deuda.venta_id}`) });
  return (
    <Modal titulo={deuda.ticket ? `Ticket ${deuda.ticket}` : 'Compra'} descripcion={`${fecha(deuda.fecha)} · falta pagar ${pesos(deuda.pendiente)}`} icono={ReceiptText} onCerrar={onCerrar} ancho="sm:max-w-lg">
      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorCarga error={q.error} reintentar={q.refetch} />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-borde rounded-xl ring-1 ring-borde">
            {q.data.items.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block font-semibold text-texto">{i.descripcion}</span>
                  <span className="text-sm text-texto-suave">{cantidad(i.cantidad, i.unidad)} × {pesos(i.precio_unitario)} / {UNIDADES_ETIQUETA[i.unidad]}</span>
                </span>
                <strong className="tabular-nums">{pesos(i.total)}</strong>
              </li>
            ))}
          </ul>
          <Dato etiqueta="Total del ticket" fuerte>{pesos(q.data.total)}</Dato>
          <Dato etiqueta="Quedó a cuenta">{pesos(deuda.total)}</Dato>
          <Dato etiqueta="Falta pagar" tono="malo">{pesos(deuda.pendiente)}</Dato>
          <Boton variante="secundario" tamanio="grande" className="w-full" onClick={onCerrar}>Cerrar</Boton>
        </div>
      )}
    </Modal>
  );
}
