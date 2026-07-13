import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCliente, type EventoCliente, type LineaMaterial } from '../hooks/useCliente'
import { ClienteForm } from '../components/clientes/ClienteForm'
import { CategoryChip } from '../components/CategoryChip'
import { LocationChip } from '../components/LocationChip'
import { MovimientoBadge } from '../components/MovimientoBadge'
import { ProductThumb } from '../components/ProductThumb'
import { EstadoEventoChip } from '../components/eventos/EstadoChip'
import { EmptyState, ErrorState, TableSkeleton } from '../components/States'
import { formatFecha, formatFechaHora, fotoUrl } from '../lib/format'
import { IconClientes } from '../components/icons'
import type { Categoria, TipoMovimiento } from '../lib/domain'
import './ClienteFicha.css'

/** Lista de material de un evento (fuera ahora, o reservado si está por venir). */
function Material({ lineas, etiqueta }: { lineas: LineaMaterial[]; etiqueta: string }) {
  if (lineas.length === 0) {
    return <p className="cf-evento__sin-material">Sin material {etiqueta}.</p>
  }
  const total = lineas.reduce((s, l) => s + l.unidades, 0)
  return (
    <>
      <p className="cf-evento__resumen tnum">
        {total} unidad{total === 1 ? '' : 'es'} · {lineas.length} producto
        {lineas.length === 1 ? '' : 's'}
      </p>
      <ul className="cf-material">
        {lineas.map((l) => (
          <li key={l.producto_id} className="cf-material__linea">
            <ProductThumb
              src={fotoUrl(l.producto?.foto_path)}
              alt={l.producto?.nombre ?? 'Producto'}
              size="sm"
            />
            <span className="cf-material__nombre">{l.producto?.nombre ?? 'Producto'}</span>
            <span className="cf-material__unidades tnum">{l.unidades}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Tarjeta de evento en la ficha del cliente. */
function EventoCard({
  evento,
  modo,
}: {
  evento: EventoCliente
  modo: 'fuera' | 'reservado' | 'pasado'
}) {
  return (
    <article className={`cf-evento cf-evento--${modo}`}>
      <header className="cf-evento__cab">
        <Link to={`/eventos/${evento.id}`} className="cf-evento__nombre">
          {evento.nombre}
        </Link>
        <EstadoEventoChip estado={evento.estado} />
      </header>
      <p className="cf-evento__fechas">
        {formatFecha(evento.fecha_inicio)} — {formatFecha(evento.fecha_fin)}
      </p>
      {modo === 'fuera' && <Material lineas={evento.fuera} etiqueta="fuera" />}
      {modo === 'reservado' && <Material lineas={evento.reservado} etiqueta="reservado" />}
    </article>
  )
}

/**
 * Ficha del cliente (SPEC §11): la pantalla que responde a "¿qué le he dejado a
 * este cliente?".
 *
 * Los eventos "en curso" no se leen del estado del evento sino de la realidad
 * física: los que tienen material fuera según `v_unidades_fuera_evento`
 * (CONTRACTS §1.4).
 */
export function ClienteFicha() {
  const { id } = useParams<{ id: string }>()
  const {
    cliente,
    enCurso,
    proximos,
    pasados,
    asignados,
    historial,
    categorias,
    cargando,
    error,
    recargar,
  } = useCliente(id)

  const [editando, setEditando] = useState(false)

  if (error) {
    return (
      <div className="cf">
        <ErrorState mensaje={error} onReintentar={recargar} />
      </div>
    )
  }

  if (cargando) {
    return (
      <div className="cf">
        <TableSkeleton />
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="cf">
        <EmptyState
          icono={<IconClientes size={26} />}
          titulo="Cliente no encontrado"
          mensaje="Puede que se haya eliminado."
          accion={
            <Link to="/clientes" className="boton boton--secundario">
              Volver a clientes
            </Link>
          }
        />
      </div>
    )
  }

  const contacto = [cliente.contacto, cliente.email, cliente.telefono].filter(Boolean)

  return (
    <div className="cf" style={{ ['--cliente-color' as string]: cliente.color }}>
      {/* Acento sutil del color del cliente: solo el filete superior de la cabecera. */}
      <header className="cf__cab">
        <div className="cf__identidad">
          <Link to="/clientes" className="cf__volver">
            ← Clientes
          </Link>
          <h1 className="cf__nombre">{cliente.nombre}</h1>
          <p className="cf__contacto">
            {contacto.length > 0 ? contacto.join(' · ') : 'Sin datos de contacto'}
          </p>
        </div>
        <button className="boton boton--secundario" onClick={() => setEditando(true)}>
          Editar cliente
        </button>
      </header>

      {/* --- Eventos en curso: material fuera AHORA --- */}
      <section className="cf__seccion">
        <h2 className="cf__titulo">
          Eventos en curso
          <span className="cf__titulo-nota">material suyo fuera ahora mismo</span>
        </h2>
        {enCurso.length === 0 ? (
          <p className="cf__vacio">No tiene material fuera. Todo está en el almacén.</p>
        ) : (
          <div className="cf__eventos">
            {enCurso.map((e) => (
              <EventoCard key={e.id} evento={e} modo="fuera" />
            ))}
          </div>
        )}
      </section>

      {/* --- Eventos próximos: planificados, con su material reservado --- */}
      <section className="cf__seccion">
        <h2 className="cf__titulo">
          Eventos próximos
          <span className="cf__titulo-nota">planificados, con su material reservado</span>
        </h2>
        {proximos.length === 0 ? (
          <p className="cf__vacio">Sin eventos próximos.</p>
        ) : (
          <div className="cf__eventos">
            {proximos.map((e) => (
              <EventoCard key={e.id} evento={e} modo="reservado" />
            ))}
          </div>
        )}
      </section>

      {/* --- Eventos pasados --- */}
      <section className="cf__seccion">
        <h2 className="cf__titulo">
          Eventos pasados
          <span className="cf__titulo-nota">histórico</span>
        </h2>
        {pasados.length === 0 ? (
          <p className="cf__vacio">Sin eventos pasados.</p>
        ) : (
          <ul className="cf__pasados">
            {pasados.map((e) => (
              <li key={e.id} className="cf__pasado">
                <Link to={`/eventos/${e.id}`} className="cf__pasado-nombre">
                  {e.nombre}
                </Link>
                <span className="cf__pasado-fechas">
                  {formatFecha(e.fecha_inicio)} — {formatFecha(e.fecha_fin)}
                </span>
                <EstadoEventoChip estado={e.estado} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Material asignado (producto.cliente_id, DOMAIN §6) --- */}
      <section className="cf__seccion">
        <h2 className="cf__titulo">
          Material asignado
          <span className="cf__titulo-nota">productos dedicados a este cliente</span>
        </h2>
        {asignados.length === 0 ? (
          <p className="cf__vacio">
            Ningún producto está asignado a este cliente (todo es stock genérico).
          </p>
        ) : (
          <div className="cf__tabla-scroll">
            <table className="cf__tabla">
              <thead>
                <tr>
                  <th></th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Ubicación</th>
                  <th className="cf__col-num">Disponible</th>
                  <th className="cf__col-num">Fuera</th>
                  <th className="cf__col-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {asignados.map((p) => {
                  const cat: Categoria | undefined = p.categoria_id
                    ? categorias.get(p.categoria_id)
                    : undefined
                  return (
                    <tr key={p.id}>
                      <td>
                        <ProductThumb
                          src={fotoUrl(p.foto_path)}
                          alt={p.nombre ?? 'Producto'}
                          size="sm"
                        />
                      </td>
                      <td className="cf__producto">{p.nombre}</td>
                      <td>
                        {cat ? (
                          <CategoryChip nombre={cat.nombre} color={cat.color} />
                        ) : (
                          <span className="cf__sin-cat">Sin categoría</span>
                        )}
                      </td>
                      <td>
                        <LocationChip ubicacion={p.ubicacion} />
                      </td>
                      <td className="cf__col-num tnum">{p.disponible_real ?? 0}</td>
                      <td className="cf__col-num tnum">{p.en_evento ?? 0}</td>
                      <td className="cf__col-num tnum">{p.total ?? 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Historial de movimientos asociados al cliente --- */}
      <section className="cf__seccion">
        <h2 className="cf__titulo">
          Historial
          <span className="cf__titulo-nota">
            movimientos suyos, de sus eventos o de su material
          </span>
        </h2>
        {historial.length === 0 ? (
          <p className="cf__vacio">Sin movimientos asociados.</p>
        ) : (
          <div className="cf__tabla-scroll">
            <table className="cf__tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Evento</th>
                  <th>Registró</th>
                  <th className="cf__col-num">Cantidad</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((m) => (
                  <tr key={m.id}>
                    <td>{m.tipo && <MovimientoBadge tipo={m.tipo as TipoMovimiento} />}</td>
                    <td className="cf__producto">{m.producto ?? '—'}</td>
                    <td>{m.evento ?? '—'}</td>
                    <td>{m.usuario ?? '—'}</td>
                    <td className="cf__col-num tnum">
                      {m.tipo === 'ajuste'
                        ? `${m.valor_anterior ?? 0} → ${m.valor_nuevo ?? 0}`
                        : (m.unidades ?? '—')}
                    </td>
                    <td className="cf__fecha">{formatFechaHora(m.creado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editando && (
        <ClienteForm
          cliente={cliente}
          onClose={() => setEditando(false)}
          onGuardado={() => {
            setEditando(false)
            recargar()
          }}
        />
      )}
    </div>
  )
}
