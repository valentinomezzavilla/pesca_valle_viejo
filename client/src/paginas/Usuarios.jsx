import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, ShieldCheck, UserRound, Users } from 'lucide-react';
import { ROLES_ETIQUETA } from '@pescaderia/shared';
import { get, post, put } from '../api/cliente.js';
import { useSesion } from '../contexto/Sesion.jsx';
import { useDialogos } from '../contexto/Dialogos.jsx';
import { Boton } from '../componentes/Boton.jsx';
import { Modal } from '../componentes/Modal.jsx';
import { Campo, Interruptor, SelectorBotones } from '../componentes/Formulario.jsx';
import { Cargando, Encabezado, Etiqueta, Tabla } from '../componentes/Varios.jsx';
import { fechaHora } from '../lib/formato.js';

export function Usuarios() {
  const [modal, setModal] = useState(null);
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => get('/usuarios') });
  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo="Usuarios" icono={Users} subtitulo="Quién puede entrar al sistema y qué puede hacer.">
        <Boton icono={Plus} onClick={() => setModal({})}>Nuevo usuario</Boton>
      </Encabezado>
      {usuarios.isLoading ? (
        <Cargando />
      ) : (
        <Tabla
          filas={usuarios.data}
          alTocarFila={(u) => setModal({ usuario: u })}
          columnas={[
            {
              clave: 'nombre',
              titulo: 'Nombre',
              render: (u) => (
                <span className="flex items-center gap-3">
                  <span className={`flex size-9 items-center justify-center rounded-full text-sm font-bold ${u.activo ? 'bg-primario-suave text-primario-texto' : 'bg-superficie-2 text-texto-tenue'}`}>
                    {u.nombre.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <span className="block font-semibold">{u.nombre}</span>
                    <span className="block text-sm text-texto-suave">@{u.usuario}</span>
                  </span>
                </span>
              ),
            },
            { clave: 'rol', titulo: 'Rol', render: (u) => <Etiqueta tono={u.rol === 'DUENO' ? 'azul' : 'gris'} icono={u.rol === 'DUENO' ? ShieldCheck : UserRound}>{ROLES_ETIQUETA[u.rol]}</Etiqueta> },
            { clave: 'activo', titulo: 'Estado', render: (u) => (u.activo ? <Etiqueta tono="verde">Activo</Etiqueta> : <Etiqueta tono="rojo">Desactivado</Etiqueta>) },
            { clave: 'acceso', titulo: 'Último ingreso', render: (u) => <span className="text-texto-suave">{fechaHora(u.ultimo_acceso) || 'Nunca'}</span> },
          ]}
        />
      )}
      {modal && <ModalUsuario usuario={modal.usuario} onCerrar={() => setModal(null)} />}
    </div>
  );
}

function ModalUsuario({ usuario, onCerrar }) {
  const queryClient = useQueryClient();
  const { usuario: yo } = useSesion();
  const { avisar, confirmar } = useDialogos();
  const esNuevo = !usuario;
  const [d, setD] = useState({ nombre: usuario?.nombre ?? '', usuario: '', password: '', rol: usuario?.rol ?? 'CAJERO', pin: '', activo: usuario?.activo ?? true });
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const set = (c) => setD((x) => ({ ...x, ...c }));
  const esYo = usuario?.id === yo.id;

  const guardar = async (e) => {
    e.preventDefault();
    if (!esNuevo && usuario.activo && !d.activo && !(await confirmar({ titulo: 'Desactivar usuario', mensaje: `${usuario.nombre} no va a poder entrar más al sistema.`, textoConfirmar: 'Desactivar', peligro: true }))) return;
    setEnviando(true);
    setErrores({});
    try {
      if (esNuevo) await post('/usuarios', d);
      else await put(`/usuarios/${usuario.id}`, { nombre: d.nombre, rol: d.rol, activo: d.activo, pin: d.pin || undefined });
      avisar('Usuario guardado.');
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      onCerrar();
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  const blanquear = async () => {
    try {
      await post(`/usuarios/${usuario.id}/reset-password`, { password: nuevaPassword });
      avisar('Contraseña cambiada. Pasásela a la persona para que entre.');
      setNuevaPassword('');
    } catch (err) {
      avisar(err.message, 'error');
    }
  };

  return (
    <Modal titulo={esNuevo ? 'Nuevo usuario' : usuario.nombre} descripcion={esNuevo ? undefined : `@${usuario.usuario}`} icono={UserRound} onCerrar={onCerrar} ancho="sm:max-w-lg">
      <form onSubmit={guardar} className="space-y-4">
        <Campo etiqueta="Nombre" autoFocus value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} error={errores.nombre} />
        {esNuevo && (
          <>
            <Campo etiqueta="Usuario (para entrar)" autoCapitalize="none" value={d.usuario} onChange={(e) => set({ usuario: e.target.value })} error={errores.usuario} />
            <Campo etiqueta="Contraseña" type="password" autoComplete="new-password" value={d.password} onChange={(e) => set({ password: e.target.value })} error={errores.password} ayuda="Mínimo 8 caracteres" />
          </>
        )}
        {!esYo && (
          <div>
            <span className="mb-1.5 block text-sm font-semibold">Rol</span>
            <SelectorBotones
              etiqueta="Rol"
              valor={d.rol}
              onCambio={(r) => set({ rol: r })}
              opciones={[{ valor: 'CAJERO', etiqueta: 'Cajero', icono: UserRound }, { valor: 'DUENO', etiqueta: 'Dueño', icono: ShieldCheck }]}
            />
            <p className="mt-1.5 text-sm text-texto-suave">{d.rol === 'DUENO' ? 'Acceso total: precios, costos, reportes y configuración.' : 'Vende, ingresa mercadería y cierra caja.'}</p>
          </div>
        )}
        {d.rol === 'DUENO' && (
          <Campo
            etiqueta={esNuevo ? 'PIN de autorización' : 'Nuevo PIN (vacío para no cambiar)'}
            icono={KeyRound}
            inputMode="numeric"
            type="password"
            value={d.pin}
            onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '').slice(0, 8) })}
            error={errores.pin}
            ayuda="4 a 8 números. Autoriza anulaciones y descuentos en la caja."
          />
        )}
        {!esNuevo && !esYo && <Interruptor etiqueta="Activo (puede entrar)" checked={d.activo} onChange={(v) => set({ activo: v })} />}
        <Boton type="submit" tamanio="grande" className="w-full" cargando={enviando}>Guardar</Boton>
      </form>
      {!esNuevo && !esYo && (
        <div className="mt-6 border-t border-borde pt-5">
          <h3 className="mb-2 flex items-center gap-2 font-bold"><KeyRound size={17} className="text-texto-suave" aria-hidden /> ¿Se olvidó la contraseña?</h3>
          <div className="flex items-end gap-2">
            <Campo className="flex-1" type="password" aria-label="Contraseña nueva" placeholder="Contraseña nueva" autoComplete="new-password" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} />
            <Boton variante="secundario" className="min-h-12" disabled={nuevaPassword.length < 8} onClick={blanquear}>Cambiar</Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
