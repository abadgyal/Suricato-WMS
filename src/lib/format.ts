/** Utilidades de formato para la UI. */

import { supabase } from './supabase'

/** Bucket de Storage donde viven las fotos de producto (DOMAIN §3.3). */
const BUCKET_FOTOS = 'productos'

/**
 * URL pública de la foto de un producto, o `null` si no tiene foto.
 * El bucket `productos` es público (CDN); si no hay `foto_path`, la UI muestra
 * un marcador en vez de una imagen rota.
 */
export function fotoUrl(fotoPath: string | null | undefined): string | null {
  if (!fotoPath) return null
  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(fotoPath)
  return data.publicUrl
}

const fmtFecha = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const fmtFechaHora = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Fecha corta legible (ej. "9 jul 2026"). Devuelve "—" si es nula. */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  return fmtFecha.format(new Date(iso))
}

/** Fecha con hora (ej. "9 jul 2026, 14:30"). Devuelve "—" si es nula. */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return fmtFechaHora.format(new Date(iso))
}

/** Dimensión en cm/kg con unidad, o "—" si no está definida. */
export function formatMedida(valor: number | null | undefined, unidad: string): string {
  if (valor == null) return '—'
  return `${valor} ${unidad}`
}
