import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Flame, LayoutGrid, Lock, Percent, Printer, Search, ShoppingCart, Star, Trash2, TriangleAlert, X } from 'lucide-react';
import { calcularVenta, dec } from '@pescaderia/shared';
import { conPin, get, post } from '../../api/cliente.js';
import { useCaja } from '../../hooks/useCaja.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { useImpresion } from '../../contexto/Impresion.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { Cargando, ErrorCarga, Vacio } from '../../componentes/Varios.jsx';
import { cantidad as fmtCantidad, pesos } from '../../lib/formato.js';
import { ModalCantidad } from './ModalCantidad.jsx';
import { ModalLinea, ModalDescuentoGlobal } from './ModalLinea.jsx';
import { ModalCobro } from './ModalCobro.jsx';

const CLAVE_CARRITO = 'pescaderia.carrito';
// Color de acento por categoría (en orden), visible en claro y oscuro
const ACENTOS = ['#0b84c9', '#e2603a', '#0aa5b8', '#cf9410', '#8a63d2', '#3f9b4f', '#d6456f'];

function leerCarrito() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_CARRITO)) ?? { lineas: [], descuentoGlobal: '0' };
  } catch {
    return { lineas: [], descuentoGlobal: '0' };
  }
}

export function Vender() {
  const queryClient = useQueryClient();
  const { avisar, confirmar, pedirPin } = useDialogos();
  const { imprimirComprobante } = useImpresion();
  const caja = useCaja();
  const pos = useQuery({ queryKey: ['productos-pos'], queryFn: () => get('/productos/pos') });
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => get('/categorias') });

  const [carrito, setCarrito] = useState(leerCarrito);
  const [busqueda, setBusqueda] = useState('');
  const [pestania, setPestania] = useState('favoritos');
  const [modal, setModal] = useState(null); // { tipo: 'cantidad'|'linea'|'descuento'|'cobro'|'listo', ... }
  const [carritoMovil, setCarritoMovil] = useState(false);
  const buscador = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
    } catch {
      /* sin almacenamiento */
    }
  }, [carrito]);

  const productos = pos.data?.productos ?? [];
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const categoriasActivas = useMemo(() => (categorias.data ?? []).filter((c) => c.activa), [categorias.data]);
  const acentoDe = useMemo(() => {
    const m = new Map((categorias.data ?? []).map((c, i) => [c.id, ACENTOS[i % ACENTOS.length]]));
    return (id) => m.get(id) ?? ACENTOS[0];
  }, [categorias.data]);
  const nombreCategoria = useMemo(() => new Map((categorias.data ?? []).map((c) => [c.id, c.nombre])), [categorias.data]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q) return productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo?.toLowerCase().startsWith(q));
    if (pestania === 'favoritos') return productos.filter((p) => p.favorito);
    if (pestania === 'mas-vendidos') return (pos.data?.masVendidos ?? []).map((id) => porId.get(id)).filter(Boolean);
    if (pestania === 'todos') return productos;
    return productos.filter((p) => p.categoria_id === pestania);
  }, [busqueda, pestania, productos, porId, pos.data]);

  // Si no hay favoritos cargados, arrancar mostrando todos
  useEffect(() => {
    if (pos.data && pestania === 'favoritos' && !productos.some((p) => p.favorito)) setPestania('todos');
  }, [pos.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const calculo = useMemo(
    () =>
      calcularVenta({
        items: carrito.lineas.map((l) => ({ cantidad: l.cantidad, precioUnitario: l.producto.precio_venta, descuento: l.descuento })),
        descuentoGlobal: carrito.descuentoGlobal,
      }),
    [carrito],
  );

  const agregar = (producto, cantidad) => {
    setCarrito((c) => {
      const existente = c.lineas.find((l) => l.producto.id === producto.id && dec(l.descuento || 0).isZero());
      if (existente) {
        return { ...c, lineas: c.lineas.map((l) => (l === existente ? { ...l, cantidad: dec(l.cantidad).plus(cantidad).toString() } : l)) };
      }
      return { ...c, lineas: [...c.lineas, { clave: `${producto.id}-${Date.now()}`, producto, cantidad, descuento: '0' }] };
    });
    setBusqueda('');
    setModal(null);
  };

  const actualizarLinea = (clave, cambios) => setCarrito((c) => ({ ...c, lineas: c.lineas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)) }));
  const quitarLinea = (clave) => setCarrito((c) => ({ ...c, lineas: c.lineas.filter((l) => l.clave !== clave) }));
  const vaciar = () => setCarrito({ lineas: [], descuentoGlobal: '0' });

  const pedirVaciar = async () => {
    if (await confirmar({ titulo: 'Vaciar la venta', mensaje: 'Se quitan todos los productos cargados.', textoConfirmar: 'Sí, vaciar', peligro: true })) vaciar();
  };

  // Antes de cobrar se actualizan los precios (pueden haber cambiado mientras se armaba la venta)
  const abrirCobro = async () => {
    const datos = await pos.refetch();
    const nuevos = new Map((datos.data?.productos ?? []).map((p) => [p.id, p]));
    let cambiaron = false;
    const lineas = carrito.lineas.map((l) => {
      const p = nuevos.get(l.producto.id);
      if (p && p.precio_venta !== l.producto.precio_venta) cambiaron = true;
      return p ? { ...l, producto: p } : l;
    });
    if (cambiaron) {
      setCarrito((c) => ({ ...c, lineas }));
      avisar('Se actualizaron precios que cambiaron recién. Revisá el total.', 'alerta');
      return;
    }
    setModal({ tipo: 'cobro' });
  };

  const cobrar = async (pagos, efectivoRecibido, clienteId) => {
    try {
      const resultado = await conPin(pedirPin, (pin) =>
        post('/ventas', {
          caja_id: caja.cajaId,
          items: carrito.lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad, descuento: l.descuento })),
          descuento_global: carrito.descuentoGlobal,
          pagos,
          efectivo_recibido: efectivoRecibido,
          cliente_id: clienteId,
          pinAutorizacion: pin,
        }),
      );
      if (!resultado) return;
      vaciar();
      setCarritoMovil(false);
      setModal({ tipo: 'listo', resultado });
      queryClient.invalidateQueries({ queryKey: ['productos-pos'] });
      queryClient.invalidateQueries({ queryKey: ['caja-actual'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      if (clienteId) queryClient.invalidateQueries({ queryKey: ['clientes'] });
    } catch (e) {
      avisar(e.message, 'error');
      if (e.codigo === 'CAJA_CERRADA') caja.refrescar();
    }
  };

  if (pos.isLoading || caja.cargando) return <Cargando />;
  if (pos.error) return <div className="p-6"><ErrorCarga error={pos.error} reintentar={pos.refetch} /></div>;

  if (!caja.abierta) {
    return (
      <div className="flex min-h-[80dvh] items-center justify-center px-4">
        <div className="w-full max-w-md animate-entrar rounded-3xl bg-superficie p-8 text-center shadow-suave ring-1 ring-borde">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-alerta-suave text-alerta-texto">
            <Lock size={30} aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">La caja está cerrada</h1>
          <p className="mt-2 text-texto-suave">Para empezar a vender, abrí la caja con el efectivo inicial (el cambio).</p>
          <Link
            to="/caja"
            className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-primario px-6 text-lg font-semibold text-sobre-primario shadow-suave transition-colors hover:bg-primario-hover focus-visible:ring-4 focus-visible:ring-anillo"
          >
            Ir a abrir la caja
          </Link>
        </div>
      </div>
    );
  }

  const pestanias = [
    { id: 'favoritos', texto: 'Favoritos', icono: Star },
    { id: 'mas-vendidos', texto: 'Más vendidos', icono: Flame },
    { id: 'todos', texto: 'Todos', icono: LayoutGrid },
    ...categoriasActivas.map((c) => ({ id: c.id, texto: c.nombre, color: acentoDe(c.id) })),
  ];
  const cantidadLineas = carrito.lineas.length;

  const panelCarrito = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          Venta actual
          {cantidadLineas > 0 && <span className="rounded-full bg-primario px-2 py-0.5 text-xs font-bold text-sobre-primario">{cantidadLineas}</span>}
        </h2>
        {cantidadLineas > 0 && (
          <Boton variante="fantasma" tamanio="chico" icono={Trash2} onClick={pedirVaciar} className="!text-peligro-texto hover:!bg-peligro-suave">
            Vaciar
          </Boton>
        )}
      </div>
      <div className="scroll-fino flex-1 overflow-y-auto">
        {cantidadLineas === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-superficie-2 text-texto-tenue">
              <ShoppingCart size={30} aria-hidden />
            </span>
            <p className="mt-3 font-semibold text-texto">Todavía no hay productos</p>
            <p className="text-sm text-texto-suave">Tocá un producto para agregarlo.</p>
          </div>
        ) : (
          <ul className="divide-y divide-borde">
            {carrito.lineas.map((l, i) => {
              const calc = calculo.lineas[i];
              return (
                <li key={l.clave}>
                  <button
                    type="button"
                    onClick={() => setModal({ tipo: 'linea', clave: l.clave })}
                    className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-superficie-2 focus-visible:bg-superficie-2 focus-visible:outline-none"
                  >
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: acentoDe(l.producto.categoria_id) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-texto">{l.producto.nombre}</span>
                      <span className="block text-sm tabular-nums text-texto-suave">
                        {fmtCantidad(l.cantidad, l.producto.unidad)} × {pesos(l.producto.precio_venta)}
                      </span>
                      {calc.descuento.gt(0) && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-exito-suave px-1.5 py-0.5 text-xs font-semibold text-exito-texto">
                          <Percent size={11} aria-hidden /> −{pesos(calc.descuento.toString())}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-texto">{pesos(calc.subtotal.minus(calc.descuento).toString())}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="space-y-3 border-t border-borde bg-superficie-2/50 p-5">
        {(calculo.descuentoGlobal.gt(0) || calculo.descuentoItems.gt(0)) && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-texto-suave"><span>Subtotal</span><span className="tabular-nums">{pesos(calculo.subtotal.toString())}</span></div>
            <div className="flex justify-between font-semibold text-exito-texto">
              <span>Descuentos</span>
              <span className="tabular-nums">−{pesos(calculo.descuentoItems.plus(calculo.descuentoGlobal).toString())}</span>
            </div>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-texto-suave">Total</span>
          <span className="text-[40px] font-bold leading-none tabular-nums tracking-tight text-texto">{pesos(calculo.total.toString())}</span>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2.5">
          <Boton variante="secundario" tamanio="grande" icono={Percent} disabled={!cantidadLineas} onClick={() => setModal({ tipo: 'descuento' })} aria-label="Descuento a toda la venta" />
          <Boton variante="exito" tamanio="grande" disabled={!cantidadLineas} onClick={abrirCobro} className="text-xl">
            Cobrar
          </Boton>
        </div>
      </div>
    </div>
  );

  const lineaEditando = modal?.tipo === 'linea' ? carrito.lineas.find((l) => l.clave === modal.clave) : null;

  return (
    <div className="lg:flex lg:h-dvh">
      {/* Productos */}
      <section className="scroll-fino min-w-0 flex-1 px-4 pb-32 pt-4 sm:px-6 lg:overflow-y-auto lg:px-8 lg:pb-8 lg:pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-texto-tenue" aria-hidden />
            <input
              ref={buscador}
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && visibles.length === 1) setModal({ tipo: 'cantidad', producto: visibles[0] });
                if (e.key === 'Escape') setBusqueda('');
              }}
              placeholder="Buscar producto o código..."
              aria-label="Buscar producto"
              className="h-14 w-full rounded-2xl border border-borde bg-superficie pl-12 pr-12 text-lg text-texto shadow-suave placeholder:text-texto-tenue focus:border-primario focus:outline-none focus:ring-4 focus:ring-anillo [&::-webkit-search-cancel-button]:hidden"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-texto-suave hover:bg-superficie-2" aria-label="Borrar búsqueda">
                <X size={20} />
              </button>
            )}
          </div>
          <div className="hidden shrink-0 items-center gap-2 rounded-2xl bg-superficie px-4 py-3 text-sm font-medium text-texto-suave shadow-suave ring-1 ring-borde sm:flex">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-exito opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-exito" />
            </span>
            {caja.caja?.nombre ?? 'Caja'} abierta
          </div>
        </div>

        {!busqueda && (
          <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filtrar productos">
            {pestanias.map((p) => {
              const activa = pestania === p.id;
              const Icono = p.icono;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setPestania(p.id)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-anillo ${
                    activa ? 'bg-texto text-fondo' : 'bg-superficie text-texto-suave ring-1 ring-borde hover:text-texto'
                  }`}
                >
                  {Icono ? <Icono size={16} aria-hidden /> : <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />}
                  {p.texto}
                </button>
              );
            })}
          </div>
        )}

        {visibles.length === 0 ? (
          <Vacio icono={busqueda ? Search : pestania === 'favoritos' ? Star : LayoutGrid}>
            {busqueda ? `No hay productos que coincidan con “${busqueda}”.` : pestania === 'mas-vendidos' ? 'Todavía no hay ventas para armar el ranking.' : 'No hay productos acá.'}
          </Vacio>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {visibles.map((p) => {
              const sinStock = dec(p.stock_actual).lte(0);
              const acento = acentoDe(p.categoria_id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setModal({ tipo: 'cantidad', producto: p })}
                  className="group relative flex min-h-32 flex-col overflow-hidden rounded-2xl bg-superficie p-4 pt-5 text-left shadow-suave ring-1 ring-borde transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-primario active:translate-y-0 active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-anillo"
                >
                  <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: acento }} aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide text-texto-tenue">{nombreCategoria.get(p.categoria_id)}</span>
                  <span className="mt-0.5 line-clamp-2 text-[17px] font-bold leading-snug text-texto">{p.nombre}</span>
                  <span className="mt-auto flex items-end justify-between gap-2 pt-3">
                    <span className="whitespace-nowrap text-primario-texto">
                      <span className="text-base font-bold tabular-nums tracking-tight sm:text-lg">{pesos(p.precio_venta)}</span>
                      <span className="text-sm font-medium opacity-75"> /{p.unidad === 'KG' ? 'kg' : 'u'}</span>
                    </span>
                  </span>
                  <span className={`mt-1 text-[13px] font-medium ${sinStock ? 'text-peligro-texto' : 'text-texto-suave'}`}>
                    {sinStock ? 'Sin stock cargado' : `Stock: ${fmtCantidad(p.stock_actual, p.unidad)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Carrito: columna fija en pantallas grandes */}
      <aside className="hidden w-[400px] shrink-0 border-l border-borde bg-superficie lg:block" aria-label="Venta actual">
        {panelCarrito}
      </aside>

      {/* Carrito en celular/tablet: barra inferior + hoja */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 p-3 backdrop-blur lg:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={() => setCarritoMovil(true)}
          className="flex min-h-16 w-full items-center justify-between rounded-2xl bg-exito px-5 text-sobre-exito shadow-suave active:scale-[0.99]"
        >
          <span className="flex items-center gap-2.5 text-lg font-semibold">
            <ShoppingCart size={22} aria-hidden />
            {cantidadLineas} {cantidadLineas === 1 ? 'producto' : 'productos'}
          </span>
          <span className="text-2xl font-bold tabular-nums">{pesos(calculo.total.toString())}</span>
        </button>
      </div>
      {carritoMovil && (
        <Modal titulo="Carrito" onCerrar={() => setCarritoMovil(false)} ancho="sm:max-w-lg">
          <div className="-mx-5 -mb-5 h-[72dvh] border-t border-borde">{panelCarrito}</div>
        </Modal>
      )}

      {modal?.tipo === 'cantidad' && (
        <ModalCantidad
          producto={modal.producto}
          inicial={modal.inicial}
          onCerrar={() => setModal(null)}
          onConfirmar={(cant) => {
            if (modal.clave) {
              actualizarLinea(modal.clave, { cantidad: cant });
              setModal(null);
            } else agregar(modal.producto, cant);
          }}
        />
      )}
      {lineaEditando && (
        <ModalLinea
          linea={lineaEditando}
          onCerrar={() => setModal(null)}
          onCambiarCantidad={() => setModal({ tipo: 'cantidad', producto: lineaEditando.producto, inicial: lineaEditando.cantidad, clave: lineaEditando.clave })}
          onQuitar={() => {
            quitarLinea(lineaEditando.clave);
            setModal(null);
          }}
          onDescuento={(d) => {
            actualizarLinea(lineaEditando.clave, { descuento: d });
            setModal(null);
          }}
        />
      )}
      {modal?.tipo === 'descuento' && (
        <ModalDescuentoGlobal
          subtotal={calculo.subtotal.minus(calculo.descuentoItems).toString()}
          actual={carrito.descuentoGlobal}
          onCerrar={() => setModal(null)}
          onAplicar={(d) => {
            setCarrito((c) => ({ ...c, descuentoGlobal: d }));
            setModal(null);
          }}
        />
      )}
      {modal?.tipo === 'cobro' && <ModalCobro total={calculo.total.toFixed(2)} onCerrar={() => setModal(null)} onCobrar={cobrar} />}
      {modal?.tipo === 'listo' && (
        <VentaRegistrada
          resultado={modal.resultado}
          onImprimir={() => imprimirComprobante(modal.resultado.comprobante.id)}
          onNueva={() => {
            setModal(null);
            setTimeout(() => buscador.current?.focus(), 50);
          }}
        />
      )}
    </div>
  );
}

function VentaRegistrada({ resultado, onImprimir, onNueva }) {
  const { venta, comprobante, faltantes } = resultado;
  return (
    <Modal titulo="Venta registrada" descripcion={`Comprobante N° ${comprobante.numero_formateado}`} onCerrar={onNueva} ancho="sm:max-w-md">
      <div className="text-center">
        <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-exito-suave text-exito">
          <CircleCheck size={44} strokeWidth={2.2} aria-hidden />
        </span>
        <p className="mt-3 text-sm font-medium uppercase tracking-wide text-texto-suave">Total cobrado</p>
        <p className="text-3xl font-bold tabular-nums tracking-tight">{pesos(venta.total)}</p>
        {Number(venta.vuelto) > 0 && (
          <div className="mt-4 rounded-2xl bg-exito-suave px-4 py-4 text-exito-texto">
            <div className="text-sm font-semibold uppercase tracking-wider">Vuelto</div>
            <div className="text-5xl font-bold tabular-nums tracking-tight">{pesos(venta.vuelto)}</div>
          </div>
        )}
        {faltantes?.length > 0 && (
          <div className="mt-4 flex gap-3 rounded-2xl bg-alerta-suave px-4 py-3 text-left text-alerta-texto">
            <TriangleAlert size={20} className="mt-0.5 shrink-0" aria-hidden />
            <div>
              <strong>Se vendió más de lo que figura en stock:</strong>
              <ul className="ml-4 mt-1 list-disc">
                {faltantes.map((f) => <li key={f.producto}>{f.producto}: faltan {Number(f.cantidad).toLocaleString('es-AR')}</li>)}
              </ul>
              <span className="text-sm">Revisá el ingreso de mercadería.</span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Boton variante="secundario" tamanio="grande" icono={Printer} onClick={onImprimir}>Ticket</Boton>
        <Boton variante="exito" tamanio="grande" onClick={onNueva} autoFocus>Nueva venta</Boton>
      </div>
    </Modal>
  );
}
