import type { ShakeClient } from '../client'

/** Inicia sesión con Google (OAuth de Supabase Auth). Redirige. */
export async function iniciarSesionGoogle(sb: ShakeClient, redirectTo: string): Promise<void> {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) throw error
}

export async function sesionActual(sb: ShakeClient) {
  const { data } = await sb.auth.getSession()
  return data.session
}

export async function usuarioActual(sb: ShakeClient) {
  const { data } = await sb.auth.getUser()
  return data.user
}

export async function cerrarSesion(sb: ShakeClient): Promise<void> {
  await sb.auth.signOut()
}

/** Suscribe a cambios de sesión; devuelve función para desuscribir. */
export function onCambioSesion(sb: ShakeClient, cb: () => void): () => void {
  const { data } = sb.auth.onAuthStateChange(() => cb())
  return () => data.subscription.unsubscribe()
}
