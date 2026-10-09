// Copia el comprobante del corte a la Edge Function del correo.
//
// Deno (Supabase Edge Functions) no lee el monorepo, así que el correo
// lleva su propia copia de packages/utils/src/comprobanteCorte.ts. Este
// script la refresca y la prueba `comprobanteCorte.test.ts` revisa que las
// dos copias sean idénticas: si alguien toca una sola, la prueba truena.
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
copyFileSync(
  join(raiz, 'packages/utils/src/comprobanteCorte.ts'),
  join(raiz, 'supabase/functions/_shared/comprobanteCorte.ts'),
)
console.log('Copiado a supabase/functions/_shared/comprobanteCorte.ts')
