import { useMemo, useState } from 'react'
import { mxn } from '@shake/utils'

/**
 * El cambio, calculado.
 *
 * Antes se picaba "Efectivo" y la venta se cerraba de inmediato: la resta
 * la hacía el cajero de cabeza con gente esperando. Ahí es donde se dan
 * los cambios mal — y un cambio mal dado no aparece en ningún reporte,
 * porque el sistema cree que cobró bien.
 *
 * Los billetes sugeridos se calculan a partir del total: no tiene sentido
 * ofrecer "$200" cuando la cuenta es de $340. Se ofrece lo que de verdad
 * puede dar alguien, más el importe exacto.
 */

const BILLETES = [20, 50, 100, 200, 500, 1000]

export function CobroEfectivo({
  total, onCobrar, onCancelar, procesando,
}: {
  total: number
  onCobrar: () => void
  onCancelar: () => void
  procesando: boolean
}) {
  const [recibido, setRecibido] = useState('')

  const sugeridos = useMemo(() => {
    // Billetes con los que alguien podría pagar esto, más el exacto.
    const utiles = BILLETES.filter((b) => b >= total)
    // Y las combinaciones redondas más comunes: dos billetes iguales o el
    // siguiente múltiplo de 50, que es como paga la gente de verdad.
    const redondo = Math.ceil(total / 50) * 50
    const opciones = new Set<number>([total, ...utiles.slice(0, 3)])
    if (redondo > total) opciones.add(redondo)
    return [...opciones].sort((a, b) => a - b).slice(0, 5)
  }, [total])

  const nRecibido = Number(recibido) || 0
  const cambio = nRecibido - total
  const alcanza = nRecibido >= total

  function tecla(d: string) {
    if (d === '←') return setRecibido((v) => v.slice(0, -1))
    setRecibido((v) => (v + d).replace(/^0+(?=\d)/, '').slice(0, 6))
  }

  return (
    <div className="rounded-sa-lg bg-sa-cream-soft p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <p className="font-display text-2xl text-sa-green-ink leading-none">Cobro en efectivo</p>
        <p className="font-mono text-sm text-sa-green-ink/60">Total {mxn(total)}</p>
      </div>

      <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
        ¿Con cuánto paga?
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {sugeridos.map((m) => (
          <button
            key={m}
            onClick={() => setRecibido(String(m))}
            className={`rounded-sa px-4 py-3 font-display text-lg border-2 transition-colors ${
              nRecibido === m
                ? 'bg-sa-green text-sa-cream border-sa-green'
                : 'bg-white text-sa-green-ink border-sa-green-ink/15'
            }`}
          >
            {m === total ? 'Exacto' : mxn(m)}
          </button>
        ))}
      </div>

      <div className="bg-white border border-sa-green-ink/10 rounded-sa px-4 py-3 font-mono text-3xl text-sa-green-ink text-right">
        ${recibido === '' ? '0' : recibido}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '←'].map((d) => (
          <button
            key={d}
            onClick={() => tecla(d)}
            className="h-14 rounded-sa bg-white border border-sa-green-ink/10 font-display text-xl text-sa-green-ink active:scale-95 transition-transform"
          >
            {d}
          </button>
        ))}
      </div>

      {/* El cambio, en grande. Es el número que el cajero va a leer con la
          mano ya en el cajón. */}
      <div
        className={`rounded-sa-lg mt-4 px-5 py-4 text-center ${
          nRecibido === 0
            ? 'bg-white/60'
            : alcanza
              ? 'bg-sa-mint/30'
              : 'bg-sa-strawberry/15'
        }`}
      >
        {nRecibido === 0 ? (
          <p className="font-mono text-sm text-sa-green-ink/50">
            Escribe con cuánto paga y aquí sale el cambio
          </p>
        ) : alcanza ? (
          <>
            <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">Cambio</p>
            <p className="font-display text-5xl text-sa-green-ink leading-none mt-1">{mxn(cambio)}</p>
          </>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-wide text-sa-strawberry">Falta</p>
            <p className="font-display text-4xl text-sa-strawberry leading-none mt-1">
              {mxn(total - nRecibido)}
            </p>
          </>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={onCancelar}
          disabled={procesando}
          className="rounded-sa-lg border border-sa-green-ink/15 px-5 py-4 font-mono text-xs uppercase tracking-wide text-sa-green-ink/70 disabled:opacity-40"
        >
          Volver
        </button>
        <button
          onClick={onCobrar}
          disabled={procesando || !alcanza}
          className="flex-1 rounded-sa-lg bg-sa-green text-sa-cream py-4 font-display text-2xl disabled:opacity-40 active:scale-[0.99] transition-transform"
        >
          {procesando ? 'Cobrando…' : 'Cobrar y mandar comanda'}
        </button>
      </div>

      {!alcanza && nRecibido > 0 && (
        <p className="font-mono text-[11px] text-sa-green-ink/50 text-center mt-2">
          No alcanza para cobrar todavía.
        </p>
      )}
    </div>
  )
}
