import { BUCKETS, BUCKET_COLOR_VAR, BUCKET_LABEL, type Bucket } from '../lib/domain'
import './BucketNumbers.css'

interface BucketNumbersProps {
  disponible: number
  en_evento: number
  en_reparacion: number
  /** `inline` (fila de tabla) o `grid` (ficha, con etiquetas). */
  variant?: 'inline' | 'grid'
}

/**
 * Desglose numérico de los tres buckets con su color semántico. Cifras
 * tabulares para que alineen en columna (clave en un WMS).
 */
export function BucketNumbers({
  disponible,
  en_evento,
  en_reparacion,
  variant = 'inline',
}: BucketNumbersProps) {
  const valores: Record<Bucket, number> = { disponible, en_evento, en_reparacion }

  if (variant === 'grid') {
    return (
      <div className="bnums bnums--grid">
        {BUCKETS.map((b) => (
          <div key={b} className="bnums__celda">
            <span className="bnums__valor tnum" style={{ color: BUCKET_COLOR_VAR[b] }}>
              {valores[b]}
            </span>
            <span className="bnums__label">{BUCKET_LABEL[b]}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <span className="bnums bnums--inline tnum" aria-label="Disponible, en evento, en reparación">
      {BUCKETS.map((b, i) => (
        <span key={b}>
          <span style={{ color: BUCKET_COLOR_VAR[b] }}>{valores[b]}</span>
          {i < BUCKETS.length - 1 && <span className="bnums__sep">·</span>}
        </span>
      ))}
    </span>
  )
}
