import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/sb'
import {
  listarImpresoras, calibrarImpresora, probarImpresora, diagnosticarImpresora,
  type ImpresoraAdmin,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'

/**
 * Calibrar la etiquetadora después de cambiar el rollo, desde la barra.
 *
 * Al poner un rollo nuevo la impresora no sabe dónde termina una etiqueta y
 * empieza la siguiente: mide la luz que pasa por el hueco entre ellas, y ese
 * umbral depende del papel que está cargado. Si nadie se lo vuelve a medir,
 * el texto sale corrido —media etiqueta arriba y media abajo— o escupe
 * etiquetas en blanco buscando un hueco que cree que no llega.
 *
 * Esta pantalla existe porque hasta hoy eso solo se arreglaba yendo a la PC
 * de la tienda. Quien cambia el rollo está en la barra, con las manos
 * ocupadas, y lo que tiene enfrente es el POS.
 */

const ESTILO_BOTON =
  'w-full font-display text-2xl px-6 py-5 rounded-sa-lg transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100'

type Estado = {
  id: string
  fase: 'enviando' | 'listo' | 'probando' | 'probada' | 'diagnosticando' | 'diagnosticada' | 'error'
  mensaje?: string
}

export function Impresoras() {
  const navigate = useNavigate()
  const [impresoras, setImpresoras] = useState<ImpresoraAdmin[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado | null>(null)

  async function cargar() {
    try {
      setImpresoras((await listarImpresoras(sb)).filter((i) => i.activa))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  /**
   * Una sola etiqueta, sin calibrar.
   *
   * Es lo que contesta "¿por qué se gastan tres?". Calibrar gasta dos o
   * tres a propósito; una impresora mal medida las escupe en CADA comanda.
   * Con este botón se distingue sin adivinar: si sale una sola, lo normal
   * está bien y las tres eran de la calibración.
   */
  async function probar(i: ImpresoraAdmin) {
    setEstado({ id: i.id, fase: 'probando' })
    try {
      await probarImpresora(sb, i.id)
      setEstado({ id: i.id, fase: 'probada' })
      void cargar()
    } catch (e) {
      setEstado({ id: i.id, fase: 'error', mensaje: mensajeDeError(e) })
    }
  }

  /**
   * La misma etiqueta con tres cabeceras distintas, rotuladas A, B y C.
   *
   * Para cuando se van blancas en CADA comanda. Quitar la cabecera a ciegas
   * con la tienda vendiendo sería apostar; esto deja que el papel conteste.
   */
  async function diagnosticar(i: ImpresoraAdmin) {
    setEstado({ id: i.id, fase: 'diagnosticando' })
    try {
      await diagnosticarImpresora(sb, i.id)
      setEstado({ id: i.id, fase: 'diagnosticada' })
      void cargar()
    } catch (e) {
      setEstado({ id: i.id, fase: 'error', mensaje: mensajeDeError(e) })
    }
  }

  async function calibrar(i: ImpresoraAdmin) {
    setEstado({ id: i.id, fase: 'enviando' })
    try {
      await calibrarImpresora(sb, i.id)
      setEstado({ id: i.id, fase: 'listo' })
      // Se refresca para que "en línea" refleje el latido más reciente: si
      // la impresora estaba caída, el mensaje de abajo cobra sentido.
      void cargar()
    } catch (e) {
      setEstado({ id: i.id, fase: 'error', mensaje: mensajeDeError(e) })
    }
  }

  return (
    <div className="min-h-screen bg-sa-cream-paper flex flex-col">
      <header className="flex items-center gap-4 px-6 py-4 bg-sa-green-deep text-sa-cream">
        <button
          onClick={() => navigate('/')}
          className="w-11 h-11 rounded-full bg-sa-green-ink hover:bg-sa-green flex items-center justify-center text-2xl"
          aria-label="Volver"
        >
          ←
        </button>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">#IMPRESORAS</p>
          <h1 className="font-display text-2xl mt-0.5">Cambié el rollo</h1>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-2xl w-full mx-auto space-y-6">
        <div className="bg-sa-cream-soft rounded-sa-lg p-6">
          <p className="font-display text-xl text-sa-green-ink leading-snug">
            Después de poner un rollo nuevo, calíbrala.
          </p>
          <p className="text-sm text-sa-green-ink/70 mt-2 leading-relaxed">
            La impresora necesita volver a medir dónde termina una etiqueta y
            empieza la siguiente. Si no lo hace, las comandas salen corridas o
            se van etiquetas en blanco.
          </p>
          <p className="text-sm text-sa-green-ink/70 mt-2 leading-relaxed">
            Va a avanzar dos o tres etiquetas y al final sacar una de prueba.
            <strong className="text-sa-green-ink"> Si esa prueba sale derecha,
            quedó.</strong> Si sale corrida, revisa que el rollo esté bien
            metido y centrado bajo el sensor, y vuelve a darle.
          </p>
        </div>

        {error && (
          <p className="font-mono text-sm text-sa-strawberry bg-sa-strawberry/10 rounded-sa px-4 py-3">
            {error}
          </p>
        )}

        {!impresoras && !error && (
          <p className="font-mono text-sm text-sa-green-ink/50 animate-pulse">Buscando impresoras…</p>
        )}

        {impresoras?.length === 0 && (
          <p className="font-mono text-sm text-sa-green-ink/60">
            No hay impresoras activas configuradas.
          </p>
        )}

        {impresoras?.map((i) => {
          const e = estado?.id === i.id ? estado : null
          return (
            <div key={i.id} className="bg-white rounded-sa-lg p-6 shadow-sa-sm">
              <div className="flex items-center justify-between gap-4 mb-4">
                <p className="font-display text-2xl text-sa-green-ink">{i.nombre}</p>
                <span
                  className={`font-mono text-[11px] uppercase tracking-wider px-3 py-1 rounded-full ${
                    i.conectada
                      ? 'bg-sa-mint/30 text-sa-green-ink'
                      : 'bg-sa-strawberry/15 text-sa-strawberry'
                  }`}
                >
                  {i.conectada ? 'En línea' : 'Sin señal'}
                </span>
              </div>

              {/* Sin agente no hay nadie que recoja el trabajo: se dice antes
                  de que le piquen, no después de que no pase nada. */}
              {!i.conectada && (
                <p className="text-sm text-sa-strawberry mb-4 leading-relaxed">
                  Esta impresora no está reportándose. Revisa que la ventana
                  negra del agente esté abierta en la PC de la tienda; si no,
                  la calibración se queda esperando en la cola.
                </p>
              )}

              {/* Probar va primero y en secundario: gasta UNA etiqueta, no
                  tres, y casi siempre es lo único que hacía falta. */}
              <button
                onClick={() => void probar(i)}
                disabled={e?.fase === 'probando' || e?.fase === 'enviando'}
                className={`${ESTILO_BOTON} bg-white border-2 border-sa-green text-sa-green-ink mb-3`}
              >
                {e?.fase === 'probando' ? 'Mandando…' : 'Sacar una de prueba'}
              </button>

              <button
                onClick={() => void calibrar(i)}
                disabled={e?.fase === 'enviando' || e?.fase === 'probando'}
                className={`${ESTILO_BOTON} bg-sa-strawberry text-white shadow-sa-sm`}
              >
                {e?.fase === 'enviando' ? 'Mandando…' : 'Calibrar · gasta 3'}
              </button>

              {/* Solo cuando el problema es en CADA comanda. Va al final y
                  discreto: gasta seis etiquetas y casi nadie lo necesita. */}
              <button
                onClick={() => void diagnosticar(i)}
                disabled={!!e && e.fase !== 'error'}
                className="w-full mt-3 font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/50 hover:text-sa-green-ink underline underline-offset-4 disabled:opacity-40"
              >
                {e?.fase === 'diagnosticando'
                  ? 'Mandando…'
                  : '¿Se van blancas en cada comanda? · Diagnóstico (gasta 6)'}
              </button>

              {e?.fase === 'diagnosticada' && (
                <p className="font-mono text-sm text-sa-green mt-4 leading-relaxed">
                  Mandado. Van a salir <strong>tres etiquetas rotuladas A, B y C</strong>,
                  con blancas entre ellas o no. <strong>Guarda la tira</strong> y dime
                  cuál de las tres salió sola y derecha: esa es la buena y la dejo fija.
                </p>
              )}
              {e?.fase === 'probada' && (
                <p className="font-mono text-sm text-sa-green mt-4 leading-relaxed">
                  Mandada. Debe salir <strong>UNA sola etiqueta</strong> que dice
                  “PRUEBA”. Si sale una y derecha, la impresión normal está bien
                  y no hace falta calibrar. Si antes escupe blancas, o sale
                  corrida, entonces sí: calibra.
                </p>
              )}
              {e?.fase === 'listo' && (
                <p className="font-mono text-sm text-sa-green mt-4 leading-relaxed">
                  Mandada. En unos segundos la impresora va a avanzar papel y
                  soltar una etiqueta de prueba.
                </p>
              )}
              {e?.fase === 'error' && (
                <p className="font-mono text-sm text-sa-strawberry mt-4">{e.mensaje}</p>
              )}
            </div>
          )
        })}

        <div className="bg-sa-cream-soft rounded-sa-lg p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50 mb-2">
            Si aun así imprime mal
          </p>
          <ul className="text-sm text-sa-green-ink/75 space-y-1.5 leading-relaxed list-disc pl-5">
            <li>El rollo tiene que ir <strong>centrado</strong> y con las guías
              pegadas al papel: si baila, el sensor no ve los huecos parejo.</li>
            <li>La tapa tiene que <strong>cerrar hasta oír el clic</strong>. Media
              tapa acepta datos y no imprime nada.</li>
            <li>Si el rollo nuevo es de <strong>otra medida</strong>, avísale a
              gerencia: las etiquetas están hechas para 80 × 25 mm.</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
