import dgram from 'node:dgram'

/**
 * Control de televisiones por DLNA / UPnP AVTransport.
 *
 * Verificado contra las Hisense VIDAA del local: exponen un MediaRenderer en
 * el puerto 18400 y aceptan SetAVTransportURI + Play sin autenticacion
 * ninguna. El puerto 36669 (RemoteNOW) NO sirve: exige un certificado de
 * cliente que vive dentro de la app de Hisense, asi que encender la tele o
 * abrirle el navegador por red no es posible. DLNA es lo unico que hay.
 *
 * Consecuencia de diseño: esto empuja MEDIA (imagen o video), no paginas
 * web. El contenido dinamico tiene que llegar ya renderizado a imagen.
 */

export interface Pantalla {
  ip: string
  puerto: number
  /** Nombre que la propia tele reporta, p.ej. "Barra larga". */
  nombre: string
  udn: string
  /** Ruta de control de AVTransport, tal como la publica el dispositivo. */
  controlAv: string
}

export interface EstadoPantalla {
  /** PLAYING | STOPPED | PAUSED_PLAYBACK | TRANSITIONING | NO_MEDIA_PRESENT */
  transporte: string
  /** Lo que la tele dice que esta reproduciendo ahora. */
  uri: string | null
}

const SSDP_IP = '239.255.255.250'
const SSDP_PUERTO = 1900

/** Descubre MediaRenderers en la red local por SSDP. */
export function descubrir(timeoutMs = 6000): Promise<Map<string, { loc: string }>> {
  return new Promise((resolve) => {
    const encontrados = new Map<string, { loc: string }>()
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const busqueda = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      `HOST: ${SSDP_IP}:${SSDP_PUERTO}\r\n` +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 3\r\n' +
      'ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n',
    )

    s.on('message', (msg, rinfo) => {
      const t = msg.toString()
      const loc = /^LOCATION:\s*(.+?)\r?$/im.exec(t)?.[1]?.trim()
      if (loc) encontrados.set(rinfo.address, { loc })
    })
    s.on('error', () => { try { s.close() } catch { /* ya cerrado */ } resolve(encontrados) })
    s.bind(() => {
      s.setBroadcast(true)
      // Tres envios: UDP se pierde, y una tele ocupada puede ignorar el primero.
      for (let i = 0; i < 3; i++) {
        setTimeout(() => { try { s.send(busqueda, SSDP_PUERTO, SSDP_IP) } catch { /* red caida */ } }, i * 400)
      }
      setTimeout(() => { try { s.close() } catch { /* ya cerrado */ } resolve(encontrados) }, timeoutMs)
    })
  })
}

async function texto(url: string, ms = 6000): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    return r.ok ? await r.text() : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

const etiqueta = (xml: string, nombre: string) =>
  new RegExp(`<${nombre}[^>]*>([^<]*)</${nombre}>`, 'i').exec(xml)?.[1]?.trim() ?? null

/**
 * Lee la descripcion del dispositivo y saca su nombre y su ruta de control.
 *
 * La ruta NO se escribe a mano aunque hoy todas digan `/upnp/control/mingusavtr`:
 * en cuanto entre una tele de otra marca, ese valor cambia y el empujador
 * dejaria de funcionar sin decir por que.
 */
export async function describir(locacion: string): Promise<Pantalla | null> {
  const xml = await texto(locacion)
  if (!xml) return null

  const u = new URL(locacion)
  const base = etiqueta(xml, 'URLBase') ?? `${u.protocol}//${u.host}`

  // El bloque de AVTransport, para no tomar el controlURL de otro servicio.
  const bloque = /<service>(?:(?!<\/service>)[\s\S])*?AVTransport:1[\s\S]*?<\/service>/i.exec(xml)?.[0]
  const control = bloque ? etiqueta(bloque, 'controlURL') : null
  if (!control) return null

  return {
    ip: u.hostname,
    puerto: Number(u.port || 80),
    nombre: etiqueta(xml, 'friendlyName') ?? u.hostname,
    udn: etiqueta(xml, 'UDN') ?? '',
    controlAv: new URL(control, base.endsWith('/') ? base : base + '/').toString(),
  }
}

async function soap(p: Pantalla, accion: string, cuerpo: string, ms = 10000): Promise<string | null> {
  const sobre =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
    's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
    `<u:${accion} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">${cuerpo}</u:${accion}>` +
    '</s:Body></s:Envelope>'

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(p.controlAv, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        SOAPACTION: `"urn:schemas-upnp-org:service:AVTransport:1#${accion}"`,
      },
      body: sobre,
      signal: ctrl.signal,
    })
    return r.ok ? await r.text() : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Metadatos DIDL-Lite. Sin esto algunas teles aceptan la URI y no pintan nada. */
function didl(url: string, titulo: string, tipo: 'imagen' | 'video'): string {
  const clase = tipo === 'video' ? 'object.item.videoItem' : 'object.item.imageItem.photo'
  const mime = tipo === 'video' ? 'video/mp4' : 'image/jpeg'
  const xml =
    '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" ' +
    'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<item id="1" parentID="0" restricted="1"><dc:title>${esc(titulo)}</dc:title>` +
    `<upnp:class>${clase}</upnp:class>` +
    `<res protocolInfo="http-get:*:${mime}:DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000">${esc(url)}</res>` +
    '</item></DIDL-Lite>'
  return esc(xml)
}

export async function estado(p: Pantalla): Promise<EstadoPantalla | null> {
  const info = await soap(p, 'GetTransportInfo', '<InstanceID>0</InstanceID>')
  if (!info) return null
  const medio = await soap(p, 'GetMediaInfo', '<InstanceID>0</InstanceID>')
  return {
    transporte: etiqueta(info, 'CurrentTransportState') ?? 'DESCONOCIDO',
    uri: medio ? etiqueta(medio, 'CurrentURI') : null,
  }
}

export async function poner(
  p: Pantalla, url: string, titulo: string, tipo: 'imagen' | 'video',
): Promise<boolean> {
  const ok = await soap(
    p, 'SetAVTransportURI',
    `<InstanceID>0</InstanceID><CurrentURI>${esc(url)}</CurrentURI>` +
    `<CurrentURIMetaData>${didl(url, titulo, tipo)}</CurrentURIMetaData>`,
  )
  if (ok === null) return false
  return (await soap(p, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>')) !== null
}

export const parar = (p: Pantalla) => soap(p, 'Stop', '<InstanceID>0</InstanceID>')
