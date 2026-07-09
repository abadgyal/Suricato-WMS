import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Categoria, Cliente, Evento, ProductoDisponible } from '../lib/domain'
import { useRealtime } from './useRealtime'

export interface Catalogo {
  productos: ProductoDisponible[]
  categorias: Categoria[]
  eventos: Evento[]
  clientes: Cliente[]
  cargando: boolean
  error: string | null
  /** Relee todo (tras una mutación o un cambio en vivo). */
  recargar: () => void
}

/**
 * Carga los datos que necesitan los formularios de movimiento: productos (con
 * `disponible_real`), categorías, eventos y clientes. Se refresca en vivo ante
 * cambios en `producto` (Realtime) y a demanda tras cada operación.
 */
export function useCatalogo(): Catalogo {
  const [productos, setProductos] = useState<ProductoDisponible[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current
    const [prod, cat, evt, cli] = await Promise.all([
      supabase.from('v_producto_disponible').select('*').order('nombre', { ascending: true }),
      supabase.from('categoria').select('*').order('nombre', { ascending: true }),
      supabase.from('evento').select('*').order('fecha_inicio', { ascending: false }),
      supabase.from('cliente').select('*').order('nombre', { ascending: true }),
    ])
    if (id !== cargaRef.current) return

    const err = prod.error || cat.error || evt.error || cli.error
    if (err) {
      setError(err.message)
    } else {
      setError(null)
      setProductos(prod.data ?? [])
      setCategorias(cat.data ?? [])
      setEventos(evt.data ?? [])
      setClientes(cli.data ?? [])
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['producto'], cargar)

  return { productos, categorias, eventos, clientes, cargando, error, recargar: () => void cargar() }
}
