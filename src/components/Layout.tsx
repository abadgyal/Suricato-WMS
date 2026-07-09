import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import './Layout.css'

/** Esqueleto de la app: sidebar oscuro fijo + área principal. */
export function Layout() {
  const [menuAbierto, setMenuAbierto] = useState(false)

  return (
    <div className="layout">
      {/* Barra superior solo en móvil, para abrir el menú. */}
      <div className="layout__topbar">
        <button
          className="layout__menu-btn"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <span className="layout__topbar-marca">SURICATO</span>
      </div>

      <div className={`layout__sidebar ${menuAbierto ? 'layout__sidebar--abierto' : ''}`}>
        <Sidebar onNavegar={() => setMenuAbierto(false)} />
      </div>

      {menuAbierto && (
        <div className="layout__backdrop" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
      )}

      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  )
}
