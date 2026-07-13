import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Categoria } from '../../lib/domain'
import { colorCategoriaPropuesto, PALETA_CATEGORIA } from '../../lib/colores'
import { SelectorColor } from '../clientes/SelectorColor'
import { CategoryChip } from '../CategoryChip'
import { Modal } from '../Modal'
import { useToast } from '../toast/useToast'

interface CategoriaFormProps {
  /** Categoría a editar; si falta, el formulario crea una nueva. */
  categoria?: Categoria | null
  /** Nombre con el que arrancar (alta en línea desde otro formulario). */
  nombreInicial?: string
  onClose: () => void
  onGuardado: (categoria: Categoria) => void
}

/**
 * Alta y edición de categoría (SPEC §12). CRUD directo bajo RLS: abierto a
 * cualquier usuario autenticado (CONTRACTS §1.3).
 *
 * El color se **propone** de forma determinista a partir del nombre (la misma
 * regla que aplica la BD si no se envía ninguno), y se puede cambiar dentro de
 * la paleta de categorías. Esto es lo que permite el alta en línea desde el
 * formulario de Entrada sin pedirle un color al usuario (deuda [S-D]).
 */
export function CategoriaForm({
  categoria,
  nombreInicial = '',
  onClose,
  onGuardado,
}: CategoriaFormProps) {
  const toast = useToast()
  const editando = categoria != null

  const [nombre, setNombre] = useState(categoria?.nombre ?? nombreInicial)
  const [color, setColor] = useState(categoria?.color ?? PALETA_CATEGORIA[0])
  const [colorElegido, setColorElegido] = useState(editando)
  const [enviando, setEnviando] = useState(false)

  const colorEfectivo = colorElegido ? color : colorCategoriaPropuesto(nombre)
  const valido = nombre.trim().length > 0

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    // El modal va por portal al body, pero en el árbol de React este formulario
    // puede colgar de otro (el de Entrada, con su alta en línea): sin esto, su
    // `submit` burbujearía hasta el formulario padre y lo enviaría también.
    e.stopPropagation()
    if (!valido) return
    setEnviando(true)

    const datos = { nombre: nombre.trim(), color: colorEfectivo }
    const { data, error } = editando
      ? await supabase.from('categoria').update(datos).eq('id', categoria.id).select().single()
      : await supabase.from('categoria').insert(datos).select().single()

    setEnviando(false)
    if (error) {
      // 23505 = violación de unicidad: `categoria.nombre` es único (DOMAIN §3.2).
      toast.error(
        error.code === '23505'
          ? `Ya existe una categoría llamada «${nombre.trim()}».`
          : error.message,
      )
      return
    }
    toast.exito(editando ? 'Categoría actualizada.' : `Categoría «${data.nombre}» creada.`)
    onGuardado(data)
  }

  return (
    <Modal
      titulo={editando ? 'Editar categoría' : 'Nueva categoría'}
      eyebrow="Categorías"
      onClose={onClose}
    >
      <form className="mov-form" onSubmit={enviar}>
        <div className="campo">
          <label className="campo__label" htmlFor="categoria-nombre">
            Nombre
          </label>
          <input
            id="categoria-nombre"
            className="input"
            type="text"
            value={nombre}
            autoFocus
            placeholder="Ej. Rigging"
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="campo">
          <span className="campo__label">Color</span>
          <SelectorColor
            valor={colorEfectivo}
            paleta={PALETA_CATEGORIA}
            onCambio={(c) => {
              setColor(c)
              setColorElegido(true)
            }}
          />
          <span className="campo__nota">
            Se propone uno estable a partir del nombre; puedes cambiarlo.
          </span>
        </div>

        <div className="campo">
          <span className="campo__label">Así se verá</span>
          <span>
            <CategoryChip nombre={nombre.trim() || 'Categoría'} color={colorEfectivo} />
          </span>
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
            {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear categoría'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
