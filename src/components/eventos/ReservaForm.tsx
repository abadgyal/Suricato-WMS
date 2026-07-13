import { useState } from 'react'
import type { Categoria, Evento, ProductoDisponible } from '../../lib/domain'
import { llamarRpc } from '../../lib/rpc'
import { useToast } from '../toast/useToast'
import { Modal } from '../Modal'
import { ProductoPicker } from '../movimientos/ProductoPicker'
import './ReservaForm.css'

interface ReservaFormProps {
  evento: Evento
  productos: ProductoDisponible[]
  categorias: Map<string, Categoria>
  onClose: () => void
  onHecho: () => void
}

/**
 * Añade una línea de reserva al evento (SPEC §8 / CONTRACTS §2.2). La reserva
 * bloquea `disponible_real` pero **no mueve buckets**: el material sigue en el
 * almacén hasta que se cumple.
 *
 * Se valida contra `disponible_real` en el cliente por UX; la garantía real es
 * de la RPC, que lanza WMS001 si no cabe (p. ej. si otro operario reservó a la
 * vez las mismas unidades).
 */
export function ReservaForm({ evento, productos, categorias, onClose, onHecho }: ReservaFormProps) {
  const toast = useToast()
  const [producto, setProducto] = useState<ProductoDisponible | null>(null)
  const [unidades, setUnidades] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)

  const total = producto?.total ?? 0
  const reservado = producto?.reservado ?? 0
  const disponibleReal = producto?.disponible_real ?? 0

  const n = unidades === '' ? null : Number(unidades)
  const noCabe = n != null && n > disponibleReal
  const valido = producto != null && n != null && Number.isInteger(n) && n > 0 && !noCabe

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || !producto || n == null) return
    setEnviando(true)
    try {
      await llamarRpc('crear_reserva', {
        p_evento_id: evento.id,
        p_producto_id: producto.id!,
        p_unidades: n,
        p_notas: notas.trim() || undefined,
      })
      toast.exito(`Reservadas ${n} × «${producto.nombre}» para «${evento.nombre}».`)
      onHecho()
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Añadir reserva" eyebrow={evento.nombre} onClose={onClose}>
      <form className="mov-form" onSubmit={enviar}>
        <div className="campo">
          <span className="campo__label">Producto</span>
          <ProductoPicker
            productos={productos}
            categorias={categorias}
            valor={producto}
            onSelect={setProducto}
            etiqueta="Buscar producto para reservar"
            autoFocus
          />
        </div>

        {producto && (
          <>
            <div className="reserva-stock">
              <div className="reserva-stock__caja">
                <span className="reserva-stock__label">Total</span>
                <span className="reserva-stock__valor tnum">{total}</span>
              </div>
              <div className="reserva-stock__caja">
                <span className="reserva-stock__label">Ya reservado</span>
                <span className="reserva-stock__valor tnum">{reservado}</span>
              </div>
              <div className="reserva-stock__caja reserva-stock__caja--destacada">
                <span className="reserva-stock__label">Disponible real</span>
                <span
                  className={`reserva-stock__valor tnum ${disponibleReal <= 0 ? 'reserva-stock__valor--cero' : ''}`}
                >
                  {disponibleReal}
                </span>
              </div>
            </div>

            <div className="campo">
              <label className="campo__label" htmlFor="reserva-unidades">
                Unidades a reservar
              </label>
              <input
                id="reserva-unidades"
                className="input"
                type="number"
                min={1}
                max={disponibleReal}
                step={1}
                inputMode="numeric"
                value={unidades}
                placeholder="0"
                onChange={(e) => setUnidades(e.target.value)}
              />
              {noCabe && (
                <span className="campo__error">
                  Solo quedan {disponibleReal} sin comprometer. Reduce las unidades, libera otra
                  reserva o repón stock.
                </span>
              )}
              {disponibleReal <= 0 && (
                <span className="campo__nota">
                  Todo el stock de este producto está comprometido o fuera.
                </span>
              )}
            </div>

            <div className="campo">
              <label className="campo__label" htmlFor="reserva-notas">
                Notas <span className="campo__nota">(opcional)</span>
              </label>
              <input
                id="reserva-notas"
                className="input"
                type="text"
                value={notas}
                placeholder="Ej. van en el flightcase 3"
                onChange={(e) => setNotas(e.target.value)}
              />
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
                {enviando ? 'Reservando…' : 'Añadir reserva'}
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}
