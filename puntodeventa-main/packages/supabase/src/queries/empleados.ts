import { supabase } from '../client'
import type { Database } from '../types/database'

type EmpleadoRow = Database['public']['Tables']['empleados']['Row']

export type { EmpleadoRow }

export async function getEmpleados(): Promise<EmpleadoRow[]> {
  const { data, error } = await supabase
    .from('empleados')
    .select('*')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  return data ?? []
}

export async function buscarEmpleadoPorPin(
  pin: string,
  sucursalId?: string,
): Promise<EmpleadoRow | null> {
  let query = supabase
    .from('empleados')
    .select('*')
    .eq('pin', pin)
    .eq('activo', true)

  if (sucursalId) {
    query = query.eq('sucursal_id', sucursalId)
  }

  const { data } = await query.limit(1)
  return data?.[0] ?? null
}

export interface EmpleadoInput {
  nombre: string
  pin: string
  rol: Database['public']['Enums']['rol_empleado']
  activo: boolean
  sucursal_id: string | null
  email?: string | null
  telefono?: string | null
}

export async function crearEmpleado(input: EmpleadoInput): Promise<EmpleadoRow> {
  const { data, error } = await supabase
    .from('empleados')
    .insert({
      nombre: input.nombre,
      pin: input.pin,
      rol: input.rol,
      activo: input.activo,
      sucursal_id: input.sucursal_id,
      email: input.email ?? null,
      telefono: input.telefono ?? null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function actualizarEmpleado(
  id: string,
  input: EmpleadoInput,
): Promise<EmpleadoRow> {
  const { data, error } = await supabase
    .from('empleados')
    .update({
      nombre: input.nombre,
      pin: input.pin,
      rol: input.rol,
      activo: input.activo,
      sucursal_id: input.sucursal_id,
      email: input.email ?? null,
      telefono: input.telefono ?? null,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function toggleActivoEmpleado(
  id: string,
  activo: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('empleados')
    .update({ activo })
    .eq('id', id)

  if (error) throw error
}

// ─── Corte de caja ────────────────────────────────────────────────────────────

export interface ResumenTurno {
  efectivo: number
  tarjeta_credito: number
  tarjeta_debito: number
  qr: number
  wallet: number
  total: number
  ordenes: number
  ticket_promedio: number
}

export async function getResumenTurno(
  sucursalId: string,
  desde: string,
): Promise<ResumenTurno> {
  const { data, error } = await supabase
    .from('ordenes')
    .select('total, metodo_pago')
    .eq('sucursal_id', sucursalId)
    .eq('pagado', true)
    .neq('estado', 'cancelada')
    .gte('created_at', desde)

  if (error) throw error

  const rows = data ?? []
  const resumen: ResumenTurno = {
    efectivo: 0,
    tarjeta_credito: 0,
    tarjeta_debito: 0,
    qr: 0,
    wallet: 0,
    total: 0,
    ordenes: rows.length,
    ticket_promedio: 0,
  }

  for (const row of rows) {
    const monto = Number(row.total)
    resumen.total += monto
    if (row.metodo_pago === 'efectivo') resumen.efectivo += monto
    else if (row.metodo_pago === 'tarjeta_credito') resumen.tarjeta_credito += monto
    else if (row.metodo_pago === 'tarjeta_debito') resumen.tarjeta_debito += monto
    else if (row.metodo_pago === 'qr') resumen.qr += monto
    else if (row.metodo_pago === 'wallet') resumen.wallet += monto
  }

  if (resumen.ordenes > 0) {
    resumen.ticket_promedio = Math.round((resumen.total / resumen.ordenes) * 100) / 100
  }

  return resumen
}

export async function guardarCorte(params: {
  sucursal_id: string
  empleado_id: string
  fecha_inicio: string
  fecha_fin: string
  resumen: ResumenTurno
  notas?: string
}): Promise<void> {
  const tarjeta = params.resumen.tarjeta_credito + params.resumen.tarjeta_debito

  const { error } = await supabase.from('cortes_caja').insert({
    sucursal_id: params.sucursal_id,
    empleado_id: params.empleado_id,
    fecha_inicio: params.fecha_inicio,
    fecha_fin: params.fecha_fin,
    num_ordenes: params.resumen.ordenes,
    total_efectivo: params.resumen.efectivo,
    total_tarjeta: tarjeta,
    total_qr: params.resumen.qr,
    total_wallet: params.resumen.wallet,
    total_general: params.resumen.total,
    notas: params.notas ?? null,
  })

  if (error) throw error
}
