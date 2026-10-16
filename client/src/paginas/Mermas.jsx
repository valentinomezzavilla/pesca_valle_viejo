import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CircleDollarSign, Hash, Trash2, TrendingDown } from 'lucide-react';
import { MOTIVOS_MERMA_ETIQUETA } from '@pescaderia/shared';
import { get } from '../api/cliente.js';
import { useSesion } from '../contexto/Sesion.jsx';
import { Boton } from '../componentes/Boton.jsx';
import { Campo } from '../componentes/Formulario.jsx';
import { BarrasHorizontales } from '../componentes/Graficos.jsx';
import { Cargando, Encabezado, ErrorCarga, Etiqueta, Indicador, Tabla, Tarjeta } from '../componentes/Varios.jsx';
import { cantidad, fechaHora, hoyIso, inicioMesIso, pesos } from '../lib/formato.js';
import { ModalMerma } from './stock/ModalesStock.jsx';

export function Mermas() {
  const { puede } = useSesion();
  const verCostos = puede('costos.ver');
  const [filtro, setFiltro] = useState({ desde: inicioMesIso(), hasta: hoyIso() });
  const [registrando, setRegistrando] = useState(false);
  const q = useQuery({ queryKey: ['mermas', filtro], queryFn: () => get('/mermas', { ...filtro, porPagina: 200 }) });
  const resumen = q.data?.resumen;

  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado titulo="Mermas" icono={Trash2} subtitulo="Mercadería que se descartó: vencida, en mal estado, limpieza o rotura.">
        <Campo etiqueta="Desde" type="date" value={filtro.desde} max={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
        <Campo etiqueta="Hasta" type="date" value={filtro.hasta} min={filtro.desde} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
        <Boton icono={Trash2} variante="peligro" onClick={() => setRegistrando(true)}>Registrar merma</Boton>
      </Encabezado>

      {resumen && (
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Indicador icono={Hash} etiqueta="Mermas registradas" valor={resumen.cantidad} />
            {verCostos && <Indicador icono={CircleDollarSign} tono={Number(resumen.costo_total) > 0 ? 'malo' : 'bueno'} etiqueta="Plata perdida (a costo)" valor={pesos(resumen.costo_total)} />}
          </div>
          {verCostos && resumen.por_motivo.length > 0 && (
            <Tarjeta titulo="¿Por qué se pierde mercadería?" icono={TrendingDown}>
              <BarrasHorizontales datos={resumen.por_motivo.map((m) => ({ etiqueta: `${MOTIVOS_MERMA_ETIQUETA[m.motivo]} (${m.cantidad})`, valor: m.costo_total, texto: pesos(m.costo_total) }))} />
            </Tarjeta>
          )}
        </div>
      )}

      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorCarga error={q.error} reintentar={q.refetch} />
      ) : (
        <Tabla
          filas={q.data.mermas}
          vacio="No hay mermas en este período. ¡Buena señal!"
          iconoVacio={CalendarDays}
          columnas={[
            { clave: 'fecha', titulo: 'Cuándo', render: (m) => <span className="text-texto-suave">{fechaHora(m.creado_en)}</span> },
            { clave: 'producto', titulo: 'Producto', render: (m) => <span className="font-semibold">{m.producto}</span> },
            { clave: 'cantidad', titulo: 'Cantidad', derecha: true, render: (m) => cantidad(m.cantidad, m.unidad) },
            { clave: 'motivo', titulo: 'Motivo', render: (m) => <Etiqueta tono={m.motivo === 'VENCIDO' ? 'rojo' : 'amarillo'}>{MOTIVOS_MERMA_ETIQUETA[m.motivo]}</Etiqueta> },
            { clave: 'detalle', titulo: 'Detalle', render: (m) => <span className="text-texto-suave">{m.detalle}</span> },
            ...(verCostos ? [{ clave: 'costo', titulo: 'Plata perdida', derecha: true, render: (m) => <strong className="text-peligro-texto">{pesos(m.costo_total)}</strong> }] : []),
            { clave: 'usuario', titulo: 'Registró', render: (m) => <span className="text-texto-suave">{m.usuario_nombre}</span> },
          ]}
        />
      )}
      {registrando && <ModalMerma onCerrar={() => setRegistrando(false)} />}
    </div>
  );
}
