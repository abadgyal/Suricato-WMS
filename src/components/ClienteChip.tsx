import { Link } from 'react-router-dom'
import './Chip.css'

interface ClienteChipProps {
  nombre: string
  /** Color del cliente (viene de la BD; nunca es nulo). */
  color: string
  /** Si se pasa, el chip enlaza a la ficha del cliente. */
  id?: string | null
}

/**
 * Chip de cliente: mismo lenguaje visual que el de categoría, con el color
 * propio del cliente (paleta apagada de `lib/colores.ts`). Identifica al cliente
 * en listados, ficha de evento e historial.
 */
export function ClienteChip({ nombre, color, id }: ClienteChipProps) {
  const contenido = (
    <>
      <span className="chip__dot" />
      {nombre}
    </>
  )
  const estilo = { ['--chip-color' as string]: color }

  if (id) {
    return (
      <Link to={`/clientes/${id}`} className="chip chip--cliente chip--enlace" style={estilo}>
        {contenido}
      </Link>
    )
  }
  return (
    <span className="chip chip--cliente" style={estilo}>
      {contenido}
    </span>
  )
}
