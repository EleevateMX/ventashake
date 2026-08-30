#!/usr/bin/env node
/**
 * Copia los instaladores de Windows a `apps/admin/public/descargas/`, para
 * que Admin los sirva desde su propio dominio.
 *
 * Se COPIAN en cada build en vez de tener una segunda copia versionada: dos
 * copias de un `.bat` en el repo se separan en cuanto alguien toca una, y
 * entonces Admin reparte un instalador viejo sin que nadie se entere. La
 * carpeta destino esta en .gitignore justo por eso.
 *
 * Servirlos desde admin.shakeaholic.mx y no mandar a la gente a GitHub tiene
 * dos razones: no hay que explicar como se baja un archivo crudo de GitHub,
 * y la tienda ya confia en ese dominio.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'apps/admin/public/descargas')

/** Lo que se ofrece para descargar. El resto lo baja `instalar-todo.bat` solo. */
const ARCHIVOS = [
  'instalar-todo.bat',
  'abrir-shakeaholic.bat',
  'abrir-caja-y-admin.bat',
  'instalar-agente-impresion.bat',
  'escanear-equipo.ps1',
]

mkdirSync(DESTINO, { recursive: true })
for (const nombre of ARCHIVOS) {
  copyFileSync(join(RAIZ, 'scripts', nombre), join(DESTINO, nombre))
}

// La version del agente, para que Admin pueda decir si la PC esta al dia.
const agente = JSON.parse(readFileSync(join(RAIZ, 'agente-impresion/package.json'), 'utf8'))
writeFileSync(
  join(DESTINO, 'version.json'),
  JSON.stringify({ agente: agente.version, generado: new Date().toISOString() }, null, 2) + '\n',
)

console.log(`Copiados ${ARCHIVOS.length} instaladores + version.json (agente ${agente.version})`)
