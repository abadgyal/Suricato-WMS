import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Inventario } from './pages/Inventario'
import { Movimientos } from './pages/Movimientos'
import { Historial } from './pages/Historial'
import { Panel } from './pages/Panel'
import { Eventos } from './pages/Eventos'
import { EventoFicha } from './pages/EventoFicha'
import { Calendario } from './pages/Calendario'
import { Clientes } from './pages/Clientes'
import { ClienteFicha } from './pages/ClienteFicha'
import { Categorias } from './pages/Categorias'
import { Admin } from './pages/Admin'
import './App.css'

/** Splash a pantalla completa mientras se resuelve la sesión persistida. */
function Splash() {
  return (
    <div className="splash">
      <div className="splash__marca">
        <span className="splash__logo">SURICATO</span>
        <span className="splash__sub">· wms ·</span>
      </div>
    </div>
  )
}

/** Envuelve las rutas privadas: sin sesión, redirige al login. */
function RutaProtegida() {
  const { session, cargando } = useAuth()
  if (cargando) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <Layout />
}

/**
 * Rutas de administración: solo rol `admin`. Es una guarda de UX — la garantía
 * está en el servidor (RLS de `perfil`, `is_admin()` en `desactivar_usuario` y la
 * comprobación de admin activo en la Edge Function `crear-usuario`).
 */
function RutaAdmin({ children }: { children: ReactNode }) {
  const { perfil, cargando } = useAuth()
  if (cargando) return <Splash />
  if (perfil?.rol !== 'admin') return <Navigate to="/inventario" replace />
  return <>{children}</>
}

export default function App() {
  const { session, cargando } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={cargando ? <Splash /> : session ? <Navigate to="/inventario" replace /> : <Login />}
      />

      <Route element={<RutaProtegida />}>
        <Route index element={<Navigate to="/inventario" replace />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/panel" element={<Panel />} />
        <Route path="/movimientos" element={<Movimientos />} />
        <Route path="/historial" element={<Historial />} />
        <Route path="/eventos" element={<Eventos />} />
        <Route path="/eventos/:id" element={<EventoFicha />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<ClienteFicha />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route
          path="/admin"
          element={
            <RutaAdmin>
              <Admin />
            </RutaAdmin>
          }
        />
        {/* Las reservas viven dentro de su evento: no tienen pantalla propia. */}
        <Route path="/reservas" element={<Navigate to="/eventos" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/inventario" replace />} />
    </Routes>
  )
}
