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
