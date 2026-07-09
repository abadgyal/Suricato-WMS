import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ToastContext, type Toast, type ToastTipo } from './ToastContext'
import './Toast.css'

const DURACION_MS = 4500

/**
 * Notificaciones transitorias (SPEC §14): éxito/error/info de cada operación.
 * Se apilan arriba a la derecha y se auto-descartan; también se pueden cerrar.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const contador = useRef(0)

  const quitar = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const mostrar = useCallback(
    (tipo: ToastTipo, mensaje: string) => {
      const id = ++contador.current
      setToasts((prev) => [...prev, { id, tipo, mensaje }])
      setTimeout(() => quitar(id), DURACION_MS)
    },
    [quitar],
  )

  const api = useRef({
    exito: (m: string) => mostrar('exito', m),
    error: (m: string) => mostrar('error', m),
    info: (m: string) => mostrar('info', m),
  }).current

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" role="region" aria-live="polite" aria-label="Notificaciones">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.tipo}`} role="status">
              <span className="toast__icono" aria-hidden="true">
                {t.tipo === 'exito' ? '✓' : t.tipo === 'error' ? '!' : 'i'}
              </span>
              <span className="toast__mensaje">{t.mensaje}</span>
              <button
                className="toast__cerrar"
                onClick={() => quitar(t.id)}
                aria-label="Cerrar notificación"
              >
                ×
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
