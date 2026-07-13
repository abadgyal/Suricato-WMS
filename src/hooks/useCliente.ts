import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Categoria, Cliente, Evento, ProductoDisponible, Reserva } from '../lib/domain'
import type { Database } from '../types/database'
import { hoyDia } from '../lib/fechas'
import { useRealtime } from './useRealtime'

/** Fila del historial del cliente (vista `v_movimiento_cliente`, S-F). */
export type MovimientoCliente = Database['public']['Views']['v_movimiento_cliente']['Row']

/** Una línea de material: qué producto y cuántas unidades. */
export interface LineaMaterial {
  producto_id: string
  unidades: number
  producto: ProductoDisponible | null
}

/** Evento del cliente con su material (fuera ahora, o reservado si es futuro). */
export interface EventoCliente extends Evento {
  /** Material fuera ahora mismo (v_unidades_fuera_evento). Solo en los "en curso". */
  fuera: LineaMaterial[]
  /** Unidades reservadas y aún activas (eventos próximos). */
  reservado: LineaMaterial[]
}

export interface ClienteState {
  cliente: Cliente | null
  /** Eventos con material fuera **ahora**: "¿qué le he dejado a este cliente?". */
  enCurso: EventoCliente[]
  /** Planificados y aún no terminados, con su material reservado. */
  proximos: EventoCliente[]
  /** Cerrados o cancelados (histórico). */
  pasados: EventoCliente[]
  /** Productos asignados al cliente (`producto.cliente_id`, DOMAIN §6). */
  asignados: ProductoDisponible[]
  /** Movimientos asociados al cliente (suyos, de sus eventos o de su material). */
  historial: MovimientoCliente[]
  categorias: Map<string, Categoria>
  cargando: boolean
  error: string | null
  recargar: () => void
}

const LIMITE_HISTORIAL = 200

export function useCliente(clienteId: string | undefined): ClienteState {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [fuera, setFuera] = useState<{ evento_id: string; producto_id: string; unidades: number }[]>(
    [],
  )
  const [productos, setProductos] = useState<ProductoDisponible[]>([])
  const [historial, setHistorial] = useState<MovimientoCliente[]>([])
  const [categorias, setCategorias] = useState<Map<string, Categoria>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    if (!clienteId) return
    const id = ++cargaRef.current

    const cli = await supabase.from('cliente').select('*').eq('id', clienteId).maybeSingle()
    if (id !== cargaRef.current) return
    if (cli.error) {
      setError(cli.error.message)
      setCargando(false)
      return
    }

    const eventosCliente = await supabase
      .from('evento')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha_inicio', { ascending: false })
    if (id !== cargaRef.current) return
    if (eventosCliente.error) {
      setError(eventosCliente.error.message)
      setCargando(false)
      return
    }

    const ids = (eventosCliente.data ?? []).map((e) => e.id)

    const [res, fue, prod, mov, cat] = await Promise.all([
      ids.length
        ? supabase.from('reserva').select('*').in('evento_id', ids).eq('estado', 'activa')
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? supabase.from('v_unidades_fuera_evento').select('*').in('evento_id', ids)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('v_producto_disponible').select('*').order('nombre', { ascending: true }),
      supabase
        .from('v_movimiento_cliente')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('creado_en', { ascending: false })
        .limit(LIMITE_HISTORIAL),
      supabase.from('categoria').select('*'),
    ])

    if (id !== cargaRef.current) return

    const err = res.error || fue.error || prod.error || mov.error || cat.error
    if (err) {
      setError(err.message)
      setCargando(false)
      return
    }

    setError(null)
    setCliente(cli.data ?? null)
    setEventos(eventosCliente.data ?? [])
    setReservas((res.data ?? []) as Reserva[])
    setFuera(
      ((fue.data ?? []) as { evento_id: string; producto_id: string; unidades_fuera: number }[]).map(
        (f) => ({ evento_id: f.evento_id, producto_id: f.producto_id, unidades: f.unidades_fuera }),
      ),
    )
    setProductos(prod.data ?? [])
    setHistorial((mov.data ?? []) as MovimientoCliente[])
    setCategorias(new Map((cat.data ?? []).map((c) => [c.id, c])))
    setCargando(false)
  }, [clienteId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['cliente', 'evento', 'reserva', 'movimiento', 'producto'], cargar)

  const { enCurso, proximos, pasados } = useMemo(() => {
    const porId = new Map(productos.map((p) => [p.id ?? '', p]))
    const hoy = hoyDia()

    const conMaterial: EventoCliente[] = eventos.map((e) => ({
      ...e,
      fuera: fuera
        .filter((f) => f.evento_id === e.id)
        .map((f) => ({
          producto_id: f.producto_id,
          unidades: f.unidades,
          producto: porId.get(f.producto_id) ?? null,
        }))
        .sort((a, b) => (a.producto?.nombre ?? '').localeCompare(b.producto?.nombre ?? '', 'es')),
      reservado: reservas
        .filter((r) => r.evento_id === e.id)
        .map((r) => ({
          producto_id: r.producto_id,
          unidades: r.unidades,
          producto: porId.get(r.producto_id) ?? null,
        }))
        .sort((a, b) => (a.producto?.nombre ?? '').localeCompare(b.producto?.nombre ?? '', 'es')),
    }))

    return {
      // "En curso" es una realidad física, no un estado: hay material suyo fuera.
      enCurso: conMaterial
        .filter((e) => e.fuera.length > 0)
        .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)),
      // Próximos: aún vivos y sin material fuera (el que tengan es el reservado).
      proximos: conMaterial
        .filter(
          (e) =>
            e.fuera.length === 0 &&
            (e.estado === 'planificado' || e.estado === 'en_curso') &&
            e.fecha_fin >= hoy,
        )
        .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)),
      // Pasados: cerrados, cancelados o ya vencidos, y sin nada fuera. Con estas
      // tres reglas cada evento cae exactamente en un grupo.
      pasados: conMaterial
        .filter(
          (e) =>
            e.fuera.length === 0 &&
            (e.estado === 'cerrado' || e.estado === 'cancelado' || e.fecha_fin < hoy),
        )
        .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio)),
    }
  }, [eventos, fuera, reservas, productos])

  const asignados = useMemo(
    () => productos.filter((p) => p.cliente_id === clienteId),
    [productos, clienteId],
  )

  return {
    cliente,
    enCurso,
    proximos,
    pasados,
    asignados,
    historial,
    categorias,
    cargando,
    error,
    recargar: () => void cargar(),
  }
}
