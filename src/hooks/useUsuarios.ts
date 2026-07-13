import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Perfil, Rol } from '../lib/domain'
import { mensajeError } from '../lib/rpc'

export interface UsuariosState {
  usuarios: Perfil[]
  cargando: boolean
  error: string | null
  recargar: () => void
}

/**
 * Usuarios de la aplicación (`perfil`). La RLS solo deja leer todas las filas al
 * admin (cada uno ve la suya): si un trabajador llegara a esta pantalla, la lista
 * saldría con su propia fila y nada más. La protección real está en el servidor.
 */
export function useUsuarios(): UsuariosState {
  const [usuarios, setUsuarios] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cargaRef = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++cargaRef.current
    const { data, error: err } = await supabase
      .from('perfil')
      .select('*')
      .order('es_principal', { ascending: false })
      .order('nombre', { ascending: true })

    if (id !== cargaRef.current) return
    if (err) setError(err.message)
    else {
      setError(null)
      setUsuarios(data ?? [])
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return { usuarios, cargando, error, recargar: () => void cargar() }
}

export interface AltaUsuario {
  nombre: string
  email: string
  password: string
  rol: Rol
}

/**
 * Alta de usuario vía la Edge Function `crear-usuario` (S-B): es la única forma
 * de crear cuentas — usa la `service_role` en el servidor, que jamás toca el
 * frontend. La función valida que el llamante sea un admin activo.
 *
 * Traduce los errores a mensajes claros: email duplicado (409), permisos (401/403)
 * y validación (400).
 */
export async function crearUsuario(datos: AltaUsuario): Promise<void> {
  const { error } = await supabase.functions.invoke('crear-usuario', {
    body: {
      nombre: datos.nombre.trim(),
      email: datos.email.trim(),
      password: datos.password,
      rol: datos.rol,
    },
  })

  if (!error) return

  // La Edge Function devuelve `{ error: "..." }` con un status HTTP; supabase-js
  // envuelve el cuerpo en un FunctionsHttpError, así que hay que leer la respuesta.
  let detalle = ''
  let status: number | undefined
  const contexto = (error as { context?: Response }).context
  if (contexto && typeof contexto.json === 'function') {
    status = contexto.status
    try {
      const cuerpo = (await contexto.json()) as { error?: string }
      detalle = cuerpo.error ?? ''
    } catch {
      detalle = ''
    }
  }

  if (status === 409 || /already|exists|registered/i.test(detalle)) {
    throw new Error(`Ya existe un usuario con el email «${datos.email.trim()}».`)
  }
  if (status === 401 || status === 403) {
    throw new Error('No tienes permiso para crear usuarios: hace falta un admin activo.')
  }
  if (detalle) throw new Error(detalle)
  throw new Error(mensajeError(error) || 'No se pudo crear el usuario.')
}
