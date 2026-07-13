import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ConflictoReserva, Evento } from '../lib/domain'
import { useRealtime } from './useRealtime'

export interface EventoCalendario extends Evento {
  cliente: { id: string; nombre: string } | null
}

export interface CalendarioState {
  eventos: EventoCalendario[]
  conflictos: ConflictoReserva[]
  /** Conflictos indexados por evento (cada conflicto aparece en sus dos eventos). */
  conflictosPorEvento: Map<string, ConflictoReserva[]>
  cargando: boolean
  error: string | null
  recargar: () => void
}

/**
 * Eventos y conflictos de reserva para el calendario (SPEC §9).
 *
 * `v_conflictos_reserva` (CONTRACTS §4) devuelve pares de eventos con rangos de
 * fecha solapados que reservan el mismo producto por encima de lo que hay. Un
 * conflicto **avisa, no bloquea**: se marca en el calendario y el usuario decide.
 */
export function useCalendario(): CalendarioState {
  const [eventos, setEventos] = useState<EventoCalendario[]>([])
  const [conflictos, setConflictos] = useState<ConflictoReserva[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current

    const [evt, con] = await Promise.all([
      supabase
        .from('evento')
        .select('*, cliente:cliente_id(id, nombre)')
        .order('fecha_inicio', { ascending: true }),
      supabase.from('v_conflictos_reserva').select('*'),
    ])

    if (id !== cargaRef.current) return

    const err = evt.error || con.error
    if (err) {
      setError(err.message)
      setCargando(false)
      return
    }

    setError(null)
    setEventos((evt.data ?? []) as unknown as EventoCalendario[])
    setConflictos(con.data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['evento', 'reserva', 'producto'], cargar)

  const conflictosPorEvento = useMemo(() => {
    const mapa = new Map<string, ConflictoReserva[]>()
    for (const c of conflictos) {
      for (const id of [c.evento_a, c.evento_b]) {
        if (!id) continue
        const lista = mapa.get(id) ?? []
        lista.push(c)
        mapa.set(id, lista)
      }
    }
    return mapa
  }, [conflictos])

  return { eventos, conflictos, conflictosPorEvento, cargando, error, recargar: () => void cargar() }
}
