/**
 * Iconos SVG inline (sin dependencias). Trazo de 1.8, heredan `currentColor`.
 * Tamaño por defecto 20; se puede sobreescribir con `size`.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }
}

/** Inventario — flightcase / caja de equipos. */
export function IconInventario(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </svg>
  )
}

/** Panel / dashboard. */
export function IconPanel(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  )
}

/** Movimientos — flechas de entrada/salida. */
export function IconMovimientos(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 8h13m0 0-4-4m4 4-4 4" />
      <path d="M20 16H7m0 0 4-4m-4 4 4 4" />
    </svg>
  )
}

/** Reservas — calendario. */
export function IconReservas(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  )
}

/** Historial — reloj con aguja (registro en el tiempo). */
export function IconHistorial(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3.05 11a9 9 0 1 1 .5 4" />
      <path d="M3 20v-5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/** Eventos — banderín / proyecto con fechas. */
export function IconEventos(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 21V4a1 1 0 0 1 1-1h11l-2.5 4L17 11H6" />
      <circle cx="5" cy="21" r="0.6" fill="currentColor" />
    </svg>
  )
}

/** Calendario con línea de tiempo. */
export function IconCalendario(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      <path d="M6.5 13h5M9.5 17h8" />
    </svg>
  )
}

/** Descargar (hoja de carga en PDF). */
export function IconDescargar(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

/** Aviso — triángulo de conflicto (avisa, no bloquea). */
export function IconAviso(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 16.5v.5" />
    </svg>
  )
}

export function IconBuscar(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  )
}

export function IconSalir(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17 5 12l5-5M5 12h12" />
    </svg>
  )
}

export function IconCerrar(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

/** Marcador de imagen ausente. */
export function IconFotoVacia(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L18 19" />
    </svg>
  )
}

/** Clientes — cartera de personas/organizaciones. */
export function IconClientes(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16.5 5.5a3 3 0 0 1 0 5.6M18 20a6 6 0 0 0-2.4-4.8" />
    </svg>
  )
}

/** Categorías — etiqueta. */
export function IconCategorias(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  )
}

/** Administración — llave / ajustes de sistema. */
export function IconAdmin(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3 4 6v5c0 4.4 3.2 8.4 8 10 4.8-1.6 8-5.6 8-10V6l-8-3Z" />
      <path d="M12 10.5v3M12 8.2v.1" />
    </svg>
  )
}

/** Eliminar — papelera. */
export function IconPapelera(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M10 11v6M14 11v6" />
    </svg>
  )
}
