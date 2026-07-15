import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCerrar } from './icons'
import './Modal.css'

interface ModalProps {
  titulo: string
  /** Línea pequeña sobre el título (p. ej. el nombre del evento). */
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  /** Ancho del diálogo. `lg` para el check-in (tabla de líneas). */
  ancho?: 'md' | 'lg'
}

/**
 * Diálogo modal genérico: portal al body, cierre con ESC o clic fuera, y
 * bloqueo del scroll de fondo. Los formularios del ciclo de alquiler (evento,
 * reserva, check-in) viven dentro de él.
 */
export function Modal({ titulo, eyebrow, onClose, children, ancho = 'md' }: ModalProps) {
  const dialogoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Gestión de foco (a11y): al abrir, el foco entra en el diálogo; al cerrar,
    // vuelve al elemento que lo abrió (p. ej. el botón que disparó el modal).
    const focoPrevio = document.activeElement as HTMLElement | null
    dialogoRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      focoPrevio?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div className="dlg-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogoRef}
        className={`dlg dlg--${ancho}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-titulo"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dlg__header">
          <div>
            {eyebrow && <p className="dlg__eyebrow">{eyebrow}</p>}
            <h2 id="dlg-titulo">{titulo}</h2>
          </div>
          <button className="dlg__cerrar" onClick={onClose} aria-label="Cerrar (Esc)">
            <IconCerrar size={22} />
          </button>
        </header>
        <div className="dlg__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
