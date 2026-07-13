import { Link } from 'react-router-dom'
import { useDashboard } from '../hooks/useDashboard'
import { useMovimientos } from '../hooks/useMovimientos'
import { MovimientoBadge } from '../components/MovimientoBadge'
import { ErrorState } from '../components/States'
import { formatFechaHora } from '../lib/format'
import { IconInventario } from '../components/icons'
import './Panel.css'

/** Tarjeta de métrica del panel. */
function Metrica({ valor, label, nota }: { valor: number; label: string; nota?: string }) {
  return (
    <div className="metrica">
      <span className="metrica__valor tnum">{valor}</span>
      <span className="metrica__label">{label}</span>
      {nota && <span className="metrica__nota">{nota}</span>}
    </div>
  )
}

/** Panel principal (SPEC §2/§3): métricas, alerta de stock bajo, recientes y categorías. */
export function Panel() {
  const { metricas, bajoMinimo, categorias, cargando, error, recargar } = useDashboard()
  const { movimientos } = useMovimientos(8)

  const maxCat = Math.max(1, ...categorias.map((c) => c.total ?? 0))
  const recientes = movimientos.slice(0, 8)

  if (error) {
    return (
      <div className="panel">
        <ErrorState mensaje={error} onReintentar={recargar} />
      </div>
    )
  }

  return (
    <div className="panel">
      <header className="panel__cab">
        <h1>Panel</h1>
        <p className="panel__sub">Estado del almacén en tiempo real.</p>
      </header>

      <section className="panel__metricas" aria-label="Métricas">
        <Metrica valor={metricas.referencias} label="Referencias" nota="productos distintos" />
        <Metrica valor={metricas.unidadesStock} label="Unidades en stock" nota="total operativo" />
        <Metrica valor={metricas.movimientosHoy} label="Movimientos hoy" />
        <Metrica valor={metricas.reservasActivas} label="Reservas activas" />
        <Metrica valor={metricas.clientes} label="Clientes" />
      </section>

      {bajoMinimo.length > 0 && (
        <Link to="/inventario" className="panel__alerta">
          <span className="panel__alerta-punto" aria-hidden="true" />
          <span className="panel__alerta-texto">
            <strong>
              {bajoMinimo.length} producto{bajoMinimo.length === 1 ? '' : 's'} bajo mínimo
            </strong>
            <span>
              {bajoMinimo
                .slice(0, 3)
                .map((p) => p.nombre)
                .join(', ')}
              {bajoMinimo.length > 3 ? '…' : ''}
            </span>
          </span>
          <span className="panel__alerta-ir">Ver inventario →</span>
        </Link>
      )}

      <div className="panel__cols">
        <section className="panel__bloque">
          <div className="panel__bloque-cab">
            <h2>Movimientos recientes</h2>
            <Link to="/historial" className="panel__link">
              Ver historial →
            </Link>
          </div>
          {cargando && recientes.length === 0 ? (
            <p className="panel__vacio">Cargando…</p>
          ) : recientes.length === 0 ? (
            <p className="panel__vacio">Todavía no hay movimientos.</p>
          ) : (
            <ul className="panel__recientes">
              {recientes.map((m) => (
                <li key={m.id} className="reciente">
                  <MovimientoBadge tipo={m.tipo} />
                  <span className="reciente__producto">{m.producto?.nombre ?? '—'}</span>
                  <span className="reciente__cant tnum">
                    {m.tipo === 'ajuste'
                      ? `${m.valor_anterior ?? 0}→${m.valor_nuevo ?? 0}`
                      : m.unidades ?? ''}
                  </span>
                  <span className="reciente__fecha">{formatFechaHora(m.creado_en)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel__bloque">
          <div className="panel__bloque-cab">
            <h2>Stock por categoría</h2>
          </div>
          {categorias.length === 0 ? (
            <p className="panel__vacio">Sin datos de categorías.</p>
          ) : (
            <ul className="panel__categorias">
              {categorias.map((c) => (
                <li key={c.categoria_id ?? c.categoria ?? ''} className="cat-barra">
                  <div className="cat-barra__cab">
                    <span className="cat-barra__nombre">{c.categoria ?? 'Sin categoría'}</span>
                    <span className="cat-barra__valor tnum">{c.total ?? 0}</span>
                  </div>
                  <div className="cat-barra__pista">
                    <div
                      className="cat-barra__relleno"
                      style={{
                        width: `${((c.total ?? 0) / maxCat) * 100}%`,
                        backgroundColor: c.color ?? 'var(--color-accent)',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {metricas.referencias === 0 && !cargando && (
        <div className="panel__inicio">
          <IconInventario size={24} />
          <span>
            Aún no hay material. Empieza registrando una entrada en{' '}
            <Link to="/movimientos" className="panel__link">
              Movimientos
            </Link>
            .
          </span>
        </div>
      )}
    </div>
  )
}
