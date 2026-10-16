import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BellRing, CalendarClock, ChevronRight, CircleDollarSign, Home, PackagePlus, Receipt, ShoppingCart, Store, TrendingDown, TrendingUp, Truck, Users, Wallet } from 'lucide-react';
import { MEDIOS_PAGO_ETIQUETA, UNIDADES_ETIQUETA, dec } from '@pescaderia/shared';
import { get } from '../api/cliente.js';
import { useSesion } from '../contexto/Sesion.jsx';
import { clasesBoton } from '../componentes/Boton.jsx';
import { Barras, BarrasHorizontales } from '../componentes/Graficos.jsx';
import { Cargando, Encabezado, ErrorCarga, Indicador, Tarjeta } from '../componentes/Varios.jsx';
import { fecha, pesos, porcentaje } from '../lib/formato.js';

const fmtDiaCorto = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' });
const fmtFechaLarga = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const diaDe = (iso) => new Date(`${iso}T12:00:00Z`);
const miles = (v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(Math.round(Number(v))));

function variacion(actual, anterior) {
  if (dec(anterior).isZero()) return null;
  return dec(actual).minus(anterior).div(anterior).times(100);
}

export function Inicio() {
  const { usuario } = useSesion();
  const q = useQuery({ queryKey: ['panel'], queryFn: () => get('/reportes/panel'), refetchInterval: 60_000 });

  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCarga error={q.error} reintentar={q.refetch} />;
  const p = q.data;

  const vsSemana = variacion(p.hoy.total, p.semana_pasada.total);
  const nombreDia = fmtFechaLarga.format(diaDe(p.fecha));
  const margenHoy = dec(p.hoy.total).gt(0) ? dec(p.hoy.ganancia).div(p.hoy.total).times(100) : null;

  // Ventas por hora: desde la primera hasta la última hora con ventas
  const horas = p.por_hora.map((h) => h.hora);
  const desdeHora = horas.length ? Math.min(...horas) : 8;
  const hastaHora = horas.length ? Math.max(...horas) : 20;
  const porHora = Array.from({ length: hastaHora - desdeHora + 1 }, (_, i) => {
    const hora = desdeHora + i;
    return { etiqueta: String(hora), valor: p.por_hora.find((h) => h.hora === hora)?.total ?? 0, titulo: `${hora}:00 hs` };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo={`Hola, ${usuario.nombre.split(' ')[0]}`} icono={Home} subtitulo={<span className="capitalize">{nombreDia}</span>}>
        <Link to="/vender" className={clasesBoton({ tamanio: 'normal' })}><ShoppingCart size={18} aria-hidden /> Vender</Link>
        <Link to="/mercaderia/nuevo" className={clasesBoton({ variante: 'secundario' })}><PackagePlus size={18} aria-hidden /> Ingresar mercadería</Link>
      </Encabezado>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          icono={CircleDollarSign}
          etiqueta="Vendido hoy"
          valor={pesos(p.hoy.total)}
          detalle={
            vsSemana ? (
              <span className={`inline-flex items-center gap-1 font-semibold ${vsSemana.gte(0) ? 'text-exito-texto' : 'text-peligro-texto'}`}>
                {vsSemana.gte(0) ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
                {porcentaje(vsSemana.abs().toFixed(0), 0)} vs. el mismo día de la semana pasada
              </span>
            ) : (
              'Sin ventas el mismo día de la semana pasada'
            )
          }
        />
        <Indicador icono={Receipt} etiqueta="Ventas" valor={p.hoy.ventas} detalle={p.hoy.ventas ? `Ticket promedio ${pesos(dec(p.hoy.total).div(p.hoy.ventas).toFixed(2))}` : 'Todavía no se vendió nada'} />
        <Indicador icono={TrendingUp} tono="bueno" etiqueta="Ganancia de hoy" valor={pesos(p.hoy.ganancia)} detalle={margenHoy ? `Margen ${porcentaje(margenHoy.toFixed(1))}` : undefined} />
        <Indicador
          icono={Wallet}
          tono={p.cajas.abiertas ? 'normal' : 'alerta'}
          etiqueta="Efectivo en caja"
          valor={pesos(p.cajas.efectivo)}
          detalle={p.cajas.abiertas ? `${p.cajas.abiertas} ${p.cajas.abiertas === 1 ? 'caja abierta' : 'cajas abiertas'}` : 'Ninguna caja abierta'}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Tarjeta titulo="Últimos 7 días" icono={Store}>
          <Barras
            datos={p.ultimos_7_dias.map((d) => ({ etiqueta: fmtDiaCorto.format(diaDe(d.fecha)).replace('.', ''), valor: d.total, destacado: d.fecha === p.fecha, titulo: `${d.fecha}: ${pesos(d.total)} (${d.ventas} ventas)` }))}
            formato={miles}
          />
        </Tarjeta>
        <Tarjeta titulo="Cómo pagaron hoy">
          {p.por_medio.length ? (
            <BarrasHorizontales datos={p.por_medio.map((m) => ({ etiqueta: MEDIOS_PAGO_ETIQUETA[m.medio], valor: m.monto, texto: pesos(m.monto) }))} />
          ) : (
            <p className="py-6 text-center text-texto-suave">Todavía no hay ventas hoy.</p>
          )}
        </Tarjeta>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Lo más vendido hoy">
          {p.top_productos.length ? (
            <BarrasHorizontales
              datos={p.top_productos.map((t) => ({
                etiqueta: t.producto,
                valor: t.total,
                texto: `${pesos(t.total)} · ${Number(t.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${UNIDADES_ETIQUETA[t.unidad]}`,
              }))}
            />
          ) : (
            <p className="py-6 text-center text-texto-suave">Todavía no hay ventas hoy.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Ventas por hora (hoy)" icono={CalendarClock}>
          <Barras datos={porHora} alto={110} formato={miles} />
        </Tarjeta>
      </div>

      <h2 className="mb-3 text-lg font-bold text-texto">Para tener en cuenta</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Atencion
          a="/stock"
          icono={BellRing}
          tono={p.alertas.total ? 'alerta' : 'bueno'}
          titulo="Alertas de stock"
          valor={p.alertas.total ? `${p.alertas.total} ${p.alertas.total === 1 ? 'aviso' : 'avisos'}` : 'Todo en orden'}
          detalle={p.alertas.total ? [p.alertas.vencimientos && `${p.alertas.vencimientos} por vencer`, p.alertas.bajo_minimo && `${p.alertas.bajo_minimo} a reponer`, p.alertas.negativos && `${p.alertas.negativos} sin stock cargado`].filter(Boolean).join(' · ') : 'Nada vence ni falta'}
        />
        <Atencion
          a="/clientes"
          icono={Users}
          tono={dec(p.deuda_clientes.total).gt(0) ? 'alerta' : 'bueno'}
          titulo="Nos deben los clientes"
          valor={pesos(p.deuda_clientes.total)}
          detalle={p.deuda_clientes.clientes ? `${p.deuda_clientes.clientes} ${p.deuda_clientes.clientes === 1 ? 'cliente' : 'clientes'}` : 'Nadie debe'}
        />
        <Atencion
          a="/proveedores"
          icono={Truck}
          tono="normal"
          titulo="Le debemos a proveedores"
          valor={pesos(p.deuda_proveedores.total)}
          detalle={p.deuda_proveedores.proveedores ? `${p.deuda_proveedores.proveedores} ${p.deuda_proveedores.proveedores === 1 ? 'proveedor' : 'proveedores'}` : 'Estamos al día'}
        />
        <Atencion
          a="/mermas"
          icono={TrendingDown}
          tono={dec(p.mermas_mes).gt(0) ? 'malo' : 'bueno'}
          titulo="Mermas del mes"
          valor={pesos(p.mermas_mes)}
          detalle="Plata perdida en mercadería descartada"
        />
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <Tarjeta titulo="Pagos a proveedores vencidos o que vencen esta semana" icono={Truck}>
          {p.proveedores_a_pagar.length ? (
            <div className="space-y-2">
              {p.proveedores_a_pagar.map((x) => (
                <Link key={x.id} to={`/proveedores/${x.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-superficie-2 px-4 py-2 hover:ring-2 hover:ring-primario focus-visible:ring-4 focus-visible:ring-anillo">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-texto">{x.nombre}</span>
                    <span className="block text-sm text-texto-suave">
                      {dec(x.vencido).gt(0) ? (
                        <span className="font-semibold text-peligro-texto">Vencido {pesos(x.vencido)}</span>
                      ) : (
                        `Vence el ${fecha(x.proximo_vencimiento.fecha)} — ${pesos(x.proximo_vencimiento.importe)}`
                      )}
                    </span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-texto-tenue" aria-hidden />
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-texto-suave">Nada para esta semana.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Cheques que se cobran esta semana" icono={Receipt}>
          {p.cheques_semana.length ? (
            <div className="space-y-2">
              {p.cheques_semana.map((c) => (
                <Link key={c.id} to={`/proveedores/${c.proveedor_id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-superficie-2 px-4 py-2 hover:ring-2 hover:ring-primario focus-visible:ring-4 focus-visible:ring-anillo">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-texto">{c.proveedor}</span>
                    <span className="block text-sm text-texto-suave">
                      Se cobra el {fecha(c.fecha_cobro)}
                      {c.numero ? ` · Cheque ${c.numero}` : ''}
                      {c.banco ? ` · ${c.banco}` : ''}
                    </span>
                  </span>
                  <strong className="shrink-0 tabular-nums">{pesos(c.importe)}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-texto-suave">No hay cheques para cubrir esta semana.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Clientes con deuda vencida" icono={Users} className="lg:col-span-2">
          {p.clientes_vencidos.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {p.clientes_vencidos.map((x) => (
                <Link key={x.id} to={`/clientes/${x.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-superficie-2 px-4 py-2 hover:ring-2 hover:ring-primario focus-visible:ring-4 focus-visible:ring-anillo">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-texto">{x.nombre}</span>
                    <span className="block text-sm font-semibold text-peligro-texto">Vencido {pesos(x.vencido)}</span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-texto-tenue" aria-hidden />
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-texto-suave">Ningún cliente debe vencido.</p>
          )}
        </Tarjeta>
      </div>

      <div className="mt-6 rounded-2xl bg-superficie p-5 shadow-suave ring-1 ring-borde">
        <div className="text-sm font-semibold uppercase tracking-wide text-texto-suave">Lo que va del mes</div>
        <div className="mt-2 flex flex-wrap gap-x-10 gap-y-3">
          <Cifra etiqueta="Ventas" valor={p.mes.ventas} />
          <Cifra etiqueta="Vendido" valor={pesos(p.mes.total)} />
          <Cifra etiqueta="Ganancia bruta" valor={pesos(p.mes.ganancia)} tono="text-exito-texto" />
        </div>
      </div>
    </div>
  );
}

const TONO_ATENCION = {
  normal: 'bg-primario-suave text-primario-texto',
  bueno: 'bg-exito-suave text-exito-texto',
  alerta: 'bg-alerta-suave text-alerta-texto',
  malo: 'bg-peligro-suave text-peligro-texto',
};

function Atencion({ a, icono: Icono, tono, titulo, valor, detalle }) {
  return (
    <Link to={a} className="group flex min-w-0 items-center gap-3 rounded-2xl bg-superficie p-4 shadow-suave ring-1 ring-borde transition-all hover:-translate-y-px hover:ring-2 hover:ring-primario focus-visible:ring-4 focus-visible:ring-anillo">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${TONO_ATENCION[tono]}`}>
        <Icono size={22} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-texto-suave">{titulo}</span>
        <span className="block truncate text-lg font-bold tabular-nums text-texto">{valor}</span>
        <span className="block truncate text-sm text-texto-suave">{detalle}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-texto-tenue transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function Cifra({ etiqueta, valor, tono = 'text-texto' }) {
  return (
    <div>
      <div className="text-sm text-texto-suave">{etiqueta}</div>
      <div className={`text-2xl font-bold tabular-nums ${tono}`}>{valor}</div>
    </div>
  );
}
