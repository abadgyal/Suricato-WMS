import { PALETA_CLIENTE } from '../../lib/colores'
import './ClienteForm.css'

interface SelectorColorProps {
  valor: string
  onCambio: (color: string) => void
  /** Paleta a ofrecer. Por defecto, la de clientes. */
  paleta?: readonly string[]
}

/**
 * Selector de color de una paleta cerrada. La gama es deliberada (ver
 * `lib/colores.ts`): no se admiten colores libres para que ningún cliente pueda
 * elegir el verde/azul/ámbar/rojo que significan estado de stock.
 */
export function SelectorColor({ valor, onCambio, paleta = PALETA_CLIENTE }: SelectorColorProps) {
  return (
    <div className="paleta" role="radiogroup" aria-label="Color">
      {paleta.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={valor.toLowerCase() === c.toLowerCase()}
          aria-label={`Color ${c}`}
          className={`paleta__color ${
            valor.toLowerCase() === c.toLowerCase() ? 'paleta__color--elegido' : ''
          }`}
          style={{ backgroundColor: c }}
          onClick={() => onCambio(c)}
        />
      ))}
    </div>
  )
}
