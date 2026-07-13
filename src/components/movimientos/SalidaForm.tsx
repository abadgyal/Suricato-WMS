import { useMemo, useState } from 'react'
import type { Categoria, Cliente, Evento, ProductoDisponible } from '../../lib/domain'
import { llamarRpc, type EstadoStock } from '../../lib/rpc'
import { formatFecha } from '../../lib/format'
import { useToast } from '../toast/useToast'
import { ProductoPicker } from './ProductoPicker'

interface SalidaFormProps {
  productos: ProductoDisponible[]
  categorias: Map<string, Categoria>
  eventos: Evento[]
  clientes: Cliente[]
  onHecho: () => void
}

/**
 * Salida directa a un evento (SPEC §5 / CONTRACTS §2.4): mueve unidades
 * `disponible → en_evento`. No reduce el total. Exige `disponible_real ≥ unidades`
 * (si no, la RPC lanza WMS001). El cliente lo aporta el evento elegido; la RPC no
 * recibe cliente (frontera de CONTRACTS §2.4), así que se muestra derivado.
 */
export function SalidaForm({ productos, categorias, eventos, clientes, onHecho }: SalidaFormProps) {
  const toast = useToast()
  const [producto, setProducto] = useState<ProductoDisponible | null>(null)
  const [eventoId, setEventoId] = useState('')
  const [unidades, setUnidades] = useState('')
  const [enviando, setEnviando] = useState(false)

  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])
  const evento = eventos.find((e) => e.id === eventoId) ?? null
  const clienteEvento = evento?.cliente_id ? clientePorId.get(evento.cliente_id) : undefined

  const disponibleReal = producto?.disponible_real ?? 0
  const n = unidades === '' ? null : Number(unidades)
  const sinStock = n != null && n > disponibleReal
  const valido =
    producto != null && eventoId !== '' && n != null && Number.isInteger(n) && n > 0 && !sinStock

  function reset() {
    setProducto(null)
    setEventoId('')
    setUnidades('')
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || !producto || n == null) return
    setEnviando(true)
    try {
      await llamarRpc<EstadoStock>('salida_evento', {
        p_producto_id: producto.id!,
        p_unidades: n,
        p_evento_id: eventoId,
      })
      toast.exito(`Salida de ${n} × «${producto.nombre}» a «${evento?.nombre}».`)
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
          etiqueta="Buscar producto para la salida"
          autoFocus
        />
      </div>

      {producto && (
        <>
          <div className="mov-dato-destacado">
            <span className="mov-dato-destacado__label">Disponible real</span>
            <span
              className={`mov-dato-destacado__valor tnum ${disponibleReal <= 0 ? 'mov-dato-destacado__valor--baja' : ''}`}
            >
              {disponibleReal}
            </span>
            <span className="mov-dato-destacado__nota">unidades listas para salir</span>
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="salida-unidades">
              Unidades a enviar
            </label>
            <input
              id="salida-unidades"
              className="input"
              type="number"
              min={1}
              max={disponibleReal}
              step={1}
              inputMode="numeric"
              value={unidades}
              onChange={(e) => setUnidades(e.target.value)}
              placeholder="0"
            />
            {sinStock && (
              <span className="campo__error">
                Solo hay {disponibleReal} disponibles. Reduce las unidades o repón stock.
              </span>
            )}
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="salida-evento">
              Evento de destino
            </label>
            <select
              id="salida-evento"
              className="select"
              value={eventoId}
              onChange={(e) => setEventoId(e.target.value)}
            >
              <option value="">Elige un evento…</option>
              {eventos.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nombre} · {formatFecha(ev.fecha_inicio)}–{formatFecha(ev.fecha_fin)}
                </option>
              ))}
            </select>
            {eventos.length === 0 && (
              <span className="campo__nota">
                No hay eventos todavía. La gestión de eventos llega en el módulo de reservas.
              </span>
            )}
            {evento && (
              <span className="campo__nota">
                Cliente: {clienteEvento?.nombre ?? 'sin asignar'} · Estado: {evento.estado}
              </span>
            )}
          </div>

          <div className="mov-form__acciones">
            <button type="button" className="boton boton--secundario" onClick={reset} disabled={enviando}>
              Cancelar
            </button>
            <button type="submit" className="boton boton--primario" disabled={!valido || enviando}>
              {enviando ? 'Registrando…' : 'Registrar salida'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
