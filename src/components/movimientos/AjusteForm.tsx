import { useState } from 'react'
import type { Categoria, ProductoDisponible } from '../../lib/domain'
import { BUCKETS, BUCKET_LABEL, type Bucket } from '../../lib/domain'
import { llamarRpc, type EstadoStock } from '../../lib/rpc'
import { useToast } from '../toast/useToast'
import { ProductoPicker } from './ProductoPicker'

interface AjusteFormProps {
  productos: ProductoDisponible[]
  categorias: Map<string, Categoria>
  /** Relee el catálogo tras una operación con éxito. */
  onHecho: () => void
}

/**
 * Ajuste de inventario (SPEC §7 / CONTRACTS §2.8): fija el valor de un bucket para
 * cuadrar con el recuento físico. Muestra el valor actual, previsualiza
 * anterior→nuevo y exige motivo. Nunca escribe el bucket: llama a `ajustar`.
 */
export function AjusteForm({ productos, categorias, onHecho }: AjusteFormProps) {
  const toast = useToast()
  const [producto, setProducto] = useState<ProductoDisponible | null>(null)
  const [bucket, setBucket] = useState<Bucket>('disponible')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  const actual = producto ? producto[bucket] ?? 0 : 0
  const nuevo = valor === '' ? null : Number(valor)
  const valido =
    producto != null && nuevo != null && Number.isInteger(nuevo) && nuevo >= 0 && motivo.trim() !== ''
  const delta = nuevo != null ? nuevo - actual : 0

  function reset() {
    setProducto(null)
    setBucket('disponible')
    setValor('')
    setMotivo('')
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || !producto || nuevo == null) return
    setEnviando(true)
    try {
      await llamarRpc<EstadoStock>('ajustar', {
        p_producto_id: producto.id!,
        p_bucket: bucket,
        p_valor_nuevo: nuevo,
        p_motivo: motivo.trim(),
      })
      toast.exito(`Ajuste registrado en «${producto.nombre}» (${BUCKET_LABEL[bucket]}).`)
      reset()
      onHecho()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="mov-form" onSubmit={enviar}>
      <div className="campo">
        <span className="campo__label">Producto</span>
        <ProductoPicker
          productos={productos}
          categorias={categorias}
          valor={producto}
          onSelect={setProducto}
          etiqueta="Buscar producto a ajustar"
          autoFocus
        />
      </div>

      {producto && (
        <>
          <div className="campo">
            <label className="campo__label" htmlFor="ajuste-bucket">
              Estado a corregir
            </label>
            <select
              id="ajuste-bucket"
              className="select"
              value={bucket}
              onChange={(e) => setBucket(e.target.value as Bucket)}
            >
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {BUCKET_LABEL[b]} (actual: {producto[b] ?? 0})
                </option>
              ))}
            </select>
          </div>

          <div className="mov-preview">
            <div className="mov-preview__caja">
              <span className="mov-preview__label">Actual</span>
              <span className="mov-preview__valor tnum">{actual}</span>
            </div>
            <span className="mov-preview__flecha" aria-hidden="true">
              →
            </span>
            <div className="mov-preview__caja">
              <span className="mov-preview__label">Nuevo</span>
              <span
                className={`mov-preview__valor tnum ${
                  nuevo == null ? '' : delta > 0 ? 'mov-preview__valor--sube' : delta < 0 ? 'mov-preview__valor--baja' : ''
                }`}
              >
                {nuevo == null ? '—' : nuevo}
              </span>
            </div>
            {nuevo != null && delta !== 0 && (
              <span
                className={`mov-preview__delta tnum ${delta > 0 ? 'mov-preview__delta--sube' : 'mov-preview__delta--baja'}`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="ajuste-valor">
              Valor correcto
            </label>
            <input
              id="ajuste-valor"
              className="input"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Unidades reales tras el recuento"
            />
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="ajuste-motivo">
              Motivo (obligatorio)
            </label>
            <input
              id="ajuste-motivo"
              className="input"
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Recuento físico, merma, error previo…"
            />
          </div>

          <div className="mov-form__acciones">
            <button type="button" className="boton boton--secundario" onClick={reset} disabled={enviando}>
              Cancelar
            </button>
            <button type="submit" className="boton boton--primario" disabled={!valido || enviando}>
              {enviando ? 'Registrando…' : 'Registrar ajuste'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
