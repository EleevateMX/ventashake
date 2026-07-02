import type { Cliente, Cupon } from '@shake/types'
import type { ShakeClient } from '../client'

export interface ClienteConLealtad extends Cliente {
  cupones: Cupon[]
}

/**
 * Identifica al cliente en caja por teléfono o por código QR (SHK-XXXXXX).
 * Devuelve su saldo de mancuernas y cupones activos vigentes.
 */
export async function identificarCliente(
  sb: ShakeClient,
  telefonoOCodigo: string,
): Promise<ClienteConLealtad | null> {
  const q = telefonoOCodigo.trim()
  if (!q) return null
  const esCodigo = /^SHK-/i.test(q)
  const { data, error } = await sb
    .from('clientes')
    .select('*, cupones(*)')
    .eq(esCodigo ? 'codigo' : 'telefono', esCodigo ? q.toUpperCase() : q)
    .eq('activo', true)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const cli = data as ClienteConLealtad
  // solo cupones activos y vigentes
  const ahora = Date.now()
  cli.cupones = (cli.cupones ?? []).filter(
    (c) => c.estado === 'activo' && new Date(c.vence_en).getTime() >= ahora,
  )
  return cli
}

export interface RegistrarClienteInput {
  nombre: string
  telefono: string
  fecha_nacimiento?: string | null
  sabor_favorito?: string | null
}

/** Alta de cliente en el programa (el código QR se genera en la base). */
export async function registrarCliente(
  sb: ShakeClient,
  input: RegistrarClienteInput,
): Promise<Cliente> {
  const { data, error } = await sb
    .from('clientes')
    .insert({
      nombre: input.nombre,
      telefono: input.telefono,
      fecha_nacimiento: input.fecha_nacimiento ?? null,
      sabor_favorito: input.sabor_favorito ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Vincula (o crea) el cliente del programa con el usuario de Supabase Auth.
 * Se llama tras el login con Google en la PWA. Idempotente por auth_user_id.
 */
export async function vincularClienteAuth(
  sb: ShakeClient,
  input: { authUserId: string; nombre: string; email?: string | null },
): Promise<ClienteConLealtad> {
  const { data: existente, error: e1 } = await sb
    .from('clientes')
    .select('*, cupones(*)')
    .eq('auth_user_id', input.authUserId)
    .maybeSingle()
  if (e1) throw e1
  if (existente) return filtrarCupones(existente as ClienteConLealtad)

  const { data, error } = await sb
    .from('clientes')
    .insert({ auth_user_id: input.authUserId, nombre: input.nombre, email: input.email ?? null })
    .select('*, cupones(*)')
    .single()
  if (error) throw error
  return filtrarCupones(data as ClienteConLealtad)
}

/** Estado de lealtad del usuario logueado (por auth_user_id). */
export async function miLealtad(sb: ShakeClient, authUserId: string): Promise<ClienteConLealtad | null> {
  const { data, error } = await sb
    .from('clientes')
    .select('*, cupones(*)')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) throw error
  return data ? filtrarCupones(data as ClienteConLealtad) : null
}

function filtrarCupones(cli: ClienteConLealtad): ClienteConLealtad {
  const ahora = Date.now()
  cli.cupones = (cli.cupones ?? []).filter(
    (c) => c.estado === 'activo' && new Date(c.vence_en).getTime() >= ahora,
  )
  return cli
}

/** Cupones activos y vigentes de un cliente. */
export async function cuponesActivos(sb: ShakeClient, clienteId: string): Promise<Cupon[]> {
  const { data, error } = await sb
    .from('cupones')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('estado', 'activo')
    .gte('vence_en', new Date().toISOString())
    .order('vence_en')
  if (error) throw error
  return data
}

/** Busca un cupón por su código (escaneo QR en caja). */
export async function buscarCupon(sb: ShakeClient, codigo: string): Promise<Cupon | null> {
  const { data, error } = await sb
    .from('cupones')
    .select('*')
    .eq('codigo', codigo.trim().toUpperCase())
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Canjea un cupón: valida que esté activo y vigente, lo marca usado y lo
 * liga a la orden. Devuelve el cupón canjeado o lanza si no es válido.
 */
export async function canjearCupon(
  sb: ShakeClient,
  cuponId: string,
  ordenId?: string,
): Promise<Cupon> {
  const { data: cup, error: e1 } = await sb.from('cupones').select('*').eq('id', cuponId).single()
  if (e1) throw e1
  if (cup.estado !== 'activo') throw new Error('El cupón no está activo.')
  if (new Date(cup.vence_en).getTime() < Date.now()) throw new Error('El cupón está vencido.')
  const { data, error } = await sb
    .from('cupones')
    .update({ estado: 'usado', usado_en: new Date().toISOString(), orden_id_uso: ordenId ?? null })
    .eq('id', cuponId)
    .eq('estado', 'activo')
    .select()
    .single()
  if (error) throw error
  return data
}
