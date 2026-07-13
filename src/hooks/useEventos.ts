import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Cliente, Evento } from '../lib/domain'
import { useRealtime } from './useRealtime'

/** Evento del listado, con su cliente y el resumen de material comprometido. */
export interface EventoResumen extends Evento {
  cliente: { id: string; nombre: string } | null
  /** Líneas de reserva todavía activas. */
  lineasActivas: number
  /** Unidades bloqueadas por esas reservas (aún en el almacén). */
  unidadesReservadas: number
  /** Unidades ya fuera en este evento (salieron y no han vuelto). */
  unidadesFuera: number
}

export interface EventosState {
  eventos: EventoResumen[]
  clientes: Cliente[]
  cargando: boolean
  error: string | null
  recargar: () => void
}

/**
 * Listado de eventos con su cliente, sus reservas activas y el material que
 * tienen fuera. Los agregados se calculan en cliente sobre `reserva` y
 * `v_unidades_fuera_evento` (dos lecturas pequeñas) en vez de una vista nueva.
 *
 * Se refresca en vivo ante cambios en evento, reserva y movimiento: cualquiera
 * de los tres cambia lo que muestra esta pantalla.
 */
export function useEventos(): EventosState {
  const [eventos, setEventos] = useState<EventoResumen[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current

    const [evt, cli, res, fuera] = await Promise.all([
      supabase
        .from('evento')
        .select('*, cliente:cliente_id(id, nombre)')
        .order('fecha_inicio', { ascending: false }),
      supabase.from('cliente').select('*').order('nombre', { ascending: true }),
      supabase.from('reserva').select('evento_id, unidades, estado').eq('estado', 'activa'),
      supabase.from('v_unidades_fuera_evento').select('evento_id, unidades_fuera'),
    ])

    if (id !== cargaRef.current) return

    const err = evt.error || cli.error || res.error || fuera.error
    if (err) {
      setError(err.message)
      setCargando(false)
      return
    }

    const reservasPorEvento = new Map<string, { lineas: number; unidades: number }>()
    for (const r of res.data ?? []) {
      const acc = reservasPorEvento.get(r.evento_id) ?? { lineas: 0, unidades: 0 }
      acc.lineas += 1
      acc.unidades += r.unidades
      reservasPorEvento.set(r.evento_id, acc)
    }

    const fueraPorEvento = new Map<string, number>()
    for (const f of fuera.data ?? []) {
      if (!f.evento_id) continue
      fueraPorEvento.set(f.evento_id, (fueraPorEvento.get(f.evento_id) ?? 0) + (f.unidades_fuera ?? 0))
    }

    setError(null)
    setEventos(
      ((evt.data ?? []) as unknown as (Evento & { cliente: { id: string; nombre: string } | null })[]).map(
        (e) => ({
          ...e,
          lineasActivas: reservasPorEvento.get(e.id)?.lineas ?? 0,
          unidadesReservadas: reservasPorEvento.get(e.id)?.unidades ?? 0,
          unidadesFuera: fueraPorEvento.get(e.id) ?? 0,
        }),
      ),
    )
    setClientes(cli.data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['evento', 'reserva', 'movimiento'], cargar)

  return { eventos, clientes, cargando, error, recargar: () => void cargar() }
}
