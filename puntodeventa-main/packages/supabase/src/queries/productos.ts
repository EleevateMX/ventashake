import { supabase } from '../client'
import type { CocinaSlug } from '../types/database'

export async function getProductosPorCocina(cocinaSlug: CocinaSlug) {
  const { data, error } = await supabase
    .from('productos')
    .select(`
      *,
      categorias!inner(
        id, nombre, cocina_id,
        cocinas!inner(id, nombre, slug)
      )
    `)
    .eq('activo', true)
    .eq('categorias.cocinas.slug', cocinaSlug)
    .order('nombre')

  if (error) throw error
  return data
}

export async function getProductosConCategorias() {
  const { data, error } = await supabase
    .from('productos')
    .select(`
      *,
      categorias(id, nombre, cocinas(id, nombre, slug))
    `)
    .eq('activo', true)
    .order('categorias(nombre)', { ascending: true })

  if (error) throw error
  return data
}

export async function getCategorias() {
  const { data, error } = await supabase
    .from('categorias')
    .select('*, cocinas(id, nombre, slug)')
    .eq('activa', true)
    .order('nombre')

  if (error) throw error
  return data
}
