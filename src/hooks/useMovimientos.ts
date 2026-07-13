import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Movimiento } from '../lib/domain'
import { useRealtime } from './useRealtime'

/** Fila de movimiento con los nombres ya resueltos por join (para el historial). */
export interface MovimientoConJoins extends Movimiento {
  producto: { nombre: string | null; foto_path: string | null } | null
  usuario: { nombre: string | null } | null
  cliente: { nombre: string | null } | null
  evento: { nombre: string | null } | null
}

const SELECT =
  '*, producto:producto_id(nombre, foto_path), usuario:usuario_id(nombre), cliente:cliente_id(nombre), evento:evento_id(nombre)'

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
