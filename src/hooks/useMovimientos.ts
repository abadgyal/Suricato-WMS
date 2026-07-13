import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Movimiento } from '../lib/domain'
import { useRealtime } from './useRealtime'

/** Cliente resuelto por join, con lo justo para pintar su chip de color. */
export interface ClienteRef {
  id: string
  nombre: string
  color: string
}

/** Fila de movimiento con los nombres ya resueltos por join (para el historial). */
export interface MovimientoConJoins extends Movimiento {
  producto: { nombre: string | null; foto_path: string | null; cliente: ClienteRef | null } | null
  usuario: { nombre: string | null } | null
  cliente: ClienteRef | null
  evento: { nombre: string | null; cliente: ClienteRef | null } | null
}

const CLIENTE = 'cliente:cliente_id(id, nombre, color)'

const SELECT =
  `*, producto:producto_id(nombre, foto_path, ${CLIENTE}), usuario:usuario_id(nombre), ` +
  `${CLIENTE}, evento:evento_id(nombre, ${CLIENTE})`

/**
 * Cliente al que se asocia un movimiento. Misma precedencia que la vista
 * `v_movimiento_cliente` (S-F): lo que diga el propio movimiento, si no el
 * cliente de su evento, y si no el del producto asignado.
 */
export function clienteDeMovimiento(m: MovimientoConJoins): ClienteRef | null {
  return m.cliente ?? m.evento?.cliente ?? m.producto?.cliente ?? null
}

export interface HistorialState {
  movimientos: MovimientoConJoins[]
  cargando: boolean
  error: string | null
  recargar: () => void
}

/**
 * Lee el log de `movimiento` (inmutable) con los nombres de producto, usuario,
 * cliente y evento resueltos por join, ordenado del más reciente al más antiguo.
 * Se refresca en vivo ante nuevos movimientos (Realtime sobre `movimiento`).
 */
export function useMovimientos(limite = 500): HistorialState {
  const [movimientos, setMovimientos] = useState<MovimientoConJoins[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current
    const { data, error: err } = await supabase
      .from('movimiento')
      .select(SELECT)
      .order('creado_en', { ascending: false })
      .limit(limite)

    if (id !== cargaRef.current) return
    if (err) {
      setError(err.message)
    } else {
      setError(null)
      setMovimientos((data ?? []) as unknown as MovimientoConJoins[])
    }
    setCargando(false)
  }, [limite])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['movimiento'], cargar)

  return { movimientos, cargando, error, recargar: () => void cargar() }
}
