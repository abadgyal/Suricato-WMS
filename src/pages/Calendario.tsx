import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCalendario, type EventoCalendario } from '../hooks/useCalendario'
import {
  DIAS_SEMANA,
  diasEntre,
  etiquetaDiaMes,
  etiquetaMes,
  hoyDia,
  inicioMes,
  inicioSemana,
  parseDia,
  solapan,
  sumarDias,
  sumarMeses,
} from '../lib/fechas'
import { ESTADO_EVENTO_COLOR_VAR } from '../lib/domain'
import { EstadoEventoChip } from '../components/eventos/EstadoChip'
import { ClienteChip } from '../components/ClienteChip'
import type { EventoCalendario as EventoCal } from '../hooks/useCalendario'
import { ConflictoAviso } from '../components/eventos/ConflictoAviso'
import { Modal } from '../components/Modal'
import { ErrorState } from '../components/States'
import { IconAviso, IconCalendario } from '../components/icons'
import { formatFecha } from '../lib/format'
import './Calendario.css'

type Vista = 'linea' | 'mes'

/** Semanas visibles de una vez en la línea de tiempo. */
const SEMANAS = 8
const DIAS = SEMANAS * 7

/**
 * Color de la barra de un evento: el de su **cliente** (paleta apagada de S-F),
 * que es lo que se quiere reconocer de un vistazo en el calendario. Los eventos
 * sin cliente caen al color de su estado. El estado sigue leyéndose en el chip
 * del detalle y en el listado de eventos.
 */
function colorBarra(e: EventoCal): string {
  return e.cliente?.color ?? ESTADO_EVENTO_COLOR_VAR[e.estado]
}

export function Calendario() {
  const { eventos, conflictosPorEvento, cargando, error, recargar } = useCalendario()
  const [vista, setVista] = useState<Vista>('linea')
  const [ancla, setAncla] = useState(() => inicioSemana(hoyDia()))
  const [mes, setMes] = useState(() => inicioMes(hoyDia()))
  const [elegido, setElegido] = useState<EventoCalendario | null>(null)

  const hoy = hoyDia()

  // --- Línea de tiempo: ventana de 8 semanas desde `ancla` (un lunes) ---
  const finVentana = sumarDias(ancla, DIAS - 1)

  const barras = useMemo(
    () =>
      eventos
        .filter((e) => solapan(e.fecha_inicio, e.fecha_fin, ancla, finVentana))
        .map((e) => {
          // Se recorta a la ventana: un evento que empieza antes entra pegado al borde.
          const desde = Math.max(0, diasEntre(ancla, e.fecha_inicio))
          const hasta = Math.min(DIAS - 1, diasEntre(ancla, e.fecha_fin))
          return {
            evento: e,
            columna: desde + 1,
            span: Math.max(1, hasta - desde + 1),
            recortadoIzq: e.fecha_inicio < ancla,
            recortadoDer: e.fecha_fin > finVentana,
          }
        })
        .sort((a, b) => a.evento.fecha_inicio.localeCompare(b.evento.fecha_inicio)),
    [eventos, ancla, finVentana],
  )

  const semanas = Array.from({ length: SEMANAS }, (_, i) => sumarDias(ancla, i * 7))

  // --- Vista mes: rejilla desde el lunes de la semana del día 1 ---
  const celdas = useMemo(() => {
    const primero = inicioSemana(mes)
    // 6 semanas cubren cualquier mes; luego se recortan las filas sobrantes.
    return Array.from({ length: 42 }, (_, i) => {
      const dia = sumarDias(primero, i)
      return {
        dia,
        delMes: dia.slice(0, 7) === mes.slice(0, 7),
        eventos: eventos.filter((e) => solapan(e.fecha_inicio, e.fecha_fin, dia, dia)),
      }
    })
  }, [eventos, mes])

  const filasMes = useMemo(() => {
    const filas = []
    for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7))
    // Quita la última semana si no toca el mes (ningún día pertenece a él).
    while (filas.length > 4 && filas[filas.length - 1].every((c) => !c.delMes)) filas.pop()
    return filas
  }, [celdas])

  const conflictosElegido = elegido ? conflictosPorEvento.get(elegido.id) ?? [] : []

  if (error) {
    return (
      <div className="cal">
        <ErrorState mensaje={error} onReintentar={recargar} />
      </div>
    )
  }

  return (
    <div className="cal">
      <header className="cal__cab">
        <div>
          <h1>Calendario</h1>
          <p className="cal__sub">
            {cargando
              ? 'Cargando…'
              : `${eventos.length} evento${eventos.length === 1 ? '' : 's'} · ${conflictosPorEvento.size} en conflicto`}
          </p>
        </div>

        <div className="cal__controles">
          <div className="cal__vistas" role="tablist" aria-label="Vista del calendario">
            <button
              role="tab"
              aria-selected={vista === 'linea'}
              className={`cal__vista ${vista === 'linea' ? 'cal__vista--activa' : ''}`}
              onClick={() => setVista('linea')}
            >
              Línea de tiempo
            </button>
            <button
              role="tab"
              aria-selected={vista === 'mes'}
              className={`cal__vista ${vista === 'mes' ? 'cal__vista--activa' : ''}`}
              onClick={() => setVista('mes')}
            >
              Mes
            </button>
          </div>

          {vista === 'linea' ? (
            <div className="cal__nav">
              <button className="boton boton--secundario" onClick={() => setAncla(sumarDias(ancla, -28))}>
                ←
              </button>
              <span className="cal__rango">
                {etiquetaDiaMes(ancla)} — {etiquetaDiaMes(finVentana)}
              </span>
              <button className="boton boton--secundario" onClick={() => setAncla(sumarDias(ancla, 28))}>
                →
              </button>
              <button className="boton boton--secundario" onClick={() => setAncla(inicioSemana(hoy))}>
                Hoy
              </button>
            </div>
          ) : (
            <div className="cal__nav">
              <button className="boton boton--secundario" onClick={() => setMes(sumarMeses(mes, -1))}>
                ←
              </button>
              <span className="cal__rango cal__rango--mes">{etiquetaMes(mes)}</span>
              <button className="boton boton--secundario" onClick={() => setMes(sumarMeses(mes, 1))}>
                →
              </button>
              <button className="boton boton--secundario" onClick={() => setMes(inicioMes(hoy))}>
                Hoy
              </button>
            </div>
          )}
        </div>
      </header>

      {vista === 'linea' ? (
        <section className="cal__panel">
          <div className="tl">
            <div className="tl__semanas" style={{ gridTemplateColumns: `repeat(${SEMANAS}, 1fr)` }}>
              {semanas.map((s) => (
                <span key={s} className="tl__semana">
                  {etiquetaDiaMes(s)}
                </span>
              ))}
            </div>

            <div className="tl__cuerpo" style={{ gridTemplateColumns: `repeat(${DIAS}, 1fr)` }}>
              {/* Rejilla de fondo: una línea por semana. */}
              {semanas.map((s, i) => (
                <span
                  key={`g-${s}`}
                  className="tl__guia"
                  style={{ gridColumn: `${i * 7 + 1} / span 7`, gridRow: '1 / -1' }}
                />
              ))}

              {/* Marca de hoy, si cae dentro de la ventana. */}
              {hoy >= ancla && hoy <= finVentana && (
                <span
                  className="tl__hoy"
                  style={{ gridColumn: `${diasEntre(ancla, hoy) + 1} / span 1`, gridRow: '1 / -1' }}
                  aria-hidden="true"
                />
              )}

              {barras.length === 0 ? (
                <p className="tl__vacio">No hay eventos en estas semanas.</p>
              ) : (
                barras.map((b, fila) => {
                  const conf = conflictosPorEvento.get(b.evento.id) ?? []
                  return (
                    <button
                      key={b.evento.id}
                      className={`tl__barra ${conf.length ? 'tl__barra--conflicto' : ''} ${
                        b.recortadoIzq ? 'tl__barra--corte-izq' : ''
                      } ${b.recortadoDer ? 'tl__barra--corte-der' : ''}`}
                      style={{
                        gridColumn: `${b.columna} / span ${b.span}`,
                        gridRow: fila + 1,
                        ['--evento-color' as string]: colorBarra(b.evento),
                      }}
                      onClick={() => setElegido(b.evento)}
                      title={`${b.evento.nombre} · ${formatFecha(b.evento.fecha_inicio)}—${formatFecha(b.evento.fecha_fin)}`}
                    >
                      {conf.length > 0 && <IconAviso size={14} />}
                      <span className="tl__barra-nombre">{b.evento.nombre}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="cal__panel">
          <div className="mes">
            <div className="mes__dias">
              {DIAS_SEMANA.map((d, i) => (
                <span key={`${d}-${i}`} className="mes__dia-cab">
                  {d}
                </span>
              ))}
            </div>
            {filasMes.map((fila) => (
              <div key={fila[0].dia} className="mes__fila">
                {fila.map((c) => (
                  <div
                    key={c.dia}
                    className={`mes__celda ${c.delMes ? '' : 'mes__celda--fuera'} ${
                      c.dia === hoy ? 'mes__celda--hoy' : ''
                    }`}
                  >
                    <span className="mes__numero tnum">{parseDia(c.dia).getDate()}</span>
                    {c.eventos.map((e) => {
                      const conf = conflictosPorEvento.get(e.id) ?? []
                      return (
                        <button
                          key={e.id}
                          className={`mes__evento ${conf.length ? 'mes__evento--conflicto' : ''}`}
                          style={{ ['--evento-color' as string]: colorBarra(e) }}
                          onClick={() => setElegido(e)}
                          title={e.nombre}
                        >
                          {conf.length > 0 && <IconAviso size={12} />}
                          <span className="mes__evento-nombre">{e.nombre}</span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {!cargando && eventos.length === 0 && (
        <p className="cal__inicio">
          <IconCalendario size={20} />
          Aún no hay eventos. Crea el primero en{' '}
          <Link to="/eventos" className="cal__link">
            Eventos
          </Link>
          .
        </p>
      )}

      {elegido && (
        <Modal
          titulo={elegido.nombre}
          eyebrow={`${formatFecha(elegido.fecha_inicio)} — ${formatFecha(elegido.fecha_fin)}`}
          onClose={() => setElegido(null)}
        >
          <div className="cal__detalle">
            <div className="cal__detalle-meta">
              <EstadoEventoChip estado={elegido.estado} />
              {elegido.cliente ? (
                <ClienteChip
                  id={elegido.cliente.id}
                  nombre={elegido.cliente.nombre}
                  color={elegido.cliente.color}
                />
              ) : (
                <span>Sin cliente</span>
              )}
            </div>

            {conflictosElegido.length === 0 ? (
              <p className="cal__sin-conflicto">
                Sin conflictos: el material reservado para este evento está cubierto.
              </p>
            ) : (
              <ConflictoAviso conflictos={conflictosElegido} eventoId={elegido.id} />
            )}

            <Link to={`/eventos/${elegido.id}`} className="boton boton--primario cal__ir">
              Abrir ficha del evento
            </Link>
          </div>
        </Modal>
      )}
    </div>
  )
}
