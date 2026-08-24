import milo from '@shake/brand/milo.png'
import { useEffect, useState } from 'react'
import {
  sesionActual, usuarioActual, iniciarSesionGoogle, cerrarSesion, onCambioSesion,
  vincularClienteAuth, guardarMiTelefono, miResumenLealtad, listarProductosParaVenta,
  nombreParaOrdenar,
  type ResumenLealtad, type ProductoVenta,
} from '@shake/supabase'
import { mxn } from '@shake/utils'
import { sb } from './lib/sb'
import QR from './QR'

/** Las secciones de la app, como pestañas de abajo. */
type Pestana = 'inicio' | 'menu' | 'actividad' | 'cuenta'

const PESTANAS: { id: Pestana; label: string; icono: string }[] = [
  { id: 'inicio', label: 'Tarjeta', icono: '🏋️' },
  { id: 'menu', label: 'Menú', icono: '🥤' },
  { id: 'actividad', label: 'Actividad', icono: '📋' },
  { id: 'cuenta', label: 'Cuenta', icono: '👤' },
]

const WHATSAPP = 'https://wa.me/529995044797'

/** Los errores crudos no le sirven a nadie parado en la barra. */
function mensajeAmable(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider')) {
    return 'Rewards estará disponible en un momentito. Estamos afinando el acceso — vuelve a intentar muy pronto.'
  }
  if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('network')) {
    return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
  }
  return 'Algo salió mal. Inténtalo de nuevo en un momento.'
}

export default function App() {
  const [cargando, setCargando] = useState(true)
  const [logueado, setLogueado] = useState(false)
  const [datos, setDatos] = useState<ResumenLealtad | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Los atajos del icono (mantener presionado en el celular) abren
  // directo en una pestaña: /?ir=menu. Si prometemos el atajo, tiene que
  // llevar a algún lado.
  const [pestana, setPestana] = useState<Pestana>(() => {
    const ir = new URLSearchParams(window.location.search).get('ir')
    return (['inicio', 'menu', 'actividad', 'cuenta'] as const).includes(ir as Pestana)
      ? (ir as Pestana)
      : 'inicio'
  })
  const [menu, setMenu] = useState<ProductoVenta[] | null>(null)

  /**
   * Trae la sesión y el expediente completo.
   *
   * Al volver de Google la sesión tarda un instante en asentarse, y esto se
   * dispara dos veces (al montar y al cambiar la sesión). El intento que
   * llega temprano fallaba y pintaba un error rojo que se iba solo un
   * segundo después: alarmar por algo ya resuelto es peor que callar. Los
   * primeros tropiezos se reintentan en silencio.
   */
  async function sincronizar(intento = 0) {
    let reintentando = false
    try {
      const sesion = await sesionActual(sb)
      if (!sesion) {
        setLogueado(false)
        setDatos(null)
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
      // Da de alta la ficha si es la primera vez; el servidor toma el id y
      // el correo de la sesión, no de aquí.
      await vincularClienteAuth(sb, { nombre })
      setDatos(await miResumenLealtad(sb))
      setError(null)
    } catch (e) {
      if (intento < 2) {
        reintentando = true
        window.setTimeout(() => void sincronizar(intento + 1), 700)
        return
      }
      setError(mensajeAmable(e))
    } finally {
      if (!reintentando) setCargando(false)
    }
  }

  useEffect(() => {
    void sincronizar()
    const off = onCambioSesion(sb, () => void sincronizar())
    return off
  }, [])

  // El menú se trae la primera vez que se abre esa pestaña, no al arrancar:
  // la mayoría entra a ver su saldo, no la carta.
  useEffect(() => {
    if (pestana !== 'menu' || menu !== null) return
    listarProductosParaVenta(sb).then(setMenu).catch(() => setMenu([]))
  }, [pestana, menu])

  if (cargando) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-5 bg-sa-green-deep font-body text-sa-cream/70">
        <img src={milo} alt="" className="w-24 h-auto animate-pulse" />
        <p>Cargando…</p>
      </div>
    )
  }

  if (!logueado) return <Bienvenida error={error} />

  const c = datos?.cliente

  return (
    <div className="min-h-[100dvh] bg-sa-green-deep font-body flex flex-col">
      {/* Encabezado compacto: en una app el nombre no ocupa media pantalla. */}
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">
            Shakeaholic Rewards
          </p>
          <p className="font-display text-xl text-sa-cream leading-tight truncate">
            {c?.nombre?.split(' ')[0] ?? 'Hola'}
          </p>
        </div>
        <img src={milo} alt="" className="h-10 w-auto shrink-0" />
      </header>

      {error && (
        <div className="mx-4 mb-3 rounded-sa border border-sa-strawberry/60 bg-sa-strawberry/15 text-sa-strawberry font-mono text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* El contenido se desplaza; las pestañas se quedan fijas abajo. */}
      <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {pestana === 'inicio' && <Inicio datos={datos} alRecargar={() => void sincronizar()} />}
        {pestana === 'menu' && <Menu productos={menu} />}
        {pestana === 'actividad' && <Actividad datos={datos} />}
        {pestana === 'cuenta' && <Cuenta datos={datos} alRecargar={() => void sincronizar()} />}
      </main>

      {/* Barra de pestañas — el patrón que la gente ya conoce de cualquier
          app, y lo que hace que esto se sienta una app y no una página. */}
      <nav className="fixed bottom-0 inset-x-0 bg-sa-green-ink/95 backdrop-blur border-t border-sa-cream/10 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                pestana === p.id ? 'text-sa-banana' : 'text-sa-cream/45'
              }`}
            >
              <span className="text-xl leading-none">{p.icono}</span>
              <span className="font-mono text-[10px] uppercase tracking-wide">{p.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

// ─────────────────────────── Pantalla de entrada ──────────────────────────

function Bienvenida({ error }: { error: string | null }) {
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
          <div className="mt-4 rounded-sa border border-sa-mint/40 bg-sa-mint/10 text-sa-cream text-sm px-4 py-3 leading-snug">
            {error}
          </div>
        )}
        <button
          className="mt-4 mb-2 w-full rounded-sa-lg bg-sa-cream text-sa-green-ink font-display text-xl py-4 active:scale-[0.98] transition-transform"
          onClick={() => void iniciarSesionGoogle(sb, window.location.origin)}
        >
          Continuar con Google
        </button>
        <p className="text-sa-cream/45 text-xs mt-3">
          1 mancuerna por cada $10 · 100 mancuernas = un cupón
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────── Tarjeta ─────────────────────────────────

function Inicio({ datos, alRecargar }: { datos: ResumenLealtad | null; alRecargar: () => void }) {
  const c = datos?.cliente
  const p = datos?.progreso
  if (!c) return null

  return (
    <>
      {/* La tarjeta: saldo y camino al próximo cupón. */}
      <section className="relative overflow-hidden rounded-sa-lg p-5 mb-3 text-sa-cream shadow-sa bg-gradient-to-br from-sa-green to-sa-green-deep">
        <img src={milo} alt="" className="absolute -right-4 -bottom-6 h-32 opacity-20 pointer-events-none" />
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana">Tus mancuernas</p>
        <p className="font-display text-6xl leading-none text-sa-banana mt-1">{c.mancuernas}</p>

        {p && (
          <div className="mt-4 relative z-10">
            <div className="h-2.5 rounded-full bg-sa-cream/15 overflow-hidden">
              <div className="h-full rounded-full bg-sa-banana transition-all" style={{ width: `${p.pct}%` }} />
            </div>
            <p className="text-sm text-sa-cream/85 mt-2">
              {p.faltan === 0
                ? '¡Tienes un cupón listo! Pídelo en caja.'
                : <>Te faltan <b className="text-sa-banana">{p.faltan}</b> para tu próximo cupón</>}
            </p>
          </div>
        )}
      </section>

      {/* El código: lo único que tiene que enseñar en la barra. Va grande y
          arriba a propósito — es el momento en que abre la app. */}
      <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa text-center">
        <h2 className="font-display text-lg text-sa-green">Muéstralo en caja</h2>
        <p className="text-xs text-sa-green-ink/55 mb-3">
          Con esto te sumamos las mancuernas de tu compra
        </p>
        {c.codigo ? (
          <>
            <div className="inline-block bg-white rounded-sa p-3">
              <QR value={c.codigo} size={168} />
            </div>
            <p className="font-mono font-medium tracking-[0.2em] text-sa-green text-lg mt-2">{c.codigo}</p>
          </>
        ) : (
          <p className="text-sa-green-ink/50 text-sm">—</p>
        )}
      </section>

      <Cupones datos={datos} />

      {datos?.vida && datos.vida.visitas > 0 && (
        <section className="grid grid-cols-3 gap-2 mb-3">
          <Dato valor={String(datos.vida.visitas)} pie="visitas" />
          <Dato valor={mxn(datos.vida.gastado)} pie="gastado" />
          <Dato valor={String(datos.ganadas_total ?? 0)} pie="ganadas" />
        </section>
      )}

      <button
        onClick={alRecargar}
        className="w-full rounded-sa border border-sa-cream/20 text-sa-cream/70 font-mono text-xs uppercase tracking-wide py-3 mb-3 active:scale-[0.99] transition-transform"
      >
        Actualizar
      </button>
    </>
  )
}

function Dato({ valor, pie }: { valor: string; pie: string }) {
  return (
    <div className="rounded-sa bg-sa-cream-paper/10 border border-sa-cream/10 px-2 py-3 text-center">
      <p className="font-display text-xl text-sa-cream leading-none">{valor}</p>
      <p className="font-mono text-[9px] uppercase tracking-wide text-sa-cream/45 mt-1">{pie}</p>
    </div>
  )
}

function Cupones({ datos }: { datos: ResumenLealtad | null }) {
  const cupones = datos?.cupones ?? []
  return (
    <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
      <h2 className="font-display text-lg text-sa-green mb-2">
        Cupones activos ({cupones.length})
      </h2>
      {cupones.length === 0 ? (
        <p className="text-sm text-sa-green-ink/55">
          Todavía ninguno. Al llegar a 100 mancuernas te damos el primero.
        </p>
      ) : (
        <div className="space-y-3">
          {cupones.map((cu) => (
            <div key={cu.codigo} className="flex items-center gap-3 rounded-sa bg-sa-mint/20 border border-sa-mint/50 p-3">
              <div className="bg-white rounded p-1.5 shrink-0">
                <QR value={cu.codigo} size={64} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base leading-tight">{cu.beneficio}</p>
                <p className="font-mono text-[11px] text-sa-green-ink/60 mt-0.5">{cu.codigo}</p>
                <p className={`text-[11px] mt-0.5 ${cu.dias_restantes <= 7 ? 'text-sa-strawberry font-semibold' : 'text-sa-green-ink/55'}`}>
                  {cu.dias_restantes <= 0
                    ? 'Vence hoy'
                    : cu.dias_restantes <= 7
                      ? `Vence en ${cu.dias_restantes} días`
                      : `Vence el ${cu.vence}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ────────────────────────────────── Menú ──────────────────────────────────

function Menu({ productos }: { productos: ProductoVenta[] | null }) {
  if (productos === null) {
    return <p className="text-sa-cream/50 text-center py-10 font-mono text-xs uppercase tracking-widest">Cargando el menú…</p>
  }

  // Solo lo que se antoja: los scoops y suplementos son surtido de
  // mostrador, no carta.
  const carta = new Map<string, ProductoVenta[]>()
  for (const p of productos) {
    const cat = p.categorias?.nombre
    if (!cat || /^(extras|scoops|suplementos)/i.test(cat)) continue
    if (!carta.has(cat)) carta.set(cat, [])
    carta.get(cat)!.push(p)
  }

  if (carta.size === 0) {
    return <p className="text-sa-cream/50 text-center py-10">El menú no está disponible ahora.</p>
  }

  return (
    <>
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-sa-banana mb-3">
        Lo que hay hoy en la barra
      </p>
      {[...carta.entries()].map(([cat, items]) => (
        <section key={cat} className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-2">{cat}</h2>
          <div className="divide-y divide-sa-green-ink/10">
            {items.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{nombreParaOrdenar(p.nombre)}</p>
                  {p.descripcion && (
                    <p className="text-xs text-sa-green-ink/55 leading-snug mt-0.5">{p.descripcion}</p>
                  )}
                </div>
                <p className="font-mono text-sm text-sa-green shrink-0">{mxn(p.precio)}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
      <a
        href={WHATSAPP}
        className="block w-full rounded-sa-lg bg-sa-banana text-sa-green-ink font-display text-xl py-4 text-center mb-3 active:scale-[0.98] transition-transform"
      >
        Pedir por WhatsApp
      </a>
    </>
  )
}

// ──────────────────────────────── Actividad ───────────────────────────────

function Actividad({ datos }: { datos: ResumenLealtad | null }) {
  const historial = datos?.historial ?? []
  const favoritos = datos?.favoritos ?? []
  const movimientos = datos?.movimientos ?? []

  if (historial.length === 0 && movimientos.length === 0) {
    return (
      <div className="text-center py-12">
        <img src={milo} alt="" className="h-24 mx-auto opacity-60" />
        <p className="font-display text-xl text-sa-cream mt-3">Aún no hay nada por aquí</p>
        <p className="text-sm text-sa-cream/60 mt-1 max-w-[260px] mx-auto">
          En tu próxima compra, muestra tu código en caja y aquí verás tus
          mancuernas y lo que pediste.
        </p>
      </div>
    )
  }

  return (
    <>
      {favoritos.length > 0 && (
        <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-2">Lo que siempre pides</h2>
          <div className="space-y-1.5">
            {favoritos.map((f, i) => (
              <div key={f.nombre} className="flex items-center gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-sa-green text-sa-cream font-display text-xs flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="text-sm flex-1 min-w-0 truncate">{nombreParaOrdenar(f.nombre)}</span>
                <span className="font-mono text-xs text-sa-green-ink/50">{f.veces}×</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {historial.length > 0 && (
        <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-2">Tus compras</h2>
          <div className="divide-y divide-sa-green-ink/10">
            {historial.map((h) => (
              <div key={h.folio} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-xs text-sa-green-ink/55">{h.fecha}</p>
                  <p className="font-mono text-sm">{mxn(h.total)}</p>
                </div>
                <p className="text-sm leading-snug mt-0.5">{h.items}</p>
                {h.mancuernas > 0 && (
                  <p className="font-mono text-[11px] text-sa-green mt-0.5">+{h.mancuernas} mancuernas</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {movimientos.length > 0 && (
        <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-2">Movimientos</h2>
          <div className="divide-y divide-sa-green-ink/10">
            {movimientos.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{m.descripcion}</p>
                  <p className="font-mono text-[11px] text-sa-green-ink/50">{m.fecha}</p>
                </div>
                <span className={`font-mono text-sm shrink-0 ${m.puntos > 0 ? 'text-sa-green' : 'text-sa-strawberry'}`}>
                  {m.puntos > 0 ? '+' : ''}{m.puntos}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

// ───────────────────────────────── Cuenta ─────────────────────────────────

function Cuenta({ datos, alRecargar }: { datos: ResumenLealtad | null; alRecargar: () => void }) {
  const c = datos?.cliente
  const [telefono, setTelefono] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorTel, setErrorTel] = useState<string | null>(null)

  async function guardarTelefono() {
    const limpio = telefono.replace(/\D/g, '')
    if (limpio.length !== 10) {
      setErrorTel('Escribe tu número a 10 dígitos.')
      return
    }
    setGuardando(true)
    setErrorTel(null)
    try {
      await guardarMiTelefono(sb, limpio)
      setTelefono('')
      alRecargar()
    } catch (e) {
      setErrorTel(e instanceof Error && e.message ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
        <h2 className="font-display text-lg text-sa-green mb-2">Tu cuenta</h2>
        <div className="space-y-2 text-sm">
          <Fila etiqueta="Nombre" valor={c?.nombre ?? '—'} />
          <Fila etiqueta="Código" valor={c?.codigo ?? '—'} mono />
          <Fila etiqueta="Teléfono" valor={c?.telefono ?? 'sin registrar'} mono />
          <Fila etiqueta="Cliente desde" valor={c?.desde ?? '—'} />
        </div>
      </section>

      {!c?.telefono && (
        <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
          <h2 className="font-display text-lg text-sa-green mb-1">Agrega tu teléfono</h2>
          <p className="text-xs text-sa-green-ink/60 mb-3">
            Con él te encontramos en caja aunque no traigas el celular.
          </p>
          <div className="flex gap-2">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="numeric"
              placeholder="9991234567"
              className="flex-1 min-w-0 rounded-sa border border-sa-green-ink/15 px-3 py-2.5 font-mono"
            />
            <button
              onClick={() => void guardarTelefono()}
              disabled={guardando}
              className="rounded-sa bg-sa-green text-sa-cream font-display text-lg px-5 disabled:opacity-40 active:scale-95 transition-transform"
            >
              {guardando ? '…' : 'Guardar'}
            </button>
          </div>
          {errorTel && <p className="text-sa-strawberry text-xs mt-2">{errorTel}</p>}
        </section>
      )}

      <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
        <h2 className="font-display text-lg text-sa-green mb-2">Cómo funciona</h2>
        <ul className="text-sm text-sa-green-ink/75 space-y-1.5 leading-snug">
          <li>· Ganas <b>1 mancuerna por cada $10</b> de compra.</li>
          <li>· Al llegar a <b>100</b> te damos un cupón.</li>
          <li>· Muestra tu código en caja <b>antes de pagar</b> para que cuente.</li>
          <li>· Tus cupones vencen al año de ganarlos.</li>
        </ul>
      </section>

      <section className="rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa">
        <h2 className="font-display text-lg text-sa-green mb-2">Shakeaholic</h2>
        <div className="space-y-2 text-sm">
          <a href={WHATSAPP} className="block text-sa-green underline underline-offset-4">WhatsApp: 999 504 4797</a>
          <a href="https://www.instagram.com/shakeaholicmx" className="block text-sa-green underline underline-offset-4">@shakeaholicmx</a>
          <a href="https://shakeaholic.mx" className="block text-sa-green underline underline-offset-4">shakeaholic.mx</a>
          <p className="text-sa-green-ink/60 leading-snug pt-1">
            The Harbor Lifestyle Mall, Prol. Paseo Montejo · Mérida, Yuc.
          </p>
        </div>
      </section>

      <button
        onClick={() => void cerrarSesion(sb)}
        className="w-full rounded-sa border border-sa-cream/25 text-sa-cream/70 font-mono text-xs uppercase tracking-wide py-3.5 mb-3 active:scale-[0.99] transition-transform"
      >
        Cerrar sesión
      </button>
    </>
  )
}

function Fila({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sa-green-ink/55 text-xs uppercase tracking-wide font-mono">{etiqueta}</span>
      <span className={`${mono ? 'font-mono' : ''} text-right min-w-0 truncate`}>{valor}</span>
    </div>
  )
}
