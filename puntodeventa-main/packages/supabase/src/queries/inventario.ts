import { supabase } from '../client'
import type { Database } from '../types/database'

type InsumoRow = Database['public']['Tables']['insumos']['Row']
type AlmacenRow = Database['public']['Tables']['almacenes']['Row']
type StockRow = Database['public']['Tables']['inventario_stock']['Row']
type LoteRow = Database['public']['Tables']['lotes']['Row']
type MermaRow = Database['public']['Tables']['mermas']['Row']
type TransferenciaRow = Database['public']['Tables']['transferencias']['Row']
type TransferenciaItemRow = Database['public']['Tables']['transferencia_items']['Row']
type TipoMerma = Database['public']['Enums']['tipo_merma']
type EstadoTransferencia = Database['public']['Enums']['estado_transferencia']

export type { InsumoRow, AlmacenRow, StockRow, LoteRow, MermaRow }

export interface TransferenciaConItems extends TransferenciaRow {
  items: TransferenciaItemRow[]
}

export async function getAlmacenes(): Promise<AlmacenRow[]> {
  const { data, error } = await supabase
    .from('almacenes')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data ?? []
}

export async function getInsumos(): Promise<InsumoRow[]> {
  const { data, error } = await supabase
    .from('insumos')
    .select('*')
    .order('nombre')
  if (error) throw error
  return data ?? []
}

export async function crearInsumo(input: { nombre: string; unidad: string; costo_unitario: number }): Promise<InsumoRow> {
  const { data, error } = await supabase.from('insumos').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function actualizarInsumo(id: string, input: { nombre: string; unidad: string; costo_unitario: number }): Promise<InsumoRow> {
  const { data, error } = await supabase.from('insumos').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data
}

export async function eliminarInsumo(id: string): Promise<void> {
  const { error } = await supabase.from('insumos').delete().eq('id', id)
  if (error) throw error
}

export async function getStock(): Promise<StockRow[]> {
  const { data, error } = await supabase.from('inventario_stock').select('*')
  if (error) throw error
  return data ?? []
}

export async function upsertStock(almacenId: string, insumoId: string, stockActual: number, stockMinimo?: number): Promise<void> {
  const record: Database['public']['Tables']['inventario_stock']['Insert'] = {
    almacen_id: almacenId,
    insumo_id: insumoId,
    stock_actual: stockActual,
  }
  if (stockMinimo !== undefined) record.stock_minimo = stockMinimo

  const { error } = await supabase
    .from('inventario_stock')
    .upsert(record, { onConflict: 'almacen_id,insumo_id' })
  if (error) throw error
}

export async function getLotes(): Promise<LoteRow[]> {
  const { data, error } = await supabase
    .from('lotes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function crearLote(input: Omit<Database['public']['Tables']['lotes']['Insert'], 'id' | 'created_at'>): Promise<LoteRow> {
  const { data, error } = await supabase.from('lotes').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function eliminarLote(id: string): Promise<void> {
  const { error } = await supabase.from('lotes').delete().eq('id', id)
  if (error) throw error
}

export async function getMermas(): Promise<MermaRow[]> {
  const { data, error } = await supabase
    .from('mermas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data ?? []
}

export async function registrarMermaDB(input: {
  insumo_id: string
  almacen_id: string
  lote_id?: string | null
  cantidad: number
  tipo: TipoMerma
  notas?: string | null
}): Promise<MermaRow> {
  const { data, error } = await supabase
    .from('mermas')
    .insert({
      insumo_id: input.insumo_id,
      almacen_id: input.almacen_id,
      lote_id: input.lote_id ?? null,
      cantidad: input.cantidad,
      tipo: input.tipo,
      notas: input.notas ?? null,
    })
    .select('*')
    .single()
  if (error) throw error

  // Deduct from stock
  const { data: current } = await supabase
    .from('inventario_stock')
    .select('stock_actual')
    .eq('insumo_id', input.insumo_id)
    .eq('almacen_id', input.almacen_id)
    .single()

  if (current) {
    await supabase
      .from('inventario_stock')
      .update({ stock_actual: Math.max(0, Number(current.stock_actual) - input.cantidad) })
      .eq('insumo_id', input.insumo_id)
      .eq('almacen_id', input.almacen_id)
  }

  return data
}

export async function getTransferencias(): Promise<TransferenciaConItems[]> {
  const { data, error } = await supabase
    .from('transferencias')
    .select('*, transferencia_items(*)')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((t: any) => ({ ...t, items: t.transferencia_items ?? [] }))
}

export async function crearTransferenciaDB(
  origenId: string,
  destinoId: string,
  items: { insumo_id: string; cantidad: number }[],
  notas?: string,
): Promise<TransferenciaConItems> {
  const { data: trans, error } = await supabase
    .from('transferencias')
    .insert({ origen_id: origenId, destino_id: destinoId, notas: notas || null })
    .select('*')
    .single()
  if (error) throw error

  const { error: itemsError } = await supabase
    .from('transferencia_items')
    .insert(items.map((i) => ({ transferencia_id: trans.id, insumo_id: i.insumo_id, cantidad: i.cantidad })))
  if (itemsError) throw itemsError

  return { ...trans, items: items as TransferenciaItemRow[] }
}

export async function cambiarEstadoTransferenciaDB(
  id: string,
  estado: EstadoTransferencia,
): Promise<void> {
  const { error } = await supabase
    .from('transferencias')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
