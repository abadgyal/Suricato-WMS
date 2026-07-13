import type { ConflictoReserva } from '../../lib/domain'
import { IconAviso } from '../icons'
import './ConflictoAviso.css'

interface ConflictoAvisoProps {
  conflictos: ConflictoReserva[]
  /** Evento desde el que se mira (para nombrar «el otro» de cada par). */
  eventoId: string
}

/**
 * Aviso de conflictos de calendario (`v_conflictos_reserva`, CONTRACTS §4): dos
 * eventos con fechas solapadas reservan el mismo producto por encima de lo que
 * hay. **Avisa, no bloquea**: se explica qué producto y cuántas unidades faltan,
 * y decide el usuario.
 */
export function ConflictoAviso({ conflictos, eventoId }: ConflictoAvisoProps) {
  if (conflictos.length === 0) return null

  return (
    <div className="conflicto">
      <div className="conflicto__cab">
        <IconAviso size={20} />
        <strong>
          {conflictos.length} conflicto{conflictos.length === 1 ? '' : 's'} de calendario
        </strong>
        <span className="conflicto__nota">
          Es un aviso, no un bloqueo: repón stock, mueve fechas o libera una reserva.
        </span>
      </div>

      <ul className="conflicto__lista">
        {conflictos.map((c, i) => {
          const otro = c.evento_a === eventoId ? c.evento_b_nombre : c.evento_a_nombre
          const faltan = (c.reservado_solapado ?? 0) - (c.disponible ?? 0)
          return (
            <li key={`${c.producto_id}-${c.evento_a}-${c.evento_b}-${i}`}>
              <strong>{c.producto}</strong>: falta{faltan === 1 ? '' : 'n'}{' '}
              <span className="tnum">{faltan}</span> unidad{faltan === 1 ? '' : 'es'} si se solapa con
              «{otro}» — hay {c.disponible} disponibles y entre los dos eventos se reservan{' '}
              {c.reservado_solapado}.
            </li>
          )
        })}
      </ul>
    </div>
  )
}
