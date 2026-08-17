import milo from '@shake/brand/milo.png'
import { useEffect, useState } from 'react'
import { sb } from './lib/sb'
import {
  iniciarSesionGoogle,
  sesionActual,
  usuarioActual,
  cerrarSesion,
  onCambioSesion,
  vincularClienteAuth,
  misFavoritos,
  miHistorial,
} from '@shake/supabase'
import type { ClienteConLealtad, FavoritoCliente, CompraHistorial } from '@shake/supabase'
import QR from './QR'
import { IconMancuerna, IconRegalo, IconPastel, IconRecibo, IconEstrella } from './Iconos'

// Traduce errores técnicos a un mensaje amable en español.
// Mientras el cliente termina de habilitar Google en Supabase Auth, el
// proveedor responde "provider is not enabled"; no queremos asustar al usuario.
function mensajeAmable(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)).toLowerCase()
  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider')) {
    return 'Rewards estará disponible en un momentito. Estamos afinando el acceso — vuelve a intentar muy pronto.'
  }
  if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('network')) {
    return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
  }
  return 'Algo salió mal. Inténtalo de nuevo en un momento.'
}

/** "Hoy", "Ayer" o la fecha corta, como se dice en la barra. */
function fechaHumana(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  const hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === hoy.toDateString()) return `Hoy · ${hora}`
  if (d.toDateString() === ayer.toDateString()) return `Ayer · ${hora}`
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [logueado, setLogueado] = useState(false)
  const [cliente, setCliente] = useState<ClienteConLealtad | null>(null)
  const [favoritos, setFavoritos] = useState<FavoritoCliente[]>([])
  const [historial, setHistorial] = useState<CompraHistorial[]>([])
  const [error, setError] = useState<string | null>(null)

  async function sincronizar() {
    try {
      const sesion = await sesionActual(sb)
      if (!sesion) {
        setLogueado(false)
        setCliente(null)
        return
      }
      setLogueado(true)
      const user = await usuarioActual(sb)
      if (!user) return
      const nombre =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email ||
        'Cliente'
      // El id y el correo los toma el servidor de la sesión, no de aquí.
      const cli = await vincularClienteAuth(sb, { nombre })
      setCliente(cli)
      setError(null)
      // El expediente llega aparte y sin bloquear la tarjeta: si fallara,
      // las secciones simplemente muestran su estado vacío.
      void misFavoritos(sb).then(setFavoritos).catch(() => {})
      void miHistorial(sb).then(setHistorial).catch(() => {})
    } catch (e) {
      setError(mensajeAmable(e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void sincronizar()
    const off = onCambioSesion(sb, () => void sincronizar())
    return off
  }, [])

  async function entrar() {
    try {
      await iniciarSesionGoogle(sb, window.location.origin)
    } catch (e) {
      setError(mensajeAmable(e))
    }
  }

  if (cargando)
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-5 bg-sa-green-deep font-body text-sa-cream/70">
        <img src={milo} alt="" className="w-24 h-auto animate-pulse" />
        <p>Cargando…</p>
      </div>
    )

  if (!logueado) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-5 bg-sa-green-deep font-body">
        <div className="text-center max-w-[340px] w-full">
          <img src={milo} alt="Milo, la mascota de Shakeaholic" className="w-[132px] h-auto mx-auto" />
          <h1 className="font-display text-3xl text-sa-cream mt-3 mb-2 leading-tight">
            Shakeaholic Rewards
          </h1>
          <p className="text-sa-mint">
            Acumula <b className="font-semibold">mancuernas</b> con cada compra y gana shakes gratis.
          </p>
          {error && (
            <div className="mt-4 rounded-sa border border-sa-mint/40 bg-sa-mint/10 text-sa-cream font-body text-sm px-4 py-3 leading-snug">
              {error}
            </div>
          )}
          <button
            className="mt-4 mb-2 w-full rounded-sa-lg bg-sa-cream text-sa-green-ink font-display text-xl py-4 hover:bg-sa-cream-soft transition-colors"
            onClick={() => void entrar()}
          >
            Continuar con Google
          </button>
          <p className="text-sa-cream/50 text-sm">Regístrate en segundos. 1 mancuerna por cada $10.</p>
        </div>
      </div>
    )
  }

  const restantes = cliente ? Math.max(0, 100 - (cliente.mancuernas % 100 || 0)) : 100

  return (
    <div className="min-h-[100dvh] max-w-[460px] mx-auto px-4 py-4 bg-sa-green-deep font-body">
      <header className="flex justify-between items-center mb-3">
        <span className="flex items-center gap-2 font-display text-sa-cream text-xl">
          <img src={milo} alt="" className="w-8 h-auto" />
          Rewards
        </span>
        <button
          className="font-body text-sm font-semibold text-sa-mint hover:text-sa-cream transition-colors"
          onClick={() => void cerrarSesion(sb)}
        >
          Salir
        </button>
      </header>

      {error && (
        <div className="mb-3 rounded-sa border border-sa-strawberry/60 bg-sa-strawberry/15 text-sa-strawberry font-mono text-sm px-4 py-3">
          {error}
        </div>
      )}

      {cliente && (
        <>
          {/* ── La tarjeta: saldo y camino al próximo cupón ── */}
          <section className="relative overflow-hidden rounded-sa-lg p-5 mb-3.5 text-sa-cream shadow-sa bg-gradient-to-br from-sa-green to-sa-green-deep">
            <img
              src={milo}
              alt=""
              className="absolute -right-3 -bottom-4 w-24 h-auto opacity-25 rotate-6 pointer-events-none"
            />
            <div className="text-sm opacity-90">Hola, {cliente.nombre.split(' ')[0]}</div>
            <div className="flex items-center gap-3 mt-1.5">
              <IconMancuerna className="w-12 h-12 text-sa-banana shrink-0" />
              <span className="font-display text-6xl leading-none text-sa-banana">{cliente.mancuernas}</span>
            </div>
            <div className="uppercase tracking-widest text-xs opacity-85 mt-1">mancuernas</div>
            <div className="bg-sa-cream/25 rounded-full h-2 my-3 overflow-hidden">
              <div className="bg-sa-mint h-full" style={{ width: `${cliente.mancuernas % 100}%` }} />
            </div>
            <div className="text-sa-cream/85 text-sm">
              {restantes} para tu próximo cupón
            </div>
          </section>

          {/* ── Su código: lo que muestra en caja ── */}
          <section className="rounded-sa-lg p-5 mb-3.5 bg-sa-cream-paper text-sa-green-ink shadow-sa">
            <h2 className="font-display text-lg text-sa-green mb-1.5">Tu código</h2>
            <p className="text-sa-green-ink/60 text-sm">Muéstralo en caja o en el kiosko para identificarte.</p>
            <div className="flex justify-center py-2.5">
              {cliente.codigo ? <QR value={cliente.codigo} /> : <span className="text-sa-green-ink/50 text-sm">—</span>}
            </div>
            <div className="text-center font-mono font-medium tracking-widest text-sa-green">{cliente.codigo}</div>
          </section>

          {/* ── Cupones ── */}
          <section className="rounded-sa-lg p-5 mb-3.5 bg-sa-cream-paper text-sa-green-ink shadow-sa">
            <h2 className="font-display text-lg text-sa-green mb-1.5">Cupones activos ({cliente.cupones.length})</h2>
            {cliente.cupones.length === 0 && (
              <p className="text-sa-green-ink/60 text-sm">
                Aún no tienes cupones. Junta {restantes} mancuernas más y el siguiente shake corre por nuestra cuenta.
              </p>
            )}
            {cliente.cupones.map((c) => (
              <div
                key={c.id}
                className="flex justify-between items-center gap-2.5 py-2.5 border-t border-sa-green-ink/10 first-of-type:border-t-0"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-9 h-9 shrink-0 rounded-full bg-sa-green/10 text-sa-green flex items-center justify-center">
                    {c.tipo === 'cumpleanos' ? <IconPastel className="w-5 h-5" /> : <IconRegalo className="w-5 h-5" />}
                  </span>
                  <div>
                    <b className="font-display font-normal text-base">
                      {c.tipo === 'cumpleanos' ? 'Cumpleaños' : 'Recompensa'}
                    </b>
                    <div className="text-sa-green-ink/60 text-sm">{c.beneficio}</div>
                    <div className="text-sa-green-ink/60 text-sm">
                      Vence: {new Date(c.vence_en).toLocaleDateString('es-MX')}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  <QR value={c.codigo} size={72} />
                </div>
              </div>
            ))}
          </section>

          {/* ── Lo que siempre pides ── */}
          {favoritos.length > 0 && (
            <section className="rounded-sa-lg p-5 mb-3.5 bg-sa-cream-paper text-sa-green-ink shadow-sa">
              <h2 className="flex items-center gap-2 font-display text-lg text-sa-green mb-1.5">
                <IconEstrella className="w-5 h-5 text-sa-banana" />
                Lo que siempre pides
              </h2>
              {favoritos.map((f, i) => (
                <div
                  key={f.producto}
                  className="flex items-center gap-3 py-2.5 border-t border-sa-green-ink/10 first-of-type:border-t-0"
                >
                  <span className="w-7 h-7 shrink-0 rounded-full bg-sa-green text-sa-cream font-display text-sm flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{f.producto}</div>
                    <div className="text-sa-green-ink/60 text-sm">
                      {f.veces === 1 ? '1 vez' : `${f.veces} veces`} · última {fechaHumana(f.ultima_vez).toLowerCase()}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* ── Tus últimas compras ── */}
          <section className="rounded-sa-lg p-5 mb-3.5 bg-sa-cream-paper text-sa-green-ink shadow-sa">
            <h2 className="flex items-center gap-2 font-display text-lg text-sa-green mb-1.5">
              <IconRecibo className="w-5 h-5 text-sa-green" />
              Tus últimas compras
            </h2>
            {historial.length === 0 && (
              <div className="flex items-center gap-3 py-2">
                <img src={milo} alt="" className="w-14 h-auto opacity-70" />
                <p className="text-sa-green-ink/60 text-sm">
                  Tus compras aparecerán aquí. Muestra tu código al pagar para que cada una cuente.
                </p>
              </div>
            )}
            {historial.map((h) => (
              <div key={h.folio} className="py-2.5 border-t border-sa-green-ink/10 first-of-type:border-t-0">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-sa-green-ink/60 text-sm">{fechaHumana(h.fecha)}</span>
                  <span className="flex items-center gap-1 text-sa-green text-sm font-semibold shrink-0">
                    <IconMancuerna className="w-4 h-4" />
                    +{h.mancuernas_ganadas}
                  </span>
                </div>
                <div className="mt-0.5">
                  {(h.items ?? []).map((it, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">
                        {it.cantidad > 1 ? `${it.cantidad}× ` : ''}
                        {it.producto}
                      </span>
                      {it.personalizacion && (
                        <span className="text-sa-green-ink/50"> — {it.personalizacion}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="text-sa-green-ink/60 text-sm mt-0.5">${Number(h.total).toFixed(2)}</div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
