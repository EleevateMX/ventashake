/**
 * Registra el agente de pantallas como Servicio de Windows.
 *
 * Nombre distinto al de caja y al de etiquetas a proposito: los tres
 * conviven en la misma PC y Windows no admite dos servicios con el mismo
 * nombre. Si uno se cae, los otros siguen.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

if (process.platform !== 'win32') {
  console.error('Este instalador es solo para Windows.')
  console.error('En Mac/Linux:  node agente-pantallas.mjs  (o pm2 / launchd / systemd)')
  process.exit(1)
}

const aqui = dirname(fileURLToPath(import.meta.url))
const script = join(aqui, 'agente-pantallas.mjs')

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
  name: 'Shakeaholic Agente de Pantallas',
  description: 'Mantiene cada television mostrando lo que Admin le asigno, por DLNA.',
  script,
  workingDirectory: aqui,
  env: [{ name: 'NODE_ENV', value: 'production' }],
})

svc.on('install', () => { console.log('Servicio instalado. Arrancando...'); svc.start() })
svc.on('start', () => console.log('Servicio corriendo.'))
svc.on('alreadyinstalled', () => console.log('Ya estaba instalado.'))
svc.on('error', (e) => { console.error('Error:', e); process.exit(1) })
svc.install()
