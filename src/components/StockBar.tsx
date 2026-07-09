import { BUCKETS, BUCKET_COLOR_VAR, BUCKET_LABEL, type Bucket } from '../lib/domain'
import './StockBar.css'

interface StockBarProps {
  disponible: number
  en_evento: number
  en_reparacion: number
  /** `sm` para la fila de la tabla; `lg` para la ficha de producto. */
  size?: 'sm' | 'lg'
}

/**
 * Barra de distribución de stock — el elemento de firma del WMS. Segmenta el
 * total operativo en proporción: verde disponible / azul en evento / ámbar en
 * reparación. Como un medidor de carga: de un vistazo se ve cuánto material
 * está fuera vs. en casa.
 */
export function StockBar({ disponible, en_evento, en_reparacion, size = 'sm' }: StockBarProps) {
  const valores: Record<Bucket, number> = {
    disponible,
    en_evento,
    en_reparacion,
  }
  const total = disponible + en_evento + en_reparacion

  const resumen = BUCKETS.map((b) => `${BUCKET_LABEL[b]} ${valores[b]}`).join(', ')

  return (
    <div
      className={`stockbar stockbar--${size}`}
      role="img"
      aria-label={total === 0 ? 'Sin unidades operativas' : `Distribución de stock: ${resumen}`}
    >
      {total === 0 ? (
        <span className="stockbar__empty" />
      ) : (
        BUCKETS.map((b) => {
          const valor = valores[b]
          if (valor <= 0) return null
          const pct = (valor / total) * 100
          return (
            <span
              key={b}
              className="stockbar__seg"
              style={{ width: `${pct}%`, backgroundColor: BUCKET_COLOR_VAR[b] }}
              title={`${BUCKET_LABEL[b]}: ${valor}`}
            />
          )
        })
      )}
    </div>
  )
}
