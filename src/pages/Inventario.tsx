import { useMemo, useState } from 'react'
import { useInventario } from '../hooks/useInventario'
import { BUCKETS, BUCKET_LABEL, type Bucket, type ProductoDisponible } from '../lib/domain'
import { InventoryTable } from '../components/InventoryTable'
import { ProductModal } from '../components/ProductModal'
import { Lightbox } from '../components/Lightbox'
import { TableSkeleton, EmptyState, ErrorState } from '../components/States'
import { IconBuscar, IconInventario } from '../components/icons'
import './Inventario.css'

type Orden = 'nombre' | 'stock' | 'ubicacion'

export function Inventario() {
  const { productos, categorias, cargando, error, recargar, actualizando } = useInventario()

  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroBucket, setFiltroBucket] = useState<'' | Bucket>('')
  const [orden, setOrden] = useState<Orden>('nombre')

  const [ficha, setFicha] = useState<ProductoDisponible | null>(null)
  const [foto, setFoto] = useState<{ src: string; alt: string } | null>(null)

  // Lista de categorías presente en el inventario, ordenada por nombre.
  const categoriasOrdenadas = useMemo(
    () => [...categorias.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [categorias],
  )

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    let lista = productos.filter((p) => {
      if (q && !(p.nombre ?? '').toLowerCase().includes(q)) return false
      if (filtroCat && p.categoria_id !== filtroCat) return false
      // Filtro por estado: productos con ≥1 unidad en el bucket elegido.
      if (filtroBucket && (p[filtroBucket] ?? 0) < 1) return false
      return true
    })

    lista = [...lista].sort((a, b) => {
      switch (orden) {
        case 'stock':
          return (b.total ?? 0) - (a.total ?? 0)
        case 'ubicacion':
          return (a.ubicacion ?? '￿').localeCompare(b.ubicacion ?? '￿', 'es')
        default:
          return (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es')
      }
    })
    return lista
  }, [productos, busqueda, filtroCat, filtroBucket, orden])

  const hayFiltros = Boolean(busqueda || filtroCat || filtroBucket)
  const bajoMinimo = productos.filter((p) => p.bajo_minimo).length

  function limpiarFiltros() {
    setBusqueda('')
    setFiltroCat('')
    setFiltroBucket('')
  }

  return (
    <div className="inventario">
      <header className="inventario__cab">
        <div className="inventario__titulo-zona">
          <h1>Inventario</h1>
          <p className="inventario__sub">
            {cargando
              ? 'Cargando material…'
              : `${productos.length} ${productos.length === 1 ? 'referencia' : 'referencias'}`}
            {!cargando && bajoMinimo > 0 && (
              <span className="inventario__alerta">
                {bajoMinimo} bajo mínimo
              </span>
            )}
            {actualizando && <span className="inventario__vivo">actualizando…</span>}
          </p>
        </div>

        <div className="inventario__buscador">
          <IconBuscar size={18} />
          <input
            className="inventario__buscador-input"
            type="search"
            placeholder="Buscar por nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar producto por nombre"
          />
        </div>
      </header>

      <div className="inventario__filtros">
        <label className="filtro">
          <span className="sr-only">Filtrar por categoría</span>
          <select
            className="select"
            value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value)}
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {categoriasOrdenadas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="filtro">
          <span className="sr-only">Filtrar por estado</span>
          <select
            className="select"
            value={filtroBucket}
            onChange={(e) => setFiltroBucket(e.target.value as '' | Bucket)}
            aria-label="Filtrar por estado del stock"
          >
            <option value="">Cualquier estado</option>
            {BUCKETS.map((b) => (
              <option key={b} value={b}>
                Con stock {BUCKET_LABEL[b].toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="filtro">
          <span className="sr-only">Ordenar</span>
          <select
            className="select"
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            aria-label="Ordenar inventario"
          >
            <option value="nombre">Orden: nombre</option>
            <option value="stock">Orden: mayor stock</option>
            <option value="ubicacion">Orden: ubicación</option>
          </select>
        </label>

        {hayFiltros && (
          <button className="filtro__limpiar" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      <section className="inventario__panel">
        {cargando ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState mensaje={error} onReintentar={recargar} />
        ) : productos.length === 0 ? (
          <EmptyState
            icono={<IconInventario size={26} />}
            titulo="Aún no hay material registrado"
            mensaje="Cuando se registren entradas de mercancía, el material aparecerá aquí con su desglose de stock. El alta de productos llega en el módulo de movimientos."
          />
        ) : visibles.length === 0 ? (
          <EmptyState
            icono={<IconBuscar size={26} />}
            titulo="Ningún producto coincide"
            mensaje="Prueba con otro texto o quita algún filtro para ver más material."
            accion={
              <button className="boton boton--secundario" onClick={limpiarFiltros}>
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <InventoryTable
            productos={visibles}
            categorias={categorias}
            onAbrirFicha={setFicha}
            onAbrirFoto={(src, alt) => setFoto({ src, alt })}
          />
        )}
      </section>

      {ficha && (
        <ProductModal
          producto={ficha}
          categoria={ficha.categoria_id ? categorias.get(ficha.categoria_id) : undefined}
          onClose={() => setFicha(null)}
          onCambio={recargar}
        />
      )}

      {foto && <Lightbox src={foto.src} alt={foto.alt} onClose={() => setFoto(null)} />}
    </div>
  )
}
