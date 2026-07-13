import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Categoria,
  Cliente,
  ConflictoReserva,
  Evento,
  ProductoDisponible,
  Reserva,
} from '../lib/domain'
import { useRealtime } from './useRealtime'

/** Datos del producto que necesitan la ficha, el check-in y la hoja de carga. */
export interface ProductoRef {
  id: string
  nombre: string
  ubicacion: string | null
  categoria_id: string
  foto_path: string | null
}

/** Línea de reserva con su producto resuelto. */
export interface ReservaLinea extends Reserva {
  producto: ProductoRef | null
}

/** Línea de material que salió al evento y todavía no ha vuelto. */
export interface FueraLinea {
  producto_id: string
  unidades_fuera: number
  producto: ProductoRef | null
}

export interface EventoConCliente extends Evento {
  cliente: Cliente | null
}

export interface EventoState {
  evento: EventoConCliente | null
  /** Todas las líneas de reserva del evento (activas, cumplidas y canceladas). */
  reservas: ReservaLinea[]
  /** Material aún fuera (v_unidades_fuera_evento). */
  fuera: FueraLinea[]
  /** Conflictos de calendario en los que participa este evento. */
  conflictos: ConflictoReserva[]
  /** Catálogo para el formulario de reserva (con `disponible_real`). */
  productos: ProductoDisponible[]
  categorias: Map<string, Categoria>
  /** Cartera completa, para poder reasignar el cliente del evento al editarlo. */
  clientes: Cliente[]
  cargando: boolean
  error: string | null
  recargar: () => void
}

const SELECT_PRODUCTO = 'id, nombre, ubicacion, categoria_id, foto_path'

/**
 * Todo lo que muestra la ficha de un evento: sus datos, sus líneas de reserva,
 * el material que tiene fuera, sus conflictos de calendario y el catálogo para
 * poder añadir reservas nuevas.
 *
 * Se refresca en vivo ante cambios en evento, reserva, movimiento y producto:
 * dos operarios pueden estar preparando el mismo evento a la vez.
 */
export function useEvento(eventoId: string | undefined): EventoState {
  const [evento, setEvento] = useState<EventoConCliente | null>(null)
  const [reservas, setReservas] = useState<ReservaLinea[]>([])
  const [fuera, setFuera] = useState<FueraLinea[]>([])
  const [conflictos, setConflictos] = useState<ConflictoReserva[]>([])
  const [productos, setProductos] = useState<ProductoDisponible[]>([])
  const [categorias, setCategorias] = useState<Map<string, Categoria>>(new Map())
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    if (!eventoId) return
    const id = ++cargaRef.current

    const [evt, res, fue, con, prod, cat, cli] = await Promise.all([
      supabase.from('evento').select('*, cliente:cliente_id(*)').eq('id', eventoId).maybeSingle(),
      supabase
        .from('reserva')
        .select(`*, producto:producto_id(${SELECT_PRODUCTO})`)
        .eq('evento_id', eventoId)
        .order('creado_en', { ascending: true }),
      supabase
        .from('v_unidades_fuera_evento')
        .select(`producto_id, unidades_fuera, producto:producto_id(${SELECT_PRODUCTO})`)
        .eq('evento_id', eventoId),
      supabase
        .from('v_conflictos_reserva')
        .select('*')
        .or(`evento_a.eq.${eventoId},evento_b.eq.${eventoId}`),
      supabase.from('v_producto_disponible').select('*').order('nombre', { ascending: true }),
      supabase.from('categoria').select('*'),
      supabase.from('cliente').select('*').order('nombre', { ascending: true }),
    ])

    if (id !== cargaRef.current) return

    const err =
      evt.error || res.error || fue.error || con.error || prod.error || cat.error || cli.error
    if (err) {
      setError(err.message)
      setCargando(false)
      return
    }

    setError(null)
    setEvento((evt.data ?? null) as unknown as EventoConCliente | null)
    setReservas((res.data ?? []) as unknown as ReservaLinea[])
    setFuera((fue.data ?? []) as unknown as FueraLinea[])
    setConflictos(con.data ?? [])
    setProductos(prod.data ?? [])
    setCategorias(new Map((cat.data ?? []).map((c) => [c.id, c])))
    setClientes(cli.data ?? [])
    setCargando(false)
  }, [eventoId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useRealtime(['evento', 'reserva', 'movimiento', 'producto'], cargar)

  return {
    evento,
    reservas,
    fuera,
    conflictos,
    productos,
    categorias,
    clientes,
    cargando,
    error,
    recargar: () => void cargar(),
  }
}
