import type { printer as ThermalPrinter } from 'node-thermal-printer'
import { crearImpresora, escribirComanda } from './comanda.js'
import type { PrinterConfig, TrabajoImpresion } from './types.js'
import { log } from './log.js'

/**
 * Imprime un trabajo en la impresora física, respetando `copias` y
 * `corteAutomatico`/`buzzer` de la config. Lanza si la impresora no
 * responde — el llamante (worker.ts) decide qué hacer con eso (reintento).
 */
export async function imprimirTrabajo(cfg: PrinterConfig, trabajo: TrabajoImpresion): Promise<void> {
  const printer: ThermalPrinter = crearImpresora(cfg)

  const conectada = await printer.isPrinterConnected().catch(() => false)
  if (!conectada) {
    throw new Error(`Impresora "${cfg.id}" (${cfg.interface}) no responde — revisa cable/red/encendido.`)
  }

  const copias = Math.max(1, cfg.copias || 1)
  for (let copia = 1; copia <= copias; copia++) {
    printer.clear()
    escribirComanda(printer, trabajo, copia)
    if (cfg.corteAutomatico) printer.cut()
    if (cfg.buzzer) printer.beep()
    await printer.execute()
    log.info(`Impreso trabajo ${trabajo.id} (copia ${copia}/${copias})`, cfg.id)
  }
}
