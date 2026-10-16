import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Pencil, Plus, Search, Star, Tags, TrendingUp } from 'lucide-react';
import { UNIDADES_ETIQUETA, dec } from '@pescaderia/shared';
import { get, patch } from '../../api/cliente.js';
import { useSesion } from '../../contexto/Sesion.jsx';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Campo, Interruptor, Selector } from '../../componentes/Formulario.jsx';
import { Cargando, Encabezado, Etiqueta, Tabla } from '../../componentes/Varios.jsx';
import { normalizarNumero, pesos, porcentaje } from '../../lib/formato.js';
import { ModalProducto, ModalAumento, ModalCategorias } from './ModalesProductos.jsx';

export function Productos() {
  const { puede } = useSesion();
  const editar = puede('productos.editar');
  const verCostos = puede('costos.ver');
  const [filtro, setFiltro] = useState({ q: '', categoria_id: '', inactivos: false });
  const [modal, setModal] = useState(null);
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => get('/categorias') });
  const productos = useQuery({ queryKey: ['productos', 'todos'], queryFn: () => get('/productos', { activo: 'todos' }) });

  const filas = (productos.data ?? []).filter(
    (p) =>
      (filtro.inactivos || p.activo) &&
      (!filtro.q || p.nombre.toLowerCase().includes(filtro.q.toLowerCase()) || p.codigo?.toLowerCase().startsWith(filtro.q.toLowerCase())) &&
      (!filtro.categoria_id || p.categoria_id === Number(filtro.categoria_id)),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Productos y precios" icono={Tags} subtitulo={editar ? 'Tocá un precio para cambiarlo al toque.' : undefined}>
        {editar && (
          <>
            <Boton variante="secundario" icono={LayoutGrid} onClick={() => setModal({ tipo: 'categorias' })}>Categorías</Boton>
            <Boton variante="secundario" icono={TrendingUp} onClick={() => setModal({ tipo: 'aumento' })}>Aumento por categoría</Boton>
            <Boton icono={Plus} onClick={() => setModal({ tipo: 'producto' })}>Nuevo producto</Boton>
          </>
        )}
      </Encabezado>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Campo icono={Search} aria-label="Buscar" placeholder="Buscar por nombre o código..." value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} />
        <Selector aria-label="Categoría" value={filtro.categoria_id} onChange={(e) => setFiltro({ ...filtro, categoria_id: e.target.value })} vacio="Todas las categorías" opciones={(categorias.data ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
        {editar && <Interruptor etiqueta="Mostrar dados de baja" checked={filtro.inactivos} onChange={(v) => setFiltro({ ...filtro, inactivos: v })} />}
      </div>
      {productos.isLoading ? (
        <Cargando />
      ) : (
        <Tabla
          filas={filas}
          vacio="No hay productos. Creá el primero con “Nuevo producto”."
          iconoVacio={Tags}
          columnas={[
            ...(editar ? [{ clave: 'fav', titulo: '', render: (p) => <BotonFavorito producto={p} /> }] : []),
            {
              clave: 'nombre',
              titulo: 'Producto',
              render: (p) =>
                editar ? (
                  <button type="button" className="group inline-flex items-center gap-2 text-left font-semibold text-texto hover:text-primario-texto" onClick={() => setModal({ tipo: 'producto', producto: p })}>
                    {p.nombre}
                    <Pencil size={14} className="text-texto-tenue opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    {!p.activo && <Etiqueta>De baja</Etiqueta>}
                  </button>
                ) : (
                  <span className="font-semibold">{p.nombre}</span>
                ),
            },
            { clave: 'codigo', titulo: 'Código', render: (p) => <span className="font-mono text-sm text-texto-suave">{p.codigo ?? ''}</span> },
            { clave: 'categoria', titulo: 'Categoría', render: (p) => <span className="text-texto-suave">{p.categoria}</span> },
            { clave: 'unidad', titulo: 'Por', render: (p) => <Etiqueta tono={p.unidad === 'KG' ? 'azul' : 'gris'}>{UNIDADES_ETIQUETA[p.unidad]}</Etiqueta> },
            { clave: 'precio', titulo: 'Precio de venta', derecha: true, render: (p) => (editar ? <PrecioEditable producto={p} /> : <strong>{pesos(p.precio_venta)}</strong>) },
            ...(verCostos
              ? [
                  { clave: 'costo', titulo: 'Último costo', derecha: true, render: (p) => <span className="text-texto-suave">{dec(p.costo_referencia).gt(0) ? pesos(p.costo_referencia) : '—'}</span> },
                  {
                    clave: 'margen',
                    titulo: 'Margen',
                    derecha: true,
                    render: (p) => {
                      if (dec(p.costo_referencia).isZero() || dec(p.precio_venta).isZero()) return <span className="text-texto-tenue">—</span>;
                      const m = dec(p.precio_venta).minus(p.costo_referencia).div(p.precio_venta).times(100);
                      return <Etiqueta tono={m.lt(0) ? 'rojo' : m.lt(20) ? 'amarillo' : 'verde'}>{porcentaje(m.toFixed(1))}</Etiqueta>;
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
      {modal?.tipo === 'producto' && <ModalProducto producto={modal.producto} categorias={categorias.data ?? []} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'aumento' && <ModalAumento categorias={categorias.data ?? []} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'categorias' && <ModalCategorias categorias={categorias.data ?? []} onCerrar={() => setModal(null)} />}
    </div>
  );
}

function PrecioEditable({ producto }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const [valor, setValor] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const editando = valor !== null;

  const guardar = async () => {
    const nuevo = normalizarNumero(valor);
    setValor(null);
    if (!nuevo || dec(nuevo).eq(producto.precio_venta)) return;
    setGuardando(true);
    try {
      await patch(`/productos/${producto.id}/precio`, { precio_venta: nuevo });
      avisar(`Precio de ${producto.nombre} actualizado.`);
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['productos-pos'] });
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setValor(String(Number(producto.precio_venta)).replace('.', ','))}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-bold tabular-nums text-texto ring-1 ring-inset ring-borde transition-colors hover:bg-primario-suave hover:text-primario-texto hover:ring-primario focus-visible:ring-4 focus-visible:ring-anillo"
        aria-label={`Cambiar precio de ${producto.nombre}`}
      >
        {guardando ? 'Guardando...' : pesos(producto.precio_venta)}
      </button>
    );
  }
  return (
    <input
      autoFocus
      inputMode="decimal"
      aria-label={`Nuevo precio de ${producto.nombre}`}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setValor(null);
      }}
      className="h-11 w-36 rounded-lg border-2 border-primario bg-superficie px-3 text-right font-bold tabular-nums text-texto focus:outline-none focus:ring-4 focus:ring-anillo"
    />
  );
}

function BotonFavorito({ producto }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const cambiar = async () => {
    try {
      await patch(`/productos/${producto.id}/favorito`, { favorito: !producto.favorito });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['productos-pos'] });
    } catch (e) {
      avisar(e.message, 'error');
    }
  };
  return (
    <button
      type="button"
      onClick={cambiar}
      className={`flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-alerta-suave ${producto.favorito ? 'text-alerta' : 'text-texto-tenue hover:text-alerta'}`}
      aria-label={producto.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
      aria-pressed={producto.favorito}
      title="Favorito en la pantalla de venta"
    >
      <Star size={20} fill={producto.favorito ? 'currentColor' : 'none'} />
    </button>
  );
}
