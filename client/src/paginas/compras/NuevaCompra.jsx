import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, ChevronDown, CircleAlert, ClipboardList, PackagePlus, Plus, Save, Trash2, Truck, Wallet } from 'lucide-react';
import {
  CONDICIONES_COMPRA_ETIQUETA, MEDIOS_PAGO_PROVEEDOR, MEDIOS_PAGO_PROVEEDOR_ETIQUETA, TIPOS_DOCUMENTO_COMPRA, TIPOS_DOCUMENTO_COMPRA_ETIQUETA,
  dec, redondear, sumar, UNIDADES_ETIQUETA,
} from '@pescaderia/shared';
import { get, post } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { useCaja } from '../../hooks/useCaja.js';
import { Boton } from '../../componentes/Boton.jsx';
import { AreaTexto, Campo, Selector, SelectorBotones, clasesInput } from '../../componentes/Formulario.jsx';
import { Cargando, Encabezado, Tarjeta, Vacio } from '../../componentes/Varios.jsx';
import { hoyIso, normalizarNumero, pesos } from '../../lib/formato.js';

const nuevaLinea = () => ({ clave: Math.random().toString(36).slice(2), producto_id: '', cantidad: '', modoCosto: 'unitario', costo: '', fecha_vencimiento: '' });

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const etiquetaChica = 'mb-1.5 block text-sm font-semibold text-texto-suave';

export function NuevaCompra() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { avisar, confirmar } = useDialogos();
  const caja = useCaja();
  const proveedores = useQuery({ queryKey: ['proveedores'], queryFn: () => get('/proveedores') });
  const productos = useQuery({ queryKey: ['productos'], queryFn: () => get('/productos') });

  const [cabecera, setCabecera] = useState({ proveedor_id: '', fecha: hoyIso(), tipo_documento: 'REMITO', numero_documento: '', condicion: 'CUENTA_CORRIENTE', medio_pago: 'EFECTIVO_CAJA', observaciones: '' });
  const [lineas, setLineas] = useState([nuevaLinea()]);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const porId = useMemo(() => new Map((productos.data ?? []).map((p) => [p.id, p])), [productos.data]);

  const subtotalDe = (l) => {
    const cant = normalizarNumero(l.cantidad);
    const costo = normalizarNumero(l.costo);
    if (!cant || !costo || isNaN(Number(cant)) || isNaN(Number(costo))) return dec(0);
    return l.modoCosto === 'total' ? redondear(costo, 2) : redondear(dec(cant).times(costo), 2);
  };
  const total = sumar(lineas.map(subtotalDe));

  const actualizar = (clave, cambios) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  const elegirProducto = (clave, id) => {
    const p = porId.get(Number(id));
    const vence = p?.controla_vencimiento && p?.dias_vida_util ? sumarDias(cabecera.fecha, p.dias_vida_util) : '';
    actualizar(clave, { producto_id: id, fecha_vencimiento: vence });
  };

  const guardar = async (e) => {
    e.preventDefault();
    const items = lineas
      .filter((l) => l.producto_id)
      .map((l) => ({
        producto_id: Number(l.producto_id),
        cantidad: normalizarNumero(l.cantidad),
        ...(l.modoCosto === 'total' ? { subtotal: normalizarNumero(l.costo) } : { costo_unitario: normalizarNumero(l.costo) }),
        fecha_vencimiento: l.fecha_vencimiento || undefined,
      }));
    if (!items.length) return avisar('Agregá al menos un producto.', 'error');
    if (!(await confirmar({ titulo: 'Confirmar ingreso', mensaje: `Se suma el stock y se registra el ingreso por ${pesos(total.toString())}.`, textoConfirmar: 'Guardar ingreso' }))) return;

    setEnviando(true);
    setErrores({});
    try {
      const contado = cabecera.condicion === 'CONTADO';
      const compra = await post('/compras', {
        ...cabecera,
        proveedor_id: Number(cabecera.proveedor_id) || undefined,
        medio_pago: contado ? cabecera.medio_pago : undefined,
        caja_id: contado && cabecera.medio_pago === 'EFECTIVO_CAJA' ? caja.cajaId : undefined,
        items,
      });
      avisar('Mercadería ingresada. El stock ya está actualizado.');
      ['compras', 'productos-pos', 'productos', 'stock', 'caja-actual', 'proveedores'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      navigate(`/mercaderia?ver=${compra.id}`);
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (proveedores.isLoading || productos.isLoading) return <Cargando />;
  const listaProveedores = (proveedores.data ?? []).filter((p) => p.activo);

  return (
    <form onSubmit={guardar} className="mx-auto max-w-5xl space-y-5 pb-24">
      <Encabezado titulo="Ingresar mercadería" icono={PackagePlus} subtitulo="Cargá lo que dice el remito o la factura del proveedor." />

      <Tarjeta titulo="Comprobante del proveedor" icono={Truck} className="grid gap-4 md:grid-cols-2">
        {listaProveedores.length === 0 ? (
          <div className="md:col-span-2"><Vacio icono={Truck}>Primero cargá un proveedor en la sección Proveedores.</Vacio></div>
        ) : (
          <Selector
            etiqueta="Proveedor"
            vacio="Elegí el proveedor..."
            value={cabecera.proveedor_id}
            onChange={(e) => setCabecera({ ...cabecera, proveedor_id: e.target.value })}
            opciones={listaProveedores.map((p) => ({ valor: p.id, etiqueta: p.nombre }))}
            error={errores.proveedor_id}
          />
        )}
        <Campo etiqueta="Fecha del comprobante" type="date" value={cabecera.fecha} max={hoyIso()} onChange={(e) => setCabecera({ ...cabecera, fecha: e.target.value })} error={errores.fecha} />
        <Selector
          etiqueta="Tipo de comprobante"
          value={cabecera.tipo_documento}
          onChange={(e) => setCabecera({ ...cabecera, tipo_documento: e.target.value })}
          opciones={TIPOS_DOCUMENTO_COMPRA.map((t) => ({ valor: t, etiqueta: TIPOS_DOCUMENTO_COMPRA_ETIQUETA[t] }))}
        />
        {cabecera.tipo_documento !== 'SIN_COMPROBANTE' && (
          <Campo etiqueta="Número" placeholder="Ej: 0001-00012345" value={cabecera.numero_documento} onChange={(e) => setCabecera({ ...cabecera, numero_documento: e.target.value })} />
        )}
      </Tarjeta>

      <Tarjeta titulo="Productos que llegaron" icono={ClipboardList}>
        <div className="space-y-3">
          {lineas.map((l, i) => {
            const p = porId.get(Number(l.producto_id));
            const unidad = p ? UNIDADES_ETIQUETA[p.unidad] : 'kg/u';
            return (
              <div key={l.clave} className="relative grid gap-3 rounded-2xl bg-superficie-2 p-4 ring-1 ring-inset ring-borde md:grid-cols-12 md:items-end">
                <span className="absolute -left-2 -top-2 flex size-6 items-center justify-center rounded-full bg-primario text-xs font-bold text-sobre-primario md:hidden">{i + 1}</span>
                <label className="md:col-span-4">
                  <span className={etiquetaChica}>Producto</span>
                  <span className="relative block">
                    <select className={`${clasesInput} cursor-pointer appearance-none pr-10`} value={l.producto_id} onChange={(e) => elegirProducto(l.clave, e.target.value)}>
                      <option value="">Elegí...</option>
                      {(productos.data ?? []).map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-texto-suave" aria-hidden />
                  </span>
                </label>
                <label className="md:col-span-2">
                  <span className={etiquetaChica}>Cantidad ({unidad})</span>
                  <input className={`${clasesInput} text-right tabular-nums`} inputMode="decimal" value={l.cantidad} onChange={(e) => actualizar(l.clave, { cantidad: e.target.value })} />
                </label>
                <div className="md:col-span-3">
                  <div className="mb-1.5 grid grid-cols-2 gap-1 rounded-xl bg-superficie-2 p-1 ring-1 ring-inset ring-borde" role="radiogroup" aria-label="Cómo cargar el costo">
                    {[['unitario', `$ por ${unidad}`], ['total', '$ total']].map(([m, t]) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={l.modoCosto === m}
                        onClick={() => actualizar(l.clave, { modoCosto: m })}
                        className={`min-h-10 rounded-lg px-2 text-[15px] font-semibold transition-colors ${l.modoCosto === m ? 'bg-primario text-sobre-primario shadow-sm' : 'text-texto-suave hover:bg-superficie hover:text-texto'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input className={`${clasesInput} text-right tabular-nums`} inputMode="decimal" aria-label="Costo" value={l.costo} onChange={(e) => actualizar(l.clave, { costo: e.target.value })} placeholder="$ 0" />
                </div>
                <label className="md:col-span-2">
                  <span className={etiquetaChica}>Vence</span>
                  <input className={clasesInput} type="date" value={l.fecha_vencimiento} onChange={(e) => actualizar(l.clave, { fecha_vencimiento: e.target.value })} />
                </label>
                <div className="flex items-center justify-between gap-2 md:col-span-1 md:flex-col md:items-end md:justify-end">
                  <span className="font-bold tabular-nums">{pesos(subtotalDe(l).toString())}</span>
                  {lineas.length > 1 && (
                    <button type="button" onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))} className="flex size-10 items-center justify-center rounded-xl text-texto-suave hover:bg-peligro-suave hover:text-peligro-texto" aria-label="Quitar este producto">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {errores.items && <p className="mt-2 flex items-center gap-2 font-medium text-peligro-texto"><CircleAlert size={16} aria-hidden />{errores.items}</p>}
        <Boton variante="suave" icono={Plus} className="mt-3" onClick={() => setLineas((ls) => [...ls, nuevaLinea()])}>Agregar otro producto</Boton>
      </Tarjeta>

      <Tarjeta titulo="Pago" icono={Wallet} className="space-y-4">
        <SelectorBotones
          etiqueta="¿Se pagó?"
          valor={cabecera.condicion}
          onCambio={(v) => setCabecera({ ...cabecera, condicion: v })}
          opciones={[{ valor: 'CUENTA_CORRIENTE', etiqueta: CONDICIONES_COMPRA_ETIQUETA.CUENTA_CORRIENTE }, { valor: 'CONTADO', etiqueta: CONDICIONES_COMPRA_ETIQUETA.CONTADO }]}
        />
        {cabecera.condicion === 'CONTADO' && (
          <div className="space-y-2">
            <span className="block text-sm font-semibold">¿Cómo se pagó?</span>
            <SelectorBotones
              etiqueta="Cómo se pagó"
              columnas={2}
              valor={cabecera.medio_pago}
              onCambio={(v) => setCabecera({ ...cabecera, medio_pago: v })}
              opciones={MEDIOS_PAGO_PROVEEDOR.map((m) => ({ valor: m, etiqueta: MEDIOS_PAGO_PROVEEDOR_ETIQUETA[m], icono: m === 'EFECTIVO_CAJA' ? Banknote : undefined }))}
            />
            {cabecera.medio_pago === 'EFECTIVO_CAJA' && (
              <p className={`flex items-center gap-2 text-sm ${caja.abierta ? 'text-texto-suave' : 'font-semibold text-peligro-texto'}`}>
                {!caja.abierta && <CircleAlert size={16} aria-hidden />}
                {caja.abierta ? `Sale de ${caja.caja?.nombre} (hay ${pesos(caja.resumen.efectivo_esperado)} en efectivo).` : 'La caja está cerrada: abrila o elegí otro medio de pago.'}
              </p>
            )}
          </div>
        )}
        <AreaTexto etiqueta="Observaciones (opcional)" value={cabecera.observaciones} onChange={(e) => setCabecera({ ...cabecera, observaciones: e.target.value })} />
      </Tarjeta>

      {/* Barra de acciones fija abajo */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-superficie/95 backdrop-blur lg:left-[260px]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-texto-suave">Total del ingreso</div>
            <div className="text-2xl font-bold tabular-nums tracking-tight">{pesos(total.toString())}</div>
          </div>
          <div className="flex gap-2">
            <Boton variante="secundario" tamanio="grande" onClick={() => navigate('/mercaderia')} className="hidden sm:inline-flex">Cancelar</Boton>
            <Boton type="submit" variante="exito" tamanio="grande" icono={Save} cargando={enviando}>Guardar</Boton>
          </div>
        </div>
      </div>
    </form>
  );
}
