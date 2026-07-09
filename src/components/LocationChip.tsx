import './Chip.css'

/** Chip de ubicación (estantería / pasillo / zona). Neutro, monoespaciado. */
export function LocationChip({ ubicacion }: { ubicacion: string | null | undefined }) {
  if (!ubicacion) return <span className="ubicacion-vacia">Sin ubicación</span>
  return (
    <span className="chip chip--ubicacion">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="2" />
      </svg>
      {ubicacion}
    </span>
  )
}
