import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, History, Trash2 } from 'lucide-react';
import { MOTIVOS_MERMA_ETIQUETA, TIPOS_MOV_STOCK_ETIQUETA, dec } from '@pescaderia/shared';
import { conPin, get, post } from '../../api/cliente.js';
import { useSesion } from '../../contexto/Sesion.jsx';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { AreaTexto, Campo, Selector } from '../../componentes/Formulario.jsx';
import { SelectorProducto } from '../../componentes/Selectores.jsx';
import { Cargando, Etiqueta, Tabla } from '../../componentes/Varios.jsx';
import { cantidad, diasHasta, fecha, fechaHora, normalizarNumero, pesos } from '../../lib/formato.js';

const refrescarStock = (queryClient) =>
  ['stock', 'alertas', 'mermas', 'lotes', 'movimientos-stock', 'productos-pos'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

/** Registrar una merma. Si ya se sabe el producto (y el lote) llega precargado. */
export function ModalMerma({ producto: inicial = null, lote = null, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const [producto, setProducto] = useState(inicial);
  const [d, setD] = useState({ lote_id: lote ? String(lote.lote_id ?? lote.id) : '', cantidad: lote ? String(Number(lote.cantidad_actual)).replace('.', ',') : '', motivo: lote ? 'VENCIDO' : '', detalle: '' });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const set = (c) => setD((x) => ({ ...x, ...c }));
  const lotes = useQuery({ queryKey: ['lotes', producto?.id], queryFn: () => get(`/stock/productos/${producto.id}/lotes`), enabled: !!producto });

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      await post('/mermas', {
        producto_id: producto.id,
        cantidad: normalizarNumero(d.cantidad),
        motivo: d.motivo || undefined,
        detalle: d.detalle,
        lote_id: d.lote_id || undefined,
      });
      avisar('Merma registrada. El stock ya se descontó.');
      refrescarStock(queryClient);
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Registrar merma" descripcion="Mercadería que se descarta: se descuenta del stock y queda anotada la pérdida." icono={Trash2} onCerrar={onCerrar} ancho="sm:max-w-lg">
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <div className="mb-1.5 text-sm font-semibold text-texto">Producto</div>
          <SelectorProducto valor={producto} onElegir={(p) => { setProducto(p); set({ lote_id: '' }); }} autoFocus />
        </div>
        {producto && (
          <>
            {!!lotes.data?.length && (
              <Selector
                etiqueta="¿De qué ingreso?"
                value={d.lote_id}
                onChange={(e) => set({ lote_id: e.target.value })}
                vacio="El más viejo primero (automático)"
                opciones={lotes.data.map((l) => ({
                  valor: l.id,
                  etiqueta: `${cantidad(l.cantidad_actual, producto.unidad)} · entró ${fecha(l.fecha_ingreso)}${l.fecha_vencimiento ? ` · vence ${fecha(l.fecha_vencimiento)}` : ''}`,
                }))}
              />
            )}
            <Campo etiqueta={`Cantidad (${producto.unidad === 'KG' ? 'kg' : 'unidades'})`} inputMode="decimal" value={d.cantidad} onChange={(e) => set({ cantidad: e.target.value })} error={errores.cantidad} placeholder={producto.unidad === 'KG' ? 'Ej: 1,5' : 'Ej: 3'} />
            <Selector
              etiqueta="Motivo"
              value={d.motivo}
              onChange={(e) => set({ motivo: e.target.value })}
              vacio="Elegí qué pasó..."
              error={errores.motivo}
              opciones={Object.entries(MOTIVOS_MERMA_ETIQUETA).map(([valor, etiqueta]) => ({ valor, etiqueta }))}
            />
            <AreaTexto etiqueta={d.motivo === 'OTRO' ? 'Contanos qué pasó' : 'Detalle (opcional)'} value={d.detalle} onChange={(e) => set({ detalle: e.target.value })} error={errores.detalle} rows={2} />
          </>
        )}
        <div className="flex gap-3 border-t border-borde pt-4 sm:justify-end">
          <Boton variante="secundario" tamanio="grande" onClick={onCerrar} className="flex-1 sm:flex-none">Cancelar</Boton>
          <Boton type="submit" variante="peligro" tamanio="grande" cargando={enviando} disabled={!producto || !d.cantidad || !d.motivo} className="flex-1 sm:flex-none">Registrar merma</Boton>
        </div>
      </form>
    </Modal>
  );
}

/** Corregir el stock a lo que realmente hay. El cajero necesita el PIN del dueño. */
export function ModalAjuste({ producto, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar, pedirPin } = useDialogos();
  const [real, setReal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const numero = normalizarNumero(real);
  const valido = /^\d+(\.\d{1,3})?$/.test(numero);
  const diferencia = valido ? dec(numero).minus(producto.stock_actual) : null;

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      const r = await conPin(pedirPin, (pin) => post('/stock/ajustes', { producto_id: producto.id, cantidad_real: numero, motivo, pinAutorizacion: pin }));
      if (!r) return;
      avisar('Stock corregido.');
      refrescarStock(queryClient);
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Corregir stock" descripcion={producto.nombre} icono={ClipboardCheck} onCerrar={onCerrar} ancho="sm:max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <div className="rounded-xl bg-superficie-2 px-4 py-3">
          <div className="text-sm text-texto-suave">El sistema dice que hay</div>
          <div className="text-2xl font-bold tabular-nums text-texto">{cantidad(producto.stock_actual, producto.unidad)}</div>
        </div>
        <Campo etiqueta="¿Cuánto hay realmente?" autoFocus inputMode="decimal" value={real} onChange={(e) => setReal(e.target.value)} error={errores.cantidad_real} placeholder={producto.unidad === 'KG' ? 'Ej: 12,5' : 'Ej: 8'} />
        {diferencia && !diferencia.isZero() && (
          <p className={`rounded-xl px-4 py-2.5 font-semibold ${diferencia.gt(0) ? 'bg-exito-suave text-exito-texto' : 'bg-peligro-suave text-peligro-texto'}`}>
            {diferencia.gt(0) ? 'Sobran ' : 'Faltan '}
            {cantidad(diferencia.abs().toString(), producto.unidad)}
          </p>
        )}
        <AreaTexto etiqueta="¿Por qué se corrige?" value={motivo} onChange={(e) => setMotivo(e.target.value)} error={errores.motivo} rows={2} placeholder="Ej: Se pesó mal el remito, apareció una caja..." />
        <p className="text-sm text-texto-suave">Para descartar mercadería que se echó a perder usá <strong>Registrar merma</strong>: así queda anotada la pérdida.</p>
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" onClick={onCerrar} className="flex-1">Cancelar</Boton>
          <Boton type="submit" tamanio="grande" cargando={enviando} disabled={!valido || !motivo.trim() || !diferencia || diferencia.isZero()} className="flex-1">Corregir</Boton>
        </div>
      </form>
    </Modal>
  );
}

/** Detalle de un producto: ingresos con mercadería y movimientos recientes. */
export function ModalDetalleStock({ producto, onCerrar, onMerma, onAjuste }) {
  const { puede } = useSesion();
  const verCostos = puede('costos.ver');
  const lotes = useQuery({ queryKey: ['lotes', producto.id], queryFn: () => get(`/stock/productos/${producto.id}/lotes`) });
  const movs = useQuery({ queryKey: ['movimientos-stock', producto.id], queryFn: () => get(`/stock/productos/${producto.id}/movimientos`) });

  return (
    <Modal titulo={producto.nombre} descripcion={`${producto.categoria} · hay ${cantidad(producto.stock_actual, producto.unidad)}`} onCerrar={onCerrar} ancho="sm:max-w-3xl">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <Boton variante="peligro-suave" icono={Trash2} onClick={onMerma}>Registrar merma</Boton>
          <Boton variante="suave" icono={ClipboardCheck} onClick={onAjuste}>Corregir stock</Boton>
        </div>

        <section>
          <h3 className="mb-2 font-bold text-texto">Mercadería que hay (por ingreso)</h3>
          {lotes.isLoading ? (
            <Cargando />
          ) : (
            <Tabla
              filas={lotes.data}
              vacio="No hay mercadería cargada de este producto."
              columnas={[
                { clave: 'ingreso', titulo: 'Entró', render: (l) => fecha(l.fecha_ingreso) },
                { clave: 'origen', titulo: 'Origen', render: (l) => <span className="text-texto-suave">{{ COMPRA: 'Compra', AJUSTE: 'Ajuste', INVENTARIO: 'Inventario' }[l.origen]}</span> },
                {
                  clave: 'vence',
                  titulo: 'Vence',
                  render: (l) => {
                    if (!l.fecha_vencimiento) return <span className="text-texto-tenue">—</span>;
                    const dias = diasHasta(l.fecha_vencimiento);
                    return dias < 0 ? <Etiqueta tono="rojo">Vencido {fecha(l.fecha_vencimiento)}</Etiqueta> : dias <= 2 ? <Etiqueta tono="amarillo">{fecha(l.fecha_vencimiento)}</Etiqueta> : fecha(l.fecha_vencimiento);
                  },
                },
                { clave: 'cant', titulo: 'Queda', derecha: true, render: (l) => <strong>{cantidad(l.cantidad_actual, producto.unidad)}</strong> },
                ...(verCostos ? [{ clave: 'costo', titulo: 'Costo', derecha: true, render: (l) => pesos(l.costo_unitario) }] : []),
              ]}
            />
          )}
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 font-bold text-texto"><History size={18} aria-hidden /> Últimos movimientos</h3>
          {movs.isLoading ? (
            <Cargando />
          ) : (
            <Tabla
              filas={movs.data?.slice(0, 15)}
              vacio="Todavía no hay movimientos."
              columnas={[
                { clave: 'fecha', titulo: 'Cuándo', render: (m) => <span className="text-texto-suave">{fechaHora(m.creado_en)}</span> },
                { clave: 'tipo', titulo: 'Qué pasó', render: (m) => <span>{TIPOS_MOV_STOCK_ETIQUETA[m.tipo]}{m.motivo && <span className="text-texto-suave"> · {m.motivo}</span>}</span> },
                { clave: 'cant', titulo: 'Cantidad', derecha: true, render: (m) => <strong className={dec(m.cantidad).gt(0) ? 'text-exito-texto' : 'text-peligro-texto'}>{dec(m.cantidad).gt(0) ? '+' : ''}{cantidad(m.cantidad, producto.unidad)}</strong> },
                { clave: 'usuario', titulo: 'Quién', render: (m) => <span className="text-texto-suave">{m.usuario_nombre}</span> },
              ]}
            />
          )}
        </section>
      </div>
    </Modal>
  );
}
