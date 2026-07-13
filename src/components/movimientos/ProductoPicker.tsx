import { useEffect, useMemo, useRef, useState } from 'react'
import type { Categoria, ProductoDisponible } from '../../lib/domain'
import { fotoUrl } from '../../lib/format'
import { ProductThumb } from '../ProductThumb'
import { CategoryChip } from '../CategoryChip'
import { IconBuscar } from '../icons'
import './ProductoPicker.css'

interface ProductoPickerProps {
  productos: ProductoDisponible[]
  categorias: Map<string, Categoria>
  /** Producto seleccionado (o `null`). */
  valor: ProductoDisponible | null
  onSelect: (producto: ProductoDisponible | null) => void
  /** Texto del campo cuando no hay selección. */
  placeholder?: string
  /** Etiqueta accesible del campo de búsqueda. */
  etiqueta?: string
  /** Permite escribir un nombre libre aunque no exista (alta en Entrada). */
  permitirTextoLibre?: boolean
  /** Notifica el texto tecleado (para el modo alta de Entrada). */
  onTexto?: (texto: string) => void
  autoFocus?: boolean
}

/**
 * Autocompletado de producto: muestra foto, categoría y stock de cada coincidencia.
 * Al elegir uno, lo presenta como tarjeta con opción de cambiarlo. Es de solo
 * selección; los formularios deciden qué hacer con el producto elegido.
 */
export function ProductoPicker({
  productos,
  categorias,
  valor,
  onSelect,
  placeholder = 'Busca un producto por nombre…',
  etiqueta = 'Buscar producto',
  permitirTextoLibre = false,
  onTexto,
  autoFocus = false,
}: ProductoPickerProps) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const cajaRef = useRef<HTMLDivElement>(null)

  const coincidencias = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return productos.slice(0, 8)
    return productos
      .filter((p) => (p.nombre ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [productos, texto])

  // Cierra el desplegable al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  function elegir(p: ProductoDisponible) {
    onSelect(p)
    setTexto('')
    setAbierto(false)
    onTexto?.('')
  }

  function cambiarTexto(v: string) {
    setTexto(v)
    setAbierto(true)
    setActivo(0)
    onTexto?.(v)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!abierto) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActivo((i) => Math.min(i + 1, coincidencias.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && coincidencias[activo]) {
      e.preventDefault()
      elegir(coincidencias[activo])
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  // Con producto elegido: tarjeta compacta con botón de cambio.
  if (valor) {
    const cat = valor.categoria_id ? categorias.get(valor.categoria_id) : undefined
    return (
      <div className="picker picker--elegido">
        <ProductThumb src={fotoUrl(valor.foto_path)} alt={valor.nombre ?? 'Producto'} size="sm" />
        <div className="picker__datos">
          <span className="picker__nombre">{valor.nombre}</span>
          <span className="picker__meta">
            {cat && <CategoryChip nombre={cat.nombre} color={cat.color} />}
            <span className="picker__stock tnum">
              {valor.disponible_real ?? 0} disp. · {valor.total ?? 0} total
            </span>
          </span>
        </div>
        <button
          type="button"
          className="picker__cambiar"
          onClick={() => {
            onSelect(null)
            onTexto?.('')
          }}
        >
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <div className="picker" ref={cajaRef}>
      <div className="picker__campo">
        <IconBuscar size={18} />
        <input
          className="picker__input"
          type="text"
          value={texto}
          placeholder={placeholder}
          aria-label={etiqueta}
          autoFocus={autoFocus}
          onChange={(e) => cambiarTexto(e.target.value)}
          onFocus={() => setAbierto(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
        />
      </div>

      {abierto && (
        <ul className="picker__lista" role="listbox">
          {coincidencias.length === 0 ? (
            <li className="picker__vacio">
              {permitirTextoLibre && texto.trim()
                ? `Ningún producto se llama «${texto.trim()}». Se dará de alta como nuevo.`
                : 'Ningún producto coincide.'}
            </li>
          ) : (
            coincidencias.map((p, i) => {
              const cat = p.categoria_id ? categorias.get(p.categoria_id) : undefined
              return (
                <li key={p.id ?? ''} role="option" aria-selected={i === activo}>
                  <button
                    type="button"
                    className={`picker__opcion ${i === activo ? 'picker__opcion--activa' : ''}`}
                    onMouseEnter={() => setActivo(i)}
                    onClick={() => elegir(p)}
                  >
                    <ProductThumb src={fotoUrl(p.foto_path)} alt={p.nombre ?? 'Producto'} size="sm" />
                    <span className="picker__opcion-datos">
                      <span className="picker__nombre">{p.nombre}</span>
                      <span className="picker__meta">
                        {cat && <CategoryChip nombre={cat.nombre} color={cat.color} />}
                        <span className="picker__stock tnum">
                          {p.disponible_real ?? 0} disp. · {p.total ?? 0} total
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
