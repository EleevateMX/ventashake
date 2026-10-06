import type { ShakeClient } from '@shake/supabase'
import { rpc } from './rpc'

/**
 * Avisos push en la web (Android y, instalada, iOS).
 *
 * La app solo hace dos cosas: pedir permiso cuando tiene sentido (nunca al
 * abrir) y registrar la suscripción con la sesión. Quién recibe qué lo
 * decide el servidor (`push_cola`), y quien habla con el navegador es la
 * Edge Function `push-cola`, igual que con Apple para iOS.
 *
 * La llave pública VAPID es pública por diseño: identifica al remitente,
 * no autoriza nada. La privada vive en los secrets de Edge.
 */
export const VAPID_PUBLICA = 'BPnxrw8c7qU6Eg8-Ln358ndEETqI4sP8nxQMnK6tc0_UHiJmYI4UfMW-KOpR7Spe4BByRblG8eBxJhnFjPxS-1Q'

export function pushDisponible(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function permisoPush(): NotificationPermission | 'no' {
  return pushDisponible() ? Notification.permission : 'no'
}

function aBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/**
 * Registra (o renueva) la suscripción con la sesión actual. No pide
 * permiso: eso lo hace `activarPush` desde un botón.
 */
export async function registrarPush(sb: ShakeClient): Promise<void> {
  if (permisoPush() !== 'granted') return
  const reg = await registro()
  if (!reg) return
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(VAPID_PUBLICA) as BufferSource })
  }
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return
  await rpc(sb, 'fn_push_registrar_web', {
    p_endpoint: j.endpoint,
    p_claves: { p256dh: j.keys.p256dh, auth: j.keys.auth },
    p_version: 'pwa',
  })
}

/** Desde un botón: pide permiso y, si lo dan, registra. */
export async function activarPush(sb: ShakeClient): Promise<NotificationPermission> {
  if (!pushDisponible()) return 'denied'
  const permiso = await Notification.requestPermission()
  // Si el registro falla (sin red, o la base aún sin fn_push_registrar_web),
  // el permiso ya quedó dado y la próxima sincronización lo reintenta.
  if (permiso === 'granted') await registrarPush(sb).catch(() => {})
  return permiso
}

/** Al cerrar sesión, este navegador deja de ser de esa cuenta. */
export async function quitarPush(sb: ShakeClient): Promise<void> {
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await rpc(sb, 'fn_push_quitar', { p_token: sub.endpoint }).catch(() => {})
}
