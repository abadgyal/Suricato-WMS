import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { crearUsuario, useUsuarios } from '../hooks/useUsuarios'
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
                    {/* Invariante 8: al admin principal no se le ofrece la baja. */}
                    {u.activo && !u.es_principal && (
                      <button className="boton boton--secundario" onClick={() => setDesactivando(u)}>
                        Dar de baja
                      </button>
                    )}
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
