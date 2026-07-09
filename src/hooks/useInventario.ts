import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Categoria, ProductoDisponible } from '../lib/domain'

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
 * Lee el inventario de la vista `v_producto_disponible` + las categorías, y se
 * suscribe por Realtime a la tabla `producto`. Las vistas no emiten Realtime, así
 * que escuchamos la tabla base y revalidamos la vista ante cualquier cambio
 * (INSERT/UPDATE/DELETE) hecho desde cualquier cliente.
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

    // Revalidación con pequeño debounce: varias mutaciones seguidas (p. ej. una
    // RPC que toca varias filas) disparan una sola relectura.
    let debounce: ReturnType<typeof setTimeout> | undefined
    const revalidar = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void cargar(), 250)
    }

    const canal = supabase
      .channel('inventario-producto')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'producto' }, revalidar)
      .subscribe()

    return () => {
      clearTimeout(debounce)
      void supabase.removeChannel(canal)
    }
  }, [cargar])

  return { productos, categorias, cargando, error, recargar: () => void cargar(), actualizando }
}
