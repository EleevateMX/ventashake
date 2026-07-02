import type { Cliente } from '@shake/types'
import type { ShakeClient } from '../client'

export interface ClienteInput {
  nombre: string
  telefono?: string | null
  email?: string | null
  notas?: string | null
}

export async function listarClientes(sb: ShakeClient): Promise<Cliente[]> {
  const { data, error } = await sb
    .from('clientes')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data
}

export async function buscarClientes(sb: ShakeClient, texto: string): Promise<Cliente[]> {
  const q = texto.trim()
  if (!q) return listarClientes(sb)
  const { data, error } = await sb
    .from('clientes')
    .select('*')
    .eq('activo', true)
    .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`)
    .order('nombre')
    .limit(20)
  if (error) throw error
  return data
}

export async function crearCliente(sb: ShakeClient, input: ClienteInput): Promise<Cliente> {
  const { data, error } = await sb
    .from('clientes')
    .insert({
      nombre: input.nombre,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
      notas: input.notas ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarCliente(
  sb: ShakeClient,
  id: string,
  input: ClienteInput,
): Promise<Cliente> {
  const { data, error } = await sb
    .from('clientes')
    .update({
      nombre: input.nombre,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
      notas: input.notas ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Baja lógica. */
export async function desactivarCliente(sb: ShakeClient, id: string): Promise<void> {
  const { error } = await sb.from('clientes').update({ activo: false }).eq('id', id)
  if (error) throw error
}
