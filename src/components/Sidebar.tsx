import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  IconInventario,
  IconPanel,
  IconMovimientos,
  IconHistorial,
  IconEventos,
  IconCalendario,
  IconClientes,
  IconCategorias,
  IconAdmin,
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
  { to: '/eventos', label: 'Eventos', icon: IconEventos },
  { to: '/calendario', label: 'Calendario', icon: IconCalendario },
  { to: '/clientes', label: 'Clientes', icon: IconClientes },
  { to: '/categorias', label: 'Categorías', icon: IconCategorias },
  { to: '/historial', label: 'Historial', icon: IconHistorial },
]

/** Navegación reservada al rol `admin` (además, protegida en servidor). */
const NAV_ADMIN: NavItem[] = [{ to: '/admin', label: 'Administración', icon: IconAdmin }]

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  trabajador: 'Trabajador',
}

export function Sidebar({ onNavegar }: { onNavegar?: () => void }) {
  const { perfil, salir } = useAuth()

  const nombre = perfil?.nombre ?? 'Usuario'
  const inicial = nombre.charAt(0).toUpperCase()
  const rol = perfil?.rol ? ROL_LABEL[perfil.rol] ?? perfil.rol : ''
  const esAdmin = perfil?.rol === 'admin'

  function enlace(item: NavItem) {
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
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__marca">
        <span className="sidebar__logo">SURICATO</span>
        <span className="sidebar__logo-sub">· wms ·</span>
      </div>

      <nav className="sidebar__nav" aria-label="Navegación principal">
        {NAV.map(enlace)}

        {/* Administración: solo para admin. Ocultarlo es cosmético — la ruta y la
            base de datos lo protegen de verdad (RLS + Edge Function). */}
        {esAdmin && (
          <>
            <span className="sidebar__separador" aria-hidden="true" />
            {NAV_ADMIN.map(enlace)}
          </>
        )}
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
