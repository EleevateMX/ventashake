import type {
  Insumo,
  InsumoInsert,
  InsumoUpdate,
  InsumoCategoria,
  Producto,
  ProductoInsert,
  ProductoUpdate,
  Categoria,
  Cocina,
  Receta,
  RecetaInsert,
} from '@shake/types'
import type { ShakeClient } from '../client'

// ------------------------------ insumos ------------------------------

export async function listarInsumos(sb: ShakeClient): Promise<Insumo[]> {
  const { data, error } = await sb
    .from('insumos')
    .select('*')
    .eq('activo', true)
    .order('tipo')
    .order('nombre')
  if (error) throw error
  return data
}

export async function crearInsumo(sb: ShakeClient, insumo: InsumoInsert): Promise<Insumo> {
  const { data, error } = await sb.from('insumos').insert(insumo).select().single()
  if (error) throw error
  return data
}

export async function actualizarInsumo(
  sb: ShakeClient,
  id: string,
  cambios: InsumoUpdate,
): Promise<Insumo> {
  const { data, error } = await sb.from('insumos').update(cambios).eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Baja lógica: nunca se borra un insumo (histórico de recetas/kardex). */
export async function desactivarInsumo(sb: ShakeClient, id: string): Promise<void> {
  const { error } = await sb.from('insumos').update({ activo: false }).eq('id', id)
  if (error) throw error
}

export async function listarInsumoCategorias(sb: ShakeClient): Promise<InsumoCategoria[]> {
  const { data, error } = await sb.from('insumo_categorias').select('*').eq('activa', true).order('nombre')
  if (error) throw error
  return data
}

// ------------------------------ productos ----------------------------

export async function listarProductos(sb: ShakeClient): Promise<Producto[]> {
  const { data, error } = await sb.from('productos').select('*').eq('activo', true).order('nombre')
  if (error) throw error
  return data
}

export async function crearProducto(sb: ShakeClient, producto: ProductoInsert): Promise<Producto> {
  const { data, error } = await sb.from('productos').insert(producto).select().single()
  if (error) throw error
  return data
}

export async function actualizarProducto(
  sb: ShakeClient,
  id: string,
  cambios: ProductoUpdate,
): Promise<Producto> {
  const { data, error } = await sb.from('productos').update(cambios).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function listarCategorias(sb: ShakeClient): Promise<Categoria[]> {
  const { data, error } = await sb.from('categorias').select('*').eq('activa', true).order('nombre')
  if (error) throw error
  return data
}

/** Baja lógica de producto: no se borra (histórico de órdenes/recetas). */
export async function desactivarProducto(sb: ShakeClient, id: string): Promise<void> {
  const { error } = await sb.from('productos').update({ activo: false }).eq('id', id)
  if (error) throw error
}

export async function crearCategoria(
  sb: ShakeClient,
  cat: { nombre: string; cocina_id: string },
): Promise<Categoria> {
  const { data, error } = await sb.from('categorias').insert(cat).select().single()
  if (error) throw error
  return data
}

export async function listarCocinas(sb: ShakeClient): Promise<Cocina[]> {
  const { data, error } = await sb.from('cocinas').select('*').order('nombre')
  if (error) throw error
  return data
}

// ------------------------- catálogo para venta -----------------------
// Producto con su categoría y la cocina/estación a la que ruta.
export interface ProductoVenta extends Producto {
  categorias: {
    id: string
    nombre: string
    cocinas: { id: string; nombre: string; slug: string } | null
  } | null
}

/** Catálogo activo con categoría y cocina anidada (POS, kiosko, admin). */
export async function listarProductosParaVenta(sb: ShakeClient): Promise<ProductoVenta[]> {
  const { data, error } = await sb
    .from('productos')
    .select('*, categorias(id, nombre, cocinas(id, nombre, slug))')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data as unknown as ProductoVenta[]
}

/** Catálogo activo de una estación de cocina ('alimentos' | 'bebidas'). */
export async function listarProductosPorCocina(
  sb: ShakeClient,
  cocinaSlug: string,
): Promise<ProductoVenta[]> {
  const { data, error } = await sb
    .from('productos')
    .select('*, categorias!inner(id, nombre, cocinas!inner(id, nombre, slug))')
    .eq('activo', true)
    .eq('categorias.cocinas.slug', cocinaSlug)
    .order('nombre')
  if (error) throw error
  return data as unknown as ProductoVenta[]
}

// ------------------------------ recetas ------------------------------

export async function obtenerReceta(sb: ShakeClient, productoId: string): Promise<Receta[]> {
  const { data, error } = await sb.from('recetas').select('*').eq('producto_id', productoId)
  if (error) throw error
  return data
}

/**
 * Reemplaza la receta completa de un producto (borra líneas anteriores
 * e inserta las nuevas). Las cantidades van en la unidad del insumo.
 */
export async function guardarReceta(
  sb: ShakeClient,
  productoId: string,
  lineas: Omit<RecetaInsert, 'producto_id'>[],
): Promise<void> {
  const { error: delError } = await sb.from('recetas').delete().eq('producto_id', productoId)
  if (delError) throw delError
  if (lineas.length === 0) return
  const { error } = await sb
    .from('recetas')
    .insert(lineas.map((l) => ({ ...l, producto_id: productoId })))
  if (error) throw error
}
