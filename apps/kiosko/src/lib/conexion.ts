import { create } from 'zustand'
import { urlBackend } from '@shake/supabase'

/**
 * ¿Hay internet? (08/10/26)
 *
 * `navigator.onLine` no sirve para esto: dice si la PC tiene red, y la noche
 * del 07/10 la PC tenía red —el módem estaba prendido, las etiquetadoras
 * contestaban— pero no había salida a internet. Así que se le PREGUNTA al
 * servidor: una consulta chiquita cada 15 s (cada 5 s mientras no hay).
 *
 * Dos fallos seguidos para declarar «sin internet» y uno bueno para
 * quitarlo: un parpadeo de un segundo no debe cambiarle la pantalla al
 * cajero a media venta, pero la vuelta sí se avisa en cuanto se nota.
 *
 * Lo que se mide es si se LLEGA al servidor, no si contesta bonito: un
 * servidor que responde con error ya no es «sin internet», y vender sin
 * registrar con internet sería peor.
 */

interface EstadoConexion {
  enLinea: boolean
  /** Desde cuándo no hay internet (ISO), para el aviso. */
  desde: string | null
}

export const useConexion = create<EstadoConexion>(() => ({ enLinea: true, desde: null }))

// El MISMO lugar al que van las ventas (el dominio propio, ver
// packages/supabase/src/client.ts).
const URL_SB = urlBackend()

let fallosSeguidos = 0
let timer: ReturnType<typeof setTimeout> | null = null
let revisando: Promise<boolean> | null = null
let arrancado = false

/**
 * `no-cors` y sin cabeceras, a propósito: solo se quiere saber si se LLEGA
 * al servidor. Con la llave en una cabecera el navegador tendría que pedir
 * permiso antes (CORS), y si ese permiso fallara por cualquier motivo el
 * kiosko creería que nunca hay internet — con internet. Así, la respuesta
 * llega opaca (no se puede leer) pero llega; sin internet, la promesa falla.
 */
async function sondear(): Promise<boolean> {
  if (!URL_SB) return true
  try {
    await fetch(`${URL_SB}/auth/v1/health`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch {
    return false
  }
}

function aplicar(ok: boolean) {
  const estado = useConexion.getState()
  if (ok) {
    fallosSeguidos = 0
    if (!estado.enLinea) useConexion.setState({ enLinea: true, desde: null })
    return
  }
  fallosSeguidos++
  if (estado.enLinea && fallosSeguidos >= 2) {
    useConexion.setState({ enLinea: false, desde: new Date().toISOString() })
  }
}

function programar() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void revisarAhora(), useConexion.getState().enLinea ? 15_000 : 5_000)
}

/**
 * Pregunta ya, sin esperar al siguiente turno. La llama quien vio fallar
 * algo por red (un cobro que no llegó), para que la pantalla se entere en
 * segundos y no a los 30.
 */
export function revisarAhora(): Promise<boolean> {
  if (revisando) return revisando
  revisando = (async () => {
    try {
      const ok = await sondear()
      aplicar(ok)
      return useConexion.getState().enLinea
    } finally {
      revisando = null
      programar()
    }
  })()
  return revisando
}

/** Se arranca una sola vez al abrir el kiosko. */
export function vigilarConexion(): void {
  if (arrancado) return
  arrancado = true
  window.addEventListener('online', () => void revisarAhora())
  window.addEventListener('offline', () => {
    // Aquí sí se le cree al navegador: si dice que ni red hay, no hay.
    fallosSeguidos = 2
    aplicar(false)
    programar()
  })
  void revisarAhora()
}

/**
 * ¿Este error es de red (no llegó al servidor) o del servidor (llegó y dijo
 * que no)? Solo los de red justifican pasar a vender sin internet: un
 * «el monto no coincide» no se arregla guardando la venta para después.
 */
export function esErrorDeRed(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  return (
    e instanceof TypeError ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed') ||
    m.includes('timeout') ||
    m.includes('aborted')
  )
}
