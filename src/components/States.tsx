import type { ReactNode } from 'react'
import './States.css'

/** Filas skeleton para la tabla de inventario mientras carga. */
export function TableSkeleton({ filas = 6 }: { filas?: number }) {
  return (
    <div className="skeleton-wrap" aria-hidden="true">
      {Array.from({ length: filas }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <span className="sk sk--thumb" />
          <span className="sk sk--linea sk--ancha" />
          <span className="sk sk--chip" />
          <span className="sk sk--bar" />
          <span className="sk sk--linea sk--corta" />
        </div>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  titulo: string
  mensaje: string
  accion?: ReactNode
  icono?: ReactNode
}

/** Estado vacío: invita a actuar, no se disculpa. */
export function EmptyState({ titulo, mensaje, accion, icono }: EmptyStateProps) {
  return (
    <div className="estado">
      {icono && <div className="estado__icono">{icono}</div>}
      <h3 className="estado__titulo">{titulo}</h3>
      <p className="estado__mensaje">{mensaje}</p>
      {accion && <div className="estado__accion">{accion}</div>}
    </div>
  )
}

interface ErrorStateProps {
  mensaje: string
  onReintentar?: () => void
}

/** Estado de error: explica qué pasó y cómo seguir, sin vaguedad. */
export function ErrorState({ mensaje, onReintentar }: ErrorStateProps) {
  return (
    <div className="estado estado--error">
      <div className="estado__icono estado__icono--error" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 8v5M12 16.5v.5" />
          <path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="estado__titulo">No se pudo cargar el inventario</h3>
      <p className="estado__mensaje">{mensaje}</p>
      {onReintentar && (
        <div className="estado__accion">
          <button className="boton boton--secundario" onClick={onReintentar}>
            Reintentar
          </button>
        </div>
      )}
    </div>
  )
}
