import React, { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { listarProductosParaVenta, type ProductoVenta } from '@shake/supabase'
import { mxn } from '@shake/utils'
import { sb } from './lib/sb'

/** A dónde manda el QR y el botón de lealtad. */
const URL_REWARDS =
  ((import.meta.env.VITE_URL_REWARDS as string | undefined) ?? 'https://rewards.shakeaholic.mx')
    // Si la variable en Cloudflare aún trae la URL vieja, se traduce sola.
    .replace('shake-cliente-pwa.pages.dev', 'rewards.shakeaholic.mx')

export default function App() {
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [qr, setQr] = useState('')

  useEffect(() => {
    // El menú se lee de la misma base que usa la caja: lo que el negocio
    // captura en costeo aparece aquí solo, sin publicar nada a mano. Si la
    // consulta falla, la página sigue viéndose — el menú es un plus, no el
    // motivo por el que alguien entra.
    listarProductosParaVenta(sb).then(setProductos).catch(() => setProductos([]))
    QRCode.toDataURL(URL_REWARDS, {
      width: 320, margin: 2, color: { dark: '#14241D', light: '#FFFFFF' },
    }).then(setQr).catch(() => setQr(''))
  }, [])

  const porCategoria = useMemo(() => {
    const m = new Map<string, ProductoVenta[]>()
    for (const p of productos) {
      const cat = p.categorias?.nombre
      if (!cat) continue
      if (!m.has(cat)) m.set(cat, [])
      m.get(cat)!.push(p)
    }
    return m
  }, [productos])

  const shakes = porCategoria.get('Shakes') ?? []
  const alimentos = porCategoria.get('Alimentos') ?? []

  return (
    <div className="min-h-screen bg-sa-cream-paper text-sa-green-ink font-body">
      {/* ---------------------------------------------------------------- */}
      <header className="relative bg-sa-green-deep text-sa-cream overflow-hidden">
        <img
          src="/milo-transparent.png"
          alt=""
          className="absolute -right-10 -bottom-16 h-72 md:h-96 w-auto opacity-90 pointer-events-none select-none"
        />
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-16 md:py-24">
          <img src="/logo.png" alt="Shakeaholic" className="h-20 md:h-24 w-auto drop-shadow-lg" />
          <h1 className="font-display text-5xl md:text-7xl leading-none mt-6">
            Shakeaholic
          </h1>
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-sa-banana mt-3">
            Protein Bar · Mérida
          </p>
          <p className="font-body text-lg md:text-xl mt-6 max-w-lg text-sa-cream/90">
            Shakes de proteína, comida real y snacks. Sin polvo raro, sin pose
            fitness — y con recompensas por cada visita.
          </p>
          <a
            href={URL_REWARDS}
            className="inline-flex items-center gap-3 mt-8 bg-sa-banana text-sa-coffee px-7 py-4 rounded-full font-display text-xl shadow-sa hover:scale-[1.02] transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Únete a Rewards
          </a>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      <section id="rewards" className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sa-green/70">
              Programa de lealtad
            </p>
            <h2 className="font-display text-4xl md:text-5xl leading-tight mt-2">
              Acumula mancuernas
            </h2>
            <p className="font-body text-lg text-sa-green-ink/70 mt-4">
              Escanea el código con la cámara de tu celular, entra con tu cuenta
              de Google y listo. Tu tarjeta vive en el navegador — no hay que
              instalar nada ni cargar un plástico más.
            </p>

            <div className="grid grid-cols-3 gap-3 mt-7">
              {[
                { dato: '$10', pie: '1 mancuerna' },
                { dato: '100', pie: 'Un cupón' },
                { dato: '1 año', pie: 'Vigencia' },
              ].map((b) => (
                <div key={b.pie} className="bg-white rounded-sa p-4 text-center shadow-sa-sm">
                  <p className="font-display text-2xl leading-none text-sa-green-ink">{b.dato}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/50 mt-1.5">
                    {b.pie}
                  </p>
                </div>
              ))}
            </div>

            <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/40 mt-5">
              ¿Sin celular a la mano? En caja te damos de alta con tu teléfono
            </p>
          </div>

          <div className="flex flex-col items-center">
            {qr && (
              <img
                src={qr}
                alt="Código QR para entrar a Shakeaholic Rewards"
                className="w-64 h-64 rounded-sa-lg bg-white p-4 shadow-sa"
              />
            )}
            <a
              href={URL_REWARDS}
              className="mt-4 font-mono text-xs uppercase tracking-wide text-sa-green underline underline-offset-4"
            >
              o entra desde aquí
            </a>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {shakes.length > 0 && (
        <section className="bg-sa-cream-soft">
          <div className="max-w-5xl mx-auto px-6 py-16 md:py-20">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-sa-green/70">Carta</p>
            <h2 className="font-display text-4xl md:text-5xl leading-tight mt-2 mb-8">
              Protein shakes
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {shakes.map((p) => (
                <article key={p.id} className="bg-white rounded-sa-lg overflow-hidden shadow-sa-sm">
                  <div className="h-44 bg-white flex items-center justify-center">
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.nombre} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <img src="/milo-transparent.png" alt="" className="h-28 opacity-70" />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-lg leading-tight">{p.nombre}</h3>
                    {p.descripcion && (
                      <p className="font-body text-xs text-sa-green-ink/55 mt-1.5 leading-snug">
                        {p.descripcion}
                      </p>
                    )}
                    <p className="font-mono text-base text-sa-green mt-3">{mxn(p.precio)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {alimentos.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 py-16 md:py-20">
          <h2 className="font-display text-4xl md:text-5xl leading-tight mb-8">Comida real</h2>
          <div className="divide-y divide-sa-green-ink/10">
            {alimentos.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-6 py-4">
                <div>
                  <h3 className="font-display text-xl leading-tight">{p.nombre}</h3>
                  {p.descripcion && (
                    <p className="font-body text-sm text-sa-green-ink/55 mt-1">{p.descripcion}</p>
                  )}
                </div>
                <p className="font-mono text-lg text-sa-green flex-shrink-0">{mxn(p.precio)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      <footer className="bg-sa-green-deep text-sa-cream">
        <div className="max-w-5xl mx-auto px-6 py-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <img src="/logo.png" alt="Shakeaholic" className="h-12 w-auto" />
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-sa-cream/50 mt-3">
              Protein Bar · Mérida, Yucatán
            </p>
          </div>
          <a
            href={URL_REWARDS}
            className="font-display text-xl text-sa-banana hover:underline underline-offset-4"
          >
            Únete a Rewards →
          </a>
        </div>
      </footer>
    </div>
  )
}
