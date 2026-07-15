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
 *
 * Las (re)conexiones se **serializan** en una cola y cada intento usa un **nombre
 * de canal único**: supabase-js cachea los canales por nombre, así que reutilizar
 * el mismo nombre tras `subscribe()` lanzaba «cannot add postgres_changes
 * callbacks after subscribe()» cuando la conexión inicial y un evento de auth
 * corrían a la vez.
 */
export function useRealtime(tablas: string[], onCambio: () => void) {
  const clave = tablas.join(',')

  useEffect(() => {
    let canal: ReturnType<typeof supabase.channel> | null = null
    let cancelado = false
    // Cola: cada (re)conexión se encadena tras la anterior para no solaparse.
    let cola: Promise<void> = Promise.resolve()

    function reconectar() {
      cola = cola.then(async () => {
        if (cancelado) return

        // Cierra el canal anterior antes de abrir el nuevo.
        if (canal) {
          await supabase.removeChannel(canal)
          canal = null
        }

        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token || cancelado) return

        await supabase.realtime.setAuth(token)
        if (cancelado) return

        // Nombre único por intento (ver nota de arriba).
        const nombre = `rt-${clave}-${++contadorCanal}`
        let ch = supabase.channel(nombre)
        for (const t of clave.split(',')) {
          ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onCambio)
        }
        canal = ch.subscribe()
      })
    }

    reconectar()
    const { data: sub } = supabase.auth.onAuthStateChange(() => reconectar())

    return () => {
      cancelado = true
      sub.subscription.unsubscribe()
      // Elimina el canal cuando la cola termine (evita cortar un subscribe a medias).
      void cola.then(() => {
        if (canal) void supabase.removeChannel(canal)
      })
    }
  }, [clave, onCambio])
}
