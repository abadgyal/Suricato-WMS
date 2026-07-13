/**
 * Utilidades de fecha para el calendario. Trabajan con cadenas `YYYY-MM-DD`
 * (el tipo `date` de Postgres y el de `<input type="date">`), no con instantes:
 * un evento del 1 al 3 de agosto lo es en cualquier huso, y convertir a `Date`
 * con hora traía desfases de un día.
 */

/** `2026-08-01` → Date local a mediodía (inmune a desfases de huso). */
export function parseDia(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

/** Date → `YYYY-MM-DD`. */
export function aDia(fecha: Date): string {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Hoy en formato `YYYY-MM-DD`. */
export function hoyDia(): string {
  return aDia(new Date())
}

/** Suma (o resta) días a una fecha `YYYY-MM-DD`. */
export function sumarDias(iso: string, dias: number): string {
  const f = parseDia(iso)
  f.setDate(f.getDate() + dias)
  return aDia(f)
}

/** Días enteros de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  const ms = parseDia(hasta).getTime() - parseDia(desde).getTime()
  return Math.round(ms / 86_400_000)
}

/** Lunes de la semana de `iso` (la semana europea empieza en lunes). */
export function inicioSemana(iso: string): string {
  const f = parseDia(iso)
  const dow = (f.getDay() + 6) % 7 // 0 = lunes
  return sumarDias(iso, -dow)
}

/** Día 1 del mes de `iso`. */
export function inicioMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Suma (o resta) meses, conservando el día 1. */
export function sumarMeses(iso: string, meses: number): string {
  const f = parseDia(inicioMes(iso))
  f.setMonth(f.getMonth() + meses)
  return aDia(f)
}

/** ¿Se solapan los rangos [aIni, aFin] y [bIni, bFin]? (extremos incluidos) */
export function solapan(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  return aIni <= bFin && bIni <= aFin
}

const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const fmtDiaMes = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' })

/** "agosto de 2026". */
export function etiquetaMes(iso: string): string {
  return fmtMes.format(parseDia(iso))
}

/** "01 ago". */
export function etiquetaDiaMes(iso: string): string {
  return fmtDiaMes.format(parseDia(iso))
}

/** Iniciales de los días de la semana, empezando en lunes. */
export const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
