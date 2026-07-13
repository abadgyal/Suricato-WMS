import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Categoria, ProductoDisponible } from '../lib/domain'
import { supabase } from '../lib/supabase'
import { fotoUrl, formatFecha, formatFechaHora, formatMedida } from '../lib/format'
import type { EstadoStock } from '../lib/rpc'
import { useToast } from './toast/useToast'
import { StockBar } from './StockBar'
import { BucketNumbers } from './BucketNumbers'
import { CategoryChip } from './CategoryChip'
import { LocationChip } from './LocationChip'
import { ProductThumb } from './ProductThumb'
import { Lightbox } from './Lightbox'
import { AccionesEstado } from './AccionesEstado'
import { IconCerrar } from './icons'
import './ProductModal.css'

interface ProductModalProps {
  producto: ProductoDisponible
  /** Catálogo de categorías: permite ver la suya y reasignarla. */
  categorias: Map<string, Categoria>
  onClose: () => void
  /** Se llama tras una acción de estado con éxito (para refrescar la lista). */
  onCambio?: () => void
}

/** Ficha de producto en modal con acciones de estado (reparado / baja). */
export function ProductModal({ producto, categorias, onClose, onCambio }: ProductModalProps) {
  const toast = useToast()
  const [lightbox, setLightbox] = useState(false)
  const foto = fotoUrl(producto.foto_path)
  const nombre = producto.nombre ?? 'Producto'

  // Categoría editable: un producto puede quedarse sin categoría si se borró la
  // suya (DOMAIN §3.2), y desde aquí se le asigna otra. Es metadato, no bucket:
  // va por UPDATE directo bajo RLS (CONTRACTS §3).
  const [categoriaId, setCategoriaId] = useState(producto.categoria_id ?? '')
  const [guardandoCat, setGuardandoCat] = useState(false)
  const categoria = categoriaId ? categorias.get(categoriaId) : undefined
  const categoriasOrdenadas = [...categorias.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es'),
  )

  async function cambiarCategoria(nuevaId: string) {
    const anterior = categoriaId
    setCategoriaId(nuevaId)
    setGuardandoCat(true)
    const { error } = await supabase
      .from('producto')
      .update({ categoria_id: nuevaId || null })
      .eq('id', producto.id!)
    setGuardandoCat(false)

    if (error) {
      setCategoriaId(anterior)
      toast.error(error.message)
      return
    }
    toast.exito(
      nuevaId
        ? `«${nombre}» pasa a la categoría «${categorias.get(nuevaId)?.nombre ?? ''}».`
        : `«${nombre}» queda sin categoría.`,
    )
    onCambio?.()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ESC cierra la ficha, salvo que el lightbox esté encima (lo cierra él).
      if (e.key === 'Escape' && !lightbox) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, lightbox])

  // Estado de buckets vivo: se siembra del producto y se actualiza con el retorno
  // de las RPC de acción (reparado / baja), sin esperar a Realtime.
  const [buckets, setBuckets] = useState({
    disponible: producto.disponible ?? 0,
    en_evento: producto.en_evento ?? 0,
    en_reparacion: producto.en_reparacion ?? 0,
    total: producto.total ?? 0,
  })

  function aplicarEstado(est: EstadoStock) {
    setBuckets({
      disponible: est.disponible,
      en_evento: est.en_evento,
      en_reparacion: est.en_reparacion,
      total: est.total,
    })
    onCambio?.()
  }

  const { disponible, en_evento, en_reparacion, total } = buckets
  const reservado = producto.reservado ?? 0
  // disponible_real = disponible − reservas activas (las acciones no tocan reservas).
  const disponibleReal = Math.max(0, disponible - reservado)

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <p className="modal__eyebrow">Ficha de producto</p>
            <h2 id="ficha-titulo">{nombre}</h2>
          </div>
          <button className="modal__cerrar" onClick={onClose} aria-label="Cerrar ficha (Esc)">
            <IconCerrar size={22} />
          </button>
        </header>

        <div className="modal__body">
          <div className="modal__col-foto">
            <ProductThumb
              src={foto}
              alt={nombre}
              size="lg"
              onOpen={foto ? () => setLightbox(true) : undefined}
            />
            <div className="modal__chips">
              {categoria && <CategoryChip nombre={categoria.nombre} color={categoria.color} />}
              <LocationChip ubicacion={producto.ubicacion} />
            </div>

            <label className="modal__categoria campo">
              <span className="campo__label">Categoría</span>
              <select
                className="select"
                value={categoriaId}
                disabled={guardandoCat}
                onChange={(e) => void cambiarCategoria(e.target.value)}
              >
                <option value="">Sin categoría</option>
                {categoriasOrdenadas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="modal__col-datos">
            <section className="modal__bloque">
              <div className="modal__bloque-cab">
                <h3>Distribución del stock</h3>
                <span className="modal__total tnum">{total} operativas</span>
              </div>
              <StockBar
                disponible={disponible}
                en_evento={en_evento}
                en_reparacion={en_reparacion}
                size="lg"
              />
              <BucketNumbers
                disponible={disponible}
                en_evento={en_evento}
                en_reparacion={en_reparacion}
                variant="grid"
              />
            </section>

            <section className="modal__stats">
              <div className="stat">
                <span className="stat__label">Disponible real</span>
                <span className="stat__valor tnum">{disponibleReal}</span>
                {reservado > 0 && <span className="stat__nota tnum">{reservado} reservadas</span>}
              </div>
              <div className="stat">
                <span className="stat__label">Stock mínimo</span>
                <span className={`stat__valor tnum ${producto.bajo_minimo ? 'stat__valor--bajo' : ''}`}>
                  {producto.stock_minimo ?? 0}
                </span>
                {producto.bajo_minimo && <span className="stat__nota stat__nota--alerta">Bajo mínimo</span>}
              </div>
              <div className="stat">
                <span className="stat__label">Total operativo</span>
                <span className="stat__valor tnum">{total}</span>
              </div>
            </section>

            <section className="modal__meta">
              <h3 className="modal__meta-titulo">Dimensiones y peso</h3>
              <dl className="modal__def">
                <div>
                  <dt>Largo</dt>
                  <dd className="tnum">{formatMedida(producto.largo_cm, 'cm')}</dd>
                </div>
                <div>
                  <dt>Ancho</dt>
                  <dd className="tnum">{formatMedida(producto.ancho_cm, 'cm')}</dd>
                </div>
                <div>
                  <dt>Alto</dt>
                  <dd className="tnum">{formatMedida(producto.alto_cm, 'cm')}</dd>
                </div>
                <div>
                  <dt>Peso</dt>
                  <dd className="tnum">{formatMedida(producto.peso_kg, 'kg')}</dd>
                </div>
              </dl>
            </section>

            <section className="modal__meta">
              <h3 className="modal__meta-titulo">Fechas</h3>
              <dl className="modal__def">
                <div>
                  <dt>Creado</dt>
                  <dd>{formatFecha(producto.creado_en)}</dd>
                </div>
                <div>
                  <dt>Actualizado</dt>
                  <dd>{formatFechaHora(producto.actualizado_en)}</dd>
                </div>
              </dl>
            </section>

            <AccionesEstado
              productoId={producto.id!}
              productoNombre={nombre}
              disponible={disponible}
              en_evento={en_evento}
              en_reparacion={en_reparacion}
              onEstado={aplicarEstado}
            />
          </div>
        </div>
      </div>

      {lightbox && foto && (
        <Lightbox src={foto} alt={nombre} onClose={() => setLightbox(false)} />
      )}
    </div>,
    document.body,
  )
}
