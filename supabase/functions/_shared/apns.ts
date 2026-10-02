// Hablar con APNs (Apple Push Notification service) desde Deno, sin SDK.
//
// Apple pide HTTP/2 y un JWT ES256 firmado con la llave .p8 de la cuenta de
// desarrollador (developer.apple.com → Keys → APNs). El JWT dura una hora;
// Apple rechaza uno de más de 60 min y también pide no renovarlo cada 20 min
// o menos, así que se guarda en memoria y se reusa 50 minutos.
//
// Secrets: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 (contenido del .p8),
// APNS_BUNDLE_ID (mx.shakeaholic.rewards).

export interface Aviso {
  titulo: string
  cuerpo: string
  datos?: Record<string, unknown>
  badge?: number
}

export type Resultado =
  | { ok: true }
  | { ok: false; razon: string; tokenMuerto: boolean }

let jwtCache: { valor: string; emitido: number } | null = null

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemADer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function jwt(): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000)
  if (jwtCache && ahora - jwtCache.emitido < 50 * 60) return jwtCache.valor

  const keyId = Deno.env.get('APNS_KEY_ID')
  const teamId = Deno.env.get('APNS_TEAM_ID')
  const p8 = Deno.env.get('APNS_KEY_P8')
  if (!keyId || !teamId || !p8) throw new Error('Faltan los secrets de APNs (APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8).')

  const llave = await crypto.subtle.importKey(
    'pkcs8', pemADer(p8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const enc = new TextEncoder()
  const cabecera = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: keyId })))
  const cuerpo = b64url(enc.encode(JSON.stringify({ iss: teamId, iat: ahora })))
  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, llave, enc.encode(`${cabecera}.${cuerpo}`),
  )
  const valor = `${cabecera}.${cuerpo}.${b64url(new Uint8Array(firma))}`
  jwtCache = { valor, emitido: ahora }
  return valor
}

export async function mandarAviso(token: string, entorno: 'sandbox' | 'production', aviso: Aviso): Promise<Resultado> {
  const bundle = Deno.env.get('APNS_BUNDLE_ID') ?? 'mx.shakeaholic.rewards'
  const host = entorno === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com'
  const payload = {
    aps: {
      alert: { title: aviso.titulo, body: aviso.cuerpo },
      sound: 'default',
      ...(aviso.badge !== undefined ? { badge: aviso.badge } : {}),
    },
    ...(aviso.datos ?? {}),
  }
  let r: Response
  try {
    r = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await jwt()}`,
        'apns-topic': bundle,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 60 * 60 * 6),
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { ok: false, razon: `red: ${(e as Error).message}`, tokenMuerto: false }
  }
  if (r.ok) return { ok: true }
  let razon = `HTTP ${r.status}`
  try {
    const j = await r.json()
    if (j?.reason) razon = `${r.status} ${j.reason}`
  } catch { /* sin cuerpo */ }
  // 410 = el token ya no existe (app borrada). 400 BadDeviceToken /
  // DeviceTokenNotForTopic = nunca va a servir. Se apaga y no se reintenta.
  const muerto = r.status === 410 || /BadDeviceToken|DeviceTokenNotForTopic|Unregistered/.test(razon)
  return { ok: false, razon, tokenMuerto: muerto }
}
