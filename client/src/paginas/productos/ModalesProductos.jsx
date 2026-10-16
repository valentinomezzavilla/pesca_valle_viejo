import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, LayoutGrid, Package, Plus, Scale, Tag, TrendingUp } from 'lucide-react';
import { dec, redondearAMultiplo } from '@pescaderia/shared';
import { patch, post, put } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { Campo, Interruptor, Selector, SelectorBotones } from '../../componentes/Formulario.jsx';
import { normalizarNumero, pesos, porcentaje } from '../../lib/formato.js';

const invalidar = (qc) => ['productos', 'productos-pos', 'stock', 'categorias'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

export function ModalProducto({ producto, categorias, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar, confirmar } = useDialogos();
  const esNuevo = !producto;
  const [d, setD] = useState({
    nombre: producto?.nombre ?? '',
    codigo: producto?.codigo ?? '',
    categoria_id: producto?.categoria_id ?? categorias[0]?.id ?? '',
    unidad: producto?.unidad ?? 'KG',
    precio_venta: producto ? String(Number(producto.precio_venta)) : '',
    stock_minimo: producto ? String(Number(producto.stock_minimo)) : '0',
    dias_vida_util: producto?.dias_vida_util ?? '',
    controla_vencimiento: producto?.controla_vencimiento ?? true,
    favorito: producto?.favorito ?? false,
    activo: producto?.activo ?? true,
  });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const set = (cambios) => setD((x) => ({ ...x, ...cambios }));

  const costo = producto?.costo_referencia;
  const precio = normalizarNumero(d.precio_venta);
  const margen = costo && dec(costo).gt(0) && precio && !isNaN(Number(precio)) && dec(precio).gt(0) ? dec(precio).minus(costo).div(precio).times(100) : null;

  const guardar = async (e) => {
    e.preventDefault();
    if (!esNuevo && producto.activo && !d.activo) {
      if (!(await confirmar({ titulo: 'Dar de baja', mensaje: `“${producto.nombre}” deja de aparecer en la pantalla de venta. El historial se conserva.`, textoConfirmar: 'Dar de baja', peligro: true }))) return;
    }
    setEnviando(true);
    setErrores({});
    const datos = {
      ...d,
      categoria_id: Number(d.categoria_id),
      precio_venta: normalizarNumero(d.precio_venta),
      stock_minimo: normalizarNumero(d.stock_minimo) || '0',
      dias_vida_util: d.dias_vida_util === '' ? null : Number(d.dias_vida_util),
    };
    try {
      if (esNuevo) await post('/productos', datos);
      else await put(`/productos/${producto.id}`, datos);
      avisar(esNuevo ? 'Producto creado.' : 'Cambios guardados.');
      invalidar(queryClient);
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={esNuevo ? 'Nuevo producto' : 'Editar producto'} icono={Tag} onCerrar={onCerrar} ancho="sm:max-w-2xl">
      <form onSubmit={guardar} className="grid gap-4 md:grid-cols-2">
        <Campo className="md:col-span-2" etiqueta="Nombre" autoFocus value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} error={errores.nombre} placeholder="Ej: Merluza filet" />
        <Selector
          etiqueta="Categoría"
          value={d.categoria_id}
          onChange={(e) => set({ categoria_id: e.target.value })}
          opciones={categorias.filter((c) => c.activa || c.id === d.categoria_id).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
          error={errores.categoria_id}
        />
        <Campo etiqueta="Código corto (opcional)" value={d.codigo} onChange={(e) => set({ codigo: e.target.value })} error={errores.codigo} ayuda="Para encontrarlo rápido en la venta" />
        <div className="md:col-span-2">
          <span className="mb-1.5 block text-sm font-semibold">Se vende por</span>
          <SelectorBotones etiqueta="Se vende por" valor={d.unidad} onCambio={(u) => set({ unidad: u })} opciones={[{ valor: 'KG', etiqueta: 'Peso (kg)', icono: Scale }, { valor: 'UNIDAD', etiqueta: 'Unidad', icono: Package }]} />
        </div>
        <Campo
          etiqueta={`Precio de venta (por ${d.unidad === 'KG' ? 'kg' : 'unidad'})`}
          inputMode="decimal"
          value={d.precio_venta}
          onChange={(e) => set({ precio_venta: e.target.value })}
          error={errores.precio_venta}
          ayuda={margen ? `Último costo ${pesos(costo)} → margen ${porcentaje(margen.toFixed(1))}` : undefined}
        />
        <Campo etiqueta="Stock mínimo" inputMode="decimal" value={d.stock_minimo} onChange={(e) => set({ stock_minimo: e.target.value })} error={errores.stock_minimo} ayuda="Avisa cuando llega a esta cantidad" />
        <Campo etiqueta="Días que dura (opcional)" inputMode="numeric" value={d.dias_vida_util} onChange={(e) => set({ dias_vida_util: e.target.value.replace(/\D/g, '') })} ayuda="Sugiere el vencimiento al ingresar mercadería" error={errores.dias_vida_util} />
        <div className="space-y-2">
          <Interruptor etiqueta="Controlar vencimiento" checked={d.controla_vencimiento} onChange={(v) => set({ controla_vencimiento: v })} />
          <Interruptor etiqueta="Favorito en la venta" checked={d.favorito} onChange={(v) => set({ favorito: v })} />
          {!esNuevo && <Interruptor etiqueta="Activo (se puede vender)" checked={d.activo} onChange={(v) => set({ activo: v })} />}
        </div>
        <div className="flex gap-3 border-t border-borde pt-4 md:col-span-2 md:justify-end">
          <Boton variante="secundario" tamanio="grande" onClick={onCerrar} className="flex-1 md:flex-none">Cancelar</Boton>
          <Boton type="submit" tamanio="grande" cargando={enviando} className="flex-1 md:flex-none">Guardar</Boton>
        </div>
      </form>
    </Modal>
  );
}

export function ModalAumento({ categorias, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar, confirmar } = useDialogos();
  const [d, setD] = useState({ categoria_id: categorias[0]?.id ?? '', porcentaje: '', redondeo: 10 });
  const [enviando, setEnviando] = useState(false);
  const pct = normalizarNumero(d.porcentaje);
  const ejemplo = pct && !isNaN(Number(pct)) ? redondearAMultiplo(dec(10000).times(dec(100).plus(pct).div(100)), d.redondeo) : null;

  const aplicar = async () => {
    const cat = categorias.find((c) => c.id === Number(d.categoria_id));
    if (!(await confirmar({ titulo: 'Cambiar precios', mensaje: `Todos los productos de “${cat?.nombre}” cambian ${d.porcentaje}%. Después se puede corregir uno por uno.`, textoConfirmar: 'Aplicar' }))) return;
    setEnviando(true);
    try {
      const r = await patch('/productos/precios', { categoria_id: Number(d.categoria_id), porcentaje: Number(pct), redondeo: d.redondeo });
      avisar(`Se actualizaron ${r.length} precios.`);
      invalidar(queryClient);
      onCerrar();
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Aumento por categoría" icono={TrendingUp} onCerrar={onCerrar} ancho="sm:max-w-md">
      <div className="space-y-4">
        <Selector etiqueta="Categoría" value={d.categoria_id} onChange={(e) => setD({ ...d, categoria_id: e.target.value })} opciones={categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} />
        <Campo etiqueta="Porcentaje" inputMode="decimal" value={d.porcentaje} onChange={(e) => setD({ ...d, porcentaje: e.target.value })} placeholder="Ej: 8" ayuda="Usá un número negativo para bajar precios" />
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Redondear a</span>
          <SelectorBotones etiqueta="Redondear a" columnas={4} valor={d.redondeo} onCambio={(r) => setD({ ...d, redondeo: r })} opciones={[{ valor: 0, etiqueta: 'No' }, { valor: 10, etiqueta: '$10' }, { valor: 50, etiqueta: '$50' }, { valor: 100, etiqueta: '$100' }]} />
        </div>
        {ejemplo && (
          <p className="rounded-xl bg-primario-suave px-4 py-3 text-primario-texto">
            Ejemplo: un producto de $10.000 queda en <strong>{pesos(ejemplo.toString())}</strong>
          </p>
        )}
        <Boton tamanio="grande" className="w-full" cargando={enviando} disabled={!d.porcentaje || !d.categoria_id} onClick={aplicar}>Aplicar</Boton>
      </div>
    </Modal>
  );
}

export function ModalCategorias({ categorias, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const [nueva, setNueva] = useState('');

  const crear = async (e) => {
    e.preventDefault();
    try {
      await post('/categorias', { nombre: nueva, orden: categorias.length + 1 });
      setNueva('');
      invalidar(queryClient);
    } catch (err) {
      avisar(err.message, 'error');
    }
  };
  const actualizar = async (c, cambios) => {
    try {
      await put(`/categorias/${c.id}`, cambios);
      invalidar(queryClient);
    } catch (err) {
      avisar(err.message, 'error');
    }
  };

  return (
    <Modal titulo="Categorías" icono={LayoutGrid} onCerrar={onCerrar} ancho="sm:max-w-md">
      <ul className="mb-4 divide-y divide-borde overflow-hidden rounded-xl ring-1 ring-borde">
        {categorias.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 bg-superficie px-4 py-2">
            <span className={c.activa ? 'font-medium' : 'text-texto-tenue line-through'}>{c.nombre}</span>
            <Boton variante="fantasma" tamanio="chico" icono={c.activa ? EyeOff : Eye} onClick={() => actualizar(c, { activa: !c.activa })}>{c.activa ? 'Ocultar' : 'Mostrar'}</Boton>
          </li>
        ))}
      </ul>
      <form onSubmit={crear} className="flex items-end gap-2">
        <Campo className="flex-1" aria-label="Nueva categoría" placeholder="Nueva categoría" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <Boton type="submit" icono={Plus} disabled={!nueva.trim()} className="min-h-12">Agregar</Boton>
      </form>
    </Modal>
  );
}
