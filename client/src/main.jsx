import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SesionProvider } from './contexto/Sesion.jsx';
import { DialogosProvider } from './contexto/Dialogos.jsx';
import { ImpresionProvider } from './contexto/Impresion.jsx';
import { TemaProvider } from './contexto/Tema.jsx';
import { App } from './App.jsx';
import '@fontsource-variable/inter';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (intentos, error) => error?.status === 0 && intentos < 2,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TemaProvider>
          <DialogosProvider>
            <SesionProvider>
              <ImpresionProvider>
                <App />
              </ImpresionProvider>
            </SesionProvider>
          </DialogosProvider>
        </TemaProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
