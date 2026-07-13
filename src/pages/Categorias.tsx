import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCategorias, type CategoriaFila } from '../hooks/useCategorias'
import { CategoriaForm } from '../components/categorias/CategoriaForm'
import { CategoryChip } from '../components/CategoryChip'
import { Modal } from '../components/Modal'
import { useToast } from '../components/toast/useToast'
import { EmptyState, ErrorState, TableSkeleton } from '../components/States'
import { IconCategorias, IconPapelera } from '../components/icons'
import './Categorias.css'

/**
 * Gestión de categorías (SPEC §12). Abierta a cualquier usuario autenticado
 * (CONTRACTS §1.3; la RLS se relajó en S-D y el DELETE en S-F).
 *
 * **Al eliminar una categoría sus productos NO se borran: quedan sin categoría**
 * (`producto.categoria_id` → NULL, ON DELETE SET NULL). El histórico de
 * movimientos no referencia categorías, así que no se ve afectado.
 */
export function Categorias() {
  const { categorias, sinCategoria, cargando, error, recargar } = useCategorias()
  const toast = useToast()

  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<CategoriaFila | null>(null)
  const [borrando, setBorrando] = useState<CategoriaFila | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function eliminar() {
    if (!borrando) return
    setEnviando(true)
    const { error: err } = await supabase.from('categoria').delete().eq('id', borrando.id)
    setEnviando(false)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.exito(
      borrando.productos > 0
        ? `Categoría «${borrando.nombre}» eliminada. Sus ${borrando.productos} producto(s) quedan sin categoría.`
        : `Categoría «${borrando.nombre}» eliminada.`,
    )
    setBorrando(null)
    recargar()
  }

  return (
    <div className="cats">
      <header className="cats__cab">
        <div>
          <h1>Categorías</h1>
          <p className="cats__sub">
            {cargando
              ? 'Cargando…'
              : `${categorias.length} categoría${categorias.length === 1 ? '' : 's'}${
                  sinCategoria > 0 ? ` · ${sinCategoria} producto(s) sin categoría` : ''
                }`}
          </p>
        </div>
        <button className="boton boton--primario" onClick={() => setCreando(true)}>
          Nueva categoría
        </button>
      </header>

      <section className="cats__panel">
        {cargando ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState mensaje={error} onReintentar={recargar} />
        ) : categorias.length === 0 ? (
          <EmptyState
            icono={<IconCategorias size={26} />}
            titulo="Todavía no hay categorías"
            mensaje="Las categorías agrupan el material del inventario y le dan color."
            accion={
              <button className="boton boton--primario" onClick={() => setCreando(true)}>
                Nueva categoría
              </button>
            }
          />
        ) : (
          <ul className="cats__lista">
            {categorias.map((c) => (
              <li key={c.id} className="cat-fila">
                <CategoryChip nombre={c.nombre} color={c.color} />
                <span className="cat-fila__productos tnum">
                  {c.productos} producto{c.productos === 1 ? '' : 's'}
                </span>
                <div className="cat-fila__acciones">
                  <button className="boton boton--secundario" onClick={() => setEditando(c)}>
                    Editar
                  </button>
                  <button
                    className="cat-fila__borrar"
                    onClick={() => setBorrando(c)}
                    aria-label={`Eliminar categoría ${c.nombre}`}
                    title="Eliminar"
                  >
                    <IconPapelera size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(creando || editando) && (
        <CategoriaForm
          categoria={editando}
          onClose={() => {
            setCreando(false)
            setEditando(null)
          }}
          onGuardado={() => {
            setCreando(false)
            setEditando(null)
            recargar()
          }}
        />
      )}

      {borrando && (
        <Modal titulo="Eliminar categoría" eyebrow={borrando.nombre} onClose={() => setBorrando(null)}>
          <div className="cats__confirmar">
            <p>
              {borrando.productos > 0 ? (
                <>
                  <strong>{borrando.productos} producto(s)</strong> usan esta categoría.
                  No se borran: <strong>quedan sin categoría</strong> y podrás
                  reasignarlos después. El historial de movimientos no se toca.
                </>
              ) : (
                <>Ningún producto usa esta categoría.</>
              )}
            </p>
            <div className="mov-form__acciones">
              <button
                className="boton boton--secundario"
                onClick={() => setBorrando(null)}
                disabled={enviando}
              >
                Cancelar
              </button>
              <button className="boton boton--baja" onClick={eliminar} disabled={enviando}>
                {enviando ? 'Eliminando…' : 'Eliminar categoría'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
