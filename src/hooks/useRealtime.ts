import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

let contadorCanal = 0

/**
 * Se suscribe por Realtime a una o varias tablas y llama a `onCambio` ante
 * cualquier INSERT/UPDATE/DELETE. Autentica el socket con el token de la sesión
 * (necesario porque las tablas tienen RLS) y se re-suscribe si la sesión cambia.
 *
 * `onCambio` debe ser estable (envuélvelo en `useCallback`). `tablas` se compara
 * por contenido, así que puede ser un array literal en el sitio de llamada.
 */
export function useRealtime(tablas: string[], onCambio: () => void) {
  const clave = tablas.join(',')

  useEffect(() => {
    let canal: ReturnType<typeof supabase.channel> | null = null
    let cancelado = false
    const nombre = `rt-${clave}-${++contadorCanal}`

    async function conectar() {
      if (canal) {
        await supabase.removeChannel(canal)
        canal = null
      }
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token || cancelado) return

      await supabase.realtime.setAuth(token)
      if (cancelado) return

      let ch = supabase.channel(nombre)
      for (const t of clave.split(',')) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onCambio)
      }
      canal = ch.subscribe()
    }

    void conectar()
    const { data: sub } = supabase.auth.onAuthStateChange(() => void conectar())

    return () => {
      cancelado = true
      sub.subscription.unsubscribe()
      if (canal) void supabase.removeChannel(canal)
    }
  }, [clave, onCambio])
}
