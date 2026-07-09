import './Placeholder.css'

/** Placeholder para las rutas aún no construidas (Panel, Movimientos, Reservas). */
export function Placeholder({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder__caja">
        <span className="placeholder__badge">Próximamente</span>
        <h1>{titulo}</h1>
        <p>{descripcion}</p>
      </div>
    </div>
  )
}
