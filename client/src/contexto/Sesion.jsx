import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { get, post } from '../api/cliente.js';

const SesionContexto = createContext(null);

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(undefined); // undefined = cargando, null = sin sesión
  const queryClient = useQueryClient();

  useEffect(() => {
    get('/auth/yo')
      .then(setUsuario)
      .catch(() => setUsuario(null));
    const alVencer = () => {
      setUsuario(null);
      queryClient.clear();
    };
    window.addEventListener('sesion-vencida', alVencer);
    return () => window.removeEventListener('sesion-vencida', alVencer);
  }, [queryClient]);

  const ingresar = useCallback(async (datos) => {
    const u = await post('/auth/login', datos);
    queryClient.clear();
    setUsuario(u);
    return u;
  }, [queryClient]);

  const salir = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    queryClient.clear();
    setUsuario(null);
  }, [queryClient]);

  const puede = useCallback((permiso) => !!usuario?.permisos?.includes(permiso), [usuario]);

  return <SesionContexto.Provider value={{ usuario, ingresar, salir, puede }}>{children}</SesionContexto.Provider>;
}

export const useSesion = () => useContext(SesionContexto);
