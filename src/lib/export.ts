/**
 * Export de datos a CSV (nativo) y Excel (.xlsx vía exceljs, cargado en diferido
 * para no engordar el bundle principal). Todo se genera en cliente a partir de lo
 * que ya está en pantalla; no toca la BD (S-G).
 *
 * Contrato: cada pantalla mapea sus datos a `Registro` (claves = cabeceras en
 * español) y pasa el orden de columnas. Así el export no conoce el dominio.
 */

export type Valor = string | number | boolean | null | undefined
export type Registro = Record<string, Valor>

function dos(n: number): string {
  return String(n).padStart(2, '0')
}

/** `inventario` → `inventario-2026-07-15.csv`. Fecha local, legible. */
export function nombreFichero(base: string, ext: string): string {
  const d = new Date()
  const fecha = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
  return `${base}-${fecha}.${ext}`
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Se revoca en el siguiente tick para no cortar la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function celdaCSV(v: Valor): string {
  if (v == null) return ''
  const s = String(v)
  // Entrecomilla si contiene separador, comillas o saltos de línea (RFC 4180).
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV RFC-4180 con coma y BOM UTF-8 (para que Excel respete los acentos). Se
 * elige coma —no `;`— por interoperabilidad; el que quiera Excel nativo usa el
 * .xlsx.
 */
export function exportarCSV(base: string, columnas: string[], filas: Registro[]): void {
  const lineas = [
    columnas.map(celdaCSV).join(','),
    ...filas.map((f) => columnas.map((c) => celdaCSV(f[c])).join(',')),
  ]
  const contenido = '﻿' + lineas.join('\r\n')
  descargar(new Blob([contenido], { type: 'text/csv;charset=utf-8' }), nombreFichero(base, 'csv'))
}

/** Excel .xlsx con cabecera en negrita. `exceljs` se importa en diferido. */
export async function exportarXLSX(
  base: string,
  hoja: string,
  columnas: string[],
  filas: Registro[],
): Promise<void> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  wb.creator = 'WMS Suricato Producciones'
  const ws = wb.addWorksheet(hoja)

  ws.columns = columnas.map((c) => ({
    header: c,
    key: c,
    width: Math.min(Math.max(c.length + 4, 12), 40),
  }))
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).alignment = { vertical: 'middle' }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  for (const f of filas) {
    ws.addRow(columnas.reduce<Registro>((r, c) => ((r[c] = f[c] ?? null), r), {}))
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  descargar(blob, nombreFichero(base, 'xlsx'))
}
