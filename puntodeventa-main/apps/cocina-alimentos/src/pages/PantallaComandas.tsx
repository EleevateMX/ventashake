import React, { useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, getCocinaIdPorSlug, getOrdenesPorCocina, suscribirseAOrdenes, actualizarEstadoOrden } from '@pos/supabase'
import type { CocinaSlug } from '@pos/supabase'

const KDS_CH = 'shakeaholic-kds'

function subscribeKds(handler: (orden: {
  id: string; folio: string; canal: string; created_at: string
  items: { id: string; nombre: string; cantidad: number; personalizacion?: string }[]
}) => void): () => void {
  try {
    if (typeof BroadcastChannel === 'undefined') return () => {}
    const ch = new BroadcastChannel(KDS_CH)
    ch.onmessage = (m) => { if (m.data?.type === 'new-order') handler(m.data.orden) }
    return () => { try { ch.close() } catch {} }
  } catch { return () => {} }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EstadoKDS = 'nueva' | 'en_preparacion' | 'lista'
type Canal = 'pos' | 'mesa' | 'kiosko' | 'delivery'

interface OrdenItem {
  id: string
  cantidad: number
  personalizacion: string | null
  productos: { id: string; nombre: string } | null
}

interface Orden {
  id: string
  folio: number
  estado: EstadoKDS
  canal: Canal
  created_at: string
  orden_items: OrdenItem[]
  /** local-only: set when moved to "lista" so we can fade-out */
  completada_at?: number
}

interface Props {
  cocinaSlug: CocinaSlug
  titulo: string
  color: 'orange' | 'blue'
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const now = Date.now()

const DEMO_ORDENES: Orden[] = [
  {
    id: 'demo-1',
    folio: 41,
    estado: 'nueva',
    canal: 'kiosko',
    created_at: new Date(now - 2 * 60 * 1000).toISOString(),
    orden_items: [
      { id: 'i1', cantidad: 2, personalizacion: 'sin azúcar', productos: { id: 'p1', nombre: 'Shake de Fresa' } },
      { id: 'i2', cantidad: 1, personalizacion: null, productos: { id: 'p2', nombre: 'Cold Brew' } },
    ],
  },
  {
    id: 'demo-2',
    folio: 42,
    estado: 'nueva',
    canal: 'kiosko',
    created_at: new Date(now - 4 * 60 * 1000).toISOString(),
    orden_items: [
      { id: 'i3', cantidad: 1, personalizacion: 'doble proteína', productos: { id: 'p3', nombre: 'Shake Verde' } },
      { id: 'i4', cantidad: 2, personalizacion: null, productos: { id: 'p4', nombre: 'Energy Bites' } },
    ],
  },
  {
    id: 'demo-3',
    folio: 43,
    estado: 'en_preparacion',
    canal: 'kiosko',
    created_at: new Date(now - 6 * 60 * 1000).toISOString(),
    orden_items: [
      { id: 'i5', cantidad: 1, personalizacion: null, productos: { id: 'p5', nombre: 'Power Bowl' } },
      { id: 'i6', cantidad: 1, personalizacion: null, productos: { id: 'p6', nombre: 'Shake de Mango' } },
    ],
  },
  {
    id: 'demo-4',
    folio: 44,
    estado: 'en_preparacion',
    canal: 'pos',
    created_at: new Date(now - 9 * 60 * 1000).toISOString(),
    orden_items: [
      { id: 'i7', cantidad: 3, personalizacion: null, productos: { id: 'p7', nombre: 'Café Americano' } },
    ],
  },
  {
    id: 'demo-5',
    folio: 45,
    estado: 'lista',
    canal: 'kiosko',
    created_at: new Date(now - 13 * 60 * 1000).toISOString(),
    orden_items: [
      { id: 'i8', cantidad: 1, personalizacion: null, productos: { id: 'p8', nombre: 'Açaí Bowl' } },
      { id: 'i9', cantidad: 1, personalizacion: null, productos: { id: 'p9', nombre: 'Mix de Nueces' } },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function elapsedMinutes(ms: number): number {
  return ms / 1000 / 60
}

function elapsedColor(ms: number): string {
  const minutes = elapsedMinutes(ms)
  if (minutes < 3) return 'text-sa-mint'
  if (minutes < 7) return 'text-sa-mango'
  return 'text-sa-strawberry'
}

function sortOrdenes(ordenes: Orden[]): Orden[] {
  const priority: Record<EstadoKDS, number> = { nueva: 0, en_preparacion: 1, lista: 2 }
  return [...ordenes].sort((a, b) => {
    const pd = priority[a.estado] - priority[b.estado]
    if (pd !== 0) return pd
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

function formatClock(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, ctx.currentTime)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => ctx.close()
  } catch {
    // AudioContext not available (e.g., SSR)
  }
}

// ─── Canal badge ─────────────────────────────────────────────────────────────

const CANAL_LABELS: Record<Canal, string> = {
  pos: 'POS',
  mesa: 'Mesa',
  kiosko: 'Kiosko',
  delivery: 'Delivery',
}

const CANAL_ICON: Record<Canal, React.ReactNode> = {
  pos:      (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>),
  mesa:     (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z"/><line x1="21" y1="15" x2="21" y2="22"/></svg>),
  kiosko:   (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>),
  delivery: (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>),
}

const CANAL_CLASSES: Record<Canal, string> = {
  pos: 'bg-sa-green text-sa-cream',
  mesa: 'bg-sa-mint text-sa-green-ink',
  kiosko: 'bg-sa-blueberry text-white',
  delivery: 'bg-sa-mango text-white',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PantallaComandas({ cocinaSlug, titulo, color: _color }: Props) {
  const [ordenes, setOrdenes] = useState<Orden[]>(isSupabaseConfigured ? [] : DEMO_ORDENES)
  const [cocinaId, setCocinaId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())

  // Track which order IDs have already triggered a beep
  const seenIds = useRef<Set<string>>(new Set())

  // Tick every second to update timers
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Sound alert for new orders
  useEffect(() => {
    ordenes.forEach((o) => {
      if (o.estado === 'nueva' && !seenIds.current.has(o.id)) {
        seenIds.current.add(o.id)
        playBeep()
      }
    })
  }, [ordenes])

  // Resolve slug to cocinaId on mount
  useEffect(() => {
    if (!isSupabaseConfigured) return
    getCocinaIdPorSlug(cocinaSlug)
      .then(id => { if (id) setCocinaId(id) })
      .catch(console.error)
  }, [cocinaSlug])

  // Always subscribe to BroadcastChannel for live kiosk orders (works in demo + real mode)
  useEffect(() => {
    const unsub = subscribeKds((orden) => {
      setOrdenes((prev) => {
        if (prev.some((o) => o.id === orden.id)) return prev
        const newOrden: Orden = {
          id: orden.id,
          folio: parseInt(orden.folio) || prev.length + 1,
          estado: 'nueva',
          canal: orden.canal as Canal,
          created_at: orden.created_at,
          orden_items: orden.items.map((item) => ({
            id: item.id,
            cantidad: item.cantidad,
            personalizacion: item.personalizacion ?? null,
            productos: { id: item.id, nombre: item.nombre },
          })),
        }
        return [newOrden, ...prev]
      })
    })
    return unsub
  }, [])

  // Load orders and subscribe when cocinaId is available
  useEffect(() => {
    if (!cocinaId) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function mapOrdenes(data: any[]): Orden[] {
      return data.map(o => ({
        id: o.id,
        folio: o.folio,
        estado: (o.estado as EstadoKDS) ?? 'nueva',
        canal: (o.canal as Canal) ?? 'pos',
        created_at: o.created_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orden_items: (o.orden_items ?? []).map((item: any) => ({
          id: item.id,
          cantidad: item.cantidad,
          personalizacion: item.personalizacion ?? null,
          productos: item.productos ?? null,
        })),
      }))
    }

    // Initial load
    getOrdenesPorCocina(cocinaId)
      .then(data => { setOrdenes(mapOrdenes(data)) })
      .catch(console.error)

    // Realtime subscription
    const channel = suscribirseAOrdenes(cocinaId, () => {
      getOrdenesPorCocina(cocinaId)
        .then(data => { setOrdenes(mapOrdenes(data)) })
        .catch(console.error)
    })

    return () => { channel.unsubscribe() }
  }, [cocinaId])

  // State machine actions
  function iniciarPreparacion(id: string) {
    // Optimistic local update
    setOrdenes((prev) =>
      prev.map((o) => (o.id === id ? { ...o, estado: 'en_preparacion' as EstadoKDS } : o)),
    )
    // Persist to DB (fire and forget, don't block UI)
    if (isSupabaseConfigured) {
      actualizarEstadoOrden(id, 'en_preparacion').catch(console.error)
    }
  }

  function marcarLista(id: string) {
    setOrdenes((prev) =>
      prev.map((o) => (o.id === id ? { ...o, estado: 'lista' as EstadoKDS, completada_at: Date.now() } : o)),
    )
    setFadingOut((prev) => new Set([...prev, id]))

    if (isSupabaseConfigured) {
      actualizarEstadoOrden(id, 'lista').catch(console.error)
    }

    setTimeout(() => {
      setOrdenes((prev) => prev.filter((o) => o.id !== id))
      setFadingOut((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      // Mark as entregada in DB after removal
      if (isSupabaseConfigured) {
        actualizarEstadoOrden(id, 'entregada').catch(console.error)
      }
    }, 3000)
  }

  const sorted = sortOrdenes(ordenes)

  const enEspera = ordenes.filter((o) => o.estado === 'nueva').length
  const preparando = ordenes.filter((o) => o.estado === 'en_preparacion').length
  const listasHoy = ordenes.filter((o) => o.estado === 'lista').length

  const clock = formatClock(new Date(now))

  return (
    <div className="min-h-screen bg-sa-green-ink flex flex-col font-body">
      {/* ── Header ── */}
      <header className="px-6 py-4 bg-sa-green-deep border-b border-sa-cream/10">
        <div className="flex items-center justify-between gap-6">
          {/* Left: logo */}
          <div className="flex items-center gap-4 shrink-0">
            <img
              src="/logo.png"
              alt="Shake Aholic"
              className="h-16 w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            />
          </div>

          {/* Center: title */}
          <div className="flex-1 text-center">
            <h1 className="font-display text-sa-cream text-3xl md:text-4xl tracking-wide leading-none">
              {titulo}
            </h1>
            <p className="font-mono text-sa-cream/50 text-xs mt-1 uppercase tracking-widest">
              Kitchen Display · En vivo
            </p>
          </div>

          {/* Right: clock + live dot */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sa-mint animate-pulse" />
              <span className="font-mono text-sa-cream/70 text-xl tabular-nums">{clock}</span>
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-3 mt-4 justify-center md:justify-end">
          <StatPill
            count={enEspera}
            label="En espera"
            bg="bg-sa-strawberry"
            text="text-white"
            pulseNumber
          />
          <StatPill
            count={preparando}
            label="Preparando"
            bg="bg-sa-banana"
            text="text-sa-coffee"
          />
          <StatPill
            count={listasHoy}
            label="Listas hoy"
            bg="bg-sa-mint"
            text="text-sa-green-ink"
          />
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 p-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
            <img
              src="/milo-transparent.png"
              alt="Milo descansando"
              className="w-[280px] h-auto opacity-90 drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            />
            <p className="font-display text-sa-cream text-4xl md:text-5xl tracking-wide">
              Todo limpio. A descansar.
            </p>
            <p className="font-mono text-sa-cream/50 text-sm uppercase tracking-widest">
              Las órdenes nuevas aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {sorted.map((orden) => (
              <OrdenCard
                key={orden.id}
                orden={orden}
                now={now}
                isFadingOut={fadingOut.has(orden.id)}
                onIniciarPreparacion={iniciarPreparacion}
                onMarcarLista={marcarLista}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({
  count,
  label,
  bg,
  text,
  pulseNumber = false,
}: {
  count: number
  label: string
  bg: string
  text: string
  pulseNumber?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-sa ${bg} ${text} shadow-sa-sm`}>
      <span
        className={`font-display text-2xl leading-none min-w-[2rem] text-center px-2 ${
          pulseNumber ? 'animate-pulse' : ''
        }`}
      >
        {count}
      </span>
      <span className="font-mono text-xs uppercase tracking-widest">{label}</span>
    </span>
  )
}

interface OrdenCardProps {
  orden: Orden
  now: number
  isFadingOut: boolean
  onIniciarPreparacion: (id: string) => void
  onMarcarLista: (id: string) => void
}

function OrdenCard({ orden, now, isFadingOut, onIniciarPreparacion, onMarcarLista }: OrdenCardProps) {
  const elapsed = now - new Date(orden.created_at).getTime()
  const timerColor = elapsedColor(elapsed)
  const mins = elapsedMinutes(elapsed)

  const accentByState: Record<EstadoKDS, string> = {
    nueva: 'bg-sa-strawberry animate-pulse',
    en_preparacion: 'bg-sa-banana',
    lista: 'bg-sa-mint',
  }

  const stateLabel: Record<EstadoKDS, string> = {
    nueva: 'Nueva',
    en_preparacion: 'Preparando',
    lista: 'Lista',
  }

  const stateBadge: Record<EstadoKDS, string> = {
    nueva: 'bg-sa-strawberry text-white',
    en_preparacion: 'bg-sa-banana text-sa-coffee',
    lista: 'bg-sa-mint text-sa-green-ink',
  }

  return (
    <div
      className={`bg-sa-cream rounded-sa-lg shadow-sa overflow-hidden flex flex-col transition-all duration-700 ${
        isFadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      } ${orden.estado === 'lista' ? 'bg-sa-mint/20' : ''}`}
    >
      {/* Accent strip */}
      <div className={`h-1.5 w-full ${accentByState[orden.estado]}`} />

      {/* Card header: folio + channel */}
      <div className="flex items-start justify-between px-5 pt-4">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-widest text-sa-green-ink/50">
            Folio
          </span>
          <span className="font-display text-sa-green-ink text-3xl leading-none mt-0.5">
            #ORD-{String(orden.folio).padStart(3, '0')}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sa font-mono text-[11px] uppercase tracking-wider ${CANAL_CLASSES[orden.canal]}`}
        >
          {CANAL_ICON[orden.canal]}
          {CANAL_LABELS[orden.canal]}
        </span>
      </div>

      {/* Timer + state */}
      <div className="px-5 pt-3 pb-2 flex items-end justify-between">
        <div className="flex items-baseline gap-2">
          <span className={`font-display text-4xl leading-none ${timerColor}`}>
            {formatElapsed(elapsed)}
          </span>
          <span className="font-mono text-xs uppercase tracking-widest text-sa-green-ink/50">
            {mins < 1 ? 'recién' : 'min'}
          </span>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-sa font-mono text-[10px] uppercase tracking-widest ${stateBadge[orden.estado]}`}
        >
          {stateLabel[orden.estado]}
        </span>
      </div>

      <div className="mx-5 my-1 h-px bg-sa-green-ink/10" />

      {/* Items */}
      <div className="px-3 py-2 flex-1">
        {orden.orden_items.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 items-start px-2 py-2 rounded-sa hover:bg-sa-cream-soft transition-colors"
          >
            <span className="font-mono font-medium text-sm bg-sa-green-ink text-sa-cream px-2.5 py-1 rounded-sa min-w-[2.75rem] text-center shrink-0 tabular-nums">
              {item.cantidad}×
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-body font-medium text-sa-green-ink leading-tight">
                {item.productos?.nombre ?? '—'}
              </p>
              {item.personalizacion && (
                <p className="font-mono text-[11px] mt-1 text-sa-strawberry uppercase tracking-wide">
                  ↳ {item.personalizacion}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action button */}
      <div className="px-5 pb-5 pt-2">
        {orden.estado === 'nueva' && (
          <button
            onClick={() => onIniciarPreparacion(orden.id)}
            className="w-full bg-sa-green hover:bg-sa-green-deep text-sa-cream font-display text-xl tracking-wide py-3 rounded-sa transition-colors shadow-sa-sm"
          >
            ▶ Preparar
          </button>
        )}
        {orden.estado === 'en_preparacion' && (
          <button
            onClick={() => onMarcarLista(orden.id)}
            className="w-full bg-sa-mint hover:bg-sa-mint/80 text-sa-green-ink font-display text-xl tracking-wide py-3 rounded-sa transition-colors shadow-sa-sm"
          >
            ✓ Lista
          </button>
        )}
        {orden.estado === 'lista' && (
          <div className="w-full bg-sa-mint/40 text-sa-green-ink font-display text-lg py-3 rounded-sa text-center">
            ✓ Completada
          </div>
        )}
      </div>
    </div>
  )
}
