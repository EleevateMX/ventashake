import { descubrir, describir, estado } from './dlna.js'

/**
 * Lista las teles de la red y que esta mostrando cada una.
 *
 *   npm run buscar
 *
 * Es lo primero que hay que correr al instalar: da las IP y los nombres
 * exactos que Admin necesita para asignarles contenido.
 */
const hallazgos = await descubrir()
if (hallazgos.size === 0) {
  console.log('No respondio ninguna tele. Revisa que esten encendidas y en la misma red.')
  process.exit(0)
}
console.log(`${hallazgos.size} dispositivo(s) con MediaRenderer:\n`)
for (const [ip, { loc }] of hallazgos) {
  const p = await describir(loc)
  if (!p) { console.log(`  ${ip}  (no se pudo leer su descripcion)`); continue }
  const e = await estado(p)
  console.log(`  ${p.ip.padEnd(15)} ${p.nombre}`)
  console.log(`  ${''.padEnd(15)} estado: ${e?.transporte ?? 'sin respuesta'}`)
  if (e?.uri) console.log(`  ${''.padEnd(15)} mostrando: ${e.uri}`)
  console.log()
}
