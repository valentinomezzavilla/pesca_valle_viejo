import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Landmark, Phone, Truck } from 'lucide-react';
import { DIAS_SEMANA, ORDEN_DIAS_SEMANA, cuitValido } from '@pescaderia/shared';
import { post, put } from '../../api/cliente.js';
import { useDialogos } from '../../contexto/Dialogos.jsx';
import { Boton } from '../../componentes/Boton.jsx';
import { Modal } from '../../componentes/Modal.jsx';
import { AreaTexto, Campo, Interruptor } from '../../componentes/Formulario.jsx';

export function ModalProveedor({ proveedor, onCerrar }) {
  const queryClient = useQueryClient();
  const { avisar } = useDialogos();
  const [d, setD] = useState({
    nombre: proveedor?.nombre ?? '',
    contacto: proveedor?.contacto ?? '',
    telefono: proveedor?.telefono ?? '',
    email: proveedor?.email ?? '',
    cuit: proveedor?.cuit ?? '',
    cbu_alias: proveedor?.cbu_alias ?? '',
    plazo_pago_dias: String(proveedor?.plazo_pago_dias ?? 0),
    dias_entrega: proveedor?.dias_entrega ?? [],
    direccion: proveedor?.direccion ?? '',
    notas: proveedor?.notas ?? '',
    activo: proveedor?.activo ?? true,
  });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const set = (c) => setD((x) => ({ ...x, ...c }));
  const alternarDia = (dia) => set({ dias_entrega: d.dias_entrega.includes(dia) ? d.dias_entrega.filter((x) => x !== dia) : [...d.dias_entrega, dia] });
  const revisarCuit = () => setErrores((e) => ({ ...e, cuit: d.cuit && !cuitValido(d.cuit) ? 'El CUIT no es válido. Revisá los números.' : undefined }));

  const guardar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    try {
      const datos = { ...d, plazo_pago_dias: d.plazo_pago_dias === '' ? 0 : d.plazo_pago_dias };
      if (proveedor) await put(`/proveedores/${proveedor.id}`, datos);
      else await post('/proveedores', datos);
      avisar('Proveedor guardado.');
      ['proveedores', 'ficha-proveedor'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'} icono={Truck} onCerrar={onCerrar} ancho="sm:max-w-2xl">
      <form onSubmit={guardar} className="grid gap-4 md:grid-cols-2">
        <Campo className="md:col-span-2" etiqueta="Nombre" autoFocus value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} error={errores.nombre} />
        <Campo etiqueta="Persona de contacto" value={d.contacto} onChange={(e) => set({ contacto: e.target.value })} />
        <Campo etiqueta="Teléfono" icono={Phone} inputMode="tel" placeholder="Ej: 223 555-0101" value={d.telefono} onChange={(e) => set({ telefono: e.target.value })} ayuda="Con la característica, para que funcione WhatsApp" />
        <Campo etiqueta="CUIT" inputMode="numeric" placeholder="20-12345678-6" value={d.cuit} onChange={(e) => set({ cuit: e.target.value })} onBlur={revisarCuit} error={errores.cuit} />
        <Campo etiqueta="Email" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} error={errores.email} />
        <Campo etiqueta="CBU o alias para transferirle" icono={Landmark} value={d.cbu_alias} onChange={(e) => set({ cbu_alias: e.target.value })} error={errores.cbu_alias} />
        <Campo etiqueta="¿En cuántos días hay que pagarle?" inputMode="numeric" value={d.plazo_pago_dias} onChange={(e) => set({ plazo_pago_dias: e.target.value.replace(/\D/g, '') })} error={errores.plazo_pago_dias} ayuda="0 = se le paga en el día" />
        <fieldset className="md:col-span-2">
          <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-texto"><CalendarDays size={16} aria-hidden /> ¿Qué días entrega?</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {ORDEN_DIAS_SEMANA.map((dia) => {
              const activo = d.dias_entrega.includes(dia);
              return (
                <button
                  key={dia}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => alternarDia(dia)}
                  className={`min-h-12 rounded-xl border-2 text-[15px] font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-anillo ${activo ? 'border-primario bg-primario-suave text-primario-texto' : 'border-borde bg-superficie text-texto-suave hover:border-borde-fuerte'}`}
                >
                  {DIAS_SEMANA[dia]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Campo className="md:col-span-2" etiqueta="Dirección" value={d.direccion} onChange={(e) => set({ direccion: e.target.value })} />
        <AreaTexto className="md:col-span-2" etiqueta="Notas" value={d.notas} onChange={(e) => set({ notas: e.target.value })} placeholder="Condiciones, horarios, lo que haga falta recordar" />
        {proveedor && <Interruptor etiqueta="Activo" checked={d.activo} onChange={(v) => set({ activo: v })} />}
        <div className="flex gap-3 border-t border-borde pt-4 md:col-span-2 md:justify-end">
          <Boton variante="secundario" tamanio="grande" onClick={onCerrar} className="flex-1 md:flex-none">Cancelar</Boton>
          <Boton type="submit" tamanio="grande" cargando={enviando} className="flex-1 md:flex-none">Guardar</Boton>
        </div>
      </form>
    </Modal>
  );
}
