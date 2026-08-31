import React from 'react'
import { mxn, repartirCobro } from '@shake/utils'
import type { MetodoPago } from '@shake/types'
import type { PartePago } from '@shake/supabase'

/**
 * "Me das $100 en efectivo y el resto con tarjeta."
 *
 * El cajero teclea UN número. El resto lo pone la pantalla: pedirle los dos
 * montos es pedirle que haga la resta con gente esperando, y esa resta mal
 * hecha no sale como un número feo — sale como un cobro que el servidor
 * rechaza con la fila detenida.
 *
 * Vive aparte porque hay dos puertas al mismo cobro (la venta de caja y el
 * pedido del kiosko que se paga en caja), y ya nos costó caro que dos
 * pantallas de la misma venta se fueran separando.
 */

/** Solo formas de pago que de verdad se combinan. Cortesía no se divide. */
export const METODOS_DIVISIBLES: { key: MetodoPago; label: string; icon: string; pideRef?: boolean }[] = [
  { key: 'efectivo', label: 'Efectivo', icon: '💵' },
  { key: 'tarjeta', label: 'Tarjeta', icon: '💳' },
  { key: 'clip', label: 'Clip', icon: '📟', pideRef: true },
  { key: 'otro', label: 'Otro', icon: '•', pideRef: true },
]

export interface Division {
  metodoA: MetodoPago
  montoA: string
  referenciaA: string
  metodoB: MetodoPago
  referenciaB: string
}

export const DIVISION_INICIAL: Division = {
  metodoA: 'efectivo',
  montoA: '',
  referenciaA: '',
  metodoB: 'tarjeta',
  referenciaB: '',
}

const pideRef = (m: MetodoPago) => METODOS_DIVISIBLES.find((x) => x.key === m)?.pideRef ?? false

/**
 * Las dos partes listas para mandar, o el motivo por el que todavía no.
 * Es lo que decide si el botón de cobrar se puede tocar.
 */
export function partesDeDivision(
  d: Division,
  total: number,
): { partes: PartePago[] | null; error: string | null } {
  const { primera, segunda, error } = repartirCobro(total, d.montoA)
  if (error) return { partes: null, error }
  if (d.metodoA === d.metodoB) {
    return { partes: null, error: 'Las dos partes son la misma forma de pago: eso es un cobro normal.' }
  }
  if (pideRef(d.metodoA) && !d.referenciaA.trim()) {
    return { partes: null, error: 'Falta la referencia de la primera parte.' }
  }
  if (pideRef(d.metodoB) && !d.referenciaB.trim()) {
    return { partes: null, error: 'Falta la referencia de la segunda parte.' }
  }
  return {
    partes: [
      { metodo: d.metodoA, monto: primera, referencia: d.referenciaA.trim() || null },
      { metodo: d.metodoB, monto: segunda, referencia: d.referenciaB.trim() || null },
    ],
    error: null,
  }
}

interface Props {
  total: number
  valor: Division
  onCambio: (d: Division) => void
}

function Chips({
  activo, onElegir, deshabilitado,
}: {
  activo: MetodoPago
  onElegir: (m: MetodoPago) => void
  deshabilitado?: MetodoPago
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {METODOS_DIVISIBLES.map((m) => (
        <button
          key={m.key}
          onClick={() => onElegir(m.key)}
          disabled={m.key === deshabilitado}
          className={`px-4 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide transition-all disabled:opacity-25 ${
            activo === m.key
              ? 'bg-sa-green text-sa-cream'
              : 'bg-white border border-sa-green-ink/15 text-sa-green-ink hover:border-sa-green/50'
          }`}
        >
          <span className="mr-1.5">{m.icon}</span>{m.label}
        </button>
      ))}
    </div>
  )
}

export function PagoDividido({ total, valor, onCambio }: Props) {
  const { primera, segunda, error } = repartirCobro(total, valor.montoA)
  const set = (cambio: Partial<Division>) => onCambio({ ...valor, ...cambio })

  return (
    <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4 space-y-5">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
          Primera forma · cuánto paga con ella
        </p>
        <Chips
          activo={valor.metodoA}
          deshabilitado={valor.metodoB}
          onElegir={(m) => set({ metodoA: m })}
        />
        <div className="relative mt-3">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
          <input
            type="number"
            inputMode="decimal"
            value={valor.montoA}
            onChange={(e) => set({ montoA: e.target.value })}
            placeholder="0.00"
            autoFocus
            className="w-full pl-10 pr-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
          />
        </div>
        {/* Mitad: el reparto que más se pide, sin teclear. */}
        <button
          onClick={() => set({ montoA: (Math.round(total * 50) / 100).toFixed(2) })}
          className="mt-2 px-4 py-2 bg-sa-cream-warm hover:bg-sa-banana rounded-full font-mono text-xs uppercase tracking-wide text-sa-green-ink transition-colors"
        >
          Mitad y mitad
        </button>
        {pideRef(valor.metodoA) && (
          <input
            type="text"
            value={valor.referenciaA}
            onChange={(e) => set({ referenciaA: e.target.value })}
            placeholder="Referencia del voucher"
            className="w-full mt-2 px-4 py-2.5 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
          />
        )}
      </div>

      <div className="border-t border-dashed border-sa-green-ink/15 pt-5">
        <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
          El resto va con
        </p>
        <Chips
          activo={valor.metodoB}
          deshabilitado={valor.metodoA}
          onElegir={(m) => set({ metodoB: m })}
        />
        {/* El resto NO se teclea: se calcula. Es la resta que el cajero no
            tiene por qué hacer con gente esperando. */}
        <div className="flex justify-between items-baseline mt-3 bg-sa-mint/20 rounded-sa px-4 py-3 border border-sa-mint/50">
          <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/70">
            Resto a cobrar
          </span>
          <span className="font-display text-3xl text-sa-green">
            {error ? '—' : mxn(segunda)}
          </span>
        </div>
        {pideRef(valor.metodoB) && (
          <input
            type="text"
            value={valor.referenciaB}
            onChange={(e) => set({ referenciaB: e.target.value })}
            placeholder="Referencia del voucher"
            className="w-full mt-2 px-4 py-2.5 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
          />
        )}
      </div>

      {!error && (
        <p className="font-mono text-xs text-sa-green-ink/55 text-center">
          {mxn(primera)} + {mxn(segunda)} = {mxn(total)}
        </p>
      )}
    </div>
  )
}
