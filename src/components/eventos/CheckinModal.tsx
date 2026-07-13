import { useMemo, useState } from 'react'
import type { Categoria, Evento } from '../../lib/domain'
import type { FueraLinea } from '../../hooks/useEvento'
import { llamarRpc, type EstadoStock } from '../../lib/rpc'
import { useToast } from '../toast/useToast'
import { Modal } from '../Modal'
import { CategoryChip } from '../CategoryChip'
import './CheckinModal.css'

interface CheckinModalProps {
  evento: Evento
  /** Material que salió al evento y todavía no ha vuelto. */
  fuera: FueraLinea[]
  categorias: Map<string, Categoria>
  onClose: () => void
  onHecho: () => void
}

/** Reparto de una línea: lo que vuelve bien, lo roto y lo que no vuelve. */
interface Reparto {
  ok: string
  roto: string
  perdido: string
}

const REPARTO_VACIO: Reparto = { ok: '', roto: '', perdido: '' }

/** Devolución con retorno ampliado: varios movimientos (CONTRACTS §2.5). */
interface EstadoDevolucion extends EstadoStock {
  movimiento_ids: string[]
}

const num = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v)) || 0))

/**
 * Check-in de devolución por evento (SPEC §6). Por cada producto que sigue
 * fuera, el operario reparte las unidades entre OK (→ disponible), roto (→
 * en_reparacion) y perdido (→ baja, que es lo único que reduce el total).
 *
 * Admite devoluciones parciales: lo que no se reparte sigue fuera y se puede
 * cerrar en otro check-in. Llama a `devolver` una vez por producto con unidades;
 * cada llamada es su propia transacción, así que si una falla las anteriores ya
 * están registradas — se dice explícitamente en el aviso.
 */
export function CheckinModal({ evento, fuera, categorias, onClose, onHecho }: CheckinModalProps) {
  const toast = useToast()
  const [repartos, setRepartos] = useState<Record<string, Reparto>>({})
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  const reparto = (id: string) => repartos[id] ?? REPARTO_VACIO

  function set(id: string, campo: keyof Reparto, valor: string) {
    setRepartos((r) => ({ ...r, [id]: { ...(r[id] ?? REPARTO_VACIO), [campo]: valor } }))
  }

  function todoOk(linea: FueraLinea) {
    setRepartos((r) => ({
      ...r,
      [linea.producto_id]: { ok: String(linea.unidades_fuera), roto: '', perdido: '' },
    }))
  }

  const lineas = useMemo(
    () =>
      fuera.map((f) => {
        const r = reparto(f.producto_id)
        const reparte = num(r.ok) + num(r.roto) + num(r.perdido)
        return {
          f,
          ok: num(r.ok),
          roto: num(r.roto),
          perdido: num(r.perdido),
          reparte,
          excede: reparte > f.unidades_fuera,
          pendientes: f.unidades_fuera - reparte,
        }
      }),
    // `repartos` es la dependencia real; `reparto` es una lectura sobre él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fuera, repartos],
  )

  const totalPerdido = lineas.reduce((s, l) => s + l.perdido, 0)
  const totalReparte = lineas.reduce((s, l) => s + l.reparte, 0)
  const algunaExcede = lineas.some((l) => l.excede)
  const faltaMotivo = totalPerdido > 0 && motivo.trim().length === 0
  const valido = totalReparte > 0 && !algunaExcede && !faltaMotivo

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)

    const conUnidades = lineas.filter((l) => l.reparte > 0)
    let hechas = 0
    let movimientos = 0

    for (const l of conUnidades) {
      try {
        const res = await llamarRpc<EstadoDevolucion>('devolver', {
          p_evento_id: evento.id,
          p_producto_id: l.f.producto_id,
          p_ok: l.ok,
          p_roto: l.roto,
          p_perdido: l.perdido,
          p_motivo: l.perdido > 0 ? motivo.trim() : undefined,
        })
        hechas += 1
        movimientos += res.movimiento_ids?.length ?? 1
      } catch (err) {
        // Cada `devolver` es una transacción independiente: lo ya devuelto queda
        // registrado. Se dice tal cual en vez de fingir que no pasó nada.
        const nombre = l.f.producto?.nombre ?? 'un producto'
        toast.error(
          hechas > 0
            ? `Se devolvieron ${hechas} línea${hechas === 1 ? '' : 's'} y falló en «${nombre}»: ${(err as Error).message}`
            : (err as Error).message,
        )
        setEnviando(false)
        onHecho()
        return
      }
    }

    setEnviando(false)
    toast.exito(
      `Check-in registrado: ${totalReparte} unidad${totalReparte === 1 ? '' : 'es'} en ${movimientos} movimiento${movimientos === 1 ? '' : 's'}.`,
    )
    onHecho()
    onClose()
  }

  return (
    <Modal titulo="Check-in de devolución" eyebrow={evento.nombre} onClose={onClose} ancho="lg">
      <form className="checkin" onSubmit={enviar}>
        <p className="checkin__intro">
          Reparte lo que vuelve de cada producto. Lo que no repartas sigue fuera y podrás cerrarlo en
          otro check-in. Solo las unidades <strong>perdidas</strong> reducen el total.
        </p>

        <div className="checkin__tabla-scroll">
          <table className="checkin__tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="checkin__col-num">Fuera</th>
                <th className="checkin__col-num">OK</th>
                <th className="checkin__col-num">Roto</th>
                <th className="checkin__col-num">Perdido</th>
                <th className="checkin__col-num">Pendientes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lineas.map(({ f, excede, pendientes }) => {
                const cat = f.producto?.categoria_id
                  ? categorias.get(f.producto.categoria_id)
                  : undefined
                const r = reparto(f.producto_id)
                return (
                  <tr key={f.producto_id} className={excede ? 'checkin__fila--error' : ''}>
                    <td>
                      <span className="checkin__producto">{f.producto?.nombre ?? '—'}</span>
                      {cat && <CategoryChip nombre={cat.nombre} color={cat.color} />}
                    </td>
                    <td className="checkin__col-num tnum">{f.unidades_fuera}</td>
                    {(['ok', 'roto', 'perdido'] as const).map((campo) => (
                      <td key={campo} className="checkin__col-num">
                        <input
                          className={`input checkin__input checkin__input--${campo}`}
                          type="number"
                          min={0}
                          max={f.unidades_fuera}
                          step={1}
                          inputMode="numeric"
                          value={r[campo]}
                          placeholder="0"
                          aria-label={`${campo} de ${f.producto?.nombre ?? 'producto'}`}
                          onChange={(e) => set(f.producto_id, campo, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="checkin__col-num tnum">
                      <span className={excede ? 'checkin__pendientes--error' : ''}>
                        {excede ? `+${-pendientes} de más` : pendientes}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="checkin__todo-ok"
                        onClick={() => todoOk(f)}
                        disabled={enviando}
                      >
                        Todo OK
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {algunaExcede && (
          <p className="campo__error">
            Alguna línea reparte más unidades de las que hay fuera. Corrígela antes de continuar.
          </p>
        )}

        {totalPerdido > 0 && (
          <div className="campo checkin__motivo">
            <label className="campo__label" htmlFor="checkin-motivo">
              Motivo de la pérdida <span className="campo__nota">(obligatorio)</span>
            </label>
            <input
              id="checkin-motivo"
              className="input"
              type="text"
              value={motivo}
              placeholder="Ej. no aparecieron en el desmontaje"
              onChange={(e) => setMotivo(e.target.value)}
            />
            <span className="campo__nota">
              {totalPerdido} unidad{totalPerdido === 1 ? '' : 'es'} saldrá{totalPerdido === 1 ? '' : 'n'}{' '}
              del total de forma permanente.
            </span>
          </div>
        )}

        <div className="mov-form__acciones">
          <button type="button" className="boton boton--secundario" onClick={onClose} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={!valido || enviando}>
            {enviando ? 'Registrando…' : `Registrar devolución (${totalReparte})`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
