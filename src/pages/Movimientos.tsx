import { useMemo, useState } from 'react'
import { useCatalogo } from '../hooks/useCatalogo'
import type { Categoria } from '../lib/domain'
import { EntradaForm } from '../components/movimientos/EntradaForm'
import { SalidaForm } from '../components/movimientos/SalidaForm'
import { AjusteForm } from '../components/movimientos/AjusteForm'
import { ErrorState } from '../components/States'
import { IconMovimientos } from '../components/icons'
import './Movimientos.css'

type Tab = 'entrada' | 'salida' | 'ajuste'

const TABS: { id: Tab; label: string; descripcion: string }[] = [
  { id: 'entrada', label: 'Entrada', descripcion: 'Registra la llegada de mercancía o da de alta un producto nuevo.' },
  { id: 'salida', label: 'Salida a evento', descripcion: 'Envía material a un evento (disponible → en evento). No reduce el total.' },
  { id: 'ajuste', label: 'Ajuste', descripcion: 'Cuadra un bucket con el recuento físico. Requiere motivo.' },
]

/**
 * Operaciones del día a día (S-D): entrada, salida a evento y ajuste. Cada
 * formulario llama a su RPC de CONTRACTS §2; los errores WMS### salen como toast.
 */
export function Movimientos() {
  const { productos, categorias, eventos, clientes, cargando, error, recargar } = useCatalogo()
  const [tab, setTab] = useState<Tab>('entrada')

  const categoriasMap = useMemo(
    () => new Map<string, Categoria>(categorias.map((c) => [c.id, c])),
    [categorias],
  )

  const activa = TABS.find((t) => t.id === tab)!

  return (
    <div className="movimientos">
      <header className="movimientos__cab">
        <h1>Movimientos</h1>
        <p className="movimientos__sub">Entradas, salidas a evento y ajustes de stock.</p>
      </header>

      <div className="movimientos__tabs" role="tablist" aria-label="Tipo de movimiento">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`movimientos__tab ${tab === t.id ? 'movimientos__tab--activa' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="movimientos__panel">
        <p className="movimientos__desc">{activa.descripcion}</p>

        {error ? (
          <ErrorState mensaje={error} onReintentar={recargar} />
        ) : cargando ? (
          <div className="movimientos__cargando">
            <IconMovimientos size={26} />
            <span>Cargando catálogo…</span>
          </div>
        ) : (
          <>
            {tab === 'entrada' && (
              <EntradaForm
                productos={productos}
                categorias={categoriasMap}
                clientes={clientes}
                onHecho={recargar}
              />
            )}
            {tab === 'salida' && (
              <SalidaForm
                productos={productos}
                categorias={categoriasMap}
                eventos={eventos}
                clientes={clientes}
                onHecho={recargar}
              />
            )}
            {tab === 'ajuste' && (
              <AjusteForm productos={productos} categorias={categoriasMap} onHecho={recargar} />
            )}
          </>
        )}
      </section>
    </div>
  )
}
