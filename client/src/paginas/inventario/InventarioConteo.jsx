import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardCheck, ClipboardList, Search } from 'lucide-react';
import { dec, sumar } from '@pescaderia/shared';
import { get, post, put } from '../../api/cliente.js';
import { useSesion } from '../../contexto/Sesion.jsx';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { Campo } from '../../componentes/Formulario.jsx';
import { Cargando, Encabezado, ErrorCarga, Etiqueta, Tabla } from '../../componentes/Varios.jsx';
import { cantidad, fechaHora, normalizarNumero, pesos } from '../../lib/formato.js';
import { ESTADO_INVENTARIO } from './Inventario.jsx';

const contado = (i) => i.cantidad_contada !== null && i.cantidad_contada !== undefined;
const textoInicial = (i) => (contado(i) ? String(Number(i.cantidad_contada)).replace('.', ',') : '');

export function InventarioConteo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { puede } = useSesion();
  const { avisar, confirmar } = useDialogos();
  const puedeCerrar = puede('inventario.cerrar');
  const [tab, setTab] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [revisando, setRevisando] = useState(false);
  const q = useQuery({ queryKey: ['inventario', id], queryFn: () => get(`/inventarios/${id}`) });
  const inv = q.data;
  const abierto = inv?.estado === 'ABIERTO';

  const actualizarItem = (productoId, cambios) =>
    queryClient.setQueryData(['inventario', id], (viejo) => ({ ...viejo, items: viejo.items.map((i) => (i.producto_id === productoId ? { ...i, ...cambios } : i)) }));

  const guardarConteo = async (item, texto) => {
    const numero = normalizarNumero(texto);
    try {
      const r = await put(`/inventarios/${id}/items/${item.producto_id}`, { cantidad_contada: numero });
      actualizarItem(item.producto_id, r);
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
    } catch (e) {
      avisar(e.message, 'error');
    }
  };

  const items = inv?.items ?? [];
  const contados = items.filter(contado).length;
  const conDiferencia = items.filter((i) => contado(i) && !dec(i.diferencia).isZero());

  const visibles = useMemo(
    () =>
      items.filter(
        (i) =>
          (tab === 'todos' || (tab === 'faltan' && !contado(i)) || (tab === 'diferencias' && contado(i) && !dec(i.diferencia).isZero())) &&
          (!busqueda.trim() || i.producto.toLowerCase().includes(busqueda.trim().toLowerCase())),
      ),
    [items, tab, busqueda],
  );
  const porCategoria = useMemo(() => {
    const grupos = new Map();
    for (const i of visibles) grupos.set(i.categoria, [...(grupos.get(i.categoria) ?? []), i]);
    return [...grupos.entries()];
  }, [visibles]);

  const cancelar = async () => {
    if (!(await confirmar({ titulo: 'Cancelar el inventario', mensaje: 'Se descartan los conteos cargados y el stock no se modifica.', textoConfirmar: 'Sí, cancelar', peligro: true }))) return;
    try {
      await post(`/inventarios/${id}/cancelar`);
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      avisar('Inventario cancelado.');
      navigate('/inventario');
    } catch (e) {
      avisar(e.message, 'error');
    }
  };

  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCarga error={q.error} reintentar={q.refetch} />;

  const progreso = items.length ? Math.round((contados / items.length) * 100) : 0;
  const estado = ESTADO_INVENTARIO[inv.estado];

  return (
    <div className="mx-auto max-w-4xl pb-28">
      <Link to="/inventario" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primario-texto hover:underline">
        <ArrowLeft size={16} aria-hidden /> Inventarios
      </Link>
      <Encabezado
        titulo={`Inventario de ${inv.categoria ?? 'todo el negocio'}`}
        icono={ClipboardList}
        subtitulo={abierto ? 'Contá lo que ves en el local y escribilo. El sistema compara después.' : `${estado.texto} el ${fechaHora(inv.cerrado_en ?? inv.iniciado_en)}`}
      >
        <Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>
      </Encabezado>

      <div className="mb-4 rounded-2xl bg-superficie p-4 shadow-suave ring-1 ring-borde">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-semibold text-texto">{contados} de {items.length} contados</span>
          <span className="text-sm text-texto-suave">{progreso}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-superficie-2" role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-exito transition-[width] duration-300" style={{ width: `${progreso}%` }} />
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Campo icono={Search} aria-label="Buscar producto" placeholder="Buscar producto..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <div role="tablist" className="flex gap-1 rounded-xl bg-superficie-2 p-1">
          {[['todos', 'Todos'], ['faltan', `Faltan (${items.length - contados})`], ['diferencias', `Diferencias (${conDiferencia.length})`]].map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={tab === valor}
              onClick={() => setTab(valor)}
              className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${tab === valor ? 'bg-superficie text-texto shadow-suave' : 'text-texto-suave hover:text-texto'}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {!porCategoria.length && <p className="rounded-2xl border-2 border-dashed border-borde px-6 py-10 text-center text-texto-suave">No hay productos con ese filtro.</p>}
      <div className="space-y-5">
        {porCategoria.map(([categoria, filas]) => (
          <section key={categoria}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-texto-suave">{categoria}</h2>
            <ul className="divide-y divide-borde overflow-hidden rounded-2xl bg-superficie shadow-suave ring-1 ring-borde">
              {filas.map((i) => (
                <FilaConteo key={`${i.producto_id}-${i.contado_en ?? ''}`} item={i} editable={abierto} onGuardar={guardarConteo} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {abierto && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 px-4 py-3 backdrop-blur lg:left-[260px]">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            {puedeCerrar ? (
              <>
                <Boton variante="peligro-suave" onClick={cancelar}>Cancelar inventario</Boton>
                <Boton variante="exito" tamanio="grande" icono={ClipboardCheck} className="flex-1" disabled={!contados} onClick={() => setRevisando(true)}>
                  Revisar y terminar
                </Boton>
              </>
            ) : (
              <p className="flex-1 text-center text-texto-suave">Cuando termines de contar, avisale al dueño para que cierre el inventario.</p>
            )}
          </div>
        </div>
      )}

      {revisando && <ModalRevision inventario={inv} onCerrar={() => setRevisando(false)} onListo={() => navigate('/inventario')} />}
    </div>
  );
}

function FilaConteo({ item, editable, onGuardar }) {
  const [texto, setTexto] = useState(textoInicial(item));
  const dif = contado(item) ? dec(item.diferencia) : null;
  const cambio = texto !== textoInicial(item);

  const guardar = () => {
    if (cambio) onGuardar(item, texto);
  };
  const alTeclear = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    guardar();
    const campos = [...document.querySelectorAll('[data-conteo]')];
    campos[campos.indexOf(e.currentTarget) + 1]?.focus();
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-texto">{item.producto}</div>
        <div className="text-sm text-texto-suave">
          {contado(item) ? (
            <>
              Sistema: {cantidad(item.stock_sistema, item.unidad)}
              {dif && !dif.isZero() && (
                <strong className={`ml-2 ${dif.gt(0) ? 'text-exito-texto' : 'text-peligro-texto'}`}>
                  {dif.gt(0) ? 'Sobra' : 'Falta'} {cantidad(dif.abs().toString(), item.unidad)}
                </strong>
              )}
            </>
          ) : (
            'Sin contar'
          )}
        </div>
      </div>
      {editable ? (
        <div className="flex shrink-0 items-center gap-2">
          <input
            data-conteo
            aria-label={`Cantidad contada de ${item.producto}`}
            inputMode="decimal"
            placeholder="0"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={guardar}
            onKeyDown={alTeclear}
            className={`min-h-12 w-28 rounded-xl border bg-superficie px-3 text-right text-lg font-bold tabular-nums text-texto transition-[border-color,box-shadow] focus:border-primario focus:outline-none focus:ring-4 focus:ring-anillo ${contado(item) && !cambio ? 'border-exito/60' : 'border-borde-fuerte'}`}
          />
          <span className="w-8 text-sm text-texto-suave">{item.unidad === 'KG' ? 'kg' : 'u.'}</span>
          <span className={`flex size-6 items-center justify-center ${contado(item) && !cambio ? 'text-exito' : 'text-transparent'}`} aria-hidden><Check size={20} /></span>
        </div>
      ) : (
        <strong className="shrink-0 tabular-nums">{contado(item) ? cantidad(item.cantidad_contada, item.unidad) : '—'}</strong>
      )}
    </li>
  );
}

function ModalRevision({ inventario, onCerrar, onListo }) {
  const queryClient = useQueryClient();
  const { puede } = useSesion();
  const { avisar } = useDialogos();
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const verCostos = puede('costos.ver');
  const contadosItems = inventario.items.filter(contado);
  const difs = contadosItems.filter((i) => !dec(i.diferencia).isZero());
  const sinContar = inventario.items.length - contadosItems.length;
  const valor = verCostos ? sumar(difs.map((i) => dec(i.diferencia).times(i.costo_unitario))) : null;

  const cerrar = async () => {
    setEnviando(true);
    try {
      const r = await post(`/inventarios/${inventario.id}/cerrar`, { observaciones });
      ['inventarios', 'inventario', 'stock', 'alertas', 'productos-pos'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      avisar(r.resumen.ajustados ? `Inventario cerrado. Se corrigió el stock de ${r.resumen.ajustados} productos.` : 'Inventario cerrado. No había diferencias.');
      onListo();
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Revisá antes de terminar" descripcion="Al terminar, el stock se corrige según lo que contaste." icono={ClipboardCheck} onCerrar={onCerrar} ancho="sm:max-w-2xl">
      <div className="space-y-4">
        {sinContar > 0 && (
          <p className="rounded-xl bg-alerta-suave px-4 py-3 text-alerta-texto">
            Quedan <strong>{sinContar}</strong> productos sin contar. A esos no se les toca el stock.
          </p>
        )}
        {difs.length ? (
          <Tabla
            filas={difs}
            claveFila={(i) => i.producto_id}
            columnas={[
              { clave: 'p', titulo: 'Producto', render: (i) => <span className="font-semibold">{i.producto}</span> },
              { clave: 's', titulo: 'Sistema', derecha: true, render: (i) => cantidad(i.stock_sistema, i.unidad) },
              { clave: 'c', titulo: 'Contado', derecha: true, render: (i) => cantidad(i.cantidad_contada, i.unidad) },
              { clave: 'd', titulo: 'Diferencia', derecha: true, render: (i) => <strong className={dec(i.diferencia).gt(0) ? 'text-exito-texto' : 'text-peligro-texto'}>{dec(i.diferencia).gt(0) ? '+' : ''}{cantidad(i.diferencia, i.unidad)}</strong> },
              ...(verCostos ? [{ clave: 'v', titulo: 'Valor', derecha: true, render: (i) => pesos(dec(i.diferencia).times(i.costo_unitario).toFixed(2)) }] : []),
            ]}
          />
        ) : (
          <p className="rounded-xl bg-exito-suave px-4 py-3 font-semibold text-exito-texto">Lo contado coincide con el sistema. No hay nada que corregir.</p>
        )}
        {valor && difs.length > 0 && (
          <p className="text-right text-lg font-bold">
            Diferencia total: <span className={valor.gte(0) ? 'text-exito-texto' : 'text-peligro-texto'}>{pesos(valor.toFixed(2))}</span>
          </p>
        )}
        <Campo etiqueta="Nota (opcional)" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" className="flex-1" onClick={onCerrar}>Seguir contando</Boton>
          <Boton variante="exito" tamanio="grande" className="flex-1" cargando={enviando} onClick={cerrar}>Terminar inventario</Boton>
        </div>
      </div>
    </Modal>
  );
}
