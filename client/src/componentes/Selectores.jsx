// Buscadores con lista para elegir un cliente o un producto sin salir de la pantalla.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fish, Search, UserPlus, UserRound, X } from 'lucide-react';
import { get, post } from '../api/cliente.js';
import { useDialogos } from '../contexto/Dialogos.jsx';
import { Boton } from './Boton.jsx';
import { Campo } from './Formulario.jsx';
import { cantidad, pesos } from '../lib/formato.js';

function useRetraso(valor, ms = 250) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

function TarjetaElegida({ icono: Icono, titulo, detalle, onQuitar }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-primario-suave px-4 py-3 text-primario-texto">
      <Icono size={22} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{titulo}</div>
        {detalle && <div className="text-sm opacity-90">{detalle}</div>}
      </div>
      {onQuitar && (
        <button type="button" onClick={onQuitar} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-black/10" aria-label="Cambiar">
          <X size={18} />
        </button>
      )}
    </div>
  );
}

/** Elegir (o crear en el momento) un cliente. valor = cliente elegido o null. */
export function SelectorCliente({ valor, onElegir, autoFocus = false }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const [texto, setTexto] = useState('');
  const [nuevo, setNuevo] = useState(null); // { nombre, telefono } mientras se crea
  const [creando, setCreando] = useState(false);
  const q = useRetraso(texto.trim());
  const lista = useQuery({ queryKey: ['clientes', 'buscar', q], queryFn: () => get('/clientes', { q, porPagina: 8 }), enabled: !valor });

  if (valor) {
    return (
      <TarjetaElegida
        icono={UserRound}
        titulo={valor.nombre}
        detalle={[!valor.cuenta_corriente && 'Sin cuenta corriente', Number(valor.saldo) > 0 ? `Ya debe ${pesos(valor.saldo)}` : 'Sin deuda'].filter(Boolean).join(' · ')}
        onQuitar={() => onElegir(null)}
      />
    );
  }

  const crear = async (e) => {
    e.preventDefault();
    setCreando(true);
    try {
      const cliente = await post('/clientes', { nombre: nuevo.nombre, telefono: nuevo.telefono });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      onElegir(cliente);
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setCreando(false);
    }
  };

  if (nuevo) {
    return (
      <form onSubmit={crear} className="space-y-3 rounded-xl border border-borde p-4">
        <div className="font-semibold text-texto">Cliente nuevo</div>
        <Campo etiqueta="Nombre" autoFocus value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <Campo etiqueta="Teléfono (opcional)" inputMode="tel" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={() => setNuevo(null)}>Volver</Boton>
          <Boton type="submit" className="flex-1" cargando={creando} disabled={!nuevo.nombre.trim()}>Guardar y elegir</Boton>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <Campo icono={Search} autoFocus={autoFocus} aria-label="Buscar cliente" placeholder="Buscar cliente por nombre o teléfono..." value={texto} onChange={(e) => setTexto(e.target.value)} />
      <ul className="scroll-fino max-h-56 space-y-1 overflow-y-auto">
        {(lista.data ?? []).map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onElegir(c)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-superficie-2 focus-visible:ring-4 focus-visible:ring-anillo">
              <UserRound size={18} className="shrink-0 text-texto-suave" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-texto">{c.nombre}</span>
                {c.telefono && <span className="block text-sm text-texto-suave">{c.telefono}</span>}
              </span>
              {!c.cuenta_corriente && <span className="shrink-0 text-sm text-texto-tenue">Sin cuenta corriente</span>}
              {Number(c.saldo) > 0 && <span className="shrink-0 text-sm font-semibold text-peligro-texto">Debe {pesos(c.saldo)}</span>}
            </button>
          </li>
        ))}
        {lista.data && !lista.data.length && <li className="px-3 py-2 text-texto-suave">{q ? 'No hay clientes con ese nombre.' : 'Todavía no hay clientes cargados.'}</li>}
      </ul>
      <Boton variante="fantasma" icono={UserPlus} onClick={() => setNuevo({ nombre: texto.trim(), telefono: '' })}>Cliente nuevo</Boton>
    </div>
  );
}

/** Elegir un producto del stock. valor = producto elegido (fila de /stock) o null. */
export function SelectorProducto({ valor, onElegir, autoFocus = false }) {
  const [texto, setTexto] = useState('');
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => get('/stock'), enabled: !valor });

  if (valor) {
    return <TarjetaElegida icono={Fish} titulo={valor.nombre} detalle={`Stock: ${cantidad(valor.stock_actual, valor.unidad)}`} onQuitar={() => onElegir(null)} />;
  }
  const filtrados = (stock.data ?? []).filter((p) => !texto.trim() || p.nombre.toLowerCase().includes(texto.trim().toLowerCase())).slice(0, 30);
  return (
    <div className="space-y-2">
      <Campo icono={Search} autoFocus={autoFocus} aria-label="Buscar producto" placeholder="Buscar producto..." value={texto} onChange={(e) => setTexto(e.target.value)} />
      <ul className="scroll-fino max-h-56 space-y-1 overflow-y-auto">
        {filtrados.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onElegir(p)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-superficie-2 focus-visible:ring-4 focus-visible:ring-anillo">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-texto">{p.nombre}</span>
                <span className="block text-sm text-texto-suave">{p.categoria}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-texto-suave">{cantidad(p.stock_actual, p.unidad)}</span>
            </button>
          </li>
        ))}
        {stock.data && !filtrados.length && <li className="px-3 py-2 text-texto-suave">No hay productos con ese nombre.</li>}
      </ul>
    </div>
  );
}
