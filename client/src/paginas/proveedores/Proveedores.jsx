import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { dec } from '@pescaderia/shared';
import { get } from '../../api/cliente.js';
import { useSesion } from '../../contexto/Sesion.jsx';
import { Boton, clasesBoton } from '../../componentes/Boton.jsx';
import { Campo, SelectorBotones } from '../../componentes/Formulario.jsx';
import { BotonesContacto } from '../../componentes/Contacto.jsx';
import { Cargando, Encabezado, ErrorCarga, Etiqueta, Tabla, Vacio } from '../../componentes/Varios.jsx';
import { pesos } from '../../lib/formato.js';
import { vieneHoy } from '../../lib/proveedores.js';
import { ModalProveedor } from './ModalProveedor.jsx';

const FILTROS = [
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'baja', etiqueta: 'De baja' },
  { valor: 'todos', etiqueta: 'Todos' },
];

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Proveedores() {
  const { puede } = useSesion();
  const navigate = useNavigate();
  const esDueno = puede('proveedores.editar');
  const [nuevo, setNuevo] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('activos');
  const q = useQuery({ queryKey: ['proveedores', 'todos'], queryFn: () => get('/proveedores', { activo: 'todos' }) });

  // Son pocos proveedores: se busca en el navegador y el resultado aparece al instante
  const filas = useMemo(() => {
    const texto = sinAcentos(buscar.trim());
    const digitos = buscar.replace(/\D/g, '');
    return (q.data ?? [])
      .filter((p) => (filtro === 'todos' ? true : filtro === 'activos' ? p.activo : !p.activo))
      .filter((p) => !texto || sinAcentos(p.nombre).includes(texto) || sinAcentos(p.contacto).includes(texto) || (digitos.length >= 3 && String(p.cuit ?? '').replace(/\D/g, '').includes(digitos)));
  }, [q.data, buscar, filtro]);

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Proveedores" icono={Truck}>
        {esDueno && <Boton icono={Plus} tamanio="grande" onClick={() => setNuevo(true)}>Nuevo proveedor</Boton>}
      </Encabezado>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Campo etiqueta="Buscar" icono={Search} placeholder="Nombre, CUIT o contacto" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <div className="md:w-96">
          <SelectorBotones etiqueta="Mostrar" columnas={3} valor={filtro} onCambio={setFiltro} opciones={FILTROS} />
        </div>
      </div>

      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorCarga error={q.error} reintentar={q.refetch} />
      ) : (
        <>
          {/* En el celular, tarjetas: todo a la vista sin correr una tabla de costado */}
          <div className="space-y-3 sm:hidden">
            {!filas.length && <Vacio icono={Truck}>{buscar ? 'No hay proveedores que coincidan con la búsqueda.' : 'Todavía no hay proveedores.'}</Vacio>}
            {filas.map((p) => (
              <div key={p.id} className="space-y-3 rounded-2xl bg-superficie p-4 shadow-suave ring-1 ring-borde">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-texto">{p.nombre}</span>
                  {p.activo && vieneHoy(p.dias_entrega) && <Etiqueta tono="azul" icono={Truck}>Viene hoy</Etiqueta>}
                  {!p.activo && <Etiqueta>De baja</Etiqueta>}
                  {p.contacto && <span className="block w-full text-sm text-texto-suave">{p.contacto}</span>}
                </div>
                {esDueno && (
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span><span className="text-sm text-texto-suave">Le debemos </span><strong>{pesos(p.saldo)}</strong></span>
                    {dec(p.vencido).gt(0) && <span><span className="text-sm text-texto-suave">Vencido </span><strong className="text-peligro-texto">{pesos(p.vencido)}</strong></span>}
                  </div>
                )}
                <BotonesContacto telefono={p.telefono} className="grid grid-cols-2 [&>*]:w-full" />
                {esDueno && (
                  <Link to={`/proveedores/${p.id}`} className={clasesBoton({ variante: 'suave', className: 'w-full' })}>
                    Ver proveedor <ChevronRight size={18} aria-hidden />
                  </Link>
                )}
              </div>
            ))}
          </div>
          <div className="hidden sm:block">
            <Tabla
              filas={filas}
              alTocarFila={esDueno ? (p) => navigate(`/proveedores/${p.id}`) : undefined}
              vacio={buscar ? 'No hay proveedores que coincidan con la búsqueda.' : 'Todavía no hay proveedores.'}
              iconoVacio={Truck}
              columnas={[
                {
                  clave: 'nombre',
                  titulo: 'Proveedor',
                  render: (p) => (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.nombre}</span>
                      {p.activo && vieneHoy(p.dias_entrega) && <Etiqueta tono="azul" icono={Truck}>Viene hoy</Etiqueta>}
                      {!p.activo && <Etiqueta>De baja</Etiqueta>}
                      {p.contacto && <span className="block w-full text-sm text-texto-suave">{p.contacto}</span>}
                    </span>
                  ),
                },
                { clave: 'contacto', titulo: 'Contacto', render: (p) => <BotonesContacto telefono={p.telefono} /> },
                ...(esDueno
                  ? [
                      { clave: 'saldo', titulo: 'Le debemos', derecha: true, render: (p) => (dec(p.saldo).gt(0) ? <strong>{pesos(p.saldo)}</strong> : <span className="text-texto-tenue">{pesos(p.saldo)}</span>) },
                      { clave: 'vencido', titulo: 'Vencido', derecha: true, render: (p) => (dec(p.vencido).gt(0) ? <strong className="text-peligro-texto">{pesos(p.vencido)}</strong> : <span className="text-texto-tenue">—</span>) },
                      { clave: 'ver', titulo: '', render: () => <span className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-primario-texto">Ver proveedor <ChevronRight size={16} aria-hidden /></span> },
                    ]
                  : []),
              ]}
            />
          </div>
        </>
      )}
      {nuevo && <ModalProveedor onCerrar={() => setNuevo(false)} />}
    </div>
  );
}
