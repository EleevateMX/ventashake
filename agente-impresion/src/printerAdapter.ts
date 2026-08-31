import type { printer as ThermalPrinter } from 'node-thermal-printer'
import { crearImpresora, escribirComanda } from './comanda.js'
import { etiquetasDeTrabajo } from './etiquetas.js'
import {
  generarTSPL, tsplCalibracion, VARIANTES_CABECERA, etiquetaDeVariante,
} from './tspl.js'
import { enviarTSPL, estaViva, parsearDestino } from './tsplSocket.js'
import type { PrinterConfig, TrabajoImpresion } from './types.js'
import { log } from './log.js'

/**
 * Imprime un trabajo en la impresora física, respetando `copias` y
 * `corteAutomatico`/`buzzer` de la config. Lanza si la impresora no
 * responde — el llamante (worker.ts) decide qué hacer con eso (reintento).
 *
 * El lenguaje decide el camino entero, no solo el formato: ESC/POS pasa por
 * node-thermal-printer, TSPL escribe al socket directo. Ver `LenguajeImpresora`
 * en types.ts para por qué esto no puede quedar en manos de una heurística.
 */
export async function imprimirTrabajo(cfg: PrinterConfig, trabajo: TrabajoImpresion): Promise<void> {
  if ((cfg.lenguaje ?? 'escpos') === 'tspl') {
    await imprimirEtiquetas(cfg, trabajo)
    return
  }
  await imprimirRecibo(cfg, trabajo)
}

/** Etiquetadoras TSC / 3nstar: una etiqueta por unidad pedida. */
async function imprimirEtiquetas(cfg: PrinterConfig, trabajo: TrabajoImpresion): Promise<void> {
  const destino = parsearDestino(cfg.interface)

  // Se pregunta ANTES de generar nada. Una etiquetadora apagada acepta el
  // trabajo en silencio si uno se limita a escribir al vacío, y entonces la
  // comanda se da por impresa y nunca llega a barra.
  if (!(await estaViva(destino))) {
    throw new Error(
      `Etiquetadora "${cfg.id}" (${destino.ip}:${destino.puerto}) no responde — revisa red/encendido/tapa.`,
    )
  }

  // Calibracion: no es una comanda, es ajustar el sensor despues de cambiar
  // el rollo. Va primero la medicion y despues UNA etiqueta de prueba, para
  // que quien cambio el rollo vea con sus ojos si quedo derecha. Sin esa
  // etiqueta, calibrar es apretar un boton y esperar a que la proxima venta
  // diga si sirvio.
  // Diagnostico del rollo: la MISMA etiqueta mandada de tres formas, para
  // averiguar por que se van blancas en cada comanda. Va antes que todo lo
  // demas porque no imprime una comanda: imprime evidencia.
  if (trabajo.payload.diagnostico) {
    for (const v of VARIANTES_CABECERA) {
      const etiqueta = etiquetaDeVariante(v.id, v.que, trabajo.payload.impresora ?? cfg.id)
      await enviarTSPL(generarTSPL(etiqueta, v.lineas), destino)
    }
    log.info(
      `Diagnostico del rollo en ${cfg.id}: ${VARIANTES_CABECERA.length} variantes (trabajo ${trabajo.id})`,
      cfg.id,
    )
    return
  }

  if (trabajo.payload.calibrar) {
    await enviarTSPL(tsplCalibracion(), destino)
    const [muestra] = etiquetasDeTrabajo(
      { ...trabajo, payload: { ...trabajo.payload, calibrar: false, prueba: true } },
    )
    if (muestra) await enviarTSPL(generarTSPL(muestra), destino)
    log.info(`Calibrada la etiquetadora ${cfg.id} (trabajo ${trabajo.id})`, cfg.id)
    return
  }

  const copias = Math.max(1, cfg.copias || 1)
  for (let copia = 1; copia <= copias; copia++) {
    const etiquetas = etiquetasDeTrabajo(trabajo, copia)
    if (etiquetas.length === 0) {
      // Se LANZA, no se registra y sigue. Un trabajo que no produce ninguna
      // etiqueta y aun así se confirma queda "impreso" en la cola con nada
      // en la mano: en Admin todo verde y la comanda perdida. Que falle y
      // se reintente es incómodo; que mienta es peor.
      throw new Error(
        `El trabajo ${trabajo.id} no produjo ninguna etiqueta (payload sin productos).`,
      )
    }
    // Una etiqueta por envío: si falla la tercera de cinco, las dos primeras
    // ya salieron y el error dice exactamente dónde se quedó.
    for (const etiqueta of etiquetas) {
      await enviarTSPL(generarTSPL(etiqueta), destino)
    }
    log.info(
      `Impresas ${etiquetas.length} etiquetas del trabajo ${trabajo.id} (copia ${copia}/${copias})`,
      cfg.id,
    )
  }
}

/** Impresoras de recibos ESC/POS: una comanda larga con todos los productos. */
async function imprimirRecibo(cfg: PrinterConfig, trabajo: TrabajoImpresion): Promise<void> {
  // Calibrar el sensor de separacion solo tiene sentido en una etiquetadora:
  // una impresora de recibos usa rollo continuo, no tiene huecos que medir.
  // Se falla con el motivo dicho, en vez de imprimir un recibo sorpresa.
  if (trabajo.payload.calibrar || trabajo.payload.diagnostico) {
    throw new Error(
      `"${cfg.id}" es una impresora de recibos (rollo continuo): no hay separacion que medir.`,
    )
  }

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
