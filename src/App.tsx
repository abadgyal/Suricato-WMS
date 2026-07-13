import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Inventario } from './pages/Inventario'
import { Movimientos } from './pages/Movimientos'
import { Historial } from './pages/Historial'
import { Placeholder } from './pages/Placeholder'
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
        <Route
          path="/panel"
          element={
            <Placeholder
              titulo="Panel"
              descripcion="Métricas en tiempo real, alertas de stock bajo y desglose por categoría. Llega en el próximo módulo."
            />
          }
        />
        <Route path="/movimientos" element={<Movimientos />} />
        <Route path="/historial" element={<Historial />} />
        <Route
          path="/reservas"
          element={
            <Placeholder
              titulo="Reservas"
              descripcion="Compromiso anticipado de material por evento, con detección de conflictos. Llega en un módulo posterior."
            />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/inventario" replace />} />
    </Routes>
  )
}
