import { Navigate, Route, Routes } from 'react-router';
import { useSesion } from './contexto/Sesion.jsx';
import { Layout } from './layout/Layout.jsx';
import { Cargando } from './componentes/Varios.jsx';
import { Login } from './paginas/Login.jsx';
import { Vender } from './paginas/vender/Vender.jsx';
import { Caja } from './paginas/caja/Caja.jsx';
import { Ventas } from './paginas/Ventas.jsx';
import { Compras } from './paginas/compras/Compras.jsx';
import { NuevaCompra } from './paginas/compras/NuevaCompra.jsx';
import { Stock } from './paginas/Stock.jsx';
import { Productos } from './paginas/productos/Productos.jsx';
import { Proveedores } from './paginas/proveedores/Proveedores.jsx';
import { Usuarios } from './paginas/Usuarios.jsx';
import { Configuracion } from './paginas/Configuracion.jsx';
import { MiCuenta } from './paginas/MiCuenta.jsx';
import { Inicio } from './paginas/Inicio.jsx';
import { Mermas } from './paginas/Mermas.jsx';
import { Inventario } from './paginas/inventario/Inventario.jsx';
import { InventarioConteo } from './paginas/inventario/InventarioConteo.jsx';
import { FichaProveedor } from './paginas/proveedores/FichaProveedor.jsx';
import { Clientes } from './paginas/clientes/Clientes.jsx';
import { CuentaCliente } from './paginas/clientes/CuentaCliente.jsx';
import { Reportes } from './paginas/reportes/Reportes.jsx';

function SoloCon({ permiso, children }) {
  const { puede } = useSesion();
  return puede(permiso) ? children : <Navigate to="/vender" replace />;
}

export function App() {
  const { usuario, puede } = useSesion();
  if (usuario === undefined) return <Cargando texto="Iniciando..." />;
  if (!usuario) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={puede('reportes.ver') ? '/inicio' : '/vender'} replace />} />
        <Route path="inicio" element={<SoloCon permiso="reportes.ver"><Inicio /></SoloCon>} />
        <Route path="vender" element={<Vender />} />
        <Route path="caja" element={<Caja />} />
        <Route path="ventas" element={<Ventas />} />
        <Route path="mercaderia" element={<SoloCon permiso="compras.crear"><Compras /></SoloCon>} />
        <Route path="mercaderia/nuevo" element={<SoloCon permiso="compras.crear"><NuevaCompra /></SoloCon>} />
        <Route path="stock" element={<SoloCon permiso="stock.ver"><Stock /></SoloCon>} />
        <Route path="productos" element={<Productos />} />
        <Route path="mermas" element={<SoloCon permiso="mermas.registrar"><Mermas /></SoloCon>} />
        <Route path="inventario" element={<SoloCon permiso="inventario.contar"><Inventario /></SoloCon>} />
        <Route path="inventario/:id" element={<SoloCon permiso="inventario.contar"><InventarioConteo /></SoloCon>} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="proveedores/:id" element={<SoloCon permiso="proveedores.editar"><FichaProveedor /></SoloCon>} />
        <Route path="clientes" element={<SoloCon permiso="clientes.operar"><Clientes /></SoloCon>} />
        <Route path="clientes/:id" element={<SoloCon permiso="clientes.operar"><CuentaCliente /></SoloCon>} />
        <Route path="reportes" element={<SoloCon permiso="reportes.ver"><Reportes /></SoloCon>} />
        <Route path="usuarios" element={<SoloCon permiso="usuarios.gestionar"><Usuarios /></SoloCon>} />
        <Route path="configuracion" element={<SoloCon permiso="configuracion.editar"><Configuracion /></SoloCon>} />
        <Route path="mi-cuenta" element={<MiCuenta />} />
        <Route path="*" element={<Navigate to="/vender" replace />} />
      </Route>
    </Routes>
  );
}
