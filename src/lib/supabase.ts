import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

/**
 * Cliente Supabase de la aplicación.
 *
 * Lee la configuración de `import.meta.env` (definida en `.env`, ver `.env.example`).
 * NUNCA se hardcodean valores aquí ni se usa la service_role en el frontend:
 * solo la clave publishable/anon, que es pública por diseño y está protegida por RLS.
 *
 * Si falta alguna variable, se lanza un error claro al arrancar en lugar de crear
 * un cliente silenciosamente roto.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url) {
  throw new Error(
    'Falta VITE_SUPABASE_URL. Copia .env.example a .env y rellénala con la URL de tu proyecto Supabase.',
  )
}

if (!publishableKey) {
  throw new Error(
    'Falta VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env y rellénala con la clave publishable/anon de tu proyecto Supabase.',
  )
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // Sesión persistente entre recargas y refresco automático del token.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
