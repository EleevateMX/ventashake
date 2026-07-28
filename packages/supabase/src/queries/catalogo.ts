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
  ComboVista,
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

/**
 * Sube la foto de un producto al bucket público `productos` y deja la URL
 * en `productos.imagen_url` (que POS y Kiosko ya renderizan).
 * El nombre incluye un sufijo de tiempo para que al reemplazar la foto el
 * navegador no siga mostrando la anterior por caché.
 */
export async function subirFotoProducto(
  sb: ShakeClient,
  productoId: string,
  archivo: File,
): Promise<string> {
  const ext = (archivo.name.split('.').pop() ?? 'jpg').toLowerCase()
  const ruta = `${productoId}/${Date.now()}.${ext}`
  const { error: upError } = await sb.storage
    .from('productos')
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type })
  if (upError) throw upError

  const { data } = sb.storage.from('productos').getPublicUrl(ruta)
  const url = data.publicUrl
  const { error } = await sb.from('productos').update({ imagen_url: url }).eq('id', productoId)
  if (error) throw error
  return url
}

/** Quita la foto del producto (deja el emoji por defecto del catálogo). */
export async function quitarFotoProducto(sb: ShakeClient, productoId: string): Promise<void> {
  const { error } = await sb.from('productos').update({ imagen_url: null }).eq('id', productoId)
  if (error) throw error
}

export async function listarCategorias(sb: ShakeClient): Promise<Categoria[]> {
  const { data, error } = await sb.from('categorias').select('*').eq('activa', true).order('orden').order('nombre')
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
    orden: number
    cocinas: { id: string; nombre: string; slug: string } | null
  } | null
}

/**
 * Catálogo activo con categoría y cocina anidada (POS, kiosko, admin).
 * Excluye los extras: no son tarjetas del catálogo, se ofrecen solo
 * dentro del producto al que pertenecen (ver `listarExtrasDeProducto`).
 */
export async function listarProductosParaVenta(sb: ShakeClient): Promise<ProductoVenta[]> {
  const { data, error } = await sb
    .from('productos')
    .select('*, categorias(id, nombre, orden, cocinas(id, nombre, slug))')
    .eq('activo', true)
    .eq('es_extra', false)
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
    .select('*, categorias!inner(id, nombre, orden, cocinas!inner(id, nombre, slug))')
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

// ------------------------------- combos -------------------------------
// Un combo es un producto normal (`productos.es_combo = true`) compuesto
// de otros productos vía `combo_items`. Su receta se materializa sola en
// el servidor (triggers, ver supabase/migrations/costeo_combos_productos.sql)
// — aquí solo se gestiona la cabecera y los componentes.

/** Todos los combos (activos e inactivos, para poder gestionarlos). */
export async function listarCombos(sb: ShakeClient): Promise<ComboVista[]> {
  const { data, error } = await sb.from('vw_combos').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function crearCombo(
  sb: ShakeClient,
  combo: { nombre: string; precio: number; categoria_id: string | null },
): Promise<Producto> {
  const { data, error } = await sb
    .from('productos')
    .insert({ ...combo, es_combo: true })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Agrega un producto como componente del combo, o actualiza su cantidad
 * si ya estaba agregado. El servidor valida que todos los componentes
 * sean de la misma estación (cocina) y recalcula la receta del combo.
 */
export async function agregarComponenteCombo(
  sb: ShakeClient,
  comboId: string,
  productoId: string,
  cantidad: number,
): Promise<void> {
  const { error } = await sb
    .from('combo_items')
    .upsert({ combo_id: comboId, producto_id: productoId, cantidad }, { onConflict: 'combo_id,producto_id' })
  if (error) throw error
}

export async function quitarComponenteCombo(
  sb: ShakeClient,
  comboId: string,
  productoId: string,
): Promise<void> {
  const { error } = await sb
    .from('combo_items')
    .delete()
    .eq('combo_id', comboId)
    .eq('producto_id', productoId)
  if (error) throw error
}

// ------------------------------- extras -------------------------------
// Un extra es un producto normal (`es_extra = true`) con receta 1:1 contra
// el insumo que consume — al venderlo descuenta inventario y cuesta igual
// que cualquier producto. `producto_extras` dice cuáles se ofrecen en cuál
// alimento. Ver supabase/migrations/catalogo_suplementos_y_extras.sql.

export interface ExtraDeProducto {
  producto_id: string
  extra_id: string
  nombre: string
  precio: number
  activo: boolean
}

/**
 * Los productos extra en sí (los que `listarProductosParaVenta` excluye).
 * El POS los necesita para poder meterlos al ticket cuando el cajero los
 * elige dentro de un alimento.
 */
export async function listarProductosExtra(sb: ShakeClient): Promise<ProductoVenta[]> {
  const { data, error } = await sb
    .from('productos')
    .select('*, categorias(id, nombre, orden, cocinas(id, nombre, slug))')
    .eq('activo', true)
    .eq('es_extra', true)
    .order('nombre')
  if (error) throw error
  return data as unknown as ProductoVenta[]
}

/** Extras ofrecidos por producto (todos de una, para cachear en el POS). */
export async function listarExtras(sb: ShakeClient): Promise<ExtraDeProducto[]> {
  const { data, error } = await sb
    .from('vw_producto_extras')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data as unknown as ExtraDeProducto[]
}

/** Ingredientes de un producto que pueden ofrecerse como extra, con su costo real. */
export interface IngredienteExtraible {
  insumo_id: string
  nombre: string
  unidad: string
  cantidad_receta: number
  costo_unitario: number
  costo_en_receta: number
  ya_es_extra: boolean
}

export async function extrasDisponibles(
  sb: ShakeClient,
  productoId: string,
): Promise<IngredienteExtraible[]> {
  const { data, error } = await (sb.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>)('fn_extras_disponibles', {
    p_producto_id: productoId,
  })
  if (error) throw error
  return (data ?? []) as IngredienteExtraible[]
}

/** Crea/actualiza el extra de un insumo y lo ofrece en ese producto. */
export async function guardarExtra(
  sb: ShakeClient,
  input: { productoId: string; insumoId: string; nombre: string; precio: number; cantidad?: number | null },
): Promise<void> {
  const { error } = await (sb.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>)('fn_guardar_extra', {
    p_producto_id: input.productoId,
    p_insumo_id: input.insumoId,
    p_nombre: input.nombre,
    p_precio: input.precio,
    p_cantidad: input.cantidad ?? null,
  })
  if (error) throw error
}

export async function quitarExtra(
  sb: ShakeClient,
  productoId: string,
  extraId: string,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>)('fn_quitar_extra', {
    p_producto_id: productoId,
    p_extra_id: extraId,
  })
  if (error) throw error
}
