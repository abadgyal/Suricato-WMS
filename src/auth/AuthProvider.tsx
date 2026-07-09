import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/domain'
import { AuthContext, type AuthState } from './AuthContext'

/**
 * Provee la sesión de Supabase Auth y el perfil de aplicación (rol, nombre) del
 * usuario autenticado. Escucha los cambios de sesión (login/logout/refresh) y
 * mantiene el perfil sincronizado. La sesión persiste entre recargas (ver
 * `lib/supabase.ts`).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    // Carga el perfil del usuario autenticado (RLS: cada uno lee su propia fila).
    async function cargarPerfil(userId: string | undefined) {
      if (!userId) {
        if (activo) setPerfil(null)
        return
      }
      const { data } = await supabase
        .from('perfil')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (activo) setPerfil(data ?? null)
    }

    // Sesión inicial (desde el almacenamiento persistente).
    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return
      setSession(data.session)
      await cargarPerfil(data.session?.user.id)
      if (activo) setCargando(false)
    })

    // Cambios posteriores de sesión.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion)
      void cargarPerfil(nuevaSesion?.user.id)
    })

    return () => {
      activo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value: AuthState = {
    session,
    perfil,
    cargando,
    salir: async () => {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
