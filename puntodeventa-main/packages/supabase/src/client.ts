import { createClient } from '@supabase/supabase-js'
import type { Database } from './types/database'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://xxxx.supabase.co'
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'public-anon-placeholder'

export const isSupabaseConfigured =
  !!import.meta.env.VITE_SUPABASE_URL &&
  !String(import.meta.env.VITE_SUPABASE_URL).includes('xxxx')

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
