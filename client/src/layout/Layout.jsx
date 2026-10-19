import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BarChart3, BookUser, Boxes, ClipboardList, House, LogOut, Menu, Monitor, Moon, PackagePlus, Receipt, Settings, ShoppingCart, Sun, Tags, Trash2, Truck, Users, Wallet, X,
} from 'lucide-react';
import { ROLES_ETIQUETA } from '@pescaderia/shared';
import { get } from '../api/cliente.js';
import { useSesion } from '../contexto/Sesion.jsx';
import { TEMAS_ETIQUETA, useTema } from '../contexto/Tema.jsx';

const GRUPOS = [
  {
    titulo: 'Mostrador',
    secciones: [
      { a: '/inicio', texto: 'Inicio', icono: House, permiso: 'reportes.ver' },
      { a: '/vender', texto: 'Vender', icono: ShoppingCart },
      { a: '/caja', texto: 'Caja', icono: Wallet },
      { a: '/ventas', texto: 'Ventas', icono: Receipt },
      { a: '/clientes', texto: 'Clientes y fiado', icono: BookUser, permiso: 'clientes.operar' },
    ],
  },
  {
    titulo: 'Mercadería',
    secciones: [
      { a: '/mercaderia', texto: 'Ingreso de mercadería', icono: PackagePlus, permiso: 'compras.crear' },
      { a: '/stock', texto: 'Stock', icono: Boxes, permiso: 'stock.ver', alertas: true },
      { a: '/mermas', texto: 'Mermas', icono: Trash2, permiso: 'mermas.registrar' },
      { a: '/inventario', texto: 'Inventario', icono: ClipboardList, permiso: 'inventario.contar' },
      { a: '/productos', texto: 'Productos y precios', icono: Tags },
      { a: '/proveedores', texto: 'Proveedores', icono: Truck },
    ],
  },
  {
    titulo: 'Administración',
    secciones: [
      { a: '/reportes', texto: 'Reportes', icono: BarChart3, permiso: 'reportes.ver' },
      { a: '/usuarios', texto: 'Usuarios', icono: Users, permiso: 'usuarios.gestionar' },
      { a: '/configuracion', texto: 'Configuración', icono: Settings, permiso: 'configuracion.editar' },
    ],
  },
];

const ICONO_TEMA = { claro: Sun, oscuro: Moon, sistema: Monitor };

const iniciales = (nombre = '') =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export function Layout() {
  const { usuario, salir, puede } = useSesion();
  const { tema, siguiente } = useTema();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();
  const config = useQuery({ queryKey: ['configuracion'], queryFn: () => get('/configuracion'), staleTime: 5 * 60_000 });
  const nombreNegocio = config.data?.negocio?.nombre ?? 'Pescadería Valle Viejo';
  const alertas = useQuery({ queryKey: ['alertas'], queryFn: () => get('/stock/alertas'), enabled: puede('stock.ver'), refetchInterval: 5 * 60_000 });
  const cantidadAlertas = alertas.data?.total ?? 0;
  const IconoTema = ICONO_TEMA[tema];
  const esPos = pathname.startsWith('/vender');

  const grupos = GRUPOS.map((g) => ({ ...g, secciones: g.secciones.filter((s) => !s.permiso || puede(s.permiso)) })).filter((g) => g.secciones.length);

  const contenidoMenu = (
    <>
      <div className="flex items-center gap-3 pb-4 pl-5 pr-14 pt-5 lg:pr-5">
        <img src="/logo-512.png" alt="" className="size-12 shrink-0 rounded-full ring-2 ring-white/20" />
        <div className="min-w-0">
          <div className="font-bold leading-tight text-white">{nombreNegocio}</div>
          <div className="text-xs text-lateral-texto">Sistema de gestión</div>
        </div>
      </div>

      <nav className="scroll-fino flex-1 overflow-y-auto px-3 pb-3" aria-label="Secciones">
        {grupos.map((g) => (
          <div key={g.titulo} className="mt-3 first:mt-1">
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-lateral-texto/70">{g.titulo}</div>
            <ul className="space-y-0.5">
              {g.secciones.map((s) => (
                <li key={s.a}>
                  <NavLink
                    to={s.a}
                    onClick={() => setMenuAbierto(false)}
                    className={({ isActive }) =>
                      `group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/40 ${
                        isActive ? 'bg-white text-[#0a2236] shadow-sm' : 'text-lateral-texto hover:bg-lateral-hover hover:text-white'
                      }`
                    }
                  >
                    <s.icono size={19} strokeWidth={2.1} aria-hidden />
                    {s.texto}
                    {s.alertas && cantidadAlertas > 0 && (
                      <span className="ml-auto min-w-6 rounded-full bg-alerta px-1.5 py-0.5 text-center text-xs font-bold text-slate-900" title="Avisos de stock" aria-label={`${cantidadAlertas} avisos de stock`}>
                        {cantidadAlertas}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-lateral-borde p-3">
        <NavLink
          to="/mi-cuenta"
          onClick={() => setMenuAbierto(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-lateral-hover ${isActive ? 'bg-lateral-hover' : ''}`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primario text-sm font-bold text-sobre-primario">{iniciales(usuario.nombre)}</span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-white">{usuario.nombre}</span>
            <span className="block text-xs text-lateral-texto">{ROLES_ETIQUETA[usuario.rol]} · Mi cuenta</span>
          </span>
        </NavLink>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={siguiente}
            title={`Tema: ${TEMAS_ETIQUETA[tema]}`}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium text-lateral-texto hover:bg-lateral-hover hover:text-white"
          >
            <IconoTema size={17} aria-hidden /> {TEMAS_ETIQUETA[tema]}
          </button>
          <button type="button" onClick={salir} className="flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium text-lateral-texto hover:bg-lateral-hover hover:text-white">
            <LogOut size={17} aria-hidden /> Salir
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Menú lateral fijo en pantallas grandes */}
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-lateral-borde bg-lateral lg:flex">{contenidoMenu}</aside>

      {/* Barra superior en tablet / celular */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-lateral px-2 text-white lg:hidden">
        <button type="button" onClick={() => setMenuAbierto(true)} className="flex size-11 items-center justify-center rounded-xl hover:bg-lateral-hover" aria-label="Abrir menú">
          <Menu size={24} />
        </button>
        <img src="/logo-64.png" alt="" className="size-8 shrink-0 rounded-full" />
        <span className="truncate font-semibold">{nombreNegocio}</span>
        <span className="ml-auto flex size-9 items-center justify-center rounded-full bg-primario text-xs font-bold text-sobre-primario" title={usuario.nombre}>
          {iniciales(usuario.nombre)}
        </span>
      </header>

      <Dialog.Root open={menuAbierto} onOpenChange={setMenuAbierto}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 animate-fundido bg-slate-950/55 lg:hidden" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-[290px] max-w-[85vw] flex-col bg-lateral shadow-alta focus:outline-none lg:hidden">
            <Dialog.Title className="sr-only">Menú</Dialog.Title>
            <Dialog.Close className="absolute right-2 top-4 flex size-10 items-center justify-center rounded-full text-lateral-texto hover:bg-lateral-hover hover:text-white" aria-label="Cerrar menú">
              <X size={22} />
            </Dialog.Close>
            {contenidoMenu}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <main className={`min-w-0 flex-1 ${esPos ? '' : 'px-4 py-6 sm:px-6 lg:px-10 lg:py-8'}`}>
        <Outlet />
      </main>
    </div>
  );
}
