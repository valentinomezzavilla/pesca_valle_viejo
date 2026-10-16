import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, ReceiptText, Save, Settings, SlidersHorizontal, Store, Wallet } from 'lucide-react';
import { get, post, put } from '../api/cliente.js';
import { useDialogos } from '../contexto/Dialogos.jsx';
import { Boton } from '../componentes/Boton.jsx';
import { Campo, SelectorBotones } from '../componentes/Formulario.jsx';
import { Cargando, Encabezado, Tarjeta } from '../componentes/Varios.jsx';

export function Configuracion() {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const config = useQuery({ queryKey: ['configuracion'], queryFn: () => get('/configuracion') });
  const [d, setD] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (config.data && !d) setD(config.data);
  }, [config.data, d]);

  if (!d) return <Cargando />;
  const setNegocio = (c) => setD({ ...d, negocio: { ...d.negocio, ...c } });

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await put('/configuracion', d);
      setD(r);
      queryClient.setQueryData(['configuracion'], r);
      avisar('Configuración guardada.');
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Encabezado titulo="Configuración" icono={Settings} />
      <form onSubmit={guardar} className="space-y-6">
        <Tarjeta titulo="Datos del negocio" icono={Store} className="grid gap-4 md:grid-cols-2">
          <p className="-mt-2 text-sm text-texto-suave md:col-span-2">Aparecen en el encabezado del ticket.</p>
          <Campo etiqueta="Nombre" value={d.negocio.nombre} onChange={(e) => setNegocio({ nombre: e.target.value })} />
          <Campo etiqueta="Teléfono" value={d.negocio.telefono} onChange={(e) => setNegocio({ telefono: e.target.value })} />
          <Campo etiqueta="Dirección" value={d.negocio.direccion} onChange={(e) => setNegocio({ direccion: e.target.value })} />
          <Campo etiqueta="CUIT (opcional)" value={d.negocio.cuit} onChange={(e) => setNegocio({ cuit: e.target.value })} />
          <Campo className="md:col-span-2" etiqueta="Mensaje al pie del ticket" value={d.negocio.mensaje_ticket} onChange={(e) => setNegocio({ mensaje_ticket: e.target.value })} />
        </Tarjeta>
        <Tarjeta titulo="Ventas y alertas" icono={SlidersHorizontal} className="grid gap-4 md:grid-cols-2">
          <div>
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Printer size={15} aria-hidden /> Ancho del papel del ticket</span>
            <SelectorBotones etiqueta="Ancho del papel" valor={String(d.ticket_ancho)} onCambio={(v) => setD({ ...d, ticket_ancho: v })} opciones={[{ valor: '58', etiqueta: '58 mm' }, { valor: '80', etiqueta: '80 mm' }]} />
          </div>
          <Campo etiqueta="Punto de venta" type="number" min={1} value={d.punto_venta} onChange={(e) => setD({ ...d, punto_venta: e.target.value })} ayuda="Prefijo de la numeración de tickets (0001-...)" />
          <Campo etiqueta="Descuento máximo del cajero sin PIN (%)" type="number" min={0} max={100} value={d.descuento_max_cajero} onChange={(e) => setD({ ...d, descuento_max_cajero: e.target.value })} />
          <Campo etiqueta="Avisar vencimientos con (días)" type="number" min={0} max={60} value={d.dias_alerta_vencimiento} onChange={(e) => setD({ ...d, dias_alerta_vencimiento: e.target.value })} />
        </Tarjeta>
        <div className="flex justify-end">
          <Boton type="submit" tamanio="grande" icono={Save} cargando={enviando}>Guardar configuración</Boton>
        </div>
      </form>
      <div className="grid gap-6 md:grid-cols-2">
        <ListaEditable titulo="Cajas (puestos de cobro)" icono={Wallet} clave="cajas" ruta="/cajas" />
        <ListaEditable titulo="Rubros de gastos" icono={ReceiptText} clave="categorias-gasto" ruta="/categorias-gasto" />
      </div>
    </div>
  );
}

function ListaEditable({ titulo, icono, clave, ruta }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const lista = useQuery({ queryKey: [clave], queryFn: () => get(ruta) });
  const [nuevo, setNuevo] = useState('');

  const ejecutar = async (fn) => {
    try {
      await fn();
      queryClient.invalidateQueries({ queryKey: [clave] });
      return true;
    } catch (err) {
      avisar(err.message, 'error');
      return false;
    }
  };

  return (
    <Tarjeta titulo={titulo} icono={icono}>
      <ul className="mb-4 divide-y divide-borde overflow-hidden rounded-xl ring-1 ring-borde">
        {(lista.data ?? []).map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 px-4 py-1.5">
            <span className={item.activa ? 'font-medium' : 'text-texto-tenue line-through'}>{item.nombre}</span>
            <Boton variante="fantasma" tamanio="chico" onClick={() => ejecutar(() => put(`${ruta}/${item.id}`, { activa: !item.activa }))}>
              {item.activa ? 'Desactivar' : 'Activar'}
            </Boton>
          </li>
        ))}
      </ul>
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await ejecutar(() => post(ruta, { nombre: nuevo }))) setNuevo('');
        }}
      >
        <Campo className="flex-1" aria-label={`Agregar a ${titulo}`} placeholder="Agregar..." value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <Boton type="submit" icono={Plus} className="min-h-12" disabled={!nuevo.trim()}>Agregar</Boton>
      </form>
    </Tarjeta>
  );
}
