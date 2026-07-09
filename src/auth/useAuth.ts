import { useContext } from 'react'
import { AuthContext, type AuthState } from './AuthContext'

/** Acceso al estado de autenticación. Debe usarse dentro de <AuthProvider>. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return ctx
}
