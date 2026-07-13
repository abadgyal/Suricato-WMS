import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Cliente } from '../lib/domain'
import { hoyDia } from '../lib/fechas'
import { useRealtime } from './useRealtime'

/** Cliente + lo que se ve de un vistazo en el listado (SPEC §11). */
export interface ClienteFila extends Cliente {
  /** Eventos suyos con material fuera **ahora mismo** (v_unidades_fuera_evento). */
  eventosEnCurso: number
  /** Eventos planificados que aún no han terminado. */
  eventosProximos: number
}

export interface ClientesState {
  clientes: ClienteFila[]
  cargando: boolean
  error: string | null
  recargar: () => void
}

/**
 * Cartera de clientes en **lista plana** (decisión de S-F: no hay árbol; los
 * "hijos" de un cliente son sus eventos, no otros clientes — `cliente.parent_id`
 * sigue en la BD pero la UI lo ignora).
 *
 * Cada fila trae dos señales: si tiene material fuera ahora (eventos en curso) y
 * cuántos eventos próximos hay planificados.
 */
export function useClientes(): ClientesState {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [eventosEnCursoPorCliente, setEnCurso] = useState<Map<string, number>>(new Map())
  const [eventosProximosPorCliente, setProximos] = useState<Map<string, number>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current
    const hoy = hoyDia()

    const [cli, evt, fue] = await Promise.all([
      supabase.from('cliente').select('*').order('nombre', { ascending: true }),
      supabase.from('evento').select('id, cliente_id, estado, fecha_fin'),
      supabase.from('v_unidades_fuera_evento').select('evento_id'),
    ])

    if (id !== cargaRef.current) return

    const err = cli.error || evt.error || fue.error
    if (err) {
      setError(err.message)
      setCargando(false)
      return
    }

    // Eventos con material fuera ahora mismo: los que aparecen en la vista.
    const conMaterialFuera = new Set((fue.data ?? []).map((f) => f.evento_id))

    const enCurso = new Map<string, number>()
    const proximos = new Map<string, number>()
    for (const e of evt.data ?? []) {
      if (!e.cliente_id) continue
      if (conMaterialFuera.has(e.id)) {
        enCurso.set(e.cliente_id, (enCurso.get(e.cliente_id) ?? 0) + 1)
      } else if (e.estado === 'planificado' && e.fecha_fin >= hoy) {
        proximos.set(e.cliente_id, (proximos.get(e.cliente_id) ?? 0) + 1)
      }
    }

    setError(null)
    setClientes(cli.data ?? [])
    setEnCurso(enCurso)
    setProximos(proximos)
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['cliente', 'evento', 'movimiento'], cargar)

  const filas = useMemo(
    () =>
      clientes.map((c) => ({
        ...c,
        eventosEnCurso: eventosEnCursoPorCliente.get(c.id) ?? 0,
        eventosProximos: eventosProximosPorCliente.get(c.id) ?? 0,
      })),
    [clientes, eventosEnCursoPorCliente, eventosProximosPorCliente],
  )

  return { clientes: filas, cargando, error, recargar: () => void cargar() }
}
