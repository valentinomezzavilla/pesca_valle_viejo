import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { get } from '../../api/cliente.js';
import { clasesBoton } from '../../componentes/Boton.jsx';
import { Campo, Selector } from '../../componentes/Formulario.jsx';
import { Cargando, Encabezado, ErrorCarga, Tabla } from '../../componentes/Varios.jsx';
import { fecha, formatearValor, hoyIso, inicioMesIso, sumarDiasIso } from '../../lib/formato.js';

const NUMERICOS = new Set(['pesos', 'cantidad', 'entero', 'porcentaje']);

function rangos() {
  const hoy = hoyIso();
  const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const lunes = sumarDiasIso(hoy, -((diaSemana + 6) % 7));
  const [a, m] = hoy.split('-').map(Number);
  const inicioMesPasado = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
  const finMesPasado = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
  return [
    { id: 'hoy', texto: 'Hoy', desde: hoy, hasta: hoy },
    { id: 'ayer', texto: 'Ayer', desde: sumarDiasIso(hoy, -1), hasta: sumarDiasIso(hoy, -1) },
    { id: 'semana', texto: 'Esta semana', desde: lunes, hasta: hoy },
    { id: '30dias', texto: 'Últimos 30 días', desde: sumarDiasIso(hoy, -29), hasta: hoy },
    { id: 'mes', texto: 'Este mes', desde: inicioMesIso(), hasta: hoy },
    { id: 'mespasado', texto: 'Mes pasado', desde: inicioMesPasado, hasta: finMesPasado },
  ];
}

export function Reportes() {
  const [reporteId, setReporteId] = useState('ventas-por-dia');
  const [periodo, setPeriodo] = useState({ desde: inicioMesIso(), hasta: hoyIso(), preset: 'mes' });
  const catalogo = useQuery({ queryKey: ['reportes-catalogo'], queryFn: () => get('/reportes'), staleTime: 10 * 60_000 });
  const reporte = useQuery({
    queryKey: ['reporte', reporteId, periodo.desde, periodo.hasta],
    queryFn: () => get(`/reportes/${reporteId}`, { desde: periodo.desde, hasta: periodo.hasta }),
    enabled: !!catalogo.data,
  });

  const grupos = [];
  for (const r of catalogo.data ?? []) {
    const g = grupos.find((x) => x.nombre === r.grupo);
    if (g) g.reportes.push(r);
    else grupos.push({ nombre: r.grupo, reportes: [r] });
  }
  const actual = catalogo.data?.find((r) => r.id === reporteId);
  const r = reporte.data;
  const queryDescarga = (formato) => new URLSearchParams({ formato, ...(actual?.usaFechas ? { desde: periodo.desde, hasta: periodo.hasta } : {}) }).toString();

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Reportes" icono={BarChart3} subtitulo="Elegí un reporte, el período, y descargalo en Excel o PDF." />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Lista de reportes: a la izquierda en pantallas grandes, un selector en celular */}
        <div className="lg:hidden">
          <Selector
            etiqueta="Reporte"
            value={reporteId}
            onChange={(e) => setReporteId(e.target.value)}
            opciones={(catalogo.data ?? []).map((x) => ({ valor: x.id, etiqueta: `${x.grupo} · ${x.titulo}` }))}
          />
        </div>
        <nav aria-label="Reportes" className="hidden space-y-4 lg:block">
          {grupos.map((g) => (
            <div key={g.nombre}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-texto-suave">{g.nombre}</div>
              <ul className="space-y-0.5">
                {g.reportes.map((x) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => setReporteId(x.id)}
                      aria-current={x.id === reporteId ? 'page' : undefined}
                      className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[15px] font-medium transition-colors focus-visible:ring-4 focus-visible:ring-anillo ${x.id === reporteId ? 'bg-primario-suave text-primario-texto' : 'text-texto-suave hover:bg-superficie-2 hover:text-texto'}`}
                    >
                      {x.titulo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <section className="min-w-0">
          {actual && (
            <div className="mb-4">
              <h2 className="text-xl font-bold text-texto">{actual.titulo}</h2>
              <p className="text-texto-suave">{actual.descripcion}</p>
            </div>
          )}

          {actual?.usaFechas && (
            <div className="mb-4 space-y-3 rounded-2xl bg-superficie p-4 shadow-suave ring-1 ring-borde">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Períodos rápidos">
                {rangos().map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    aria-pressed={periodo.preset === x.id}
                    onClick={() => setPeriodo({ desde: x.desde, hasta: x.hasta, preset: x.id })}
                    className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-anillo ${periodo.preset === x.id ? 'bg-primario text-sobre-primario' : 'bg-superficie-2 text-texto-suave hover:text-texto'}`}
                  >
                    {x.texto}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Desde" type="date" value={periodo.desde} max={periodo.hasta} onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value, preset: null })} />
                <Campo etiqueta="Hasta" type="date" value={periodo.hasta} min={periodo.desde} max={hoyIso()} onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value, preset: null })} />
              </div>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-texto-suave">
              <CalendarDays size={16} aria-hidden />
              {r?.periodo ? (r.periodo.desde === r.periodo.hasta ? fecha(r.periodo.desde) : `${fecha(r.periodo.desde)} al ${fecha(r.periodo.hasta)}`) : 'Situación a hoy'}
              {r && ` · ${r.filas.length} ${r.filas.length === 1 ? 'fila' : 'filas'}`}
            </span>
            <div className="flex gap-2">
              <a href={`/api/reportes/${reporteId}?${queryDescarga('xlsx')}`} download className={clasesBoton({ variante: 'secundario' })}>
                <FileSpreadsheet size={18} aria-hidden /> Excel
              </a>
              <a href={`/api/reportes/${reporteId}?${queryDescarga('pdf')}`} download className={clasesBoton({ variante: 'secundario' })}>
                <FileText size={18} aria-hidden /> PDF
              </a>
            </div>
          </div>

          {reporte.isLoading || catalogo.isLoading ? (
            <Cargando />
          ) : reporte.error ? (
            <ErrorCarga error={reporte.error} reintentar={reporte.refetch} />
          ) : (
            <Tabla
              filas={r.filas}
              iconoVacio={Download}
              vacio="No hay datos para este período."
              columnas={r.columnas.map((c) => ({
                clave: c.clave,
                titulo: c.titulo,
                derecha: NUMERICOS.has(c.tipo),
                render: (f) => formatearValor(f[c.clave], c.tipo),
              }))}
              pie={
                r.filas.length && r.totales && Object.keys(r.totales).length
                  ? Object.fromEntries(r.columnas.filter((c) => r.totales[c.clave] !== undefined).map((c) => [c.clave, formatearValor(r.totales[c.clave], c.tipo)]))
                  : undefined
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
