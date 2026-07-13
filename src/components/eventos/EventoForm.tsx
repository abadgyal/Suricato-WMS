import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Cliente, Evento } from '../../lib/domain'
import { useToast } from '../toast/useToast'
import { Modal } from '../Modal'

interface EventoFormProps {
  /** Evento a editar; si falta, el formulario crea uno nuevo. */
  evento?: Evento | null
  clientes: Cliente[]
  onClose: () => void
  /** Recibe el evento guardado (creado o editado). */
  onGuardado: (evento: Evento) => void
}

/** Fecha de hoy en formato `YYYY-MM-DD` (el que espera `<input type="date">`). */
function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Alta y edición de un evento (SPEC §9). No toca stock: `evento` es CRUD directo
 * bajo RLS (CONTRACTS §3). El estado no se edita aquí — lo mueven las RPC al
 * sacar material, y el cierre se ofrece desde la ficha cuando ya no queda nada
 * fuera.
 */
export function EventoForm({ evento, clientes, onClose, onGuardado }: EventoFormProps) {
  const toast = useToast()
  const editando = evento != null

  const [nombre, setNombre] = useState(evento?.nombre ?? '')
  const [clienteId, setClienteId] = useState(evento?.cliente_id ?? '')
  const [inicio, setInicio] = useState(evento?.fecha_inicio ?? hoy())
  const [fin, setFin] = useState(evento?.fecha_fin ?? hoy())
  const [notas, setNotas] = useState(evento?.notas ?? '')
  const [enviando, setEnviando] = useState(false)

  const fechasAlReves = Boolean(inicio && fin && fin < inicio)
  const valido = nombre.trim().length > 0 && Boolean(inicio) && Boolean(fin) && !fechasAlReves

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)

    const datos = {
      nombre: nombre.trim(),
      cliente_id: clienteId || null,
      fecha_inicio: inicio,
      fecha_fin: fin,
      notas: notas.trim() || null,
    }

    // `creado_por` lo rellena el default auth.uid() de la tabla: el autor nunca
    // lo elige el cliente (DEBT [S-B]).
    const { data, error } = editando
      ? await supabase.from('evento').update(datos).eq('id', evento.id).select().single()
      : await supabase.from('evento').insert(datos).select().single()

    setEnviando(false)

    if (error) {
      toast.error(error.message)
      return
    }
    toast.exito(editando ? `Evento «${data.nombre}» actualizado.` : `Evento «${data.nombre}» creado.`)
    onGuardado(data)
  }

  return (
    <Modal
      titulo={editando ? 'Editar evento' : 'Nuevo evento'}
      eyebrow={editando ? evento.nombre : 'Ciclo de alquiler'}
      onClose={onClose}
    >
      <form className="mov-form" onSubmit={enviar}>
        <div className="campo">
          <label className="campo__label" htmlFor="evento-nombre">
            Nombre del evento
          </label>
          <input
            id="evento-nombre"
            className="input"
            type="text"
            value={nombre}
            autoFocus
            placeholder="Ej. Gala Premios Ondas"
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo__label" htmlFor="evento-cliente">
            Cliente <span className="campo__nota">(opcional)</span>
          </label>
          <select
            id="evento-cliente"
            className="select"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">Sin cliente asignado</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="mov-form__fila">
          <div className="campo">
            <label className="campo__label" htmlFor="evento-inicio">
              Fecha de inicio
            </label>
            <input
              id="evento-inicio"
              className="input"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo__label" htmlFor="evento-fin">
              Fecha de fin
            </label>
            <input
              id="evento-fin"
              className="input"
              type="date"
              value={fin}
              min={inicio || undefined}
              onChange={(e) => setFin(e.target.value)}
            />
            {fechasAlReves && (
              <span className="campo__error">La fecha de fin no puede ser anterior al inicio.</span>
            )}
          </div>
        </div>

        <div className="campo">
          <label className="campo__label" htmlFor="evento-notas">
            Notas <span className="campo__nota">(opcional)</span>
          </label>
          <textarea
            id="evento-notas"
            className="input"
            rows={3}
            value={notas}
            placeholder="Montaje el día antes, acceso por muelle de carga…"
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>

        <div className="mov-form__acciones">
          <button type="button" className="boton boton--secundario" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={!valido || enviando}>
            {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear evento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
