import { useRef, useState } from 'react'
import { exportarCSV, exportarXLSX, type Registro } from '../lib/export'
import { useToast } from './toast/useToast'
import './ExportMenu.css'

/** Un conjunto exportable: su etiqueta y cómo obtener sus filas (sync o async). */
export interface ConjuntoExport {
  etiqueta: string
  obtener: () => Registro[] | Promise<Registro[]>
}

interface ExportMenuProps {
  /** Base del nombre de fichero (`inventario` → `inventario-2026-07-15.csv`). */
  base: string
  /** Nombre de la hoja en el .xlsx. */
  hoja: string
  /** Orden y cabeceras de las columnas (claves de cada `Registro`). */
  columnas: string[]
  /** Conjunto por defecto: lo que el usuario ve ahora (respeta sus filtros). */
  actual: ConjuntoExport
  /** Conjunto completo, solo si difiere del actual (hay filtros aplicados). */
  todo?: ConjuntoExport
}

type Formato = 'csv' | 'xlsx'

/**
 * Menú de export accesible (`<details>`/`<summary>`: foco y teclado nativos).
 * Ofrece CSV y Excel de la vista actual y, si hay filtros, también de todo.
 */
export function ExportMenu({ base, hoja, columnas, actual, todo }: ExportMenuProps) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  const detalleRef = useRef<HTMLDetailsElement>(null)

  function cerrar() {
    if (detalleRef.current) detalleRef.current.open = false
  }

  async function exportar(conj: ConjuntoExport, formato: Formato) {
    setOcupado(true)
    try {
      const filas = await conj.obtener()
      if (filas.length === 0) {
        toast.info('No hay filas que exportar con esos filtros.')
        return
      }
      if (formato === 'csv') exportarCSV(base, columnas, filas)
      else await exportarXLSX(base, hoja, columnas, filas)
      toast.exito(`Exportadas ${filas.length} fila${filas.length === 1 ? '' : 's'}.`)
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    } finally {
      setOcupado(false)
      cerrar()
    }
  }

  function grupo(conj: ConjuntoExport) {
    return (
      <div className="export__grupo" role="group" aria-label={conj.etiqueta}>
        <span className="export__grupo-tit">{conj.etiqueta}</span>
        <button className="export__opcion" disabled={ocupado} onClick={() => exportar(conj, 'csv')}>
          CSV
        </button>
        <button className="export__opcion" disabled={ocupado} onClick={() => exportar(conj, 'xlsx')}>
          Excel
        </button>
      </div>
    )
  }

  return (
    <details className="export" ref={detalleRef}>
      <summary className="export__boton" aria-label="Exportar datos">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        <span>{ocupado ? 'Exportando…' : 'Exportar'}</span>
      </summary>
      <div className="export__menu" role="menu">
        {grupo(actual)}
        {todo && grupo(todo)}
      </div>
    </details>
  )
}
