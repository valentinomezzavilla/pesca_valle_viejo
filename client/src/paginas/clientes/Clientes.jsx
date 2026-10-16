import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookUser, ChevronRight, Phone, Plus, Search, UserRound, Users, Wallet } from 'lucide-react';
import { dec, sumar } from '@pescaderia/shared';
import { conPin, get, post, put } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton, clasesBoton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { AreaTexto, Campo, Interruptor, SelectorBotones } from '../../componentes/Formulario.jsx';
import { BotonesContacto } from '../../componentes/Contacto.jsx';
import { Cargando, Encabezado, ErrorCarga, Etiqueta, Indicador, Tabla, Vacio } from '../../componentes/Varios.jsx';
import { normalizarNumero, pesos } from '../../lib/formato.js';

const FILTROS = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'cuenta', etiqueta: 'Con cuenta corriente' },
  { valor: 'deuda', etiqueta: 'Con deuda' },
  { valor: 'vencido', etiqueta: 'Con deuda vencida' },
];

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Debe({ saldo }) {
  const s = dec(saldo ?? 0);
  if (s.gt(0)) return <strong className="text-peligro-texto">{pesos(saldo)}</strong>;
  if (s.lt(0)) return <Etiqueta tono="verde">A favor {pesos(s.abs().toFixed(2))}</Etiqueta>;
  return <span className="text-texto-tenue">—</span>;
}

function EtiquetasCliente({ c }) {
  return (
    <>
      {c.cuenta_corriente && <Etiqueta tono="azul" icono={BookUser}>Cuenta corriente</Etiqueta>}
      {!c.activo && <Etiqueta>De baja</Etiqueta>}
    </>
  );
}

export function Clientes() {
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [nuevo, setNuevo] = useState(false);
  const q = useQuery({ queryKey: ['clientes', 'lista'], queryFn: () => get('/clientes', { porPagina: 500 }) });

  const todos = q.data ?? [];
  const filas = useMemo(() => {
    const texto = sinAcentos(busqueda.trim());
    return todos.filter(
      (c) =>
        (filtro === 'todos' ||
          (filtro === 'cuenta' && c.cuenta_corriente) ||
          (filtro === 'deuda' && dec(c.saldo ?? 0).gt(0)) ||
          (filtro === 'vencido' && dec(c.vencido ?? 0).gt(0))) &&
        (!texto || sinAcentos(`${c.nombre} ${c.telefono ?? ''} ${c.documento ?? ''}`).includes(texto)),
    );
  }, [todos, busqueda, filtro]);
  const deudores = todos.filter((c) => dec(c.saldo ?? 0).gt(0));
  const totalDeuda = sumar(deudores.map((c) => c.saldo));
  const totalVencido = sumar(todos.map((c) => c.vencido ?? 0));
  const vacio = todos.length ? 'No hay clientes con ese filtro.' : 'Todavía no hay clientes. Cargalos acá o al momento de vender.';

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Clientes" icono={Users} subtitulo="Cuentas corrientes: lo que se les vende a cuenta y lo que van pagando.">
        <Boton icono={Plus} tamanio="grande" onClick={() => setNuevo(true)}>Nuevo cliente</Boton>
      </Encabezado>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Indicador icono={Wallet} tono={deudores.length ? 'alerta' : 'bueno'} etiqueta="Nos deben en total" valor={pesos(totalDeuda.toFixed(2))} detalle={deudores.length ? `${deudores.length} ${deudores.length === 1 ? 'cliente' : 'clientes'} con deuda` : 'Nadie debe nada'} />
        <Indicador icono={UserRound} tono={totalVencido.gt(0) ? 'malo' : 'bueno'} etiqueta="Ya vencido" valor={pesos(totalVencido.toFixed(2))} detalle={totalVencido.gt(0) ? 'Tocá "Con deuda vencida" para ver quiénes' : 'Nadie debe vencido'} />
      </div>

      <div className="mb-4 space-y-3">
        <Campo icono={Search} etiqueta="Buscar" placeholder="Nombre, teléfono o documento" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <SelectorBotones etiqueta="Mostrar" columnas={2} valor={filtro} onCambio={setFiltro} opciones={FILTROS} />
      </div>

      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorCarga error={q.error} reintentar={q.refetch} />
      ) : (
        <>
          {/* En el celular, tarjetas: todo a la vista sin correr una tabla de costado */}
          <div className="space-y-3 sm:hidden">
            {!filas.length && <Vacio icono={Users}>{vacio}</Vacio>}
            {filas.map((c) => (
              <div key={c.id} className="space-y-3 rounded-2xl bg-superficie p-4 shadow-suave ring-1 ring-borde">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-texto">{c.nombre}</span>
                  <EtiquetasCliente c={c} />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span><span className="text-sm text-texto-suave">Debe </span><Debe saldo={c.saldo} /></span>
                  {dec(c.vencido ?? 0).gt(0) && <span><span className="text-sm text-texto-suave">Vencido </span><strong className="text-peligro-texto">{pesos(c.vencido)}</strong></span>}
                </div>
                <BotonesContacto telefono={c.telefono} className="grid grid-cols-2 [&>*]:w-full" />
                <Link to={`/clientes/${c.id}`} className={clasesBoton({ variante: 'suave', className: 'w-full' })}>
                  Ver cliente <ChevronRight size={18} aria-hidden />
                </Link>
              </div>
            ))}
          </div>
          <div className="hidden sm:block">
            <Tabla
              filas={filas}
              alTocarFila={(c) => navigate(`/clientes/${c.id}`)}
              vacio={vacio}
              iconoVacio={Users}
              columnas={[
                {
                  clave: 'nombre',
                  titulo: 'Cliente',
                  render: (c) => (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.nombre}</span>
                      <EtiquetasCliente c={c} />
                    </span>
                  ),
                },
                { clave: 'contacto', titulo: 'Contacto', render: (c) => <BotonesContacto telefono={c.telefono} /> },
                { clave: 'saldo', titulo: 'Debe', derecha: true, render: (c) => <Debe saldo={c.saldo} /> },
                { clave: 'vencido', titulo: 'Vencido', derecha: true, render: (c) => (dec(c.vencido ?? 0).gt(0) ? <strong className="text-peligro-texto">{pesos(c.vencido)}</strong> : <span className="text-texto-tenue">—</span>) },
                { clave: 'ver', titulo: '', render: () => <span className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-primario-texto">Ver cliente <ChevronRight size={16} aria-hidden /></span> },
              ]}
            />
          </div>
        </>
      )}
      {nuevo && <ModalCliente onCerrar={() => setNuevo(false)} onGuardado={(c) => navigate(`/clientes/${c.id}`)} />}
    </div>
  );
}

export function ModalCliente({ cliente, onCerrar, onGuardado }) {
  const queryClient = useQueryClient();
  const { avisar, pedirPin } = useDialogos();
  const [d, setD] = useState({
    nombre: cliente?.nombre ?? '',
    telefono: cliente?.telefono ?? '',
    documento: cliente?.documento ?? '',
    direccion: cliente?.direccion ?? '',
    cuenta_corriente: cliente?.cuenta_corriente ?? false,
    limite_credito: cliente?.limite_credito ?? '',
    plazo_pago_dias: String(cliente?.plazo_pago_dias ?? 0),
    notas: cliente?.notas ?? '',
    activo: cliente?.activo ?? true,
  });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const set = (c) => setD((x) => ({ ...x, ...c }));

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      const datos = {
        ...d,
        limite_credito: d.limite_credito === '' ? '' : normalizarNumero(d.limite_credito),
        plazo_pago_dias: d.plazo_pago_dias === '' ? 0 : d.plazo_pago_dias,
      };
      // Cliente nuevo sin cuenta corriente: lo que haya quedado escrito en límite y plazo (ocultos) no se guarda
      if (!cliente && !d.cuenta_corriente) Object.assign(datos, { limite_credito: '', plazo_pago_dias: 0 });
      // Abrir o cambiar la cuenta corriente necesita el PIN del dueño si el que guarda es el cajero
      const r = await conPin(pedirPin, (pin) => {
        const conPinAutorizacion = { ...datos, pinAutorizacion: pin };
        return cliente ? put(`/clientes/${cliente.id}`, conPinAutorizacion) : post('/clientes', conPinAutorizacion);
      });
      if (!r) return;
      avisar('Cliente guardado.');
      ['clientes', 'ficha-cliente'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onGuardado?.(r);
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'} icono={UserRound} onCerrar={onCerrar} ancho="sm:max-w-xl">
      <form onSubmit={guardar} className="grid gap-4 md:grid-cols-2">
        <Campo className="md:col-span-2" etiqueta="Nombre" autoFocus value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} error={errores.nombre} />
        <Campo etiqueta="Teléfono" icono={Phone} inputMode="tel" placeholder="Ej: 223 555-1111" value={d.telefono} onChange={(e) => set({ telefono: e.target.value })} ayuda="Con la característica, para que funcione WhatsApp" />
        <Campo etiqueta="DNI / CUIT" value={d.documento} onChange={(e) => set({ documento: e.target.value })} />
        <Campo className="md:col-span-2" etiqueta="Dirección" value={d.direccion} onChange={(e) => set({ direccion: e.target.value })} />
        <div className="space-y-4 rounded-2xl bg-superficie-2 p-4 md:col-span-2">
          <Interruptor
            etiqueta="Tiene cuenta corriente"
            checked={d.cuenta_corriente}
            onChange={(v) => set({ cuenta_corriente: v })}
            ayuda="Puede llevar mercadería y pagar después. Abrirla o cambiar límite y plazo necesita el PIN del dueño."
          />
          {d.cuenta_corriente && (
            <div className="grid gap-4 md:grid-cols-2">
              <Campo
                etiqueta="Límite de crédito"
                inputMode="decimal"
                placeholder="Sin límite"
                value={d.limite_credito}
                onChange={(e) => set({ limite_credito: e.target.value })}
                error={errores.limite_credito}
                ayuda="Lo máximo que puede deber. Vacío = sin límite."
              />
              <Campo
                etiqueta="¿En cuántos días tiene que pagar?"
                inputMode="numeric"
                value={d.plazo_pago_dias}
                onChange={(e) => set({ plazo_pago_dias: e.target.value.replace(/\D/g, '') })}
                error={errores.plazo_pago_dias}
                ayuda="0 = en el día. Pasado ese plazo, la compra figura como vencida."
              />
            </div>
          )}
          {cliente?.cuenta_corriente && !d.cuenta_corriente && dec(cliente.saldo ?? 0).gt(0) && (
            <p className="text-sm text-alerta-texto">Ya no se le va a poder vender a cuenta, pero sigue debiendo {pesos(cliente.saldo)} y se le puede cobrar.</p>
          )}
        </div>
        <AreaTexto className="md:col-span-2" etiqueta="Notas" rows={2} value={d.notas} onChange={(e) => set({ notas: e.target.value })} />
        {cliente && <Interruptor etiqueta="Cliente activo" checked={d.activo} onChange={(v) => set({ activo: v })} />}
        <div className="flex gap-3 border-t border-borde pt-4 md:col-span-2 md:justify-end">
          <Boton variante="secundario" tamanio="grande" onClick={onCerrar} className="flex-1 md:flex-none">Cancelar</Boton>
          <Boton type="submit" tamanio="grande" cargando={enviando} className="flex-1 md:flex-none">Guardar</Boton>
        </div>
      </form>
    </Modal>
  );
}
