import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useEvento } from '../hooks/useEvento'
import { supabase } from '../lib/supabase'
import { llamarRpc } from '../lib/rpc'
import type { LineaPacking } from '../lib/packingList'
import { formatFecha } from '../lib/format'
import { useToast } from '../components/toast/useToast'
import { EstadoEventoChip, EstadoReservaChip } from '../components/eventos/EstadoChip'
import { EventoForm } from '../components/eventos/EventoForm'
import { ReservaForm } from '../components/eventos/ReservaForm'
import { CheckinModal } from '../components/eventos/CheckinModal'
import { ConflictoAviso } from '../components/eventos/ConflictoAviso'
import { CategoryChip } from '../components/CategoryChip'
import { ClienteChip } from '../components/ClienteChip'
import { LocationChip } from '../components/LocationChip'
import { ErrorState } from '../components/States'
import { IconDescargar } from '../components/icons'
import './EventoFicha.css'

/** Ficha de evento: reservas, material fuera y las acciones del ciclo (SPEC §9). */
export function EventoFicha() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const {
    evento,
    reservas,
    fuera,
    conflictos,
    productos,
    categorias,
    clientes,
    cargando,
    error,
    recargar,
  } = useEvento(id)

  const [editando, setEditando] = useState(false)
  const [reservando, setReservando] = useState(false)
  const [checkin, setCheckin] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const activas = useMemo(() => reservas.filter((r) => r.estado === 'activa'), [reservas])
  const unidadesFuera = fuera.reduce((s, f) => s + f.unidades_fuera, 0)
  const vivo = evento?.estado === 'planificado' || evento?.estado === 'en_curso'
  const puedeCerrar = evento != null && evento.estado !== 'cerrado' && unidadesFuera === 0

  async function cumplirEvento() {
    if (!evento) return
    setOcupado(true)
    try {
      const res = await llamarRpc<{ reservas_cumplidas: number; unidades: number }>('cumplir_evento', {
        p_evento_id: evento.id,
      })
      toast.exito(
        `Evento cumplido: ${res.unidades} unidades en ${res.reservas_cumplidas} línea${
          res.reservas_cumplidas === 1 ? '' : 's'
        } salieron a «${evento.nombre}».`,
      )
      recargar()
    } catch (err) {
      // Si una línea no cabía, la RPC ha revertido TODAS: nada ha salido.
      toast.error((err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function cumplirLinea(reservaId: string, nombre: string) {
    setOcupado(true)
    try {
      await llamarRpc('cumplir_reserva', { p_reserva_id: reservaId })
      toast.exito(`«${nombre}» ha salido al evento.`)
      recargar()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function cancelarLinea(reservaId: string, nombre: string) {
    setOcupado(true)
    try {
      await llamarRpc('cancelar_reserva', { p_reserva_id: reservaId })
      toast.exito(`Reserva de «${nombre}» cancelada; sus unidades vuelven a estar disponibles.`)
      recargar()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function cerrarEvento() {
    if (!evento) return
    setOcupado(true)
    const { error: err } = await supabase
      .from('evento')
      .update({ estado: 'cerrado' })
      .eq('id', evento.id)
    setOcupado(false)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.exito(`Evento «${evento.nombre}» cerrado. Todo el material ha vuelto.`)
    recargar()
  }

  async function packingList() {
    if (!evento) return
    // La hoja lleva lo que el operario tiene que manejar: lo reservado (aún en el
    // almacén) y lo que ya está fuera en este evento.
    const lineas: LineaPacking[] = [
      ...activas.map((r) => ({
        producto: r.producto?.nombre ?? '—',
        categoria: categorias.get(r.producto?.categoria_id ?? '')?.nombre ?? '—',
        ubicacion: r.producto?.ubicacion ?? '—',
        unidades: r.unidades,
        estado: 'Reservado' as const,
      })),
      ...fuera.map((f) => ({
        producto: f.producto?.nombre ?? '—',
        categoria: categorias.get(f.producto?.categoria_id ?? '')?.nombre ?? '—',
        ubicacion: f.producto?.ubicacion ?? '—',
        unidades: f.unidades_fuera,
        estado: 'Fuera' as const,
      })),
    ]
    if (lineas.length === 0) {
      toast.info('El evento no tiene material: reserva algo antes de generar la hoja de carga.')
      return
    }

    setOcupado(true)
    try {
      // jsPDF pesa lo suyo y solo hace falta al descargar: se carga aquí, no en
      // el arranque de la app.
      const { descargarPackingList } = await import('../lib/packingList')
      const fichero = descargarPackingList(evento, evento.cliente?.nombre ?? null, lineas)
      toast.exito(`Hoja de carga descargada (${fichero}).`)
    } catch (err) {
      toast.error(`No se pudo generar la hoja de carga: ${(err as Error).message}`)
    } finally {
      setOcupado(false)
    }
  }

  if (error) {
    return (
      <div className="ficha">
        <ErrorState mensaje={error} onReintentar={recargar} />
      </div>
    )
  }

  if (cargando && !evento) {
    return (
      <div className="ficha">
        <p className="ficha__cargando">Cargando evento…</p>
      </div>
    )
  }

  if (!evento) {
    return (
      <div className="ficha">
        <ErrorState mensaje="Este evento no existe o se ha borrado." />
        <Link to="/eventos" className="ficha__volver">
          ← Volver a eventos
        </Link>
      </div>
    )
  }

  return (
    <div className="ficha">
      <Link to="/eventos" className="ficha__volver">
        ← Eventos
      </Link>

      <header className="ficha__cab">
        <div className="ficha__titulo">
          <div className="ficha__titulo-linea">
            <h1>{evento.nombre}</h1>
            <EstadoEventoChip estado={evento.estado} />
            {evento.cliente && (
              <ClienteChip
                id={evento.cliente.id}
                nombre={evento.cliente.nombre}
                color={evento.cliente.color}
              />
            )}
          </div>
          <p className="ficha__meta">
            {evento.cliente ? '' : 'Sin cliente · '}
            {formatFecha(evento.fecha_inicio)} — {formatFecha(evento.fecha_fin)}
          </p>
          {evento.notas && <p className="ficha__notas">{evento.notas}</p>}
        </div>

        <div className="ficha__acciones">
          <button className="boton boton--secundario" onClick={() => setEditando(true)}>
            Editar
          </button>
          <button
            className="boton boton--secundario"
            onClick={() => void packingList()}
            disabled={ocupado}
          >
            <IconDescargar size={16} />
            Hoja de carga
          </button>
          {vivo && (
            <button
              className="boton boton--secundario"
              onClick={() => setReservando(true)}
              disabled={ocupado}
            >
              Añadir reserva
            </button>
          )}
          {vivo && activas.length > 0 && (
            <button className="boton boton--primario" onClick={cumplirEvento} disabled={ocupado}>
              Cumplir evento ({activas.length})
            </button>
          )}
          {unidadesFuera > 0 && (
            <button
              className="boton boton--primario"
              onClick={() => setCheckin(true)}
              disabled={ocupado}
            >
              Check-in ({unidadesFuera})
            </button>
          )}
          {puedeCerrar && (
            <button className="boton boton--secundario" onClick={cerrarEvento} disabled={ocupado}>
              Cerrar evento
            </button>
          )}
        </div>
      </header>

      {conflictos.length > 0 && (
        <div className="ficha__conflictos">
          <ConflictoAviso conflictos={conflictos} eventoId={evento.id} />
        </div>
      )}

      <div className="ficha__cols">
        <section className="ficha__bloque">
          <div className="ficha__bloque-cab">
            <h2>Material reservado</h2>
            <span className="ficha__contador tnum">
              {activas.reduce((s, r) => s + r.unidades, 0)} uds. activas
            </span>
          </div>

          {reservas.length === 0 ? (
            <p className="ficha__vacio">
              Todavía no hay reservas. {vivo && 'Añade la primera con «Añadir reserva».'}
            </p>
          ) : (
            <table className="ficha__tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="ficha__col-num">Uds.</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reservas.map((r) => {
                  const cat = r.producto?.categoria_id
                    ? categorias.get(r.producto.categoria_id)
                    : undefined
                  const nombre = r.producto?.nombre ?? '—'
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="ficha__producto">{nombre}</span>
                        <span className="ficha__producto-meta">
                          {cat && <CategoryChip nombre={cat.nombre} color={cat.color} />}
                          <LocationChip ubicacion={r.producto?.ubicacion ?? null} />
                        </span>
                        {r.notas && <span className="ficha__linea-notas">{r.notas}</span>}
                      </td>
                      <td className="ficha__col-num tnum">{r.unidades}</td>
                      <td>
                        <EstadoReservaChip estado={r.estado} />
                      </td>
                      <td className="ficha__col-acciones">
                        {r.estado === 'activa' && vivo && (
                          <>
                            <button
                              className="ficha__accion-linea"
                              onClick={() => cumplirLinea(r.id, nombre)}
                              disabled={ocupado}
                            >
                              Cumplir
                            </button>
                            <button
                              className="ficha__accion-linea ficha__accion-linea--baja"
                              onClick={() => cancelarLinea(r.id, nombre)}
                              disabled={ocupado}
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="ficha__bloque">
          <div className="ficha__bloque-cab">
            <h2>Material fuera</h2>
            <span className="ficha__contador tnum">{unidadesFuera} uds.</span>
          </div>

          {fuera.length === 0 ? (
            <p className="ficha__vacio">
              No hay material fuera. {activas.length > 0 && 'Cumple las reservas para que salga.'}
            </p>
          ) : (
            <>
              <table className="ficha__tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="ficha__col-num">Fuera</th>
                  </tr>
                </thead>
                <tbody>
                  {fuera.map((f) => {
                    const cat = f.producto?.categoria_id
                      ? categorias.get(f.producto.categoria_id)
                      : undefined
                    return (
                      <tr key={f.producto_id}>
                        <td>
                          <span className="ficha__producto">{f.producto?.nombre ?? '—'}</span>
                          <span className="ficha__producto-meta">
                            {cat && <CategoryChip nombre={cat.nombre} color={cat.color} />}
                            <LocationChip ubicacion={f.producto?.ubicacion ?? null} />
                          </span>
                        </td>
                        <td className="ficha__col-num tnum">{f.unidades_fuera}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <button
                className="boton boton--primario ficha__checkin"
                onClick={() => setCheckin(true)}
                disabled={ocupado}
              >
                Registrar devolución
              </button>
            </>
          )}
        </section>
      </div>

      {editando && (
        <EventoForm
          evento={evento}
          clientes={clientes}
          onClose={() => setEditando(false)}
          onGuardado={() => {
            setEditando(false)
            recargar()
          }}
        />
      )}

      {reservando && (
        <ReservaForm
          evento={evento}
          productos={productos}
          categorias={categorias}
          onClose={() => setReservando(false)}
          onHecho={recargar}
        />
      )}

      {checkin && (
        <CheckinModal
          evento={evento}
          fuera={fuera}
          categorias={categorias}
          onClose={() => setCheckin(false)}
          onHecho={recargar}
        />
      )}
    </div>
  )
}
