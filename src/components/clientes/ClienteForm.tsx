import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Cliente } from '../../lib/domain'
import { useToast } from '../toast/useToast'
import { Modal } from '../Modal'
import { SelectorColor } from './SelectorColor'
import './ClienteForm.css'

interface ClienteFormProps {
  /** Cliente a editar; si falta, el formulario crea uno nuevo. */
  cliente?: Cliente | null
  onClose: () => void
  onGuardado: (cliente: Cliente) => void
}

/**
 * Alta y edición de cliente (SPEC §11). CRUD directo bajo RLS (CONTRACTS §3):
 * un cliente no toca stock.
 *
 * El color **no se pide al crear**: lo asigna la base de datos (trigger
 * determinista, S-F), así que ningún cliente queda sin color. Al editar sí se
 * ofrece la paleta para cambiarlo.
 *
 * `parent_id` existe en la BD pero la UI lo ignora: la cartera es una lista
 * plana y los "hijos" de un cliente son sus eventos (decisión de S-F).
 */
export function ClienteForm({ cliente, onClose, onGuardado }: ClienteFormProps) {
  const toast = useToast()
  const editando = cliente != null

  const [nombre, setNombre] = useState(cliente?.nombre ?? '')
  const [contacto, setContacto] = useState(cliente?.contacto ?? '')
  const [email, setEmail] = useState(cliente?.email ?? '')
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '')
  const [color, setColor] = useState(cliente?.color ?? '')
  const [enviando, setEnviando] = useState(false)

  const valido = nombre.trim().length > 0

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)

    const datos = {
      nombre: nombre.trim(),
      contacto: contacto.trim() || null,
      email: email.trim() || null,
      telefono: telefono.trim() || null,
    }

    const { data, error } = editando
      ? await supabase
          .from('cliente')
          .update({ ...datos, color })
          .eq('id', cliente.id)
          .select()
          .single()
      : // Sin `color`: lo pone el trigger de la BD (nunca queda sin color).
        await supabase.from('cliente').insert(datos).select().single()

    setEnviando(false)

    if (error) {
      toast.error(error.message)
      return
    }
    toast.exito(
      editando ? `Cliente «${data.nombre}» actualizado.` : `Cliente «${data.nombre}» creado.`,
    )
    onGuardado(data)
  }

  return (
    <Modal
      titulo={editando ? 'Editar cliente' : 'Nuevo cliente'}
      eyebrow={editando ? cliente.nombre : 'Cartera'}
      onClose={onClose}
    >
      <form className="mov-form" onSubmit={enviar}>
        <div className="campo">
          <label className="campo__label" htmlFor="cliente-nombre">
            Nombre
          </label>
          <input
            id="cliente-nombre"
            className="input"
            type="text"
            value={nombre}
            autoFocus
            placeholder="Ej. Productora Nacional"
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo__label" htmlFor="cliente-contacto">
            Persona de contacto <span className="campo__nota">(opcional)</span>
          </label>
          <input
            id="cliente-contacto"
            className="input"
            type="text"
            value={contacto}
            placeholder="Ej. Ana Ruiz"
            onChange={(e) => setContacto(e.target.value)}
          />
        </div>

        <div className="mov-form__fila">
          <div className="campo">
            <label className="campo__label" htmlFor="cliente-email">
              Email <span className="campo__nota">(opcional)</span>
            </label>
            <input
              id="cliente-email"
              className="input"
              type="email"
              value={email}
              placeholder="ana@productora.es"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo__label" htmlFor="cliente-telefono">
              Teléfono <span className="campo__nota">(opcional)</span>
            </label>
            <input
              id="cliente-telefono"
              className="input"
              type="tel"
              value={telefono}
              placeholder="600 000 000"
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
        </div>

        {editando ? (
          <div className="campo">
            <span className="campo__label">Color</span>
            <SelectorColor valor={color} onCambio={setColor} />
            <span className="campo__nota">
              Identifica al cliente en el calendario y en sus chips.
            </span>
          </div>
        ) : (
          <p className="campo__nota">
            Se le asignará un color automáticamente; podrás cambiarlo desde su ficha.
          </p>
        )}

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
            {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
