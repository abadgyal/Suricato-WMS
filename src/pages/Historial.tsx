import { useMemo, useState } from 'react'
import { useMovimientos } from '../hooks/useMovimientos'
import type { TipoMovimiento } from '../lib/domain'
import { MovimientoBadge } from '../components/MovimientoBadge'
import { TableSkeleton, EmptyState, ErrorState } from '../components/States'
import { formatFechaHora } from '../lib/format'
import { IconBuscar, IconMovimientos } from '../components/icons'
import './Historial.css'

/** Filtros agrupados de la UI → tipos reales de `movimiento`. */
const FILTROS: { id: string; label: string; tipo: TipoMovimiento | null }[] = [
  { id: 'todos', label: 'Todos', tipo: null },
  { id: 'entradas', label: 'Entradas', tipo: 'entrada' },
  { id: 'salidas', label: 'Salidas', tipo: 'salida_evento' },
  { id: 'devoluciones', label: 'Devoluciones', tipo: 'devolucion' },
  { id: 'ajustes', label: 'Ajustes', tipo: 'ajuste' },
  { id: 'bajas', label: 'Bajas', tipo: 'baja' },
]

/** Historial completo e inmutable de movimientos (SPEC §10). */
export function Historial() {
  const { movimientos, cargando, error, recargar } = useMovimientos()
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  const tipoFiltro = FILTROS.find((f) => f.id === filtro)?.tipo ?? null

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return movimientos.filter((m) => {
      if (tipoFiltro && m.tipo !== tipoFiltro) return false
      if (!q) return true
      const campos = [
        m.producto?.nombre,
        m.usuario?.nombre,
        m.cliente?.nombre,
        m.evento?.nombre,
        m.motivo,
      ]
      return campos.some((c) => (c ?? '').toLowerCase().includes(q))
    })
  }, [movimientos, tipoFiltro, busqueda])

  return (
    <div className="historial">
      <header className="historial__cab">
        <div>
          <h1>Historial</h1>
          <p className="historial__sub">
            {cargando ? 'Cargando…' : `${visibles.length} movimiento${visibles.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="historial__buscador">
          <IconBuscar size={18} />
          <input
            className="historial__buscador-input"
            type="search"
            placeholder="Buscar producto, persona, cliente, motivo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar en el historial"
          />
        </div>
      </header>

      <div className="historial__filtros" role="tablist" aria-label="Filtrar por tipo">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filtro === f.id}
            className={`historial__filtro ${filtro === f.id ? 'historial__filtro--activo' : ''}`}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="historial__panel">
        {cargando ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState mensaje={error} onReintentar={recargar} />
        ) : movimientos.length === 0 ? (
          <EmptyState
            icono={<IconMovimientos size={26} />}
            titulo="Todavía no hay movimientos"
            mensaje="Cuando registres entradas, salidas, ajustes o bajas, quedarán aquí de forma permanente."
          />
        ) : visibles.length === 0 ? (
          <EmptyState
            icono={<IconBuscar size={26} />}
            titulo="Ningún movimiento coincide"
            mensaje="Prueba con otro texto o cambia el filtro de tipo."
            accion={
              <button
                className="boton boton--secundario"
                onClick={() => {
                  setFiltro('todos')
                  setBusqueda('')
                }}
              >
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <div className="historial__tabla-scroll">
            <table className="historial__tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Cliente</th>
                  <th>Registró</th>
                  <th className="historial__col-num">Cantidad</th>
                  <th>Motivo</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <MovimientoBadge tipo={m.tipo} />
                    </td>
                    <td className="historial__producto">{m.producto?.nombre ?? '—'}</td>
                    <td>{m.cliente?.nombre ?? m.evento?.nombre ?? '—'}</td>
                    <td>{m.usuario?.nombre ?? '—'}</td>
                    <td className="historial__col-num tnum">
                      {m.tipo === 'ajuste' ? (
                        <span className="historial__ajuste">
                          {m.valor_anterior ?? 0} → <strong>{m.valor_nuevo ?? 0}</strong>
                        </span>
                      ) : (
                        (m.unidades ?? '—')
                      )}
                    </td>
                    <td className="historial__motivo">{m.motivo ?? '—'}</td>
                    <td className="historial__fecha">{formatFechaHora(m.creado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
