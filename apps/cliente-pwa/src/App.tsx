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
} from '@shake/supabase'
import type { ClienteConLealtad } from '@shake/supabase'
import QR from './QR'

// Traduce errores técnicos a un mensaje amable en español.
// Mientras el cliente termina de habilitar Google en Supabase Auth, el
// proveedor responde "provider is not enabled"; no queremos asustar al usuario.
function mensajeAmable(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)).toLowerCase()
  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider')) {
    return 'Rewards estará disponible en un momentito. Estamos afinando el acceso — vuelve a intentar muy pronto. 🥤'
  }
  if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('network')) {
    return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
  }
  return 'Algo salió mal. Inténtalo de nuevo en un momento.'
}

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [logueado, setLogueado] = useState(false)
  const [cliente, setCliente] = useState<ClienteConLealtad | null>(null)
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
      const cli = await vincularClienteAuth(sb, {
        authUserId: user.id,
        nombre,
        email: user.email ?? null,
      })
      setCliente(cli)
      setError(null)
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
      <div className="min-h-[100dvh] flex items-center justify-center px-5 font-body text-sa-cream/70">
        Cargando…
      </div>
    )

  if (!logueado) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-5 bg-sa-green-deep font-body">
        <div className="text-center max-w-[340px] w-full">
          <img src={milo} alt="" className="w-[132px] h-auto mx-auto" />
          <h1 className="font-display text-3xl text-sa-cream mt-3 mb-2 leading-tight">
            Shake Aholic Rewards
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

  return (
    <div className="min-h-[100dvh] max-w-[460px] mx-auto px-4 py-4 bg-sa-green-deep font-body">
      <header className="flex justify-between items-center mb-3 font-display text-sa-cream text-xl">
        <span>🥤 Rewards</span>
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
          <section className="rounded-sa-lg p-5 mb-3.5 text-center text-sa-cream shadow-sa bg-gradient-to-br from-sa-green to-sa-green-deep">
            <div className="text-sm opacity-90">Hola, {cliente.nombre.split(' ')[0]}</div>
            <div className="font-display text-6xl leading-none mt-1.5 text-sa-banana">
              🏋️ {cliente.mancuernas}
            </div>
            <div className="uppercase tracking-widest text-xs opacity-85 mt-1">mancuernas</div>
            <div className="bg-sa-cream/25 rounded-full h-2 my-3 overflow-hidden">
              <div className="bg-sa-mint h-full" style={{ width: `${Math.min(100, cliente.mancuernas)}%` }} />
            </div>
            <div className="text-sa-cream/85 text-sm">
              {Math.max(0, 100 - (cliente.mancuernas % 100 || 0))} para tu próximo cupón
            </div>
          </section>

          <section className="rounded-sa-lg p-5 mb-3.5 bg-sa-cream-paper text-sa-green-ink shadow-sa">
            <h2 className="font-display text-lg text-sa-green mb-1.5">Tu código</h2>
            <p className="text-sa-green-ink/60 text-sm">Muéstralo en caja o en el kiosko para identificarte.</p>
            <div className="flex justify-center py-2.5">
              {cliente.codigo ? <QR value={cliente.codigo} /> : <span className="text-sa-green-ink/50 text-sm">—</span>}
            </div>
            <div className="text-center font-mono font-medium tracking-widest text-sa-green">{cliente.codigo}</div>
          </section>

          <section className="rounded-sa-lg p-5 mb-3.5 bg-sa-cream-paper text-sa-green-ink shadow-sa">
            <h2 className="font-display text-lg text-sa-green mb-1.5">Cupones activos ({cliente.cupones.length})</h2>
            {cliente.cupones.length === 0 && (
              <p className="text-sa-green-ink/60 text-sm">Aún no tienes cupones. ¡Junta 100 mancuernas!</p>
            )}
            {cliente.cupones.map((c) => (
              <div
                key={c.id}
                className="flex justify-between items-center gap-2.5 py-2.5 border-t border-sa-green-ink/10 first-of-type:border-t-0"
              >
                <div>
                  <b className="font-display font-normal text-base">
                    {c.tipo === 'cumpleanos' ? '🎂 Cumpleaños' : '🎁 Recompensa'}
                  </b>
                  <div className="text-sa-green-ink/60 text-sm">{c.beneficio}</div>
                  <div className="text-sa-green-ink/60 text-sm">
                    Vence: {new Date(c.vence_en).toLocaleDateString('es-MX')}
                  </div>
                </div>
                <div className="shrink-0">
                  <QR value={c.codigo} size={72} />
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}