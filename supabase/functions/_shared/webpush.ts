// Web Push desde Deno, sin SDK: RFC 8291 (cifrado aes128gcm) + RFC 8292
// (VAPID). Es lo que recibe la PWA en Android (y en iOS instalada a la
// pantalla de inicio). El navegador nos dio un endpoint y dos llaves
// (p256dh, auth); el aviso viaja cifrado con ellas y firmado con la llave
// VAPID de la casa, así que ni el servicio de push de Google ni el de Apple
// pueden leerlo.
//
// Secrets: VAPID_PUBLIC_KEY (base64url, 65 bytes sin comprimir),
// VAPID_PRIVATE_KEY (el escalar `d` en base64url, como JWK),
// VAPID_SUBJECT (mailto: o https:).

import type { Aviso, Resultado } from './apns.ts'

export interface Suscripcion {
  endpoint: string
  claves: { p256dh: string; auth: string }
}

const enc = new TextEncoder()

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function deB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function concat(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let i = 0
  for (const p of partes) { out.set(p, i); i += p.length }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bits: number): Promise<Uint8Array> {
  const llave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, llave, bits))
}

/** El JWT de VAPID: quién manda, para qué origen, hasta cuándo. */
let jwtCache: { aud: string; valor: string; emitido: number } | null = null
async function vapid(aud: string): Promise<{ t: string; k: string }> {
  const publica = Deno.env.get('VAPID_PUBLIC_KEY')
  const d = Deno.env.get('VAPID_PRIVATE_KEY')
  const sub = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hola@shakeaholic.mx'
  if (!publica || !d) throw new Error('Faltan los secrets de Web Push (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).')
  const ahora = Math.floor(Date.now() / 1000)
  if (jwtCache && jwtCache.aud === aud && ahora - jwtCache.emitido < 6 * 3600) return { t: jwtCache.valor, k: publica }

  // La pública sin comprimir es 0x04 || x || y: de ahí salen x, y del JWK.
  const raw = deB64url(publica)
  const x = b64url(raw.slice(1, 33)), y = b64url(raw.slice(33, 65))
  const llave = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', x, y, d, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const cabecera = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const cuerpo = b64url(enc.encode(JSON.stringify({ aud, exp: ahora + 12 * 3600, sub })))
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llave, enc.encode(`${cabecera}.${cuerpo}`))
  const valor = `${cabecera}.${cuerpo}.${b64url(firma)}`
  jwtCache = { aud, valor, emitido: ahora }
  return { t: valor, k: publica }
}

/** Cifra el aviso para ESTA suscripción (RFC 8291, aes128gcm). */
async function cifrar(sub: Suscripcion, texto: string): Promise<Uint8Array> {
  const uaPublica = deB64url(sub.claves.p256dh)
  const authSecret = deB64url(sub.claves.auth)
  const efimera = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', efimera.publicKey))
  const suya = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const secreto = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: suya }, efimera.privateKey, 256))

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const infoLlave = concat(enc.encode('WebPush: info\0'), uaPublica, asPublica)
  const prk = await hkdf(authSecret, secreto, infoLlave, 256)
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 128)
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 96)

  // El último registro lleva el delimitador 0x02 (sin relleno extra).
  const claro = concat(enc.encode(texto), new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, claro))

  // Cabecera del cuerpo: salt(16) | rs(4) | idlen(1) | keyid(65) | registros.
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([asPublica.length]), asPublica, cifrado)
}

export async function mandarWebPush(sub: Suscripcion, aviso: Aviso): Promise<Resultado> {
  let cuerpo: Uint8Array
  let auth: { t: string; k: string }
  try {
    auth = await vapid(new URL(sub.endpoint).origin)
    cuerpo = await cifrar(sub, JSON.stringify({ titulo: aviso.titulo, cuerpo: aviso.cuerpo, datos: aviso.datos ?? {} }))
  } catch (e) {
    return { ok: false, razon: `cifrado: ${(e as Error).message}`, tokenMuerto: false }
  }
  let r: Response
  try {
    r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: `vapid t=${auth.t}, k=${auth.k}`,
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(60 * 60 * 6),
        urgency: 'high',
      },
      body: cuerpo,
    })
  } catch (e) {
    return { ok: false, razon: `red: ${(e as Error).message}`, tokenMuerto: false }
  }
  if (r.ok) return { ok: true }
  let razon = `HTTP ${r.status}`
  try { razon += ' ' + (await r.text()).slice(0, 120) } catch { /* sin cuerpo */ }
  // 404/410 = la suscripción ya no existe (quitó los permisos, borró la app).
  return { ok: false, razon, tokenMuerto: r.status === 404 || r.status === 410 }
}
