/**
 * Paletas de color del dominio. Deben coincidir con las de la base de datos
 * (`wms_paleta_cliente()` / `wms_paleta_categoria()`, migraciones de S-F): la BD
 * asigna el color al crear la fila y la UI ofrece la misma gama al cambiarlo.
 */

/**
 * Clientes: tonos apagados/desaturados. Deliberadamente **no** compiten con los
 * buckets (verde/azul/ámbar/rojo saturados = estado de stock) ni con los chips
 * de categoría; identifican al cliente en el calendario y en los chips sin gritar.
 */
export const PALETA_CLIENTE = [
  '#7E6B8F', // malva apagado
  '#5F8A8B', // verde azulado grisáceo
  '#A8776B', // terracota apagada
  '#6B7FA8', // azul pizarra
  '#8A8F5F', // oliva apagado
  '#9C6F8E', // ciruela apagada
  '#6F8F76', // salvia
  '#A8925F', // mostaza apagada
  '#7B7B8F', // gris azulado frío
  '#8F6B6B', // ladrillo apagado
] as const

/**
 * Categorías: gama saturada y viva (la del seed), pensada para leerse de un
 * vistazo en la tabla de inventario.
 */
export const PALETA_CATEGORIA = [
  '#3B82F6', // azul
  '#8B5CF6', // violeta
  '#F59E0B', // ámbar
  '#10B981', // esmeralda
  '#EF4444', // rojo
  '#6B7280', // gris
  '#EC4899', // rosa
  '#14B8A6', // turquesa
  '#F97316', // naranja
  '#84CC16', // lima
] as const

/**
 * Índice determinista dentro de una paleta a partir de una semilla (id o
 * nombre). Réplica de la fórmula de la BD (primer byte del md5 % 10), pero en
 * el cliente solo sirve para *previsualizar* el color: el valor que manda es el
 * que asigna la base de datos.
 */
function indiceDeterminista(semilla: string, tamano: number): number {
  // FNV-1a de 32 bits: barato y estable; no necesita ser md5 porque este color
  // es solo la propuesta que la UI enseña antes de guardar.
  let h = 0x811c9dc5
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return Math.abs(h) % tamano
}

/** Color propuesto para una categoría nueva a partir de su nombre. */
export function colorCategoriaPropuesto(nombre: string): string {
  return PALETA_CATEGORIA[indiceDeterminista(nombre.trim().toLowerCase(), PALETA_CATEGORIA.length)]
}
