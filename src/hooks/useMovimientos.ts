import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Movimiento, TipoMovimiento } from '../lib/domain'
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

export interface HistorialPaginado {
  movimientos: MovimientoConJoins[]
  /** Primera carga (o recarga tras cambiar de tipo). */
  cargando: boolean
  /** Cargando la siguiente página con «Cargar más». */
  cargandoMas: boolean
  error: string | null
  /** Quedan movimientos por cargar más allá de los ya leídos. */
  hayMas: boolean
  /** Total de movimientos del tipo activo en la BD (para el contador). */
  total: number | null
  cargarMas: () => void
  recargar: () => void
}

/**
 * Historial paginado por «ventana creciente»: lee siempre el rango
 * `[0, páginas·tamaño)` de `movimiento` ordenado por fecha desc. «Cargar más»
 * amplía la ventana; un cambio por Realtime revalida la ventana actual (así los
 * movimientos nuevos aparecen arriba sin duplicar ni descuadrar el conteo).
 *
 * El filtro de **tipo** se empuja a la BD (`eq('tipo', …)`) para que recorra todo
 * el histórico, no solo lo ya cargado. La búsqueda por texto se aplica en cliente
 * sobre lo cargado (deuda [S-D]: paginación sustituye al viejo `.limit(500)`).
 */
export function useHistorial(tipo: TipoMovimiento | null, tamanoPagina = 100): HistorialPaginado {
  const [movimientos, setMovimientos] = useState<MovimientoConJoins[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const cargaRef = useRef(0)
  const paginasRef = useRef(1)

  const leer = useCallback(
    async (paginas: number, esMas: boolean) => {
      const id = ++cargaRef.current
      if (esMas) setCargandoMas(true)

      let q = supabase
        .from('movimiento')
        .select(SELECT, { count: 'exact' })
        .order('creado_en', { ascending: false })
        .range(0, paginas * tamanoPagina - 1)
      if (tipo) q = q.eq('tipo', tipo)

      const { data, error: err, count } = await q

      if (id !== cargaRef.current) return
      if (err) {
        setError(err.message)
      } else {
        setError(null)
        setMovimientos((data ?? []) as unknown as MovimientoConJoins[])
        setTotal(count ?? null)
      }
      setCargando(false)
      setCargandoMas(false)
    },
    [tipo, tamanoPagina],
  )

  // Al cambiar de tipo (o al montar) se reinicia la ventana a la primera página.
  useEffect(() => {
    paginasRef.current = 1
    setCargando(true)
    void leer(1, false)
  }, [leer])

  const cargarMas = useCallback(() => {
    paginasRef.current += 1
    void leer(paginasRef.current, true)
  }, [leer])

  const recargar = useCallback(() => void leer(paginasRef.current, false), [leer])

  useRealtime(['movimiento'], recargar)

  const hayMas = total != null && movimientos.length < total
  return { movimientos, cargando, cargandoMas, error, hayMas, total, cargarMas, recargar }
}
