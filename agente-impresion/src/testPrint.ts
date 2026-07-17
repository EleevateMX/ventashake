/**
 * Prueba de impresora SIN pasar por Supabase — solo hardware. Útil para
 * confirmar cable/red/driver antes de conectar todo lo demás.
 *
 *   pnpm test-print <printerId>
 *
 * `<printerId>` debe existir en printers.config.json.
 */
import { cargarConfig } from './config.js'
import { crearImpresora, escribirComanda } from './comanda.js'
import type { TrabajoImpresion } from './types.js'

async function main(): Promise<void> {
  const printerId = process.argv[2]
  if (!printerId) {
    console.error('Uso: pnpm test-print <printerId>  (ver printers.config.json)')
    process.exit(1)
  }

  const cfg = cargarConfig()
  const printerCfg = cfg.printers.find((p) => p.id === printerId)
  if (!printerCfg) {
    console.error(`No existe la impresora "${printerId}" en printers.config.json`)
    process.exit(1)
  }

  const printer = crearImpresora(printerCfg)
  console.log(`Conectando a ${printerCfg.interface}…`)
  const conectada = await printer.isPrinterConnected()
  if (!conectada) {
    console.error('No responde. Revisa cable/IP/puerto/encendido.')
    process.exit(1)
  }
  console.log('Conectada. Imprimiendo prueba…')

  const trabajoDePrueba: TrabajoImpresion = {
    id: 'prueba-local',
    orden_id: null,
    pedido_id: null,
    estacion_id: null,
    printer_id: null,
    tipo_documento: 'comanda',
    payload: {
      folio: 999,
      canal: 'pos',
      estacion: printerCfg.descripcion ?? printerCfg.id,
      creado_en: new Date().toISOString(),
      cajero: 'Prueba local',
      items: [
        { cantidad: 2, nombre: 'Shake de Fresa (prueba)', personalizacion: 'sin azúcar, extra fresa' },
        { cantidad: 1, nombre: 'Wrap de Pollo (prueba)' },
      ],
    },
    estado: 'claimed',
    intentos: 0,
    max_intentos: 5,
    numero_copia: 1,
    created_at: new Date().toISOString(),
  }

  printer.clear()
  escribirComanda(printer, trabajoDePrueba, 1)
  if (printerCfg.corteAutomatico) printer.cut()
  if (printerCfg.buzzer) printer.beep()
  await printer.execute()
  console.log('Listo. Si no salió nada, revisa characterSet/ancho en comanda.ts para tu modelo.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
