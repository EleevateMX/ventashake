import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { EstadoWorker } from './worker.js'
import type { PayloadComanda, PrinterConfig, TrabajoImpresion } from './types.js'
import { imprimirTrabajo } from './printerAdapter.js'
import { estacionesAprendidas, impresoraDeEstacion } from './estaciones.js'
import { VERSION_AGENTE } from './version.js'
import { log } from './log.js'

/**
 * Servidor local del agente: http://localhost:PUERTO
 *
 *   GET  /status          cómo van las impresoras (como siempre).
 *   POST /local/comanda   imprime una comanda que manda el kiosko cuando NO
 *                         hay internet (08/10/26).
 *
 * Sin internet la base no puede repartir trabajos, pero el kiosko, el agente
 * y las etiquetadoras siguen en la misma red de la tienda. El kiosko arma la
 * comanda, se la pasa al agente por aquí y sale el papel. La venta se
 * registra en la base cuando vuelve el internet, y la base sabe que esa
 * comanda ya salió y no la vuelve a mandar.
 *
 * Solo acepta comandas de la dirección del kiosko: cualquier página que
 * alguien abra en esa PC podría intentar mandarle un POST a localhost, y
 * no tiene por qué poder imprimir en barra.
 */

const ORIGENES = new Set([
  'https://kiosko.shakeaholic.mx',
  'https://shake-kiosko.pages.dev',
  'http://localhost:5186',
  ...(process.env.ORIGENES_LOCALES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
])

export function origenPermitido(origen: string | undefined): boolean {
  if (!origen) return false
  if (ORIGENES.has(origen)) return true
  // Las vistas previas de Cloudflare Pages: https://<hash>.shake-kiosko.pages.dev
  return /^https:\/\/[a-z0-9-]+\.shake-kiosko\.pages\.dev$/.test(origen)
}

/** Lo que el kiosko manda, validado. `null` si no sirve. */
export function leerComandaLocal(cuerpo: unknown): { id: string; estacion: string; payload: PayloadComanda } | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const c = cuerpo as { id?: unknown; estacion?: unknown; payload?: unknown }
  if (typeof c.id !== 'string' || !c.id || c.id.length > 80) return null
  if (typeof c.estacion !== 'string' || !c.estacion.trim()) return null
  const p = c.payload as PayloadComanda | undefined
  if (!p || typeof p !== 'object' || !Array.isArray(p.items) || p.items.length === 0) return null
  // Solo comandas: calibrar o diagnosticar el rollo se sigue haciendo con
  // internet, desde el botón de siempre.
  return {
    id: c.id,
    estacion: c.estacion,
    payload: { ...p, prueba: false, calibrar: false, diagnostico: false },
  }
}

/** Un reintento del kiosko (se cortó la respuesta) no imprime dos veces. */
const yaImpresas: string[] = []

function cabecerasCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origen = req.headers.origin
  if (origenPermitido(origen)) {
    res.setHeader('access-control-allow-origin', origen as string)
    res.setHeader('vary', 'origin')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type')
    // Chrome pide permiso explícito para que una página pública hable con
    // la red local (Private Network Access): sin esto, el preflight falla.
    res.setHeader('access-control-allow-private-network', 'true')
    res.setHeader('access-control-max-age', '600')
    return true
  }
  return false
}

function json(res: ServerResponse, status: number, cuerpo: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(cuerpo, null, 2))
}

async function leerCuerpo(req: IncomingMessage, limite = 64 * 1024): Promise<unknown> {
  let total = 0
  const partes: Buffer[] = []
  for await (const parte of req) {
    total += (parte as Buffer).length
    if (total > limite) throw new Error('La comanda es demasiado grande.')
    partes.push(parte as Buffer)
  }
  return JSON.parse(Buffer.concat(partes).toString('utf8'))
}

export function iniciarStatusHttp(
  puerto: number,
  obtenerEstados: () => EstadoWorker[],
  printers: PrinterConfig[] = [],
): void {
  if (puerto <= 0) return

  const servidor = createServer((req, res) => {
    void (async () => {
      const permitido = cabecerasCors(req, res)

      if (req.method === 'OPTIONS') {
        res.writeHead(permitido ? 204 : 403)
        res.end()
        return
      }

      if (req.method === 'GET' && req.url === '/status') {
        json(res, 200, {
          agente: process.pid,
          version: VERSION_AGENTE,
          ahora: new Date().toISOString(),
          impresoras: obtenerEstados(),
          estaciones: estacionesAprendidas(),
        })
        return
      }

      if (req.method === 'POST' && req.url === '/local/comanda') {
        if (!permitido) {
          json(res, 403, { ok: false, error: 'Solo el kiosko puede mandar comandas aquí.' })
          return
        }
        let comanda: ReturnType<typeof leerComandaLocal>
        try {
          comanda = leerComandaLocal(await leerCuerpo(req))
        } catch (e) {
          json(res, 400, { ok: false, error: e instanceof Error ? e.message : 'No se pudo leer la comanda.' })
          return
        }
        if (!comanda) {
          json(res, 400, { ok: false, error: 'La comanda no trae id, estación o productos.' })
          return
        }
        if (yaImpresas.includes(comanda.id)) {
          json(res, 200, { ok: true, repetida: true })
          return
        }
        const impresora = impresoraDeEstacion(comanda.estacion, printers)
        if (!impresora) {
          json(res, 409, {
            ok: false,
            error: `No sé qué impresora es de "${comanda.estacion}". Se aprende sola en cuanto imprima una comanda con internet.`,
          })
          return
        }
        const trabajo: TrabajoImpresion = {
          id: `local-${comanda.id}`,
          orden_id: null,
          pedido_id: null,
          estacion_id: null,
          printer_id: null,
          tipo_documento: 'comanda',
          payload: comanda.payload,
          estado: 'printing',
          intentos: 0,
          max_intentos: 1,
          numero_copia: 1,
          created_at: new Date().toISOString(),
        }
        try {
          await imprimirTrabajo(impresora, trabajo)
          yaImpresas.push(comanda.id)
          if (yaImpresas.length > 500) yaImpresas.shift()
          log.info(`Comanda SIN INTERNET ${comanda.payload.ticket ?? ''} impresa (${comanda.estacion})`, impresora.id)
          json(res, 200, { ok: true, impresora: impresora.id })
        } catch (e) {
          const mensaje = e instanceof Error ? e.message : String(e)
          log.error(`Comanda sin internet no salió: ${mensaje}`, impresora.id)
          json(res, 502, { ok: false, error: mensaje })
        }
        return
      }

      json(res, 404, { error: 'Solo existen GET /status y POST /local/comanda' })
    })().catch((e) => {
      log.error(`Servidor local: ${e instanceof Error ? e.message : String(e)}`)
      try { json(res, 500, { ok: false, error: 'Error interno del agente.' }) } catch { /* ya se respondió */ }
    })
  })

  // Solo esta PC: el kiosko vive en la misma máquina. Abierto a la red de
  // la tienda, cualquier aparato conectado al wifi podría imprimir en barra
  // (el candado de origen solo detiene a los navegadores).
  servidor.listen(puerto, '127.0.0.1', () => {
    log.info(`Servidor local en http://127.0.0.1:${puerto} (/status y /local/comanda)`)
  })
}
