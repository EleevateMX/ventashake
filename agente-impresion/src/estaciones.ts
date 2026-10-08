import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PrinterConfig } from './types.js'
import { log } from './log.js'

/**
 * Qué impresora es de qué estación ("Bebidas" → la de barra).
 *
 * Con internet no hace falta saberlo: la base le manda a cada impresora sus
 * trabajos. Sin internet, el kiosko le pasa la comanda al agente por la red
 * local y el agente tiene que decidir a qué etiquetadora va. Se APRENDE de
 * los trabajos que llegan con internet (cada uno trae `payload.estacion`) y
 * se guarda en disco, para que el día que se caiga el internet el agente ya
 * sepa — aunque se haya reiniciado la PC.
 *
 * Si alguien lo quiere fijo, `estacion` en printers.config.json manda sobre
 * lo aprendido. Y con una sola impresora no hay nada que decidir.
 */

const ARCHIVO = join(process.cwd(), 'estaciones-aprendidas.json')

export type MapaEstaciones = Record<string, string>

export function normalizarEstacion(estacion: string | null | undefined): string {
  return (estacion ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

let mapa: MapaEstaciones | null = null

function cargar(): MapaEstaciones {
  if (mapa) return mapa
  try {
    mapa = JSON.parse(readFileSync(ARCHIVO, 'utf8').replace(/^\uFEFF/, '')) as MapaEstaciones
  } catch {
    mapa = {}
  }
  return mapa
}

export function estacionesAprendidas(): MapaEstaciones {
  return { ...cargar() }
}

/** Anota de quién es una estación. Solo escribe si cambió. */
export function aprenderEstacion(estacion: string | null | undefined, printerId: string): void {
  const clave = normalizarEstacion(estacion)
  if (!clave) return
  const m = cargar()
  if (m[clave] === printerId) return
  m[clave] = printerId
  try {
    writeFileSync(ARCHIVO, JSON.stringify(m, null, 2))
    log.info(`Aprendido: la estación "${estacion}" se imprime en "${printerId}"`, printerId)
  } catch (e) {
    log.error(`No se pudo guardar ${ARCHIVO}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * La impresora de una estación: la fijada en la config, la aprendida, o la
 * única que hay. `null` si no se puede saber — mejor decirlo que imprimir
 * la comanda de cocina en barra.
 */
export function impresoraDeEstacion(
  estacion: string,
  printers: PrinterConfig[],
  aprendidas: MapaEstaciones = cargar(),
): PrinterConfig | null {
  const clave = normalizarEstacion(estacion)
  const fija = printers.find((p) => normalizarEstacion(p.estacion) === clave)
  if (fija) return fija
  const id = aprendidas[clave]
  const aprendida = id ? printers.find((p) => p.id === id) : undefined
  if (aprendida) return aprendida
  return printers.length === 1 ? printers[0] : null
}
