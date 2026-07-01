import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@shake/types'

export type ShakeClient = SupabaseClient<Database>

let cliente: ShakeClient | null = null

/**
 * Cliente Supabase para frontend (anon key). Singleton por app.
 * Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el .env de la app.
 */
export function getSupabase(): ShakeClient {
  if (cliente) return cliente
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env de la app.',
    )
  }
  cliente = createClient<Database>(url, anonKey)
  return cliente
}
