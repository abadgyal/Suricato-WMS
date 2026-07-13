import { useMemo, useState } from 'react'
import type { Categoria, Cliente, ProductoDisponible } from '../../lib/domain'
import { llamarRpc, subirFotoProducto, validarFoto, type EstadoStock } from '../../lib/rpc'
import { fotoUrl } from '../../lib/format'
import { useToast } from '../toast/useToast'
import { ProductThumb } from '../ProductThumb'
import { CategoryChip } from '../CategoryChip'
import { CategoriaForm } from '../categorias/CategoriaForm'
import { ProductoPicker } from './ProductoPicker'

interface EntradaFormProps {
  productos: ProductoDisponible[]
  categorias: Map<string, Categoria>
  clientes: Cliente[]
  onHecho: () => void
}

/** Valor centinela del `<select>` de categoría: abre el alta en línea. */
const NUEVA_CATEGORIA = '__nueva__'

/**
 * Entrada de mercancía (SPEC §4 / CONTRACTS §2.1). Pantalla unificada: si el
 * producto existe, solo suma unidades a `disponible`; si no, el mismo formulario
 * lo da de alta (nombre, categoría, mínimo, ubicación, dimensiones, foto, cliente).
 * Nunca escribe buckets: llama a `registrar_entrada` (crea o suma).
 */
export function EntradaForm({ productos, categorias, clientes, onHecho }: EntradaFormProps) {
  const toast = useToast()

  const [producto, setProducto] = useState<ProductoDisponible | null>(null)
  const [alta, setAlta] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Campos comunes.
  const [unidades, setUnidades] = useState('')

  // Campos de alta (producto nuevo).
  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [stockMinimo, setStockMinimo] = useState('5')
  const [ubicacion, setUbicacion] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [largo, setLargo] = useState('')
  const [ancho, setAncho] = useState('')
  const [alto, setAlto] = useState('')
  const [peso, setPeso] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [creandoCategoria, setCreandoCategoria] = useState(false)

  const categoriasOrdenadas = useMemo(
    () => [...categorias.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [categorias],
  )

  const n = unidades === '' ? null : Number(unidades)
  const unidadesValidas = n != null && Number.isInteger(n) && n > 0
  const validoExistente = producto != null && unidadesValidas
  const validoAlta = alta && nombre.trim() !== '' && unidadesValidas
  const valido = validoExistente || validoAlta

  function resetTodo() {
    setProducto(null)
    setAlta(false)
    setTexto('')
    setUnidades('')
    setNombre('')
    setCategoriaId('')
    setStockMinimo('5')
    setUbicacion('')
    setClienteId('')
    setLargo('')
    setAncho('')
    setAlto('')
    setPeso('')
    quitarFoto()
  }

  function quitarFoto() {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    setFoto(null)
    setFotoPreview(null)
  }

  function elegirFoto(file: File | null) {
    quitarFoto()
    if (!file) return
    const err = validarFoto(file)
    if (err) {
      toast.error(err)
      return
    }
    setFoto(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  function iniciarAlta() {
    setAlta(true)
    setNombre(texto.trim())
  }

  function dimensiones(): Record<string, number> | undefined {
    const d: Record<string, number> = {}
    if (largo !== '') d.largo = Number(largo)
    if (ancho !== '') d.ancho = Number(ancho)
    if (alto !== '') d.alto = Number(alto)
    if (peso !== '') d.peso = Number(peso)
    return Object.keys(d).length > 0 ? d : undefined
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido || n == null) return
    setEnviando(true)
    try {
      if (validoExistente && producto) {
        await llamarRpc<EstadoStock>('registrar_entrada', {
          p_producto_id: producto.id!,
          p_unidades: n,
        })
        toast.exito(`Entrada de ${n} × «${producto.nombre}».`)
      } else {
        // Alta: sube la foto primero (si hay) para obtener su ruta en Storage.
        let fotoPath: string | undefined
        if (foto) fotoPath = await subirFotoProducto(foto)
        const dims = dimensiones()
        await llamarRpc<EstadoStock>('registrar_entrada', {
          p_unidades: n,
          p_nombre: nombre.trim(),
          p_categoria_id: categoriaId || undefined,
          p_stock_minimo: stockMinimo === '' ? undefined : Number(stockMinimo),
          p_ubicacion: ubicacion.trim() || undefined,
          p_cliente_id: clienteId || undefined,
          p_foto_path: fotoPath,
          p_dimensiones: dims,
        })
        toast.exito(`Alta de «${nombre.trim()}» con ${n} unidades.`)
      }
      resetTodo()
      onHecho()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="mov-form" onSubmit={enviar}>
      {!alta && (
        <div className="campo">
          <span className="campo__label">Producto</span>
          <ProductoPicker
            productos={productos}
            categorias={categorias}
            valor={producto}
            onSelect={setProducto}
            onTexto={setTexto}
            permitirTextoLibre
            etiqueta="Buscar producto o dar de alta uno nuevo"
            placeholder="Busca por nombre o teclea uno nuevo…"
            autoFocus
          />
          {!producto && (
            <button type="button" className="mov-form__alta-toggle" onClick={iniciarAlta}>
              + Dar de alta un producto nuevo{texto.trim() ? `: «${texto.trim()}»` : ''}
            </button>
          )}
        </div>
      )}

      {/* --- Producto existente: solo suma --- */}
      {producto && !alta && (
        <div className="mov-precarga">
          <ProductThumb src={fotoUrl(producto.foto_path)} alt={producto.nombre ?? ''} size="lg" />
          <div className="mov-precarga__datos">
            {producto.categoria_id && categorias.get(producto.categoria_id) && (
              <CategoryChip
                nombre={categorias.get(producto.categoria_id)!.nombre}
                color={categorias.get(producto.categoria_id)!.color}
              />
            )}
            <span className="mov-precarga__stock tnum">
              {producto.disponible ?? 0} disponibles · {producto.total ?? 0} operativas
            </span>
            <span className="campo__nota">Se sumarán las unidades nuevas a «disponible».</span>
          </div>
        </div>
      )}

      {/* --- Alta de producto nuevo --- */}
      {alta && (
        <>
          <div className="campo">
            <label className="campo__label" htmlFor="alta-nombre">
              Nombre del producto
            </label>
            <input
              id="alta-nombre"
              className="input"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Foco LED PAR 64"
              autoFocus
            />
          </div>

          <div className="mov-form__fila">
            <div className="campo">
              <label className="campo__label" htmlFor="alta-categoria">
                Categoría
              </label>
              <select
                id="alta-categoria"
                className="select"
                value={categoriaId}
                onChange={(e) => {
                  if (e.target.value === NUEVA_CATEGORIA) {
                    setCreandoCategoria(true)
                    return
                  }
                  setCategoriaId(e.target.value)
                }}
              >
                <option value="">Sin categoría</option>
                {categoriasOrdenadas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                <option value={NUEVA_CATEGORIA}>+ Crear categoría nueva…</option>
              </select>
            </div>
            <div className="campo">
              <label className="campo__label" htmlFor="alta-minimo">
                Stock mínimo
              </label>
              <input
                id="alta-minimo"
                className="input"
                type="number"
                min={0}
                step={1}
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
              />
            </div>
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="alta-ubicacion">
              Ubicación
            </label>
            <input
              id="alta-ubicacion"
              className="input"
              type="text"
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Estantería, pasillo o zona"
            />
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="alta-cliente">
              Cliente asignado (opcional)
            </label>
            <select
              id="alta-cliente"
              className="select"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">Sin asignar (stock genérico)</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="mov-form__dims">
            <legend className="campo__label">Dimensiones (opcional)</legend>
            <div className="mov-form__fila mov-form__fila--4">
              <input className="input" type="number" min={0} step="0.1" placeholder="Largo cm" value={largo} onChange={(e) => setLargo(e.target.value)} aria-label="Largo en cm" />
              <input className="input" type="number" min={0} step="0.1" placeholder="Ancho cm" value={ancho} onChange={(e) => setAncho(e.target.value)} aria-label="Ancho en cm" />
              <input className="input" type="number" min={0} step="0.1" placeholder="Alto cm" value={alto} onChange={(e) => setAlto(e.target.value)} aria-label="Alto en cm" />
              <input className="input" type="number" min={0} step="0.1" placeholder="Peso kg" value={peso} onChange={(e) => setPeso(e.target.value)} aria-label="Peso en kg" />
            </div>
          </fieldset>

          <div className="campo">
            <span className="campo__label">Foto (JPG/PNG/WebP, máx. 5 MB)</span>
            <div className="mov-form__foto">
              {fotoPreview ? (
                <img className="mov-form__foto-preview" src={fotoPreview} alt="Previsualización" />
              ) : (
                <ProductThumb src={null} alt="Sin foto" size="lg" />
              )}
              <div className="mov-form__foto-acciones">
                <label className="boton boton--secundario">
                  {foto ? 'Cambiar foto' : 'Elegir foto'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)}
                  />
                </label>
                {foto && (
                  <button type="button" className="mov-form__foto-quitar" onClick={quitarFoto}>
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* --- Unidades (común) --- */}
      {(producto || alta) && (
        <div className="campo">
          <label className="campo__label" htmlFor="entrada-unidades">
            Unidades que llegan
          </label>
          <input
            id="entrada-unidades"
            className="input"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={unidades}
            onChange={(e) => setUnidades(e.target.value)}
            placeholder="0"
          />
        </div>
      )}

      {(producto || alta) && (
        <div className="mov-form__acciones">
          <button type="button" className="boton boton--secundario" onClick={resetTodo} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={!valido || enviando}>
            {enviando ? 'Registrando…' : alta ? 'Dar de alta y registrar' : 'Registrar entrada'}
          </button>
        </div>
      )}

      {/* Alta de categoría en línea: se crea y queda seleccionada sin salir del
          formulario de entrada (deuda [S-D], resuelta en S-F). */}
      {creandoCategoria && (
        <CategoriaForm
          onClose={() => setCreandoCategoria(false)}
          onGuardado={(cat) => {
            setCreandoCategoria(false)
            setCategoriaId(cat.id)
            onHecho() // recarga el catálogo: la categoría nueva entra en el selector
          }}
        />
      )}
    </form>
  )
}
