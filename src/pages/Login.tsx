import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import './Login.css'

/** Traduce los errores de Supabase Auth a un mensaje claro y accionable. */
function mensajeError(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.'
  }
  if (m.includes('email not confirmed')) {
    return 'Tu cuenta aún no está confirmada. Pide al administrador que la active.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Demasiados intentos seguidos. Espera un momento antes de reintentar.'
  }
  return `No se pudo iniciar sesión: ${raw}`
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(mensajeError(err.message))
      setEnviando(false)
    }
    // En éxito, AuthProvider detecta la sesión y el router redirige al inventario.
  }

  return (
    <div className="login">
      {/* Panel de marca con el motivo de la barra de distribución de stock. */}
      <aside className="login__marca">
        <div className="login__marca-top">
          <span className="login__logo">SURICATO</span>
          <span className="login__logo-sub">· wms ·</span>
        </div>
        <div className="login__marca-cuerpo">
          <h2>Gestión de almacén para producción audiovisual.</h2>
          <p>El material sale a evento y vuelve. Todos ven el mismo estado, en tiempo real.</p>
          <div className="login__demo-bar" aria-hidden="true">
            <span style={{ width: '58%', background: 'var(--bucket-disponible)' }} />
            <span style={{ width: '30%', background: 'var(--bucket-en-evento)' }} />
            <span style={{ width: '12%', background: 'var(--bucket-en-reparacion)' }} />
          </div>
          <p className="login__demo-leyenda">
            <span><i style={{ background: 'var(--bucket-disponible)' }} /> Disponible</span>
            <span><i style={{ background: 'var(--bucket-en-evento)' }} /> En evento</span>
            <span><i style={{ background: 'var(--bucket-en-reparacion)' }} /> En reparación</span>
          </p>
        </div>
      </aside>

      <main className="login__panel">
        <form className="login__form" onSubmit={onSubmit}>
          <h1 className="login__titulo">Entra en tu almacén</h1>
          <p className="login__intro">Accede con el email y la contraseña de tu cuenta.</p>

          {error && (
            <div className="login__error" role="alert">
              {error}
            </div>
          )}

          <div className="campo">
            <label className="campo__label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button className="boton boton--primario login__submit" type="submit" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  )
}
