import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { crearUsuario, MIN_PASSWORD, resetearPassword, useUsuarios } from '../hooks/useUsuarios'
import { llamarRpc } from '../lib/rpc'
import type { Perfil, Rol } from '../lib/domain'
import { Modal } from '../components/Modal'
import { useToast } from '../components/toast/useToast'
import { ErrorState, TableSkeleton } from '../components/States'
import { formatFecha } from '../lib/format'
import './Admin.css'

const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  trabajador: 'Trabajador',
}

/** Alta de usuario: invoca la Edge Function `crear-usuario` (service role). */
function AltaUsuarioForm({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const toast = useToast()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('trabajador')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valido = nombre.trim() !== '' && email.trim() !== '' && password.length >= 6

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)
    setError(null)
    try {
      await crearUsuario({ nombre, email, password, rol })
      toast.exito(`Usuario «${nombre.trim()}» creado como ${ROL_LABEL[rol].toLowerCase()}.`)
      onCreado()
    } catch (err) {
      // El error se muestra dentro del formulario (no solo como toast): el admin
      // necesita verlo junto al campo que tiene que corregir.
      setError((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Nuevo usuario" eyebrow="Administración" onClose={onClose}>
      <form className="mov-form" onSubmit={enviar}>
        {error && <p className="admin__error">{error}</p>}

        <div className="campo">
          <label className="campo__label" htmlFor="usuario-nombre">
            Nombre
          </label>
          <input
            id="usuario-nombre"
            className="input"
            type="text"
            value={nombre}
            autoFocus
            placeholder="Ej. Marta Pérez"
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo__label" htmlFor="usuario-email">
            Email
          </label>
          <input
            id="usuario-email"
            className="input"
            type="email"
            value={email}
            placeholder="marta@suricato.es"
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="campo__nota">Con este email iniciará sesión.</span>
        </div>

        <div className="mov-form__fila">
          <div className="campo">
            <label className="campo__label" htmlFor="usuario-password">
              Contraseña inicial
            </label>
            <input
              id="usuario-password"
              className="input"
              type="text"
              value={password}
              placeholder="Mínimo 6 caracteres"
              onChange={(e) => setPassword(e.target.value)}
            />
            {password !== '' && password.length < 6 && (
              <span className="campo__error">Debe tener al menos 6 caracteres.</span>
            )}
          </div>
          <div className="campo">
            <label className="campo__label" htmlFor="usuario-rol">
              Rol
            </label>
            <select
              id="usuario-rol"
              className="select"
              value={rol}
              onChange={(e) => setRol(e.target.value as Rol)}
            >
              <option value="trabajador">Trabajador</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        </div>

        <div className="mov-form__acciones">
          <button
            type="button"
            className="boton boton--secundario"
            onClick={onClose}
            disabled={enviando}
          >
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={!valido || enviando}>
            {enviando ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Reseteo de contraseña: invoca la Edge Function `resetear-password` (service role).
 * No hay recuperación por email — el admin fija la contraseña y se la comunica a la
 * persona por un canal aparte, así que el diálogo lo deja claro.
 */
function ResetPasswordForm({
  usuario,
  onClose,
  onHecho,
}: {
  usuario: Perfil
  onClose: () => void
  onHecho: () => void
}) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cortaAun = password !== '' && password.length < MIN_PASSWORD
  const noCoinciden = confirmacion !== '' && confirmacion !== password
  const valido = password.length >= MIN_PASSWORD && confirmacion === password

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)
    setError(null)
    try {
      await resetearPassword(usuario.id, password)
      toast.exito(`Contraseña de «${usuario.nombre}» restablecida. Comunícasela en persona.`)
      onHecho()
    } catch (err) {
      // Como en el alta: el error se ve dentro del formulario, junto al campo.
      setError((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Restablecer contraseña" eyebrow={usuario.nombre} onClose={onClose}>
      <form className="mov-form" onSubmit={enviar}>
        {error && <p className="admin__error">{error}</p>}

        <p className="admin__aviso">
          La aplicación <strong>no envía correos</strong>: apunta esta contraseña y
          comunícasela a «{usuario.nombre}» por un canal aparte. La sesión que tenga
          abierta seguirá activa hasta que cierre sesión.
        </p>

        <div className="campo">
          <label className="campo__label" htmlFor="reset-password">
            Nueva contraseña
          </label>
          <input
            id="reset-password"
            className="input"
            type="text"
            value={password}
            autoFocus
            autoComplete="new-password"
            placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
            onChange={(e) => setPassword(e.target.value)}
          />
          {cortaAun && (
            <span className="campo__error">
              Debe tener al menos {MIN_PASSWORD} caracteres.
            </span>
          )}
        </div>

        <div className="campo">
          <label className="campo__label" htmlFor="reset-password-confirmacion">
            Repite la contraseña
          </label>
          <input
            id="reset-password-confirmacion"
            className="input"
            type="text"
            value={confirmacion}
            autoComplete="new-password"
            onChange={(e) => setConfirmacion(e.target.value)}
          />
          {noCoinciden && <span className="campo__error">Las contraseñas no coinciden.</span>}
        </div>

        <div className="mov-form__acciones">
          <button
            type="button"
            className="boton boton--secundario"
            onClick={onClose}
            disabled={enviando}
          >
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={!valido || enviando}>
            {enviando ? 'Restableciendo…' : 'Restablecer contraseña'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Panel de administración (SPEC §13). Solo admin: la ruta lo comprueba y, además,
 * el servidor lo garantiza — la Edge Function `crear-usuario` exige un admin
 * activo y `desactivar_usuario` lanza WMS009 si no lo eres (CONTRACTS §1.3).
 *
 * La baja es **lógica** (`activo = false`): nunca se borra un usuario, para no
 * romper la auditoría de los movimientos que registró. El admin principal
 * (`es_principal`) está protegido por la invariante 8 de DOMAIN §4: ni siquiera
 * se le ofrece el botón.
 */
export function Admin() {
  const { perfil } = useAuth()
  const { usuarios, cargando, error, recargar } = useUsuarios()
  const toast = useToast()

  const [creando, setCreando] = useState(false)
  const [desactivando, setDesactivando] = useState<Perfil | null>(null)
  const [reseteando, setReseteando] = useState<Perfil | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function desactivar() {
    if (!desactivando) return
    setEnviando(true)
    try {
      await llamarRpc('desactivar_usuario', { p_perfil_id: desactivando.id })
      toast.exito(`«${desactivando.nombre}» dado de baja. Ya no puede operar.`)
      setDesactivando(null)
      recargar()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="admin">
      <header className="admin__cab">
        <div>
          <h1>Administración</h1>
          <p className="admin__sub">
            {cargando
              ? 'Cargando…'
              : `${usuarios.length} usuario${usuarios.length === 1 ? '' : 's'} · ${
                  usuarios.filter((u) => u.activo).length
                } activo(s)`}
          </p>
        </div>
        <button className="boton boton--primario" onClick={() => setCreando(true)}>
          Nuevo usuario
        </button>
      </header>

      <section className="admin__panel">
        {cargando ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState mensaje={error} onReintentar={recargar} />
        ) : (
          <table className="admin__tabla">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Alta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={u.activo ? '' : 'admin__fila--baja'}>
                  <td>
                    <span className="admin__nombre">{u.nombre}</span>
                    {u.es_principal && <span className="admin__principal">Admin principal</span>}
                    {u.id === perfil?.id && <span className="admin__yo">Tú</span>}
                  </td>
                  <td>{ROL_LABEL[u.rol]}</td>
                  <td>
                    <span className={`admin__estado ${u.activo ? '' : 'admin__estado--baja'}`}>
                      {u.activo ? 'Activo' : 'Dado de baja'}
                    </span>
                  </td>
                  <td className="admin__fecha">{formatFecha(u.creado_en)}</td>
                  <td className="admin__acciones">
                    {/* Los botones van en un envoltorio: la celda tiene que seguir
                        siendo `table-cell` para quedarse a la altura de su fila. */}
                    <div className="admin__acciones-grupo">
                      {/*
                        La contraseña del admin principal solo la cambia él mismo: al
                        resto de admins ni se les ofrece, igual que con la baja. El
                        servidor lo vuelve a comprobar (403).
                      */}
                      {u.activo && (!u.es_principal || u.id === perfil?.id) && (
                        <button className="boton boton--secundario" onClick={() => setReseteando(u)}>
                          Restablecer contraseña
                        </button>
                      )}
                      {/* Invariante 8: al admin principal no se le ofrece la baja. */}
                      {u.activo && !u.es_principal && (
                        <button className="boton boton--secundario" onClick={() => setDesactivando(u)}>
                          Dar de baja
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {creando && (
        <AltaUsuarioForm
          onClose={() => setCreando(false)}
          onCreado={() => {
            setCreando(false)
            recargar()
          }}
        />
      )}

      {reseteando && (
        <ResetPasswordForm
          usuario={reseteando}
          onClose={() => setReseteando(null)}
          onHecho={() => setReseteando(null)}
        />
      )}

      {desactivando && (
        <Modal
          titulo="Dar de baja al usuario"
          eyebrow={desactivando.nombre}
          onClose={() => setDesactivando(null)}
        >
          <div className="admin__confirmar">
            <p>
              «{desactivando.nombre}» dejará de poder entrar y operar. <strong>No se borra</strong>:
              es una baja lógica, así que los movimientos que registró siguen en el historial con
              su nombre.
            </p>
            <div className="mov-form__acciones">
              <button
                className="boton boton--secundario"
                onClick={() => setDesactivando(null)}
                disabled={enviando}
              >
                Cancelar
              </button>
              <button className="boton boton--baja" onClick={desactivar} disabled={enviando}>
                {enviando ? 'Dando de baja…' : 'Dar de baja'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
