/**
 * Alias de tipos del dominio derivados de los tipos generados de la BD
 * (`src/types/database.ts`). Úsalos en todo el acceso a datos para que el
 * frontend hable el mismo idioma que el esquema.
 */
import type { Database } from '../types/database'

export type Tables = Database['public']['Tables']
export type Views = Database['public']['Views']
export type Enums = Database['public']['Enums']

/** Fila de inventario: producto + disponible_real + total + bajo_minimo (vista). */
export type ProductoDisponible = Views['v_producto_disponible']['Row']

export type Categoria = Tables['categoria']['Row']
export type Perfil = Tables['perfil']['Row']
export type Cliente = Tables['cliente']['Row']
export type Evento = Tables['evento']['Row']
export type Reserva = Tables['reserva']['Row']
export type Movimiento = Tables['movimiento']['Row']
export type Rol = Enums['rol']

/** Material aún fuera por par producto–evento (CONTRACTS §1.4/§4). */
export type UnidadesFuera = Views['v_unidades_fuera_evento']['Row']

/** Par de eventos solapados que sobre-reservan un producto (CONTRACTS §4). */
export type ConflictoReserva = Views['v_conflictos_reserva']['Row']

/** Ciclo de vida de un evento (DOMAIN §3.5). */
export type EstadoEvento = Enums['estado_evento']

export const ESTADO_EVENTO_LABEL: Record<EstadoEvento, string> = {
  planificado: 'Planificado',
  en_curso: 'En curso',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
}

/** Color del chip de estado del evento (variables de tokens.css). */
export const ESTADO_EVENTO_COLOR_VAR: Record<EstadoEvento, string> = {
  planificado: 'var(--color-accent)',
  en_curso: 'var(--bucket-en-evento)',
  cerrado: 'var(--color-text-secondary)',
  cancelado: 'var(--bucket-baja)',
}

/** Estado de una línea de reserva (DOMAIN §3.6). */
export type EstadoReserva = Enums['estado_reserva']

export const ESTADO_RESERVA_LABEL: Record<EstadoReserva, string> = {
  activa: 'Activa',
  cumplida: 'Cumplida',
  cancelada: 'Cancelada',
}

export const ESTADO_RESERVA_COLOR_VAR: Record<EstadoReserva, string> = {
  activa: 'var(--color-accent)',
  cumplida: 'var(--bucket-en-evento)',
  cancelada: 'var(--color-text-secondary)',
}

/** Los tres buckets operativos (DOMAIN §1). El orden es el del medidor de carga. */
export const BUCKETS = ['disponible', 'en_evento', 'en_reparacion'] as const
export type Bucket = (typeof BUCKETS)[number]

/**
 * Buckets de los que se puede dar de baja (CONTRACTS §2.7). `en_evento` queda
 * fuera: el material perdido en un evento se registra en el check-in de
 * devolución como «perdido», que liga la baja a su evento.
 */
export const BUCKETS_BAJA = ['disponible', 'en_reparacion'] as const satisfies readonly Bucket[]

/** Etiqueta legible de cada bucket para la UI. */
export const BUCKET_LABEL: Record<Bucket, string> = {
  disponible: 'Disponible',
  en_evento: 'En evento',
  en_reparacion: 'En reparación',
}

/** Variable CSS del color semántico de cada bucket (definida en tokens.css). */
export const BUCKET_COLOR_VAR: Record<Bucket, string> = {
  disponible: 'var(--bucket-disponible)',
  en_evento: 'var(--bucket-en-evento)',
  en_reparacion: 'var(--bucket-en-reparacion)',
}

/** Tipos de movimiento del log inmutable (DOMAIN §3.7). */
export type TipoMovimiento = Enums['tipo_movimiento']

/** Etiqueta legible de cada tipo de movimiento. */
export const TIPO_MOV_LABEL: Record<TipoMovimiento, string> = {
  entrada: 'Entrada',
  salida_evento: 'Salida a evento',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
  baja: 'Baja',
}

/** Color del badge de cada tipo de movimiento (variables de tokens.css). */
export const TIPO_MOV_COLOR_VAR: Record<TipoMovimiento, string> = {
  entrada: 'var(--bucket-disponible)',
  salida_evento: 'var(--bucket-en-evento)',
  devolucion: 'var(--bucket-en-reparacion)',
  ajuste: 'var(--color-accent)',
  baja: 'var(--bucket-baja)',
}
