/**
 * Registra el agente de caja como Servicio de Windows.
 *
 * Es un servicio APARTE del agente de cocina, con otro nombre: si uno se
 * cae, el otro sigue imprimiendo. Esa separacion es el punto entero de
 * tenerlos en dos procesos.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

if (process.platform !== 'win32') {
  console.error('Este instalador es solo para Windows.')
  console.error('En Mac/Linux usa:  node agente-caja.mjs  (o pm2 / launchd / systemd)')
  process.exit(1)
}

const aqui = dirname(fileURLToPath(import.meta.url))
const script = join(aqui, 'agente-caja.mjs')

if (!existsSync(join(aqui, '.env'))) {
  console.error('Falta el archivo .env. Copia .env.example como .env y llenalo primero.')
  process.exit(1)
}

const nw = await import('node-windows').catch(() => null)
if (!nw) {
  console.error('Falta node-windows. Corre:  npm install node-windows')
  process.exit(1)
}

const svc = new nw.Service({
  name: 'Shakeaholic Agente de Caja',
  description: 'Imprime tickets de venta y cortes de caja de Shakeaholic en la impresora de caja.',
  script,
  workingDirectory: aqui,
  env: [{ name: 'NODE_ENV', value: 'production' }],
})

svc.on('install', () => { console.log('Servicio instalado. Arrancando...'); svc.start() })
svc.on('start', () => console.log('Servicio corriendo.'))
svc.on('alreadyinstalled', () => console.log('Ya estaba instalado.'))
svc.on('error', (e) => { console.error('Error:', e); process.exit(1) })
svc.install()
