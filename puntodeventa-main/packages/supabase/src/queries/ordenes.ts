import { supabase } from '../client'
import type { Database, CocinaSlug } from '../types/database'

type MetodoPago = Database['public']['Enums']['metodo_pago']
type CanalOrden = Database['public']['Enums']['canal_orden']

export interface ItemOrden {
  producto_id: string
  cantidad: number
  precio_unitario: number
  cocina_id: string
  personalizacion?: string | null
}

export interface PagoMixto {
  metodo: MetodoPago
  monto: number
}

export interface CrearOrdenInput {
  sucursal_id: string
  canal?: CanalOrden
  metodo_pago: MetodoPago
  total: number
  descuento?: number
  cliente_id?: string | null
  notas?: string | null
  pagos_mixtos?: PagoMixto[]
}

export async function crearOrden(input: CrearOrdenInput, items: ItemOrden[]) {
  const { data: orden, error: ordenError } = await supabase
    .from('ordenes')
    .insert({
      sucursal_id: input.sucursal_id,
      canal: input.canal ?? 'pos',
      metodo_pago: input.metodo_pago,
      total: input.total,
      descuento: input.descuento ?? 0,
      cliente_id: input.cliente_id ?? null,
      notas: input.notas ?? null,
      estado: 'pendiente',
      pagado: true,
    })
    .select('id, folio')
    .single()

  if (ordenError) throw ordenError

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from('orden_items')
      .insert(
        items.map((item) => ({
          orden_id: orden.id,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          cocina_id: item.cocina_id,
          personalizacion: item.personalizacion ?? null,
        })),
      )

    if (itemsError) throw itemsError
  }

  if (input.pagos_mixtos && input.pagos_mixtos.length > 0) {
    const { error: pagosError } = await supabase
      .from('orden_pagos')
      .insert(
        input.pagos_mixtos.map((p) => ({
          orden_id: orden.id,
          metodo: p.metodo,
          monto: p.monto,
        })),
      )

    if (pagosError) throw pagosError
  }

  return orden
}

export async function actualizarEstadoOrden(
  ordenId: string,
  estado: Database['public']['Enums']['estado_orden'],
) {
  const { data, error } = await supabase
    .from('ordenes')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', ordenId)
    .select('id, folio, estado')
    .single()

  if (error) throw error
  return data
}

export async function getCocinaIdPorSlug(slug: CocinaSlug): Promise<string | null> {
  const { data } = await supabase
    .from('cocinas')
    .select('id')
    .eq('slug', slug)
    .single()
  return data?.id ?? null
}

export async function getOrdenesPorCocina(cocinaId: string) {
  const { data, error } = await supabase
    .from('ordenes')
    .select(
      `id, folio, estado, canal, created_at,
      orden_items!inner(
        id, cantidad, personalizacion, cocina_id,
        productos(id, nombre)
      )`,
    )
    .eq('orden_items.cocina_id', cocinaId)
    .eq('pagado', true)
    .not('estado', 'in', '("entregada","cancelada")')
    .order('created_at', { ascending: true })
    .limit(40)

  if (error) throw error
  return data ?? []
}

export function suscribirseAOrdenes(
  cocinaId: string,
  callback: (payload: unknown) => void,
) {
  return supabase
    .channel(`kds-${cocinaId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orden_items', filter: `cocina_id=eq.${cocinaId}` },
      callback,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'ordenes' },
      callback,
    )
    .subscribe()
}

// ─── Reportes ─────────────────────────────────────────────────────────────────

export interface VentaDiaRow {
  dia: string
  num_ordenes: number
  total_ventas: number
  ticket_promedio: number
  efectivo: number
  tarjeta_credito: number
  tarjeta_debito: number
  qr: number
  wallet: number
}

export async function getVentasDiarias(
  diasAtras = 30,
  sucursalId?: string,
): Promise<VentaDiaRow[]> {
  const desde = new Date()
  desde.setDate(desde.getDate() - diasAtras)
  const desdeStr = desde.toISOString().split('T')[0]!

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('vw_ventas_diarias')
    .select('*')
    .gte('dia', desdeStr)
    .order('dia', { ascending: true })

  if (sucursalId) {
    query = query.eq('sucursal_id', sucursalId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as VentaDiaRow[]
}

export interface ProductoVendidoRow {
  id: string
  nombre: string
  categoria: string
  total_vendido: number
  total_ingresos: number
}

export async function getProductosMasVendidos(
  limit = 10,
): Promise<ProductoVendidoRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('vw_productos_mas_vendidos')
    .select('*')
    .limit(limit)

  if (error) throw error
  return (data ?? []) as ProductoVendidoRow[]
}

export interface OrdenActivaRow {
  id: string
  folio: number
  total: number
  estado: string
  canal: string
  created_at: string
}

export async function getOrdenesRecientes(
  sucursalId: string,
  horas = 4,
): Promise<OrdenActivaRow[]> {
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('ordenes')
    .select('id, folio, total, estado, canal, created_at')
    .eq('sucursal_id', sucursalId)
    .eq('pagado', true)
    .neq('estado', 'cancelada')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return (data ?? []) as OrdenActivaRow[]
}
