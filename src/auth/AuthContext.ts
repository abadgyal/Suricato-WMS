import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Perfil } from '../lib/domain'

export interface AuthState {
  /** Sesión de Supabase Auth, o `null` si no hay usuario autenticado. */
  session: Session | null
  /** Perfil de aplicación (rol, nombre) del usuario autenticado. */
  perfil: Perfil | null
  /** `true` mientras se resuelve la sesión inicial (evita parpadeo al login). */
  cargando: boolean
  /** Cierra la sesión. */
  salir: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
