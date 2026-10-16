import { useState } from 'react';
import { CircleAlert, Fish, KeyRound, UserRound } from 'lucide-react';
import { useSesion } from '../contexto/Sesion.jsx';
import { Boton } from '../componentes/Boton.jsx';
import { Campo } from '../componentes/Formulario.jsx';

export function Login() {
  const { ingresar } = useSesion();
  const [datos, setDatos] = useState({ usuario: '', password: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await ingresar(datos);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-lateral px-4 py-10">
      {/* Fondo: ondas suaves */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full text-white/[0.04]" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
        <path fill="currentColor" d="M0,224L60,208C120,192,240,160,360,165.3C480,171,600,213,720,218.7C840,224,960,192,1080,170.7C1200,149,1320,139,1380,133.3L1440,128L1440,320L0,320Z" />
        <path fill="currentColor" d="M0,288L80,272C160,256,320,224,480,224C640,224,800,256,960,261.3C1120,267,1280,245,1360,234.7L1440,224L1440,320L0,320Z" />
      </svg>
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-primario/25 blur-3xl" aria-hidden />

      <div className="relative w-full max-w-sm animate-entrar">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Fish size={34} aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">¡Hola!</h1>
          <p className="mt-1 text-lateral-texto">Ingresá con tu usuario para empezar</p>
        </div>

        <form onSubmit={enviar} className="space-y-4 rounded-3xl bg-superficie p-6 shadow-alta sm:p-7">
          <Campo
            etiqueta="Usuario"
            icono={UserRound}
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            value={datos.usuario}
            onChange={(e) => setDatos({ ...datos, usuario: e.target.value })}
          />
          <Campo
            etiqueta="Contraseña"
            icono={KeyRound}
            type="password"
            autoComplete="current-password"
            value={datos.password}
            onChange={(e) => setDatos({ ...datos, password: e.target.value })}
          />
          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-peligro-suave px-4 py-3 font-medium text-peligro-texto">
              <CircleAlert size={18} className="shrink-0" aria-hidden /> {error}
            </p>
          )}
          <Boton type="submit" tamanio="grande" className="w-full" cargando={enviando} disabled={!datos.usuario || !datos.password}>
            Ingresar
          </Boton>
        </form>
      </div>
    </div>
  );
}
