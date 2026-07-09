import type { Categoria, ProductoDisponible } from '../lib/domain'
import { fotoUrl, formatFecha } from '../lib/format'
import { StockBar } from './StockBar'
import { BucketNumbers } from './BucketNumbers'
import { CategoryChip } from './CategoryChip'
import { LocationChip } from './LocationChip'
import { ProductThumb } from './ProductThumb'
import './InventoryTable.css'

interface InventoryTableProps {
  productos: ProductoDisponible[]
  categorias: Map<string, Categoria>
  onAbrirFicha: (p: ProductoDisponible) => void
  onAbrirFoto: (src: string, alt: string) => void
}

export function InventoryTable({
  productos,
  categorias,
  onAbrirFicha,
  onAbrirFoto,
}: InventoryTableProps) {
  return (
    <div className="tabla" role="table" aria-label="Inventario de productos">
      <div className="tabla__cab" role="row">
        <span role="columnheader">Foto</span>
        <span role="columnheader">Producto</span>
        <span role="columnheader">Categoría</span>
        <span role="columnheader">Distribución de stock</span>
        <span role="columnheader" className="tabla__num">Mínimo</span>
        <span role="columnheader">Ubicación</span>
        <span role="columnheader">Actualizado</span>
      </div>

      <div className="tabla__cuerpo">
        {productos.map((p) => {
          const nombre = p.nombre ?? 'Producto'
          const foto = fotoUrl(p.foto_path)
          const cat = p.categoria_id ? categorias.get(p.categoria_id) : undefined
          const disponible = p.disponible ?? 0
          const en_evento = p.en_evento ?? 0
          const en_reparacion = p.en_reparacion ?? 0
          const disponibleReal = p.disponible_real ?? 0

          return (
            <div className="fila" role="row" key={p.id}>
              <div className="fila__foto" role="cell" data-col="Foto">
                <ProductThumb
                  src={foto}
                  alt={nombre}
                  onOpen={foto ? () => onAbrirFoto(foto, nombre) : undefined}
                />
              </div>

              <div className="fila__producto" role="cell" data-col="Producto">
                <button className="fila__nombre" onClick={() => onAbrirFicha(p)}>
                  {nombre}
                </button>
              </div>

              <div className="fila__categoria" role="cell" data-col="Categoría">
                {cat ? (
                  <CategoryChip nombre={cat.nombre} color={cat.color} />
                ) : (
                  <span className="ubicacion-vacia">Sin categoría</span>
                )}
              </div>

              <div className="fila__stock" role="cell" data-col="Stock">
                <StockBar
                  disponible={disponible}
                  en_evento={en_evento}
                  en_reparacion={en_reparacion}
                />
                <div className="fila__stock-nums">
                  <BucketNumbers
                    disponible={disponible}
                    en_evento={en_evento}
                    en_reparacion={en_reparacion}
                  />
                  <span className="fila__real tnum" title="Disponible real (descontando reservas activas)">
                    {disponibleReal} real
                  </span>
                </div>
              </div>

              <div className="fila__minimo tabla__num" role="cell" data-col="Mínimo">
                <span className={`tnum ${p.bajo_minimo ? 'fila__minimo--bajo' : ''}`}>
                  {p.stock_minimo ?? 0}
                </span>
                {p.bajo_minimo && <span className="fila__minimo-alerta">bajo</span>}
              </div>

              <div className="fila__ubicacion" role="cell" data-col="Ubicación">
                <LocationChip ubicacion={p.ubicacion} />
              </div>

              <div className="fila__fecha" role="cell" data-col="Actualizado">
                {formatFecha(p.actualizado_en)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
