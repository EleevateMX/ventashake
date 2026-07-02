import { supabase } from '../client'
import type { Database } from '../types/database'

type ClienteRow = Database['public']['Tables']['clientes']['Row']
type GiftCardRow = Database['public']['Tables']['gift_cards']['Row']
type TipoMovimientoPuntos = Database['public']['Enums']['tipo_movimiento_puntos']
type TipoMovimientoWallet = Database['public']['Enums']['tipo_movimiento_wallet']

// ─── Clientes ─────────────────────────────────────────────────────────────────

export type { ClienteRow }

export async function getClientes(): Promise<ClienteRow[]> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  return data ?? []
}

export async function buscarClientes(busqueda: string): Promise<ClienteRow[]> {
  const q = busqueda.trim()
  if (!q) return getClientes()

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('activo', true)
    .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`)
    .order('nombre')
    .limit(20)

  if (error) throw error
  return data ?? []
}

export async function getClienteById(id: string): Promise<ClienteRow | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export interface ClienteInput {
  nombre: string
  telefono?: string | null
  email?: string | null
}

export async function crearCliente(input: ClienteInput): Promise<ClienteRow> {
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nombre: input.nombre,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function actualizarCliente(
  id: string,
  input: ClienteInput,
): Promise<ClienteRow> {
  const { data, error } = await supabase
    .from('clientes')
    .update({
      nombre: input.nombre,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function eliminarCliente(id: string): Promise<void> {
  const { error } = await supabase
    .from('clientes')
    .update({ activo: false })
    .eq('id', id)

  if (error) throw error
}

// ─── Puntos ───────────────────────────────────────────────────────────────────

export async function agregarPuntosCliente(
  clienteId: string,
  puntos: number,
  ordenId?: string | null,
  descripcion?: string,
): Promise<void> {
  // Read current points first
  const { data: cliente, error: readErr } = await supabase
    .from('clientes')
    .select('puntos')
    .eq('id', clienteId)
    .single()

  if (readErr || !cliente) throw readErr ?? new Error('Cliente no encontrado')

  const tipo: TipoMovimientoPuntos = 'ganados'

  const [updateResult, insertResult] = await Promise.all([
    supabase
      .from('clientes')
      .update({ puntos: cliente.puntos + puntos })
      .eq('id', clienteId),
    supabase.from('puntos_movimientos').insert({
      cliente_id: clienteId,
      puntos,
      tipo,
      orden_id: ordenId ?? null,
      descripcion: descripcion ?? `+${puntos} puntos por compra`,
    }),
  ])

  if (updateResult.error) throw updateResult.error
  if (insertResult.error) throw insertResult.error
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export async function cargarWalletCliente(
  clienteId: string,
  monto: number,
  descripcion?: string,
): Promise<void> {
  const { data: cliente, error: readErr } = await supabase
    .from('clientes')
    .select('wallet_saldo')
    .eq('id', clienteId)
    .single()

  if (readErr || !cliente) throw readErr ?? new Error('Cliente no encontrado')

  const tipo: TipoMovimientoWallet = 'recarga'

  const [updateResult, insertResult] = await Promise.all([
    supabase
      .from('clientes')
      .update({ wallet_saldo: Number(cliente.wallet_saldo) + monto })
      .eq('id', clienteId),
    supabase.from('wallet_movimientos').insert({
      cliente_id: clienteId,
      monto,
      tipo,
      descripcion: descripcion ?? `Recarga de wallet $${monto}`,
    }),
  ])

  if (updateResult.error) throw updateResult.error
  if (insertResult.error) throw insertResult.error
}

export async function descontarWalletCliente(
  clienteId: string,
  monto: number,
  ordenId?: string | null,
  descripcion?: string,
): Promise<void> {
  const { data: cliente, error: readErr } = await supabase
    .from('clientes')
    .select('wallet_saldo')
    .eq('id', clienteId)
    .single()

  if (readErr || !cliente) throw readErr ?? new Error('Cliente no encontrado')

  const nuevoSaldo = Math.max(0, Number(cliente.wallet_saldo) - monto)
  const tipo: TipoMovimientoWallet = 'pago'

  const [updateResult, insertResult] = await Promise.all([
    supabase
      .from('clientes')
      .update({ wallet_saldo: nuevoSaldo })
      .eq('id', clienteId),
    supabase.from('wallet_movimientos').insert({
      cliente_id: clienteId,
      monto,
      tipo,
      orden_id: ordenId ?? null,
      descripcion: descripcion ?? `Cobro wallet $${monto}`,
    }),
  ])

  if (updateResult.error) throw updateResult.error
  if (insertResult.error) throw insertResult.error
}

// ─── Gift Cards ───────────────────────────────────────────────────────────────

export type { GiftCardRow }

export async function getGiftCards(): Promise<GiftCardRow[]> {
  const { data, error } = await supabase
    .from('gift_cards')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function buscarGiftCard(codigo: string): Promise<GiftCardRow | null> {
  const { data, error } = await supabase
    .from('gift_cards')
    .select('*')
    .eq('codigo', codigo.trim().toUpperCase())
    .single()

  if (error) return null
  return data
}

function generarCodigoGift(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'GIFT-'
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(Math.random() * chars.length)
    code += chars[idx] ?? 'A'
  }
  return code
}

export async function crearGiftCard(
  monto: number,
  fechaVenc: string | null,
  clienteId?: string | null,
): Promise<GiftCardRow> {
  const codigo = generarCodigoGift()

  const { data, error } = await supabase
    .from('gift_cards')
    .insert({
      codigo,
      saldo: monto,
      saldo_inicial: monto,
      activa: true,
      vence_en: fechaVenc ?? null,
      cliente_id: clienteId ?? null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function anularGiftCard(id: string): Promise<void> {
  const { error } = await supabase
    .from('gift_cards')
    .update({ activa: false })
    .eq('id', id)

  if (error) throw error
}

export async function descontarGiftCard(
  id: string,
  monto: number,
): Promise<void> {
  const { data: gc, error: readErr } = await supabase
    .from('gift_cards')
    .select('saldo')
    .eq('id', id)
    .single()

  if (readErr || !gc) throw readErr ?? new Error('Gift Card no encontrada')

  const nuevoSaldo = Math.max(0, Number(gc.saldo) - monto)

  const { error } = await supabase
    .from('gift_cards')
    .update({
      saldo: nuevoSaldo,
      activa: nuevoSaldo > 0,
    })
    .eq('id', id)

  if (error) throw error
}

export async function buscarClientePorEmail(email: string) {
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .eq('email', email)
    .eq('activo', true)
    .limit(1)
  return data?.[0] ?? null
}
