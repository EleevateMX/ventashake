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
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'apps/admin/public/descargas')

/**
 * Lo que se ofrece para descargar. El resto lo baja `instalar-todo.bat` solo.
 *
 * SOLO `.bat`, nunca un `.ps1`. Un `.ps1` bajado del navegador no se puede
 * abrir de doble clic: Windows lo marca como venido de internet y PowerShell
 * contesta "la ejecucion de scripts esta deshabilitada en este sistema", que
 * suena a PC rota cuando es la politica de siempre. La salida no es pedirle a
 * nadie que cambie esa politica -eso si seria bajarle la guardia al equipo-
 * sino repartir un `.bat` que corre el script con permiso solo para ESA
 * ejecucion.
 */
const ARCHIVOS = [
  'instalar-todo.bat',
  'abrir-shakeaholic.bat',
  'abrir-caja-y-admin.bat',
  'instalar-agente-impresion.bat',
  'escanear-equipo.bat',
]

// Se borra antes de copiar. Sin esto, un archivo que se retira de la lista
// se queda ahi para siempre y Admin lo sigue ofreciendo: paso al cambiar
// escanear-equipo.ps1 por su .bat -- el .ps1 viejo seguia servido, que era
// justo el que no se podia abrir.
rmSync(DESTINO, { recursive: true, force: true })
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
