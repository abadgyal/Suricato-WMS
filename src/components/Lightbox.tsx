import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconCerrar } from './icons'
import './Lightbox.css'

interface LightboxProps {
  src: string
  alt: string
  onClose: () => void
}

/**
 * Lightbox de foto a pantalla completa. Cierra con ESC o clic fuera de la imagen.
 */
export function Lightbox({ src, alt, onClose }: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Evita el scroll del fondo mientras el lightbox está abierto.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={alt}>
      <button className="lightbox__cerrar" onClick={onClose} aria-label="Cerrar (Esc)">
        <IconCerrar size={24} />
      </button>
      {/* Detener la propagación: clic en la imagen no cierra; clic fuera sí. */}
      <img className="lightbox__img" src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  )
}
