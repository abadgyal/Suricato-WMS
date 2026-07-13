import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  IconInventario,
  IconPanel,
  IconMovimientos,
  IconHistorial,
  IconReservas,
  IconSalir,
} from './icons'
import './Sidebar.css'

interface NavItem {
  to: string
  label: string
  icon: typeof IconInventario
  proximamente?: boolean
}

const NAV: NavItem[] = [
  { to: '/inventario', label: 'Inventario', icon: IconInventario },
  { to: '/panel', label: 'Panel', icon: IconPanel },
  { to: '/movimientos', label: 'Movimientos', icon: IconMovimientos },
  { to: '/historial', label: 'Historial', icon: IconHistorial },
  { to: '/reservas', label: 'Reservas', icon: IconReservas, proximamente: true },
]

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  trabajador: 'Trabajador',
}

export function Sidebar({ onNavegar }: { onNavegar?: () => void }) {
  const { perfil, salir } = useAuth()

  const nombre = perfil?.nombre ?? 'Usuario'
  const inicial = nombre.charAt(0).toUpperCase()
  const rol = perfil?.rol ? ROL_LABEL[perfil.rol] ?? perfil.rol : ''

  return (
    <aside className="sidebar">
      <div className="sidebar__marca">
        <span className="sidebar__logo">SURICATO</span>
        <span className="sidebar__logo-sub">· wms ·</span>
      </div>

      <nav className="sidebar__nav" aria-label="Navegación principal">
        {NAV.map((item) => {
          const Icono = item.icon
          if (item.proximamente) {
            return (
              <span key={item.to} className="navlink navlink--disabled" aria-disabled="true">
                <Icono size={18} />
                <span className="navlink__label">{item.label}</span>
                <span className="navlink__badge">Próximamente</span>
              </span>
            )
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `navlink ${isActive ? 'navlink--active' : ''}`}
              onClick={onNavegar}
            >
              <Icono size={18} />
              <span className="navlink__label">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="sidebar__usuario">
        <div className="usuario">
          <span className="usuario__avatar" aria-hidden="true">
            {inicial}
          </span>
          <span className="usuario__datos">
            <span className="usuario__nombre">{nombre}</span>
            <span className="usuario__rol">{rol}</span>
          </span>
        </div>
        <button className="usuario__salir" onClick={() => void salir()} aria-label="Cerrar sesión">
          <IconSalir size={18} />
        </button>
      </div>
    </aside>
  )
}
