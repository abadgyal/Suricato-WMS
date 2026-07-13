import {
  ESTADO_EVENTO_COLOR_VAR,
  ESTADO_EVENTO_LABEL,
  ESTADO_RESERVA_COLOR_VAR,
  ESTADO_RESERVA_LABEL,
  type EstadoEvento,
  type EstadoReserva,
} from '../../lib/domain'
import '../Chip.css'

/** Chip del estado de un evento (planificado / en curso / cerrado / cancelado). */
export function EstadoEventoChip({ estado }: { estado: EstadoEvento }) {
  return (
    <span
      className="chip chip--categoria"
      style={{ ['--chip-color' as string]: ESTADO_EVENTO_COLOR_VAR[estado] }}
    >
      <span className="chip__dot" />
      {ESTADO_EVENTO_LABEL[estado]}
    </span>
  )
}

/** Chip del estado de una línea de reserva (activa / cumplida / cancelada). */
export function EstadoReservaChip({ estado }: { estado: EstadoReserva }) {
  return (
    <span
      className="chip chip--categoria"
      style={{ ['--chip-color' as string]: ESTADO_RESERVA_COLOR_VAR[estado] }}
    >
      <span className="chip__dot" />
      {ESTADO_RESERVA_LABEL[estado]}
    </span>
  )
}
