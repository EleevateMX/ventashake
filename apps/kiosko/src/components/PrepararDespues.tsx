import { useState } from 'react'
import { horaDeEntrega } from '@shake/utils'

/**
 * «Preparar después»: el cliente paga ahora y pasa más tarde.
 *
 * Nace **apagado** y es opcional. Si nadie lo toca, el pedido funciona
 * exactamente como siempre — esa es la condición para poder desplegarlo
 * con la tienda abierta: el día del cambio no se mueve ni una venta.
 *
 * Y es **independiente de «para llevar»** a propósito. Son dos preguntas
 * distintas: una dice *cuándo* se prepara y la otra *en qué* se entrega.
 * Un pedido puede ser para comer aquí a las 8:30, y mezclarlas haría que
 * barra empaque lo que no va empacado.
 *
 * Los atajos son minutos desde *ahora*, no horas fijas: el cliente dice
 * «regreso en veinte», no «a las ocho cuarenta y tres». La hora exacta
 * está para cuando sí la dice.
 */

const ATAJOS = [10, 20, 30, 60] as const

/** "20:30" (hora de Mérida) → ISO, para el día correcto. */
function isoDesdeHoraLocal(hhmm: string): string | null {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  // Se arma sobre la hora de Mérida de AHORA y no sobre la del navegador:
  // la PC de la tienda está en Mérida, pero gerencia puede abrir esto
  // desde otro lado y un pedido programado a la hora equivocada es peor
  // que no programarlo.
  const ahora = new Date()
  const enMerida = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Merida' }))
  const desfase = ahora.getTime() - enMerida.getTime()
  enMerida.setHours(h, m, 0, 0)
  let t = enMerida.getTime() + desfase
  // Si la hora ya pasó hoy, es de mañana: a las 11 de la noche, «a las 8»
  // quiere decir mañana a las 8, no hace quince horas.
  if (t < ahora.getTime() - 60000) t += 24 * 3600 * 1000
  return new Date(t).toISOString()
}

export function PrepararDespues({
  valor,
  onCambio,
}: {
  valor: string | null
  onCambio: (iso: string | null) => void
}) {
  const [verHora, setVerHora] = useState(false)
  const [hhmm, setHhmm] = useState('')

  function enMinutos(min: number) {
    onCambio(new Date(Date.now() + min * 60000).toISOString())
    setVerHora(false)
  }

  return (
    <div className="w-full max-w-md">
      <label className="font-mono text-xs uppercase tracking-[0.25em] text-sa-green/70 block mb-2">
        ¿Cuándo se prepara?
      </label>

      {!valor ? (
        <button
          type="button"
          onClick={() => setVerHora(true)}
          className={`w-full px-4 py-4 rounded-sa-lg border-2 transition-all active:scale-95 ${
            verHora
              ? 'border-sa-blueberry bg-white text-sa-green-ink'
              : 'border-sa-green-ink/15 bg-white text-sa-green-ink hover:border-sa-blueberry/60'
          }`}
        >
          <span className="font-display text-xl leading-tight">🕒 Preparar después</span>
          <span className="block font-mono text-[11px] text-sa-green-ink/50 mt-0.5 normal-case">
            Si no lo tocas, se prepara ahora — como siempre
          </span>
        </button>
      ) : (
        <div className="px-4 py-4 rounded-sa-lg border-2 border-sa-blueberry bg-sa-blueberry/10 flex items-center justify-between gap-3">
          <span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-sa-blueberry block">
              Lo recoge a las
            </span>
            <span className="font-display text-3xl text-sa-green-ink leading-none">
              {horaDeEntrega(valor)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => { onCambio(null); setVerHora(false); setHhmm('') }}
            className="font-mono text-xs uppercase tracking-wide text-sa-strawberry underline flex-shrink-0"
          >
            Quitar
          </button>
        </div>
      )}

      {verHora && !valor && (
        <div className="mt-3 p-4 rounded-sa-lg bg-white border border-sa-green-ink/10">
          <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mb-3">
            ¿A qué hora lo recoge?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ATAJOS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => enMinutos(min)}
                className="px-4 py-3 rounded-sa border-2 border-sa-green-ink/10 bg-white text-sa-green-ink hover:border-sa-blueberry/60 active:scale-95"
              >
                <span className="font-display text-lg leading-tight block">
                  {min === 60 ? 'En 1 hora' : `En ${min} min`}
                </span>
                <span className="font-mono text-[11px] text-sa-green-ink/45">
                  {horaDeEntrega(new Date(Date.now() + min * 60000).toISOString())}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-3 items-center">
            <input
              type="time"
              value={hhmm}
              onChange={(e) => setHhmm(e.target.value)}
              className="flex-1 px-4 py-3 rounded-sa border-2 border-sa-green-ink/10 font-mono text-lg"
            />
            <button
              type="button"
              disabled={!hhmm}
              onClick={() => {
                const iso = isoDesdeHoraLocal(hhmm)
                if (iso) { onCambio(iso); setVerHora(false) }
              }}
              className="px-5 py-3 rounded-sa bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40"
            >
              Usar
            </button>
          </div>
          <button
            type="button"
            onClick={() => setVerHora(false)}
            className="w-full mt-3 py-2 font-mono text-xs uppercase tracking-wide text-sa-green-ink/45"
          >
            Mejor prepararlo ahora
          </button>
        </div>
      )}
    </div>
  )
}
