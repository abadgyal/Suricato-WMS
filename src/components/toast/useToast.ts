import { useContext } from 'react'
import { ToastContext, type ToastAPI } from './ToastContext'

/** Acceso a las notificaciones. Debe usarse dentro de <ToastProvider>. */
export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>')
  }
  return ctx
}
