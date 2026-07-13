import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ProductoDisponible, Views } from '../lib/domain'
import { useRealtime } from './useRealtime'

export type StockCategoria = Views['v_stock_por_categoria']['Row']

export interface DashboardMetricas {
  referencias: number
  /** Unidades en stock = suma del total operativo (disponible+en_evento+en_reparacion). */
  unidadesStock: number
  movimientosHoy: number
  reservasActivas: number
  clientes: number
}

export interface DashboardState {
  metricas: DashboardMetricas
  /** Productos por debajo del mínimo (disponible_real ≤ stock_minimo). */
  bajoMinimo: ProductoDisponible[]
  categorias: StockCategoria[]
  cargando: boolean
  error: string | null
  recargar: () => void
}

const METRICAS_VACIAS: DashboardMetricas = {
  referencias: 0,
  unidadesStock: 0,
  movimientosHoy: 0,
  reservasActivas: 0,
  clientes: 0,
}

/**
 * Reúne los datos del panel (SPEC §2/§3). No hay vista de métricas en la BD, así
 * que se agregan en cliente a partir de la vista de inventario, la vista de stock
 * por categoría y conteos de movimientos de hoy, reservas activas y clientes.
 * Se refresca en vivo ante cambios en producto y movimiento.
 */
export function useDashboard(): DashboardState {
  const [metricas, setMetricas] = useState<DashboardMetricas>(METRICAS_VACIAS)
  const [bajoMinimo, setBajoMinimo] = useState<ProductoDisponible[]>([])
  const [categorias, setCategorias] = useState<StockCategoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current

    const inicioDia = new Date()
    inicioDia.setHours(0, 0, 0, 0)

    const [prod, cat, movHoy, reservas, clientes] = await Promise.all([
      supabase.from('v_producto_disponible').select('*'),
      supabase.from('v_stock_por_categoria').select('*').order('total', { ascending: false }),
      supabase
        .from('movimiento')
        .select('id', { count: 'exact', head: true })
        .gte('creado_en', inicioDia.toISOString()),
      supabase
        .from('reserva')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'activa'),
      supabase.from('cliente').select('id', { count: 'exact', head: true }),
    ])

    if (id !== cargaRef.current) return

    const err =
      prod.error || cat.error || movHoy.error || reservas.error || clientes.error
    if (err) {
      setError(err.message)
      setCargando(false)
      return
    }

    const productos = prod.data ?? []
    setError(null)
    setMetricas({
      referencias: productos.length,
      unidadesStock: productos.reduce((s, p) => s + (p.total ?? 0), 0),
      movimientosHoy: movHoy.count ?? 0,
      reservasActivas: reservas.count ?? 0,
      clientes: clientes.count ?? 0,
    })
    setBajoMinimo(productos.filter((p) => p.bajo_minimo))
    setCategorias(cat.data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['producto', 'movimiento'], cargar)

  return { metricas, bajoMinimo, categorias, cargando, error, recargar: () => void cargar() }
}
