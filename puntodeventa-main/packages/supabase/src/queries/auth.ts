import { supabase } from '../client'

export async function loginConGoogle(redirectTo: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) throw error
}

export async function getUsuarioActual() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getSessionActual() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function cerrarSesionAuth(): Promise<void> {
  await supabase.auth.signOut()
}
