import { useMemo, useState } from 'react'
import { BUCKET_LABEL, BUCKETS_BAJA, type Bucket } from '../lib/domain'
import { llamarRpc, type EstadoStock } from '../lib/rpc'
import { useToast } from './toast/useToast'
import './AccionesEstado.css'

interface AccionesEstadoProps {
  productoId: string
  productoNombre: string
  disponible: number
  en_evento: number
  en_reparacion: number
  /** Recibe el estado tras una RPC con éxito (para refrescar ficha + lista). */
  onEstado: (estado: EstadoStock) => void
}

/**
 * Acciones de estado desde la ficha (SPEC §3 / CONTRACTS §2.6, §2.7):
 * `marcar_reparado` (en_reparacion → disponible) y `dar_de_baja` (saca del total,
 * con bucket de origen y motivo). Ambas pasan por RPC; nunca escriben buckets.
 */
export function AccionesEstado({
  productoId,
  productoNombre,
  disponible,
  en_evento,
  en_reparacion,
  onEstado,
}: AccionesEstadoProps) {
  const toast = useToast()

  const [repUnidades, setRepUnidades] = useState('')
  const [repEnviando, setRepEnviando] = useState(false)

  const [bajaBucket, setBajaBucket] = useState<Bucket>(BUCKETS_BAJA[0])
  const [bajaUnidades, setBajaUnidades] = useState('')
  const [bajaMotivo, setBajaMotivo] = useState('')
  const [bajaEnviando, setBajaEnviando] = useState(false)

  const stockPorBucket: Record<Bucket, number> = useMemo(
    () => ({ disponible, en_evento, en_reparacion }),
    [disponible, en_evento, en_reparacion],
  )

  // Solo `disponible` y `en_reparacion` con unidades: `en_evento` no es un origen
  // válido de baja (CONTRACTS §2.7). El material perdido en un evento se registra
  // en el check-in de devolución como «perdido», que liga la baja a su evento.
  const bucketsConStock = BUCKETS_BAJA.filter((b) => stockPorBucket[b] > 0)

  // Si el bucket elegido se queda a 0 (p. ej. tras una baja), salta a otro con stock.
  const bucketBaja = stockPorBucket[bajaBucket] > 0 ? bajaBucket : bucketsConStock[0] ?? bajaBucket
  const maxBaja = stockPorBucket[bucketBaja] ?? 0

  const repN = repUnidades === '' ? null : Number(repUnidades)
  const repValido = repN != null && Number.isInteger(repN) && repN > 0 && repN <= en_reparacion

  const bajaN = bajaUnidades === '' ? null : Number(bajaUnidades)
  const bajaValido =
    bajaN != null && Number.isInteger(bajaN) && bajaN > 0 && bajaN <= maxBaja && bajaMotivo.trim() !== ''

  async function reparar(e: React.FormEvent) {
    e.preventDefault()
    if (!repValido || repN == null) return
    setRepEnviando(true)
    try {
      const est = await llamarRpc<EstadoStock>('marcar_reparado', {
        p_producto_id: productoId,
        p_unidades: repN,
      })
      toast.exito(`${repN} unidad(es) de «${productoNombre}» de vuelta a disponible.`)
      setRepUnidades('')
      onEstado(est)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRepEnviando(false)
    }
  }

  async function darDeBaja(e: React.FormEvent) {
    e.preventDefault()
    if (!bajaValido || bajaN == null) return
    setBajaEnviando(true)
    try {
      const est = await llamarRpc<EstadoStock>('dar_de_baja', {
        p_producto_id: productoId,
        p_unidades: bajaN,
        p_bucket_origen: bucketBaja,
        p_motivo: bajaMotivo.trim(),
      })
      toast.exito(`Baja de ${bajaN} unidad(es) de «${productoNombre}» (${BUCKET_LABEL[bucketBaja]}).`)
      setBajaUnidades('')
      setBajaMotivo('')
      onEstado(est)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBajaEnviando(false)
    }
  }

  return (
    <section className="acciones">
      <h3 className="acciones__titulo">Acciones de estado</h3>

      {/* --- Marcar reparado --- */}
      <form className="acciones__bloque" onSubmit={reparar}>
        <div className="acciones__cab">
          <span className="acciones__nombre">Marcar reparado</span>
          <span className="acciones__ayuda">De «en reparación» a «disponible».</span>
        </div>
        {en_reparacion === 0 ? (
          <p className="acciones__vacio">No hay unidades en reparación.</p>
        ) : (
          <div className="acciones__fila">
            <input
              className="input"
              type="number"
              min={1}
              max={en_reparacion}
              step={1}
              inputMode="numeric"
              value={repUnidades}
              onChange={(e) => setRepUnidades(e.target.value)}
              placeholder={`1–${en_reparacion}`}
              aria-label="Unidades reparadas"
            />
            <button className="boton boton--secundario" type="submit" disabled={!repValido || repEnviando}>
              {repEnviando ? 'Registrando…' : 'Marcar reparado'}
            </button>
          </div>
        )}
      </form>

      {/* --- Dar de baja --- */}
      <form className="acciones__bloque" onSubmit={darDeBaja}>
        <div className="acciones__cab">
          <span className="acciones__nombre acciones__nombre--baja">Dar de baja</span>
          <span className="acciones__ayuda">
            Saca unidades del total de forma permanente. Requiere motivo. Solo desde almacén
            (disponible o en reparación).
          </span>
        </div>
        {en_evento > 0 && (
          <p className="acciones__vacio">
            Hay {en_evento} unidad(es) en un evento. El material que no vuelve se da de baja en
            el check-in de devolución del evento, marcándolo como «perdido»: así la baja queda
            ligada a su evento.
          </p>
        )}
        {bucketsConStock.length === 0 ? (
          <p className="acciones__vacio">No hay unidades en almacén que dar de baja.</p>
        ) : (
          <>
            <div className="acciones__fila">
              <select
                className="select"
                value={bucketBaja}
                onChange={(e) => setBajaBucket(e.target.value as Bucket)}
                aria-label="Bucket de origen"
              >
                {bucketsConStock.map((b) => (
                  <option key={b} value={b}>
                    {BUCKET_LABEL[b]} ({stockPorBucket[b]})
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                min={1}
                max={maxBaja}
                step={1}
                inputMode="numeric"
                value={bajaUnidades}
                onChange={(e) => setBajaUnidades(e.target.value)}
                placeholder={`1–${maxBaja}`}
                aria-label="Unidades a dar de baja"
              />
            </div>
            <input
              className="input"
              type="text"
              value={bajaMotivo}
              onChange={(e) => setBajaMotivo(e.target.value)}
              placeholder="Motivo (rotura irreparable, pérdida…)"
              aria-label="Motivo de la baja"
            />
            <div className="acciones__fila acciones__fila--fin">
              <button className="boton boton--baja" type="submit" disabled={!bajaValido || bajaEnviando}>
                {bajaEnviando ? 'Registrando…' : 'Dar de baja'}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  )
}
