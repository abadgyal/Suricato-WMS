import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientes } from '../hooks/useClientes'
import { ClienteForm } from '../components/clientes/ClienteForm'
import { TableSkeleton, EmptyState, ErrorState } from '../components/States'
import { IconBuscar, IconClientes } from '../components/icons'
import './Clientes.css'

/**
 * Cartera de clientes (SPEC §11). **Lista plana**: no hay árbol de clientes —
 * los "hijos" de un cliente son sus eventos, no otros clientes (decisión S-F).
 *
 * De un vistazo, por cliente: su color, su contacto, si tiene material fuera
 * ahora mismo y cuántos eventos próximos hay.
 */
export function Clientes() {
  const { clientes, cargando, error, recargar } = useClientes()
  const navigate = useNavigate()

  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter((c) =>
      [c.nombre, c.contacto, c.email, c.telefono].some((v) => (v ?? '').toLowerCase().includes(q)),
    )
  }, [clientes, busqueda])

  return (
    <div className="clientes">
      <header className="clientes__cab">
        <div>
          <h1>Clientes</h1>
          <p className="clientes__sub">
            {cargando
              ? 'Cargando…'
              : `${visibles.length} cliente${visibles.length === 1 ? '' : 's'}${
                  busqueda ? ` de ${clientes.length}` : ''
                }`}
          </p>
        </div>
        <div className="clientes__cab-acciones">
          <div className="clientes__buscador">
            <IconBuscar size={18} />
            <input
              className="clientes__buscador-input"
              type="search"
              placeholder="Buscar cliente, contacto, email…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar clientes"
            />
          </div>
          <button className="boton boton--primario" onClick={() => setCreando(true)}>
            Nuevo cliente
          </button>
        </div>
      </header>

      <section className="clientes__panel">
        {cargando ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState mensaje={error} onReintentar={recargar} />
        ) : clientes.length === 0 ? (
          <EmptyState
            icono={<IconClientes size={26} />}
            titulo="Todavía no hay clientes"
            mensaje="Un cliente agrupa sus eventos y el material que le tienes asignado. Crea el primero."
            accion={
              <button className="boton boton--primario" onClick={() => setCreando(true)}>
                Nuevo cliente
              </button>
            }
          />
        ) : visibles.length === 0 ? (
          <EmptyState
            icono={<IconBuscar size={26} />}
            titulo="Ningún cliente coincide"
            mensaje="Prueba con otro texto."
            accion={
              <button className="boton boton--secundario" onClick={() => setBusqueda('')}>
                Limpiar búsqueda
              </button>
            }
          />
        ) : (
          <ul className="clientes__lista">
            {visibles.map((c) => (
              <li key={c.id}>
                <button
                  className="cliente-fila"
                  style={{ ['--cliente-color' as string]: c.color }}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                >
                  <span className="cliente-fila__color" aria-hidden="true" />
                  <span className="cliente-fila__datos">
                    <span className="cliente-fila__nombre">{c.nombre}</span>
                    <span className="cliente-fila__contacto">
                      {[c.contacto, c.email, c.telefono].filter(Boolean).join(' · ') ||
                        'Sin datos de contacto'}
                    </span>
                  </span>
                  <span className="cliente-fila__senales">
                    {c.eventosEnCurso > 0 && (
                      <span className="cliente-fila__fuera">
                        Material fuera · {c.eventosEnCurso} evento
                        {c.eventosEnCurso === 1 ? '' : 's'} en curso
                      </span>
                    )}
                    {c.eventosProximos > 0 && (
                      <span className="cliente-fila__proximos tnum">
                        {c.eventosProximos} próximo{c.eventosProximos === 1 ? '' : 's'}
                      </span>
                    )}
                    {c.eventosEnCurso === 0 && c.eventosProximos === 0 && (
                      <span className="cliente-fila__nada">Sin eventos activos</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {creando && (
        <ClienteForm
          onClose={() => setCreando(false)}
          onGuardado={(cliente) => {
            setCreando(false)
            navigate(`/clientes/${cliente.id}`)
          }}
        />
      )}
    </div>
  )
}
