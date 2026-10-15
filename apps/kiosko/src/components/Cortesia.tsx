import { useState } from 'react'
import { mensajeDeError, mxn } from '@shake/utils'
import { TecladoBusqueda } from '@/components/TecladoBusqueda'

/**
 * Cortesía (15/10/26, pedido de Perla).
 *
 * La cuenta completa sale en $0, autorizada con el PIN de quien gerencia
 * anotó (hoy Perla y Adrián). **La pantalla no decide nada**: manda el PIN
 * y el motivo, y `fn_cortesia_crear` revisa que ese PIN pueda dar
 * cortesías, crea la orden con los precios de siempre y la cobra como
 * cortesía. Por eso sale la comanda y baja el inventario igual que una
 * venta, y queda quién la autorizó y por qué.
 *
 * Mismo molde que «Es para personal»: botón de media fila y la ventana
 * ENCIMA de la pantalla, para que no brinque el cobro de siempre.
 */

const MOTIVOS = [
  'Cliente frecuente',
  'Se rehízo / error de barra',
  'Degustación',
  'Colaboración',
  'Personal',
]

export function Cortesia({
  valor,
  onDar,
}: {
  /** Lo que vale la cuenta a precio de lista, para que se vea qué se regala. */
  valor: number
  /** Crea la cortesía en el servidor; si truena, el error se enseña aquí. */
  onDar: (pin: string, motivo: string) => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [otro, setOtro] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const listo = motivo.trim().length >= 3 && pin.length >= 4
  /** Un motivo escrito a mano: «Otro…» se queda marcado y se enseña el texto. */
  const motivoPropio = motivo.trim() !== '' && !MOTIVOS.includes(motivo)

  function cerrar() {
    setAbierto(false); setMotivo(''); setOtro(false); setPin(''); setError(null)
  }

  async function dar() {
    if (!listo || enviando) return
    setEnviando(true); setError(null)
    try {
      await onDar(pin, motivo.trim())
      cerrar()
    } catch (e) {
      setError(mensajeDeError(e))
      setPin('')
    } finally {
      setEnviando(false)
    }
  }

  function tecla(d: string) {
    setPin((p) => (p + d).slice(0, 8)); setError(null)
  }

  return (
    <div className="flex-1 min-w-[45%]">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full px-3 py-2.5 rounded-sa border border-sa-green-ink/15 bg-white text-sa-green-ink hover:border-sa-banana active:scale-95 transition-all text-left"
      >
        <span className="font-body text-sm leading-tight">🎁 Cortesía</span>
      </button>
      {abierto && (
        <div
          data-no-recargar
          className="fixed inset-0 z-50 bg-sa-green-deep/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !enviando) cerrar() }}
        >
          <div className="w-full max-w-md p-5 rounded-sa-lg bg-sa-cream-paper shadow-2xl max-h-[95vh] overflow-y-auto">
            <p className="font-display text-2xl text-sa-green-ink text-center">Cortesía</p>
            <p className="font-mono text-[11px] text-sa-green-ink/60 text-center mt-1">
              Sale en $0 · se regalan {mxn(valor)} · baja inventario
            </p>

            {error && (
              <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-3 py-2 mt-3">
                <p className="text-sm text-sa-strawberry leading-snug">{error}</p>
              </div>
            )}

            <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mt-4 mb-1.5">¿Por qué?</p>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMotivo(m); setOtro(false); setError(null) }}
                  className={`px-3 py-2 rounded-full text-sm transition-colors ${
                    !otro && motivo === m
                      ? 'bg-sa-green text-sa-cream'
                      : 'border border-sa-green-ink/15 text-sa-green-ink/80'
                  }`}
                >
                  {m}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setOtro(true); if (!motivoPropio) setMotivo(''); setError(null) }}
                className={`px-3 py-2 rounded-full text-sm ${
                  otro || motivoPropio ? 'bg-sa-green text-sa-cream' : 'border border-sa-green-ink/15 text-sa-green-ink/80'
                }`}
              >
                {motivoPropio && !otro ? `Otro: ${motivo.trim()}` : 'Otro…'}
              </button>
            </div>
            {otro && (
              <>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  inputMode="none"
                  placeholder="Escribe el motivo"
                  className="w-full mt-2 px-3 py-2.5 border border-sa-green-ink/15 rounded-sa text-base bg-white"
                />
                <TecladoBusqueda valor={motivo} onCambio={setMotivo} onListo={() => setOtro(motivo.trim().length < 3)} maxLargo={60} />
              </>
            )}

            {!otro && (
              <>
                <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mt-4 mb-1.5">
                  PIN de quien autoriza
                </p>
                <input
                  value={pin}
                  readOnly
                  type="password"
                  placeholder="••••"
                  className="w-full px-4 py-2.5 rounded-sa border-2 border-sa-green-ink/10 bg-white font-mono text-2xl text-center tracking-widest"
                />
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => tecla(d)}
                      disabled={enviando}
                      className="h-14 rounded-sa bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setPin((p) => p.slice(0, -1)); setError(null) }}
                    disabled={enviando || pin.length === 0}
                    className="h-14 rounded-sa border border-sa-green-ink/20 text-sa-green-ink font-mono text-xs uppercase tracking-wide disabled:opacity-40"
                  >
                    ⌫ Borrar
                  </button>
                  <button
                    type="button"
                    onClick={() => tecla('0')}
                    disabled={enviando}
                    className="h-14 rounded-sa bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => void dar()}
                    disabled={enviando || !listo}
                    className="h-14 rounded-sa bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40"
                  >
                    {enviando ? 'Dando…' : 'Dar'}
                  </button>
                </div>
                {motivo.trim().length < 3 && (
                  <p className="font-mono text-[10px] text-sa-green-ink/50 text-center mt-2">Elige el motivo primero</p>
                )}
              </>
            )}

            <button
              type="button"
              onClick={cerrar}
              disabled={enviando}
              className="w-full mt-3 py-2 font-mono text-xs uppercase tracking-wide text-sa-green-ink/60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
