import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Categoria } from '../lib/domain'
import { useRealtime } from './useRealtime'

/** Categoría + cuántos productos la usan (para avisar antes de borrarla). */
export interface CategoriaFila extends Categoria {
  productos: number
}

export interface CategoriasState {
  categorias: CategoriaFila[]
  /** Productos que hoy están sin categoría. */
  sinCategoria: number
  cargando: boolean
  error: string | null
  recargar: () => void
}

/**
 * Categorías con el número de productos de cada una. La gestión (crear, editar,
 * eliminar) está abierta a cualquier usuario autenticado (CONTRACTS §1.3).
 */
export function useCategorias(): CategoriasState {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<{ categoria_id: string | null }[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current
    const [cat, prod] = await Promise.all([
      supabase.from('categoria').select('*').order('nombre', { ascending: true }),
      supabase.from('producto').select('categoria_id'),
    ])
    if (id !== cargaRef.current) return

    const err = cat.error || prod.error
    if (err) {
      setError(err.message)
      setCargando(false)
      return
    }
    setError(null)
    setCategorias(cat.data ?? [])
    setProductos(prod.data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['categoria', 'producto'], cargar)

  const { filas, sinCategoria } = useMemo(() => {
    const cuenta = new Map<string, number>()
    let sin = 0
    for (const p of productos) {
      if (!p.categoria_id) sin += 1
      else cuenta.set(p.categoria_id, (cuenta.get(p.categoria_id) ?? 0) + 1)
    }
    return {
      filas: categorias.map((c) => ({ ...c, productos: cuenta.get(c.id) ?? 0 })),
      sinCategoria: sin,
    }
  }, [categorias, productos])

  return { categorias: filas, sinCategoria, cargando, error, recargar: () => void cargar() }
}
