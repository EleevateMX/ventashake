import { useState } from 'react'
import { mxn } from '@shake/utils'

/**
 * "Me das $100 con tarjeta y el resto en efectivo."
 *
 * Se teclea UN número —lo que va con tarjeta— y el efectivo se calcula.
 * Pedirle los dos al cajero es pedirle que haga la resta con gente
 * esperando, y esa resta mal hecha no sale como un número feo: sale como
 * un cobro que el servidor rechaza con la fila detenida.
 *
 * El orden en que se cobra NO es el que se ve aquí: primero va la
 * terminal. Si el efectivo se cobrara antes y la tarjeta fallara, quedaría
 * dinero en el cajón y una venta a medias. Así, hasta que la terminal no
 * autoriza no hay nada comprometido y cancelar es gratis.
 */
export function CobroMixto({
  total, onCobrar, onCancelar, procesando,
}: {
  total: number
  onCobrar: (montoTarjeta: number) => void
  onCancelar: () => void
  procesando: boolean
}) {
  const [enTarjeta, setEnTarjeta] = useState('')

  const nTarjeta = Math.round((Number(enTarjeta) || 0) * 100) / 100
  const enEfectivo = Math.round((total - nTarjeta) * 100) / 100
  const listo = nTarjeta >= 0.01 && enEfectivo >= 0.01

  // Repartos que la gente pide de verdad: la mitad, y los billetes
  // redondos que caben en la cuenta.
  const sugeridos = [...new Set(
    [Math.round(total * 50) / 100, 100, 200, 500].filter((v) => v >= 1 && v < total),
  )].sort((a, b) => a - b).slice(0, 4)

  return (
    <div className="bg-sa-cream-soft rounded-sa-lg p-6 space-y-5">
      <div>
        <p className="font-display text-2xl text-sa-green-ink leading-tight">
          ¿Cuánto va con tarjeta?
        </p>
        <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 mt-1">
          El resto se cobra en efectivo
        </p>
      </div>

      <div className="relative">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-mono text-3xl text-sa-green-ink/35">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={enTarjeta}
          onChange={(e) => setEnTarjeta(e.target.value)}
          placeholder="0.00"
          autoFocus
          className="w-full pl-12 pr-5 py-5 bg-white border-2 border-sa-green-ink/10 rounded-sa font-mono text-4xl text-sa-green-ink focus:outline-none focus:border-sa-green"
        />
      </div>

      {sugeridos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sugeridos.map((v) => (
            <button
              key={v}
              onClick={() => setEnTarjeta(v.toFixed(2))}
              className="px-5 py-3 bg-sa-cream-warm hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
            >
              {mxn(v)}
            </button>
          ))}
        </div>
      )}

      {/* El efectivo NO se teclea: se calcula. */}
      <div className="bg-white rounded-sa px-5 py-4 border border-sa-green-ink/10 space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">
            Con tarjeta, en la terminal
          </span>
          <span className="font-display text-2xl text-sa-green-ink">
            {listo ? mxn(nTarjeta) : '—'}
          </span>
        </div>
        <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-sa-green-ink/15">
          <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">
            En efectivo, al cajón
          </span>
          <span className="font-display text-3xl text-sa-green">
            {listo ? mxn(enEfectivo) : '—'}
          </span>
        </div>
      </div>

      {!listo && enTarjeta !== '' && (
        <p className="font-mono text-xs text-sa-coffee bg-sa-banana/25 rounded-sa px-4 py-3 leading-relaxed">
          {nTarjeta >= total
            ? `Eso ya cubre los ${mxn(total)}: cóbralo todo con Clip en vez de dividirlo.`
            : 'Escribe cuánto va con tarjeta.'}
        </p>
      )}

      <p className="font-mono text-[11px] text-sa-green-ink/55 leading-relaxed">
        Primero se cobra la tarjeta en la terminal. Hasta que no pase,
        <strong className="text-sa-green-ink"> no se ha cobrado nada</strong>:
        si algo sale mal, cancelas y no queda rastro.
      </p>

      <div className="flex gap-3">
        <button
          onClick={onCancelar}
          disabled={procesando}
          className="px-6 py-4 rounded-sa font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 border border-sa-green-ink/15 bg-white disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          onClick={() => onCobrar(nTarjeta)}
          disabled={!listo || procesando}
          className="flex-1 bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-xl disabled:opacity-40 hover:bg-sa-green-deep transition-colors"
        >
          {procesando ? 'Mandando…' : `Cobrar ${listo ? mxn(nTarjeta) : ''} en la terminal`}
        </button>
      </div>
    </div>
  )
}
