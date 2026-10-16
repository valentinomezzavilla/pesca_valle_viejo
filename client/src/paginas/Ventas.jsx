import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarDays, Hash, Printer, Receipt, ReceiptText, TrendingUp, UserRound, Wallet } from 'lucide-react';
import { MEDIOS_PAGO_ETIQUETA, dec } from '@pescaderia/shared';
import { conPin, get, post } from '../api/cliente.js';
import { useSesion } from '../contexto/Sesion.jsx';
import { useDialogos } from '../contexto/Dialogos.jsx';
import { useImpresion } from '../contexto/Impresion.jsx';
import { useCaja } from '../hooks/useCaja.js';
import { Boton } from '../componentes/Boton.jsx';
import { Modal } from '../componentes/Modal.jsx';
import { Campo } from '../componentes/Formulario.jsx';
import { Cargando, Dato, Encabezado, ErrorCarga, Etiqueta, Indicador, Tabla } from '../componentes/Varios.jsx';
import { cantidad, fechaHora, hoyIso, pesos, porcentaje } from '../lib/formato.js';

const numeroTicket = (v) => (v.numero ? `${String(v.punto_venta).padStart(4, '0')}-${String(v.numero).padStart(8, '0')}` : '—');

export function Ventas() {
  const { puede } = useSesion();
  const verTodas = puede('ventas.ver_todas');
  const verCostos = puede('costos.ver');
  const [filtro, setFiltro] = useState({ desde: hoyIso(), hasta: hoyIso() });
  const [detalle, setDetalle] = useState(null);
  const query = verTodas ? { ...filtro, porPagina: 200 } : { porPagina: 200 };
  const ventas = useQuery({ queryKey: ['ventas', query], queryFn: () => get('/ventas', query) });

  const resumen = ventas.data?.resumen;
  const ganancia = resumen && verCostos ? dec(resumen.total).minus(resumen.costo_total) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Ventas" icono={Receipt} subtitulo={verTodas ? 'Historial de ventas por fecha' : 'Ventas del turno de caja actual'}>
        {verTodas && (
          <>
            <Campo etiqueta="Desde" type="date" value={filtro.desde} max={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
            <Campo etiqueta="Hasta" type="date" value={filtro.hasta} min={filtro.desde} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
          </>
        )}
      </Encabezado>

      {resumen && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador icono={Hash} etiqueta="Cantidad de ventas" valor={resumen.cantidad} />
          <Indicador icono={Wallet} etiqueta="Total vendido" valor={pesos(resumen.total)} />
          <Indicador icono={ReceiptText} etiqueta="Ticket promedio" valor={pesos(resumen.cantidad ? dec(resumen.total).div(resumen.cantidad).toFixed(2) : 0)} />
          {ganancia && (
            <Indicador
              icono={TrendingUp}
              tono="bueno"
              etiqueta="Ganancia bruta"
              valor={pesos(ganancia.toFixed(2))}
              detalle={dec(resumen.total).gt(0) ? `Margen ${porcentaje(ganancia.div(resumen.total).times(100).toFixed(1))}` : undefined}
            />
          )}
        </div>
      )}

      {ventas.isLoading ? (
        <Cargando />
      ) : ventas.error ? (
        <ErrorCarga error={ventas.error} reintentar={ventas.refetch} />
      ) : (
        <Tabla
          filas={ventas.data.ventas}
          alTocarFila={(v) => setDetalle(v.id)}
          vacio="No hay ventas en este período."
          iconoVacio={CalendarDays}
          columnas={[
            { clave: 'numero', titulo: 'Comprobante', render: (v) => <span className="font-mono text-sm">{numeroTicket(v)}</span> },
            { clave: 'fecha', titulo: 'Fecha y hora', render: (v) => <span className="text-texto-suave">{fechaHora(v.fecha)}</span> },
            { clave: 'items', titulo: 'Productos', derecha: true, render: (v) => v.cantidad_items },
            {
              clave: 'medios',
              titulo: 'Pago',
              render: (v) => (
                <span>
                  {(v.medios ?? '').split(',').filter(Boolean).map((m) => MEDIOS_PAGO_ETIQUETA[m]).join(' + ')}
                  {v.cliente && <span className="block text-sm text-texto-suave">{v.cliente}</span>}
                </span>
              ),
            },
            { clave: 'usuario', titulo: 'Vendió', render: (v) => v.usuario_nombre },
            {
              clave: 'total',
              titulo: 'Total',
              derecha: true,
              render: (v) => <strong className={v.estado === 'ANULADA' ? 'text-texto-tenue line-through' : ''}>{pesos(v.total)}</strong>,
            },
            { clave: 'estado', titulo: '', render: (v) => v.estado === 'ANULADA' && <Etiqueta tono="rojo" icono={Ban}>Anulada</Etiqueta> },
          ]}
        />
      )}
      {detalle && <DetalleVenta id={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}

function DetalleVenta({ id, onCerrar }) {
  const queryClient = useQueryClient();
  const { puede } = useSesion();
  const { avisar, pedirTexto, pedirPin } = useDialogos();
  const { imprimirComprobante } = useImpresion();
  const { cajaId } = useCaja();
  const q = useQuery({ queryKey: ['venta', id], queryFn: () => get(`/ventas/${id}`) });
  const v = q.data;
  const ticket = v?.comprobantes?.find((c) => c.tipo === 'TICKET_INTERNO');

  const anular = async () => {
    const motivo = await pedirTexto({
      titulo: 'Anular venta',
      mensaje: 'La mercadería vuelve al stock y la plata sale de la caja. La anulación queda registrada.',
      etiqueta: 'Motivo de la anulación',
      textoConfirmar: 'Anular venta',
      peligro: true,
    });
    if (!motivo) return;
    try {
      const r = await conPin(pedirPin, (pin) => post(`/ventas/${id}/anular`, { motivo, pinAutorizacion: pin, caja_id: cajaId ?? undefined }));
      if (!r) return;
      avisar('Venta anulada.');
      ['ventas', 'venta', 'caja-actual', 'productos-pos', 'caja-movimientos'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      avisar(e.message, 'error');
    }
  };

  return (
    <Modal
      titulo={`Venta #${id}`}
      icono={Receipt}
      descripcion={v ? `${fechaHora(v.fecha)} · ${v.usuario_nombre} · ${v.caja}` : undefined}
      onCerrar={onCerrar}
      ancho="sm:max-w-2xl"
    >
      {!v ? (
        <Cargando />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {ticket && <Etiqueta tono="azul">Comprobante {ticket.numero_formateado}</Etiqueta>}
            {v.cliente && <Etiqueta tono="gris" icono={UserRound}>{v.cliente}</Etiqueta>}
            {v.estado === 'ANULADA' ? <Etiqueta tono="rojo" icono={Ban}>Anulada</Etiqueta> : <Etiqueta tono="verde">Confirmada</Etiqueta>}
          </div>
          {v.estado === 'ANULADA' && (
            <div className="rounded-xl bg-peligro-suave px-4 py-3 text-peligro-texto">
              Anulada el {fechaHora(v.anulada_en)} por {v.anulada_por}
              {v.autorizada_por && v.autorizada_por !== v.anulada_por && ` (autorizó ${v.autorizada_por})`}. <strong>Motivo:</strong> {v.motivo_anulacion}
            </div>
          )}
          <Tabla
            filas={v.items}
            columnas={[
              { clave: 'descripcion', titulo: 'Producto', render: (i) => <span className="font-medium">{i.descripcion}</span> },
              { clave: 'cantidad', titulo: 'Cantidad', derecha: true, render: (i) => cantidad(i.cantidad, i.unidad) },
              { clave: 'precio', titulo: 'Precio', derecha: true, render: (i) => pesos(i.precio_unitario) },
              {
                clave: 'desc',
                titulo: 'Desc.',
                derecha: true,
                render: (i) => (Number(i.descuento) + Number(i.descuento_prorrateado) > 0 ? <span className="text-exito-texto">−{pesos(Number(i.descuento) + Number(i.descuento_prorrateado))}</span> : ''),
              },
              { clave: 'total', titulo: 'Total', derecha: true, render: (i) => <strong>{pesos(i.total)}</strong> },
              ...(puede('costos.ver') ? [{ clave: 'costo', titulo: 'Costo', derecha: true, render: (i) => <span className="text-texto-suave">{pesos(i.costo_total)}</span> }] : []),
            ]}
          />
          <div className="ml-auto max-w-xs space-y-1.5">
            {Number(v.descuento_global) > 0 && <Dato etiqueta="Descuento general" tono="bueno">−{pesos(v.descuento_global)}</Dato>}
            <Dato etiqueta="Total" fuerte>{pesos(v.total)}</Dato>
            {v.pagos.map((p) => (
              <Dato key={p.id} etiqueta={`${MEDIOS_PAGO_ETIQUETA[p.medio]}${p.referencia ? ` (${p.referencia})` : ''}`}>{pesos(p.monto)}</Dato>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {ticket && <Boton variante="secundario" tamanio="grande" icono={Printer} onClick={() => imprimirComprobante(ticket.id, { reimpresion: true })}>Reimprimir</Boton>}
            {v.estado === 'CONFIRMADA' && <Boton variante="peligro-suave" tamanio="grande" icono={Ban} onClick={anular}>Anular venta</Boton>}
          </div>
        </div>
      )}
    </Modal>
  );
}
