import { createContext } from 'react'

export type ToastTipo = 'exito' | 'error' | 'info'

export interface Toast {
  id: number
  tipo: ToastTipo
  mensaje: string
}

export interface ToastAPI {
  /** Muestra un toast de éxito (operación confirmada). */
  exito: (mensaje: string) => void
  /** Muestra un toast de error (p. ej. un WMS###). */
  error: (mensaje: string) => void
  /** Muestra un toast informativo. */
  info: (mensaje: string) => void
}

export const ToastContext = createContext<ToastAPI | null>(null)
