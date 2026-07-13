/**
 * Frontera con las RPC de stock (docs/CONTRACTS.md §2) y con Storage.
 *
 * Toda mutación de stock pasa por aquí: `llamarRpc` invoca la función de Postgres
 * y traduce los errores `WMSNNN` a un mensaje claro en español para el toast. El
 * frontend NUNCA escribe las columnas de bucket directamente.
 */
import { supabase } from './supabase'
import type { Database } from '../types/database'

type Funciones = Database['public']['Functions']
type NombreRpc = keyof Funciones

/** Mensajes claros por código de error de las RPC (CONTRACTS §1.2). */
const WMS_MENSAJES: Record<string, string> = {
  WMS001: 'Stock insuficiente: no hay unidades disponibles suficientes.',
  WMS002: 'Cantidad inválida: revisa el número de unidades.',
  WMS003: 'Falta el motivo, que es obligatorio para esta operación.',
  WMS004: 'La reserva o el evento no están en un estado válido para esta operación.',
  WMS005: 'La devolución excede las unidades que hay fuera en el evento.',
  WMS006: 'El producto o el evento no existen.',
  WMS007: 'El bucket de origen no tiene unidades suficientes.',
  WMS008: 'Rango de fechas inválido.',
  WMS009: 'No tienes permiso para esta operación (o la sesión ha caducado).',
}

/**
 * Convierte un error de Supabase/Postgres en un mensaje legible. Si el mensaje
 * lleva un código `WMSNNN`, usa el texto claro correspondiente; si el servidor
 * añadió detalle tras los dos puntos (p. ej. las cifras de un WMS001), lo anexa.
 */
export function mensajeError(error: unknown): string {
  const raw =
    (error as { message?: string } | null)?.message ?? (error ? String(error) : '')
  const m = raw.match(/WMS(\d{3})/)
  if (m) {
    const codigo = `WMS${m[1]}`
    const base = WMS_MENSAJES[codigo] ?? raw
    const detalle = raw.split(/WMS\d{3}:?/)[1]?.trim()
    if (detalle && !WMS_MENSAJES[codigo]) return raw
    return detalle ? `${base} (${detalle})` : base
  }
  return raw || 'Ha ocurrido un error inesperado.'
}

/**
 * Llama a una RPC de stock y devuelve su retorno. Lanza un `Error` con mensaje
 * ya traducido si la RPC falla (el llamante lo muestra como toast).
 */
export async function llamarRpc<T = unknown>(
  fn: NombreRpc,
  args: Funciones[NombreRpc]['Args'],
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args as never)
  if (error) throw new Error(mensajeError(error))
  return data as T
}

/** Retorno estándar de las RPC de stock (CONTRACTS §1.1). */
export interface EstadoStock {
  producto_id: string
  disponible: number
  en_evento: number
  en_reparacion: number
  total: number
  movimiento_id: string
}

// ---------------------------------------------------------------------------
// Fotos de producto (Supabase Storage, bucket `productos`).
// ---------------------------------------------------------------------------
const BUCKET_FOTOS = 'productos'
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FOTO_BYTES = 5 * 1024 * 1024 // 5 MB

/** Valida tipo/tamaño de una foto en el cliente. Devuelve el error o `null`. */
export function validarFoto(file: File): string | null {
  if (!TIPOS_FOTO.includes(file.type)) {
    return 'La foto debe ser JPG, PNG o WebP.'
  }
  if (file.size > MAX_FOTO_BYTES) {
    return 'La foto no puede superar los 5 MB.'
  }
  return null
}

/**
 * Sube una foto al bucket `productos` y devuelve su `foto_path`. Valida antes de
 * subir (además del límite que aplica la propia API de Storage).
 */
export async function subirFotoProducto(file: File): Promise<string> {
  const error = validarFoto(file)
  if (error) throw new Error(error)

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const nombre = `${crypto.randomUUID()}.${ext}`

  const { error: subida } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(nombre, file, { contentType: file.type, upsert: false })

  if (subida) throw new Error(`No se pudo subir la foto: ${subida.message}`)
  return nombre
}
