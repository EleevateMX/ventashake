/**
 * «Instalar la app» en Android.
 *
 * Chrome avisa con `beforeinstallprompt` cuando la PWA se puede instalar.
 * El evento llega UNA vez y antes de que React monte, así que se guarda
 * aquí (este módulo se importa desde main.tsx) y la pantalla lo pide
 * después. Sin esto, el botón de instalar sería una promesa vacía.
 */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pendiente: EventoInstalar | null = null
const oyentes = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  pendiente = e as EventoInstalar
  oyentes.forEach((f) => f())
})
window.addEventListener('appinstalled', () => {
  pendiente = null
  oyentes.forEach((f) => f())
})

export function sePuedeInstalar(): boolean {
  return pendiente !== null
}

export function estaInstalada(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true
}

export function alCambiarInstalable(f: () => void): () => void {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}

export async function instalar(): Promise<'accepted' | 'dismissed' | 'no'> {
  if (!pendiente) return 'no'
  const e = pendiente
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') pendiente = null
  oyentes.forEach((f) => f())
  return outcome
}
