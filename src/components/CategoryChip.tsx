import './Chip.css'

interface CategoryChipProps {
  nombre: string
  /** Color determinista de la categoría (viene de la BD). */
  color: string
}

/**
 * Chip de categoría. Usa el color propio de cada categoría (BD) como punto y
 * como tinte de fondo; el texto queda en tinta principal para máxima legibilidad.
 */
export function CategoryChip({ nombre, color }: CategoryChipProps) {
  return (
    <span
      className="chip chip--categoria"
      style={{ ['--chip-color' as string]: color }}
    >
      <span className="chip__dot" />
      {nombre}
    </span>
  )
}
