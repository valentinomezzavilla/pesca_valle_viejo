import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, CalendarClock, ChevronRight, CircleDollarSign, PackageCheck, PackageMinus, PackagePlus, Search, Trash2, TriangleAlert } from 'lucide-react';
import { dec, sumar } from '@pescaderia/shared';
import { Link } from 'react-router';
import { get } from '../api/cliente.js';
import { useSesion } from '../contexto/Sesion.jsx';
import { Boton, clasesBoton } from '../componentes/Boton.jsx';
import { Campo, Interruptor, Selector } from '../componentes/Formulario.jsx';
import { Cargando, Encabezado, Etiqueta, Indicador, Tabla, Tarjeta } from '../componentes/Varios.jsx';
import { cantidad, diasHasta, fecha, pesos } from '../lib/formato.js';
import { ModalAjuste, ModalDetalleStock, ModalMerma } from './stock/ModalesStock.jsx';

export function Stock() {
  const { puede } = useSesion();
  const verCostos = puede('costos.ver');
  const [filtro, setFiltro] = useState({ q: '', categoria_id: '', bajo_minimo: false });
  const [modal, setModal] = useState(null); // { tipo: 'detalle'|'merma'|'ajuste', producto, lote? }
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => get('/categorias') });
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => get('/stock') });
  const alertas = useQuery({ queryKey: ['alertas'], queryFn: () => get('/stock/alertas'), refetchInterval: 5 * 60_000 });
  const diasAlerta = alertas.data?.dias_alerta ?? 2;

  // "Para reponer" solo cuenta productos que tienen un mínimo cargado
  const paraReponer = (p) => p.bajo_minimo && Number(p.stock_minimo) > 0;
  const todos = stock.data ?? [];
  const filas = todos.filter(
    (p) =>
      (!filtro.q || p.nombre.toLowerCase().includes(filtro.q.toLowerCase())) &&
      (!filtro.categoria_id || p.categoria_id === Number(filtro.categoria_id)) &&
      (!filtro.bajo_minimo || paraReponer(p)),
  );
  const valorTotal = verCostos ? sumar(todos.map((p) => p.valor_stock ?? 0)) : null;
  const productoPorId = (id) => todos.find((p) => p.id === id);
  const abrirMerma = (productoId, lote) => {
    const producto = productoPorId(productoId);
    if (producto) setModal({ tipo: 'merma', producto, lote });
  };

  const a = alertas.data;
  const hayAlertas = a && a.total > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Stock" icono={Boxes} subtitulo="Lo que hay según el sistema: ingresos menos ventas y mermas.">
        <Link to="/inventario" className={clasesBoton({ variante: 'secundario' })}>Hacer inventario</Link>
        <Boton variante="peligro-suave" icono={Trash2} onClick={() => setModal({ tipo: 'merma', producto: null })}>Registrar merma</Boton>
      </Encabezado>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador icono={a?.bajo_minimo.length ? TriangleAlert : PackageCheck} etiqueta="Productos para reponer" valor={a?.bajo_minimo.length ?? '—'} tono={a?.bajo_minimo.length ? 'malo' : 'bueno'} detalle={a?.bajo_minimo.length ? 'Están en el mínimo o debajo' : 'Todo con stock suficiente'} />
        <Indicador icono={CalendarClock} etiqueta={`Vencen en ${diasAlerta} días o menos`} valor={a?.vencimientos.length ?? '—'} tono={a?.vencimientos.length ? 'alerta' : 'bueno'} />
        {valorTotal && <Indicador icono={CircleDollarSign} etiqueta="Stock valorizado (a costo)" valor={pesos(valorTotal.toFixed(2))} />}
      </div>

      {hayAlertas && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {!!a.vencimientos.length && (
            <Tarjeta titulo="Vencidos y por vencer" icono={CalendarClock} className="lg:col-span-2">
              <ul className="divide-y divide-borde">
                {a.vencimientos.map((v) => (
                  <li key={v.lote_id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-texto">{v.producto}</div>
                      <div className="text-sm text-texto-suave">{cantidad(v.cantidad_actual, v.unidad)}</div>
                    </div>
                    {v.dias_restantes < 0 ? (
                      <Etiqueta tono="rojo">Venció el {fecha(v.fecha_vencimiento)}</Etiqueta>
                    ) : (
                      <Etiqueta tono="amarillo" icono={CalendarClock}>{v.dias_restantes === 0 ? 'Vence hoy' : `Vence en ${v.dias_restantes} ${v.dias_restantes === 1 ? 'día' : 'días'}`}</Etiqueta>
                    )}
                    <Boton tamanio="chico" variante="peligro-suave" icono={Trash2} onClick={() => abrirMerma(v.producto_id, v)}>Descartar</Boton>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
          {!!a.bajo_minimo.length && (
            <Tarjeta titulo="Hay que reponer" icono={PackagePlus}>
              <ul className="divide-y divide-borde">
                {a.bajo_minimo.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate font-semibold text-texto">{p.nombre}</span>
                    <span className="shrink-0 text-sm tabular-nums text-texto-suave">
                      <strong className="text-alerta-texto">{cantidad(p.stock_actual, p.unidad)}</strong> de {cantidad(p.stock_minimo, p.unidad)}
                    </span>
                  </li>
                ))}
              </ul>
              {a.bajo_minimo.length > 6 && <p className="mt-2 text-sm text-texto-suave">y {a.bajo_minimo.length - 6} más. Filtrá abajo por "Solo para reponer".</p>}
              {puede('compras.crear') && (
                <Link to="/mercaderia/nuevo" className={`${clasesBoton({ variante: 'suave', tamanio: 'chico' })} mt-3`}>Ingresar mercadería</Link>
              )}
            </Tarjeta>
          )}
          {!!a.negativos.length && (
            <Tarjeta titulo="Se vendió sin tener cargado el ingreso" icono={PackageMinus}>
              <p className="mb-2 text-sm text-texto-suave">Estos productos figuran con stock negativo. Cargá el ingreso de mercadería que falta o corregí el stock.</p>
              <ul className="divide-y divide-borde">
                {a.negativos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate font-semibold text-texto">{p.nombre}</span>
                    <strong className="shrink-0 tabular-nums text-peligro-texto">{cantidad(p.stock_actual, p.unidad)}</strong>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Campo icono={Search} aria-label="Buscar producto" placeholder="Buscar producto..." value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} />
        <Selector aria-label="Categoría" value={filtro.categoria_id} onChange={(e) => setFiltro({ ...filtro, categoria_id: e.target.value })} vacio="Todas las categorías" opciones={(categorias.data ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
        <Interruptor etiqueta="Solo para reponer" checked={filtro.bajo_minimo} onChange={(v) => setFiltro({ ...filtro, bajo_minimo: v })} />
      </div>
      {stock.isLoading ? (
        <Cargando />
      ) : (
        <Tabla
          filas={filas}
          alTocarFila={(p) => setModal({ tipo: 'detalle', producto: p })}
          vacio="No hay productos con ese filtro."
          iconoVacio={Search}
          columnas={[
            { clave: 'nombre', titulo: 'Producto', render: (p) => <span className="font-semibold">{p.nombre}</span> },
            { clave: 'categoria', titulo: 'Categoría', render: (p) => <span className="text-texto-suave">{p.categoria}</span> },
            {
              clave: 'stock',
              titulo: 'Stock',
              derecha: true,
              render: (p) => (
                <span className={`font-semibold ${dec(p.stock_actual).lt(0) ? 'text-peligro-texto' : paraReponer(p) ? 'text-alerta-texto' : ''}`}>{cantidad(p.stock_actual, p.unidad)}</span>
              ),
            },
            { clave: 'minimo', titulo: 'Mínimo', derecha: true, render: (p) => <span className="text-texto-suave">{cantidad(p.stock_minimo, p.unidad)}</span> },
            {
              clave: 'vence',
              titulo: 'Próximo vencimiento',
              render: (p) => {
                if (!p.proximo_vencimiento) return <span className="text-texto-tenue">—</span>;
                const dias = diasHasta(p.proximo_vencimiento);
                if (dias < 0) return <Etiqueta tono="rojo">Vencido {fecha(p.proximo_vencimiento)}</Etiqueta>;
                if (dias <= diasAlerta) return <Etiqueta tono="amarillo" icono={CalendarClock}>{dias === 0 ? 'Vence hoy' : `En ${dias} ${dias === 1 ? 'día' : 'días'}`}</Etiqueta>;
                return <span className="tabular-nums text-texto-suave">{fecha(p.proximo_vencimiento)}</span>;
              },
            },
            {
              clave: 'estado',
              titulo: 'Estado',
              render: (p) =>
                dec(p.stock_actual).lt(0) ? (
                  <Etiqueta tono="rojo" icono={TriangleAlert}>Vendido sin stock</Etiqueta>
                ) : paraReponer(p) ? (
                  <Etiqueta tono="amarillo">Reponer</Etiqueta>
                ) : (
                  <Etiqueta tono="verde">OK</Etiqueta>
                ),
            },
            ...(verCostos ? [{ clave: 'valor', titulo: 'Valor', derecha: true, render: (p) => pesos(p.valor_stock) }] : []),
            { clave: 'ver', titulo: '', render: () => <ChevronRight size={18} className="text-texto-tenue" aria-hidden /> },
          ]}
        />
      )}

      {modal?.tipo === 'detalle' && (
        <ModalDetalleStock
          producto={modal.producto}
          onCerrar={() => setModal(null)}
          onMerma={() => setModal({ tipo: 'merma', producto: modal.producto })}
          onAjuste={() => setModal({ tipo: 'ajuste', producto: modal.producto })}
        />
      )}
      {modal?.tipo === 'merma' && <ModalMerma producto={modal.producto} lote={modal.lote} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'ajuste' && <ModalAjuste producto={modal.producto} onCerrar={() => setModal(null)} />}
    </div>
  );
}
