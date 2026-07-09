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
export type Rol = Enums['rol']

/** Los tres buckets operativos (DOMAIN §1). El orden es el del medidor de carga. */
export const BUCKETS = ['disponible', 'en_evento', 'en_reparacion'] as const
export type Bucket = (typeof BUCKETS)[number]

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
