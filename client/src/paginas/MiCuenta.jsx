import { useState } from 'react';
import { KeyRound, LockKeyhole, Monitor, Moon, Palette, Sun, UserRound } from 'lucide-react';
import { ROLES_ETIQUETA } from '@pescaderia/shared';
import { put } from '../api/cliente.js';
import { useSesion } from '../contexto/Sesion.jsx';
import { useDialogos } from '../contexto/Dialogos.jsx';
import { TEMAS_ETIQUETA, useTema } from '../contexto/Tema.jsx';
import { Boton } from '../componentes/Boton.jsx';
import { Campo, SelectorBotones } from '../componentes/Formulario.jsx';
import { Encabezado, Tarjeta } from '../componentes/Varios.jsx';

export function MiCuenta() {
  const { usuario } = useSesion();
  const { avisar } = useDialogos();
  const { tema, setTema } = useTema();
  const [pass, setPass] = useState({ actual: '', nueva: '', repetir: '' });
  const [pin, setPin] = useState({ password: '', pin: '' });
  const [errores, setErrores] = useState({});

  const cambiarPassword = async (e) => {
    e.preventDefault();
    if (pass.nueva !== pass.repetir) return setErrores({ repetir: 'Las contraseñas no coinciden' });
    try {
      await put('/auth/mi-password', { actual: pass.actual, nueva: pass.nueva });
      avisar('Contraseña cambiada.');
      setPass({ actual: '', nueva: '', repetir: '' });
      setErrores({});
    } catch (err) {
      setErrores(err.campos ?? {});
      avisar(err.message, 'error');
    }
  };

  const cambiarPin = async (e) => {
    e.preventDefault();
    try {
      await put('/auth/mi-pin', pin);
      avisar('PIN cambiado.');
      setPin({ password: '', pin: '' });
    } catch (err) {
      avisar(err.message, 'error');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Encabezado titulo="Mi cuenta" icono={UserRound} subtitulo={`${usuario.nombre} · ${ROLES_ETIQUETA[usuario.rol]}`} />

      <Tarjeta titulo="Apariencia" icono={Palette}>
        <SelectorBotones
          etiqueta="Tema"
          columnas={3}
          valor={tema}
          onCambio={setTema}
          opciones={[
            { valor: 'claro', etiqueta: TEMAS_ETIQUETA.claro, icono: Sun },
            { valor: 'oscuro', etiqueta: TEMAS_ETIQUETA.oscuro, icono: Moon },
            { valor: 'sistema', etiqueta: TEMAS_ETIQUETA.sistema, icono: Monitor },
          ]}
        />
        <p className="mt-2 text-sm text-texto-suave">Se guarda en este dispositivo. “Automático” sigue la configuración de la tablet o la computadora.</p>
      </Tarjeta>

      <div className="grid gap-6 md:grid-cols-2">
        <Tarjeta titulo="Cambiar contraseña" icono={LockKeyhole}>
          <form onSubmit={cambiarPassword} className="space-y-4">
            <Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password" value={pass.actual} onChange={(e) => setPass({ ...pass, actual: e.target.value })} />
            <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" value={pass.nueva} onChange={(e) => setPass({ ...pass, nueva: e.target.value })} error={errores.nueva} ayuda="Mínimo 8 caracteres" />
            <Campo etiqueta="Repetir contraseña nueva" type="password" autoComplete="new-password" value={pass.repetir} onChange={(e) => setPass({ ...pass, repetir: e.target.value })} error={errores.repetir} />
            <Boton type="submit" className="w-full" disabled={!pass.actual || !pass.nueva}>Cambiar contraseña</Boton>
          </form>
        </Tarjeta>
        {usuario.rol === 'DUENO' && (
          <Tarjeta titulo="PIN de autorización" icono={KeyRound}>
            <form onSubmit={cambiarPin} className="space-y-4">
              <p className="text-sm text-texto-suave">Lo usás para autorizar anulaciones, descuentos grandes y retiros cuando vende un cajero.</p>
              <Campo etiqueta="Tu contraseña" type="password" autoComplete="current-password" value={pin.password} onChange={(e) => setPin({ ...pin, password: e.target.value })} />
              <Campo etiqueta="PIN nuevo (4 a 8 números)" type="password" inputMode="numeric" value={pin.pin} onChange={(e) => setPin({ ...pin, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
              <Boton type="submit" className="w-full" disabled={!pin.password || pin.pin.length < 4}>Cambiar PIN</Boton>
            </form>
          </Tarjeta>
        )}
      </div>
    </div>
  );
}
