import React from 'react'
import type { DisplayItem } from '../sync'

interface Props {
  items: DisplayItem[]
  total: number
  highlightId: string | null
}

export function OrderingView({ items, total, highlightId }: Props) {
  const totalItems = items.reduce((sum, i) => sum + i.cantidad, 0)

  return (
    <div className="h-full w-full flex flex-col bg-sa-cream-paper">
      {/* Header band */}
      <header className="bg-sa-green-deep text-sa-cream flex-shrink-0 px-14 py-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <p className="font-display text-[clamp(48px,5vw,84px)] leading-none text-sa-cream">
            Tu orden
          </p>
          {totalItems > 0 && (
            <span className="font-mono text-2xl bg-sa-strawberry text-sa-cream px-6 py-2 rounded-full">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Shake Aholic" className="h-16 w-auto opacity-95" />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-14 py-10 bg-sa-cream-paper">
          <div className="space-y-4 max-w-5xl mx-auto">
            {items.map((item) => {
              const isHi = item.id === highlightId
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-6 rounded-sa-lg px-8 py-6 transition-all duration-500 ${
                    isHi
                      ? 'bg-sa-banana shadow-sa scale-[1.02]'
                      : 'bg-sa-cream-soft shadow-sa-sm'
                  }`}
                >
                  <div className="font-mono text-3xl w-20 text-sa-green-ink/70 flex-shrink-0">
                    ×{item.cantidad}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body font-semibold text-3xl text-sa-green-ink truncate">
                      {item.nombre}
                    </p>
                    <p className="font-mono text-lg text-sa-green-ink/50 mt-1">
                      ${item.precio.toFixed(2)} c/u
                    </p>
                  </div>
                  <div className="font-mono text-4xl text-sa-strawberry font-medium flex-shrink-0">
                    ${(item.precio * item.cantidad).toFixed(2)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right side total */}
        <aside className="w-[420px] bg-sa-green text-sa-cream flex-shrink-0 flex flex-col justify-between p-12 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-20 w-80 h-80 rounded-full bg-sa-green-deep/40 blur-2xl" />

          <div className="relative">
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-sa-cream/60">
              Total a pagar
            </p>
            <p className="font-display text-[clamp(80px,8vw,140px)] leading-none mt-4 text-sa-cream">
              ${total.toFixed(2)}
            </p>
            <p className="font-mono text-base text-sa-cream/60 mt-4">
              MXN · IVA incluido
            </p>
          </div>

          <div className="relative">
            <img
              src="/milo-transparent.png"
              alt="Milo"
              className="w-44 mx-auto opacity-95 animate-[bounce_2s_ease-in-out_infinite]"
            />
            <p className="text-center font-display text-2xl text-sa-cream mt-3">
              ¡Vamos por tu shake!
            </p>
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-14px) rotate(3deg); }
        }
      `}</style>
    </div>
  )
}
