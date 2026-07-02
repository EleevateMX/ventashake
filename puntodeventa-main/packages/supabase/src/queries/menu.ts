import { supabase } from '../client'
import type { Database } from '../types/database'

type ProductoInsert = Database['public']['Tables']['productos']['Insert']
type ProductoUpdate = Database['public']['Tables']['productos']['Update']
type CategoriaInsert = Database['public']['Tables']['categorias']['Insert']
type CategoriaUpdate = Database['public']['Tables']['categorias']['Update']

export async function getProductosAdmin() {
  const { data, error } = await supabase
    .from('productos')
    .select(`
      *,
      categorias(id, nombre, cocina_id, cocinas(id, nombre, slug))
    `)
    .order('nombre')

  if (error) throw error
  return data
}

export async function crearProducto(producto: ProductoInsert) {
  const { data, error } = await supabase
    .from('productos')
    .insert(producto)
    .select(`*, categorias(id, nombre, cocina_id, cocinas(id, nombre, slug))`)
    .single()

  if (error) throw error
  return data
}

export async function actualizarProducto(id: string, producto: ProductoUpdate) {
  const { data, error } = await supabase
    .from('productos')
    .update(producto)
    .eq('id', id)
    .select(`*, categorias(id, nombre, cocina_id, cocinas(id, nombre, slug))`)
    .single()

  if (error) throw error
  return data
}

export async function eliminarProducto(id: string) {
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) throw error
}

export async function toggleActivoProducto(id: string, activo: boolean) {
  const { error } = await supabase
    .from('productos')
    .update({ activo })
    .eq('id', id)

  if (error) throw error
}

export async function getCategoriasAdmin() {
  const { data, error } = await supabase
    .from('categorias')
    .select('*, cocinas(id, nombre, slug)')
    .order('nombre')

  if (error) throw error
  return data
}

export async function crearCategoria(categoria: CategoriaInsert) {
  const { data, error } = await supabase
    .from('categorias')
    .insert(categoria)
    .select('*, cocinas(id, nombre, slug)')
    .single()

  if (error) throw error
  return data
}

export async function actualizarCategoria(id: string, categoria: CategoriaUpdate) {
  const { data, error } = await supabase
    .from('categorias')
    .update(categoria)
    .eq('id', id)
    .select('*, cocinas(id, nombre, slug)')
    .single()

  if (error) throw error
  return data
}

export async function eliminarCategoria(id: string) {
  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) throw error
}

export async function getCocinas() {
  const { data, error } = await supabase
    .from('cocinas')
    .select('*')
    .order('nombre')

  if (error) throw error
  return data
}
