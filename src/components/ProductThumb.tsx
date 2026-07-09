import { IconFotoVacia } from './icons'
import './ProductThumb.css'

interface ProductThumbProps {
  src: string | null
  alt: string
  /** `sm` en la tabla; `lg` en la ficha. */
  size?: 'sm' | 'lg'
  /** Si se pasa, la miniatura es un botón que abre el lightbox. */
  onOpen?: () => void
}

/**
 * Miniatura de foto de producto. Si no hay foto, muestra un marcador (no una
 * imagen rota). Con `onOpen`, es un botón accesible que abre el lightbox.
 */
export function ProductThumb({ src, alt, size = 'sm', onOpen }: ProductThumbProps) {
  const contenido = src ? (
    <img className="thumb__img" src={src} alt={alt} loading="lazy" />
  ) : (
    <span className="thumb__vacia" aria-hidden="true">
      <IconFotoVacia size={size === 'lg' ? 40 : 20} />
    </span>
  )

  if (onOpen && src) {
    return (
      <button
        type="button"
        className={`thumb thumb--${size} thumb--click`}
        onClick={onOpen}
        aria-label={`Ampliar foto de ${alt}`}
      >
        {contenido}
      </button>
    )
  }

  return <span className={`thumb thumb--${size}`}>{contenido}</span>
}
