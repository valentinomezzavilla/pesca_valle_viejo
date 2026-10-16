import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, Play } from 'lucide-react';
import { get, post } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { AreaTexto, Selector } from '../../componentes/Formulario.jsx';
import { Cargando, Encabezado, ErrorCarga, Etiqueta, Tabla, Tarjeta } from '../../componentes/Varios.jsx';
import { fechaHora } from '../../lib/formato.js';

export const ESTADO_INVENTARIO = {
  ABIERTO: { texto: 'En curso', tono: 'amarillo' },
  CERRADO: { texto: 'Cerrado', tono: 'verde' },
  CANCELADO: { texto: 'Cancelado', tono: 'gris' },
};

export function Inventario() {
  const navigate = useNavigate();
  const [iniciando, setIniciando] = useState(false);
  const q = useQuery({ queryKey: ['inventarios'], queryFn: () => get('/inventarios') });
  const abierto = q.data?.find((i) => i.estado === 'ABIERTO');

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Inventario" icono={ClipboardList} subtitulo="Contá lo que hay en el local y el sistema corrige las diferencias.">
        {!abierto && <Boton icono={Play} onClick={() => setIniciando(true)}>Empezar inventario</Boton>}
      </Encabezado>

      {abierto && (
        <Tarjeta className="mb-6 bg-alerta-suave ring-alerta/30">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-bold text-alerta-texto">Hay un inventario en curso</div>
              <div className="text-alerta-texto/90">
                {abierto.categoria ?? 'Todo el negocio'} · empezó {fechaHora(abierto.iniciado_en)} · {abierto.contados} de {abierto.total_items} contados
              </div>
            </div>
            <Boton iconoDerecha={ArrowRight} onClick={() => navigate(`/inventario/${abierto.id}`)}>Seguir contando</Boton>
          </div>
        </Tarjeta>
      )}

      {q.isLoading ? (
        <Cargando />
      ) : q.error ? (
        <ErrorCarga error={q.error} reintentar={q.refetch} />
      ) : (
        <Tabla
          filas={q.data}
          alTocarFila={(i) => navigate(`/inventario/${i.id}`)}
          vacio="Todavía no hiciste ningún inventario. Conviene hacerlo cada tanto para detectar diferencias."
          iconoVacio={ClipboardList}
          columnas={[
            { clave: 'fecha', titulo: 'Empezó', render: (i) => fechaHora(i.iniciado_en) },
            { clave: 'alcance', titulo: 'Qué se contó', render: (i) => i.categoria ?? 'Todo el negocio' },
            { clave: 'quien', titulo: 'Lo inició', render: (i) => <span className="text-texto-suave">{i.iniciado_por}</span> },
            { clave: 'contados', titulo: 'Contados', derecha: true, render: (i) => `${i.contados} de ${i.total_items}` },
            { clave: 'dif', titulo: 'Con diferencia', derecha: true, render: (i) => (i.estado === 'CERRADO' ? i.con_diferencia : <span className="text-texto-tenue">—</span>) },
            { clave: 'estado', titulo: 'Estado', render: (i) => <Etiqueta tono={ESTADO_INVENTARIO[i.estado].tono}>{ESTADO_INVENTARIO[i.estado].texto}</Etiqueta> },
          ]}
        />
      )}
      {iniciando && <ModalIniciar onCerrar={() => setIniciando(false)} onListo={(id) => navigate(`/inventario/${id}`)} />}
    </div>
  );
}

function ModalIniciar({ onCerrar, onListo }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const [categoria, setCategoria] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => get('/categorias') });
  const iniciar = useMutation({
    mutationFn: () => post('/inventarios', { categoria_id: categoria || undefined, observaciones }),
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      onListo(inv.id);
    },
    onError: (e) => avisar(e.message, 'error'),
  });

  return (
    <Modal titulo="Empezar inventario" descripcion="Se arma la lista de productos para contar. Mientras contás se puede seguir vendiendo." icono={ClipboardList} onCerrar={onCerrar} ancho="sm:max-w-md">
      <div className="space-y-4">
        <Selector
          etiqueta="¿Qué vas a contar?"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          vacio="Todo el negocio"
          opciones={(categorias.data ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre }))}
          ayuda="Podés contar una categoría por vez para ir más tranquilo."
        />
        <AreaTexto etiqueta="Nota (opcional)" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        <div className="flex gap-3 border-t border-borde pt-4">
          <Boton variante="secundario" tamanio="grande" className="flex-1" onClick={onCerrar}>Cancelar</Boton>
          <Boton tamanio="grande" className="flex-1" cargando={iniciar.isPending} onClick={() => iniciar.mutate()}>Empezar</Boton>
        </div>
      </div>
    </Modal>
  );
}
