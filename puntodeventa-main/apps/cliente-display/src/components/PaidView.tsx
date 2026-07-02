import React, { useEffect, useState } from 'react'

interface Props {
  folio: string
}

export function PaidView({ folio }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 60)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div
      className={`h-full w-full bg-sa-green-deep flex flex-col items-center justify-center text-center px-12 relative overflow-hidden transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-sa-mint/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[600px] h-[600px] rounded-full bg-sa-banana/15 blur-3xl" />

      <img
        src="/milo-transparent.png"
        alt="Milo"
        className="w-[320px] max-w-[35vw] drop-shadow-[0_24px_48px_rgba(0,0,0,0.4)] animate-[miloPop_0.6s_cubic-bezier(0.34,1.56,0.64,1)_both]"
      />

      <h1 className="font-display text-sa-cream text-[clamp(80px,10vw,160px)] leading-[0.9] mt-8 animate-[fadeUp_0.5s_0.15s_ease-out_both]">
        ¡Gracias,<br />campeón!
      </h1>

      <p className="font-body text-sa-cream/80 text-2xl mt-8 max-w-[28ch] leading-relaxed animate-[fadeUp_0.5s_0.25s_ease-out_both]">
        Tu orden está en camino. Prepárate para agitar.
      </p>

      {folio && (
        <div className="mt-10 inline-flex items-center gap-4 bg-sa-cream/10 border border-sa-cream/20 rounded-sa px-8 py-4 animate-[fadeUp_0.5s_0.35s_ease-out_both]">
          <span className="font-mono text-sm uppercase tracking-[0.3em] text-sa-cream/60">
            Folio
          </span>
          <span className="font-mono text-3xl text-sa-banana font-medium tracking-widest">
            {folio}
          </span>
        </div>
      )}

      <p className="font-mono text-sa-mint/60 text-sm uppercase tracking-[0.3em] mt-16 animate-[fadeUp_0.5s_0.45s_ease-out_both]">
        #shakeaholic
      </p>

      <style>{`
        @keyframes miloPop {
          0% { transform: scale(0.7) rotate(-8deg); opacity: 0; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes fadeUp {
          0% { transform: translateY(24px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
