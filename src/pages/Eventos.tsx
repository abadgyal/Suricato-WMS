import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useEventos } from '../hooks/useEventos'
import { ESTADO_EVENTO_LABEL, type EstadoEvento } from '../lib/domain'
import { EstadoEventoChip } from '../components/eventos/EstadoChip'
import { EventoForm } from '../components/eventos/EventoForm'
import { TableSkeleton, EmptyState, ErrorState } from '../components/States'
import { formatFecha } from '../lib/format'
import { IconBuscar, IconReservas } from '../components/icons'
import './Eventos.css'

const ESTADOS: { id: EstadoEvento | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'planificado', label: ESTADO_EVENTO_LABEL.planificado },
  { id: 'en_curso', label: ESTADO_EVENTO_LABEL.en_curso },
  { id: 'cerrado', label: ESTADO_EVENTO_LABEL.cerrado },
  { id: 'cancelado', label: ESTADO_EVENTO_LABEL.cancelado },
]

/** Listado de eventos con filtros por estado, cliente y rango de fechas (SPEC §9). */
export function Eventos() {
  const { eventos, clientes, cargando, error, recargar } = useEventos()
  const navigate = useNavigate()

  const [estado, setEstado] = useState<EstadoEvento | 'todos'>('todos')
  const [clienteId, setClienteId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return eventos.filter((e) => {
      if (estado !== 'todos' && e.estado !== estado) return false
      if (clienteId && e.cliente_id !== clienteId) return false
      // Rango: se muestran los eventos que SOLAPAN con el rango pedido, no solo
      // los contenidos en él (un evento largo también cae en una semana corta).
      if (desde && e.fecha_fin < desde) return false
      if (hasta && e.fecha_inicio > hasta) return false
      if (!q) return true
      return [e.nombre, e.cliente?.nombre, e.notas].some((c) => (c ?? '').toLowerCase().includes(q))
    })
  }, [eventos, estado, clienteId, desde, hasta, busqueda])

  const hayFiltros = estado !== 'todos' || clienteId !== '' || desde !== '' || hasta !== '' || busqueda !== ''

  function limpiar() {
    setEstado('todos')
    setClienteId('')
    setDesde('')
    setHasta('')
    setBusqueda('')
  }

  return (
    <div className="eventos">
      <header className="eventos__cab">
        <div>
          <h1>Eventos</h1>
          <p className="eventos__sub">
            {cargando
              ? 'Cargando…'
              : `${visibles.length} evento${visibles.length === 1 ? '' : 's'}${
                  hayFiltros ? ` de ${eventos.length}` : ''
                }`}
          </p>
        </div>
        <div className="eventos__cab-acciones">
          <div className="eventos__buscador">
            <IconBuscar size={18} />
            <input
              className="eventos__buscador-input"
              type="search"
              placeholder="Buscar evento, cliente, notas…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar eventos"
            />
          </div>
          <button className="boton boton--primario" onClick={() => setCreando(true)}>
            Nuevo evento
          </button>
        </div>
      </header>

      <div className="eventos__filtros">
        <div className="eventos__estados" role="tablist" aria-label="Filtrar por estado">
          {ESTADOS.map((e) => (
            <button
              key={e.id}
              role="tab"
              aria-selected={estado === e.id}
              className={`eventos__estado ${estado === e.id ? 'eventos__estado--activo' : ''}`}
              onClick={() => setEstado(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="eventos__filtros-campos">
          <label className="eventos__filtro">
            <span className="campo__label">Cliente</span>
            <select
              className="select"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="eventos__filtro">
            <span className="campo__label">Desde</span>
            <input
              className="input"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>
          <label className="eventos__filtro">
            <span className="campo__label">Hasta</span>
            <input
              className="input"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </label>
          {hayFiltros && (
            <button className="boton boton--secundario eventos__limpiar" onClick={limpiar}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      <section className="eventos__panel">
        {cargando ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState mensaje={error} onReintentar={recargar} />
        ) : eventos.length === 0 ? (
          <EmptyState
            icono={<IconReservas size={26} />}
            titulo="Todavía no hay eventos"
            mensaje="Un evento agrupa el material que sale a un proyecto y su ventana de fechas. Crea el primero para empezar a reservar."
            accion={
              <button className="boton boton--primario" onClick={() => setCreando(true)}>
                Nuevo evento
              </button>
            }
          />
        ) : visibles.length === 0 ? (
          <EmptyState
            icono={<IconBuscar size={26} />}
            titulo="Ningún evento coincide"
            mensaje="Prueba con otro texto o afloja los filtros."
            accion={
              <button className="boton boton--secundario" onClick={limpiar}>
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <div className="eventos__tabla-scroll">
            <table className="eventos__tabla">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Cliente</th>
                  <th>Fechas</th>
                  <th>Estado</th>
                  <th className="eventos__col-num">Reservado</th>
                  <th className="eventos__col-num">Fuera</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => (
                  <tr key={e.id} onClick={() => navigate(`/eventos/${e.id}`)} className="eventos__fila">
                    <td>
                      <Link
                        to={`/eventos/${e.id}`}
                        className="eventos__nombre"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {e.nombre}
                      </Link>
                    </td>
                    <td>{e.cliente?.nombre ?? '—'}</td>
                    <td className="eventos__fechas">
                      {formatFecha(e.fecha_inicio)} — {formatFecha(e.fecha_fin)}
                    </td>
                    <td>
                      <EstadoEventoChip estado={e.estado} />
                    </td>
                    <td className="eventos__col-num tnum">
                      {e.unidadesReservadas > 0 ? (
                        <span title={`${e.lineasActivas} línea(s) activa(s)`}>
                          {e.unidadesReservadas}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="eventos__col-num tnum">
                      {e.unidadesFuera > 0 ? (
                        <span className="eventos__fuera">{e.unidadesFuera}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creando && (
        <EventoForm
          clientes={clientes}
          onClose={() => setCreando(false)}
          onGuardado={(evento) => {
            setCreando(false)
            navigate(`/eventos/${evento.id}`)
          }}
        />
      )}
    </div>
  )
}
