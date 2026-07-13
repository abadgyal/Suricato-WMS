import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Categoria, ProductoDisponible } from '../lib/domain'
import { useRealtime } from './useRealtime'

export interface InventarioState {
  productos: ProductoDisponible[]
  /** Categorías indexadas por id, para resolver chips y filtros. */
  categorias: Map<string, Categoria>
  cargando: boolean
  error: string | null
  /** Vuelve a leer el inventario (usado por el botón de reintentar). */
  recargar: () => void
  /** `true` cuando llega un cambio por Realtime y se está revalidando. */
  actualizando: boolean
}

/**
 * Lee el inventario de la vista `v_producto_disponible` + las categorías y lo
 * mantiene vivo por Realtime. Las vistas no emiten Realtime, así que se escuchan
 * las tablas base y se revalida la vista entera ante cualquier cambio:
 *
 *   * `producto` — los buckets (entradas, salidas, ajustes, bajas).
 *   * `reserva`  — una reserva no toca `producto`, pero cambia `disponible_real`
 *     y con él la alerta de stock mínimo (DOMAIN §1). Sin esto, reservar desde
 *     otra pantalla dejaba el inventario mintiendo hasta recargar (S-E).
 *
 * La suscripción autenticada y la re-suscripción por sesión las resuelve
 * `useRealtime` (deuda [S-D]: antes esto tenía su propia copia del canal).
 */
export function useInventario(): InventarioState {
  const [productos, setProductos] = useState<ProductoDisponible[]>([])
  const [categorias, setCategorias] = useState<Map<string, Categoria>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Evita condiciones de carrera entre recargas encadenadas.
  const cargaRef = useRef(0)
  const primeraCargaRef = useRef(true)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current
    if (primeraCargaRef.current) setCargando(true)
    else setActualizando(true)

    const [prodRes, catRes] = await Promise.all([
      supabase.from('v_producto_disponible').select('*').order('nombre', { ascending: true }),
      supabase.from('categoria').select('*'),
    ])

    // Descarta si otra recarga más reciente ya empezó.
    if (id !== cargaRef.current) return

    if (prodRes.error || catRes.error) {
      const msg = prodRes.error?.message ?? catRes.error?.message ?? 'Error desconocido'
      setError(
        `${msg}. Revisa tu conexión y que la sesión siga activa; si persiste, vuelve a iniciar sesión.`,
      )
    } else {
      setError(null)
      setProductos(prodRes.data ?? [])
      setCategorias(new Map((catRes.data ?? []).map((c) => [c.id, c])))
    }

    primeraCargaRef.current = false
    setCargando(false)
    setActualizando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Revalidación con pequeño debounce: varias mutaciones seguidas (p. ej. un
  // cumplir_evento que mueve varias filas) disparan una sola relectura.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const revalidar = useCallback(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void cargar(), 250)
  }, [cargar])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  useRealtime(['producto', 'reserva'], revalidar)

  return { productos, categorias, cargando, error, recargar: () => void cargar(), actualizando }
}
