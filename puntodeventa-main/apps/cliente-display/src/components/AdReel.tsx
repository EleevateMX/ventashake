import React, { useEffect, useState } from 'react'

type Panel = {
  key: string
  render: () => React.ReactNode
}

const PANELS: Panel[] = [
  {
    key: 'logo',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full w-full px-12 text-center">
        <img
          src="/logo.png"
          alt="Shake Aholic"
          className="w-[460px] max-w-[55vw] drop-shadow-[0_20px_40px_rgba(0,0,0,0.35)] mb-12"
        />
        <p className="font-display text-sa-cream text-[clamp(48px,6vw,96px)] leading-[0.95] max-w-[18ch]">
          Agitamos proteína, fruta y comida real.
        </p>
        <p className="font-mono text-sa-mint text-lg uppercase tracking-[0.3em] mt-10 opacity-80">
          #shakeaholic
        </p>
      </div>
    ),
  },
  {
    key: 'milo',
    render: () => (
      <div className="flex items-center justify-center h-full w-full px-16 gap-16">
        <img
          src="/milo-transparent.png"
          alt="Milo"
          className="w-[520px] max-w-[42vw] animate-[sway_3s_ease-in-out_infinite]"
        />
        <div className="flex flex-col">
          <p className="font-mono text-sa-mango text-base uppercase tracking-[0.3em] mb-6 opacity-90">
            Hola, soy Milo
          </p>
          <h1 className="font-display text-sa-cream text-[clamp(80px,10vw,160px)] leading-[0.9]">
            Sin polvo raro.
          </h1>
          <p className="font-display text-sa-banana text-[clamp(40px,5vw,80px)] leading-[0.95] mt-4">
            Sin pose fitness.
          </p>
        </div>
      </div>
    ),
  },
  {
    key: 'arrow',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full w-full text-center px-12">
        <p className="font-mono text-sa-mint text-base uppercase tracking-[0.3em] mb-8 opacity-80">
          ¿Listo para agitar?
        </p>
        <h2 className="font-display text-sa-cream text-[clamp(72px,9vw,140px)] leading-[0.95] max-w-[14ch]">
          Acércate a la caja para empezar
        </h2>
        <div className="mt-16 flex items-center gap-6">
          <span className="font-display text-sa-banana text-[120px] animate-[arrowSlide_1.4s_ease-in-out_infinite] inline-block">
            →
          </span>
        </div>
      </div>
    ),
  },
  {
    key: 'menu',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full w-full px-12 text-center">
        <p className="font-mono text-sa-banana text-base uppercase tracking-[0.3em] mb-6 opacity-90">
          Conocé el menú
        </p>
        <h2 className="font-display text-sa-cream text-[clamp(60px,7vw,120px)] leading-[0.95] max-w-[16ch]">
          Shakes, bowls, snacks, café
        </h2>
        <div className="mt-16 flex items-center gap-12 text-[110px]">
          <span className="bg-sa-strawberry/20 rounded-full p-8 border-4 border-sa-strawberry/40">🥤</span>
          <span className="bg-sa-banana/20 rounded-full p-8 border-4 border-sa-banana/40">🍌</span>
          <span className="bg-sa-mango/20 rounded-full p-8 border-4 border-sa-mango/40">☕</span>
        </div>
      </div>
    ),
  },
  {
    key: 'real',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full w-full px-12 text-center">
        <h2 className="font-display text-sa-banana text-[clamp(48px,6vw,96px)] leading-[0.95]">
          Comida real
        </h2>
        <h2 className="font-display text-sa-cream text-[clamp(80px,11vw,180px)] leading-[0.9] mt-2">
          para gente real.
        </h2>
        <p className="font-body text-sa-cream/80 text-2xl mt-10 max-w-[28ch] leading-snug">
          Recetas hechas en la barra, con ingredientes que reconocés.
        </p>
      </div>
    ),
  },
]

export function AdReel() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setVisible(false)
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % PANELS.length)
        setVisible(true)
      }, 700)
    }, 5000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="relative h-full w-full bg-sa-green-deep overflow-hidden">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-sa-green/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[560px] h-[560px] rounded-full bg-sa-strawberry/15 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/3 w-[320px] h-[320px] rounded-full bg-sa-mango/10 blur-3xl" />

      {/* Panel */}
      <div
        className={`relative h-full w-full transition-opacity duration-700 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {PANELS[index]?.render()}
      </div>

      {/* Progress dots */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3">
        {PANELS.map((p, i) => (
          <span
            key={p.key}
            className={`h-2 rounded-full transition-all duration-500 ${
              i === index ? 'w-10 bg-sa-cream' : 'w-2 bg-sa-cream/30'
            }`}
          />
        ))}
      </div>

      {/* Top mono brand strip */}
      <div className="absolute top-8 left-12 font-mono text-sa-cream/40 text-sm uppercase tracking-[0.4em]">
        Shake Aholic · Caja
      </div>

      <style>{`
        @keyframes sway {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-18px) rotate(2deg); }
        }
        @keyframes arrowSlide {
          0%, 100% { transform: translateX(0); opacity: 0.85; }
          50% { transform: translateX(28px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
