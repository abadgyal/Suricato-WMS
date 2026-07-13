import { TIPO_MOV_COLOR_VAR, TIPO_MOV_LABEL, type TipoMovimiento } from '../lib/domain'
import './MovimientoBadge.css'

/** Badge de color por tipo de movimiento (entrada, salida, devolución, ajuste, baja). */
export function MovimientoBadge({ tipo }: { tipo: TipoMovimiento }) {
  return (
    <span className="mov-badge" style={{ ['--mov-color' as string]: TIPO_MOV_COLOR_VAR[tipo] }}>
      <span className="mov-badge__dot" aria-hidden="true" />
      {TIPO_MOV_LABEL[tipo]}
    </span>
  )
}
