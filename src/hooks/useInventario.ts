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
 *
 * `producto` tiene RLS: para que el canal reciba los cambios hay que autenticar
 * el socket de Realtime con el token del usuario (`realtime.setAuth`). Sin esto
 * el canal va como `anon` y RLS no deja ver ninguna fila, así que no llega nada.
 * Nos re-suscribimos si la sesión cambia (login / refresco de token / logout).
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

    let canal: ReturnType<typeof supabase.channel> | null = null
    let cancelado = false

    // Autentica el socket de Realtime con el token de la sesión y (re)crea el
    // canal. Se llama al montar y cada vez que cambia la sesión.
    async function conectarRealtime() {
      if (canal) {
        await supabase.removeChannel(canal)
        canal = null
      }
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token || cancelado) return

      // Token del usuario → el canal se une autenticado y RLS de `producto`
      // deja pasar los cambios (postgres_changes se autoriza con este token).
      await supabase.realtime.setAuth(token)
      if (cancelado) return

      canal = supabase
        .channel('inventario-producto')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'producto' }, revalidar)
        .subscribe()
    }

    void conectarRealtime()

    // Re-suscribe si la sesión cambia (login, refresco de token, logout).
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void conectarRealtime()
    })

    return () => {
      cancelado = true
      clearTimeout(debounce)
      sub.subscription.unsubscribe()
      if (canal) void supabase.removeChannel(canal)
    }
  }, [cargar])

  return { productos, categorias, cargando, error, recargar: () => void cargar(), actualizando }
}
