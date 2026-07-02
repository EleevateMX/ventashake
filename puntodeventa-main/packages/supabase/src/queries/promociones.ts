import { supabase } from '../client'
import type { Database } from '../types/database'

type PromocionRow = Database['public']['Tables']['promociones']['Row']

export type { PromocionRow }

export async function getPromociones(): Promise<PromocionRow[]> {
  const { data, error } = await supabase
    .from('promociones')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function crearPromocionDB(
  input: Database['public']['Tables']['promociones']['Insert'],
): Promise<PromocionRow> {
  const { data, error } = await supabase.from('promociones').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function actualizarPromocionDB(
  id: string,
  input: Database['public']['Tables']['promociones']['Update'],
): Promise<PromocionRow> {
  const { data, error } = await supabase.from('promociones').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data
}

export async function eliminarPromocionDB(id: string): Promise<void> {
  const { error } = await supabase.from('promociones').delete().eq('id', id)
  if (error) throw error
}

export async function toggleActivaPromocionDB(id: string, activa: boolean): Promise<void> {
  const { error } = await supabase.from('promociones').update({ activa }).eq('id', id)
  if (error) throw error
}
