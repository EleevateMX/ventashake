import { useEffect, useRef, useState } from 'react'
import { sb } from '../lib/sb'
import { panelEnVivo, type PanelEnVivo } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg } from '../ui'

/** Cada cuánto se pide una foto nueva a la base. */
const CADA_MS = 5_000

const METODOS: Record<string, { etiqueta: string; icono: string }> = {
  efectivo: { etiqueta: 'Efectivo', icono: '💵' },
  clip: { etiqueta: 'Clip', icono: '📟' },
  tarjeta: { etiqueta: 'Tarjeta', icono: '💳' },
  cortesia: { etiqueta: 'Cortesía', icono: '🎁' },
  otro: { etiqueta: 'Otro', icono: '•' },
}

const ESTADOS_COCINA: Record<string, string> = {
  pendiente: 'bg-sa-banana/20 text-sa-coffee border-sa-banana/40',
  en_preparacion: 'bg-sa-blueberry/15 text-sa-blueberry border-sa-blueberry/30',
  listo: 'bg-sa-mint/25 text-sa-green-ink border-sa-mint/50',
}

/**
 * On Duty: lo que está pasando en la tienda AHORITA, visto desde donde sea.
 *
 * No es el Dashboard (ese mira semanas): esta pestaña mira el turno — quién
 * abrió la caja, qué hay en cocina y hace cuántos minutos, qué acaban de
 * vender, qué se pide más hoy, y si las impresoras respiran. Pide foto nueva
 * cada 5 segundos y el reloj corre segundo a segundo para que se VEA vivo.
 */
export default function EnVivo() {
  const [panel, setPanel] = useState<PanelEnVivo | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 'ultimos' = los 8 más recientes · 'turno' = todo desde que abrió la caja. */
  const [vista, setVista] = useState<'ultimos' | 'turno'>('ultimos')
  /** Epoch (ms) de la última foto buena; el reloj de "hace Xs" cuelga de él. */
  const [ultimaFoto, setUltimaFoto] = useState<number | null>(null)
  const [, setTic] = useState(0)
  const vivo = useRef(true)
  const vistaRef = useRef(vista)
  vistaRef.current = vista

  useEffect(() => {
    vivo.current = true
    const cargar = () =>
      panelEnVivo(sb, vistaRef.current === 'turno')
        .then((p) => {
          if (!vivo.current) return
          setPanel(p)
          setUltimaFoto(Date.now())
          setError(null)
        })
        .catch((e) => { if (vivo.current) setError(mensajeDeError(e)) })
    void cargar()
    const sonda = setInterval(cargar, CADA_MS)
    // Un tic por segundo re-pinta "hace Xs" y los minutos de espera aunque
    // la foto no haya cambiado: es lo que hace que el panel se sienta vivo.
    const reloj = setInterval(() => setTic((t) => t + 1), 1_000)
    return () => { vivo.current = false; clearInterval(sonda); clearInterval(reloj) }
  }, [vista])

  if (!panel && !error) return <Loading>Conectando con la tienda…</Loading>

  const maxTop = Math.max(1, ...(panel?.top_productos ?? []).map((p) => p.cantidad))
  const hace = ultimaFoto ? Math.max(0, Math.round((Date.now() - ultimaFoto) / 1000)) : null
  const alDia = hace !== null && hace <= Math.ceil(CADA_MS / 1000) + 4

  return (
    <div>
      <PageHeader
        title="En vivo"
        subtitle="Lo que está pasando en el kiosko, ahorita"
        action={
          <div
            className={`flex items-center gap-2.5 rounded-full px-4 py-2 shadow-sa-sm border ${
              alDia ? 'bg-white border-sa-green-ink/10' : 'bg-sa-strawberry/10 border-sa-strawberry/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${alDia ? 'bg-sa-strawberry animate-pulse' : 'bg-sa-strawberry'}`} />
            <span className="font-mono text-xs uppercase tracking-wider text-sa-green-ink">
              {alDia ? 'EN VIVO' : 'SIN SEÑAL'}
            </span>
            {panel && <span className="font-mono text-sm text-sa-green-ink/70">{panel.ahora}</span>}
            {hace !== null && (
              <span className={`font-mono text-[11px] ${alDia ? 'text-sa-green-ink/45' : 'text-sa-strawberry font-bold'}`}>
                hace {hace}s
              </span>
            )}
          </div>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {panel && (
        <>
          {/* KPIs del turno */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi lbl="Órdenes de hoy" val={String(panel.dia.ordenes)} accent="text-sa-banana" />
            <Kpi lbl="Cobrado hoy" val={mxn(panel.dia.total)} accent="text-sa-green" />
            <Kpi lbl="Ticket promedio" val={mxn(panel.dia.ticket)} accent="text-sa-blueberry" />
            <Kpi
              lbl="Caja"
              val={panel.corte ? `Abierta ${panel.corte.desde}` : 'CERRADA'}
              sub={panel.corte
                ? `${panel.corte.abrio ?? 'sin registro'} · fondo ${mxn(panel.corte.fondo)} · lleva ${panel.turno.ordenes} órdenes (${mxn(panel.turno.total)})`
                : 'Nadie ha abierto turno'}
              accent={panel.corte ? 'text-sa-mint' : 'text-sa-strawberry'}
            />
          </div>

          {/* Por método + impresoras */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            {Object.entries(panel.por_metodo).map(([m, monto]) => (
              <span key={m} className="inline-flex items-center gap-2 bg-white border border-sa-green-ink/10 rounded-full px-4 py-2 shadow-sa-sm text-sm text-sa-green-ink">
                <span>{METODOS[m]?.icono ?? '•'}</span>
                {METODOS[m]?.etiqueta ?? m}: <b className="font-mono">{mxn(monto)}</b>
              </span>
            ))}
            <span className="flex-1" />
            {panel.impresoras.map((i) => (
              <span
                key={i.nombre}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm border ${
                  i.en_linea
                    ? 'bg-sa-mint/15 border-sa-mint/40 text-sa-green-ink'
                    : 'bg-sa-strawberry/10 border-sa-strawberry/30 text-sa-strawberry'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${i.en_linea ? 'bg-sa-mint animate-pulse' : 'bg-sa-strawberry'}`} />
                {i.nombre.replace(' — ', ' ')} {i.en_linea ? '· en línea' : '· SIN SEÑAL'}
                {i.ultima_impresion && <span className="font-mono text-xs opacity-60">últ. {i.ultima_impresion}</span>}
              </span>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* En cocina ahora */}
            <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
              <h3 className="font-display text-xl text-sa-green-ink mb-4">En cocina ahora</h3>
              {panel.en_cocina.length === 0 ? (
                <p className="text-sm text-sa-green-ink/50 py-6 text-center">
                  Nada pendiente — todo entregado 💪
                </p>
              ) : (
                <div className="space-y-2">
                  {panel.en_cocina.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 bg-sa-cream-soft rounded-sa px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-sa-green-ink truncate">
                          #{c.folio}{c.nombre ? ` · ${c.nombre}` : ''}
                        </p>
                        <p className="font-mono text-[11px] text-sa-green-ink/50 uppercase">{c.estacion}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-mono uppercase px-2.5 py-1 rounded-full border ${ESTADOS_COCINA[c.estado] ?? 'bg-sa-cream-soft text-sa-green-ink/60 border-sa-green-ink/10'}`}>
                          {c.estado.replace('_', ' ')}
                        </span>
                        <span className={`font-mono text-sm ${c.minutos >= 10 ? 'text-sa-strawberry font-bold' : 'text-sa-green-ink/60'}`}>
                          {c.minutos}m
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pedidos: últimos / todo el turno */}
            <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-display text-xl text-sa-green-ink">Pedidos</h3>
                <div className="flex rounded-full bg-sa-cream-soft p-1">
                  {([['ultimos', 'Últimos'], ['turno', 'Todo el turno']] as const).map(([id, lbl]) => (
                    <button
                      key={id}
                      onClick={() => setVista(id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wide transition-colors ${
                        vista === id
                          ? 'bg-sa-green-deep text-sa-cream shadow-sa-sm'
                          : 'text-sa-green-ink/60 hover:text-sa-green-ink'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              {vista === 'turno' && (
                <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/50 mb-3">
                  Desde que abrió la caja: {panel.turno.ordenes} pedidos · {mxn(panel.turno.total)}
                </p>
              )}
              <div className={`space-y-2.5 ${vista === 'turno' ? 'max-h-[26rem] overflow-y-auto pr-1' : ''}`}>
                {panel.pedidos_recientes.map((p) => (
                  <div key={p.folio} className="border-b border-dotted border-sa-green-ink/15 pb-2.5 last:border-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-sm text-sa-green-ink">
                        #{p.folio} · {p.nombre ?? 'Sin nombre'}
                        <span className="ml-2 font-mono text-[10px] uppercase text-sa-green-ink/40">{p.canal}</span>
                      </p>
                      <p className="font-mono text-xs text-sa-green-ink/60 shrink-0">{p.hora} · {mxn(p.total)}</p>
                    </div>
                    <p className="text-xs text-sa-green-ink/60 mt-0.5 leading-snug">{p.items}</p>
                  </div>
                ))}
                {panel.pedidos_recientes.length === 0 && (
                  <p className="text-sm text-sa-green-ink/50 py-6 text-center">Aún no hay pedidos.</p>
                )}
              </div>
            </div>

            {/* Los más pedidos hoy */}
            <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
              <h3 className="font-display text-xl text-sa-green-ink mb-4">Los más pedidos hoy</h3>
              <div className="space-y-2.5">
                {panel.top_productos.map((t, i) => (
                  <div key={t.nombre}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <p className="text-sm text-sa-green-ink truncate">
                        <span className="font-mono text-xs text-sa-green-ink/40 mr-1.5">{i + 1}.</span>
                        {t.nombre}
                      </p>
                      <p className="font-mono text-sm font-bold text-sa-green-ink shrink-0">{t.cantidad}</p>
                    </div>
                    <div className="h-1.5 bg-sa-cream-soft rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${i === 0 ? 'bg-sa-banana' : i < 3 ? 'bg-sa-green' : 'bg-sa-green/40'}`}
                        style={{ width: `${(t.cantidad / maxTop) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {panel.top_productos.length === 0 && (
                  <p className="text-sm text-sa-green-ink/50 py-6 text-center">Aún no hay ventas hoy.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ lbl, val, sub, accent }: { lbl: string; val: string; sub?: string; accent: string }) {
  return (
    <div className="bg-white rounded-sa p-5 shadow-sa-sm border border-sa-green-ink/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-sa-green-ink/60 font-mono uppercase tracking-wide">{lbl}</span>
        <span className={`w-2.5 h-2.5 rounded-full bg-current ${accent}`} />
      </div>
      <p className="font-display text-2xl text-sa-green-ink leading-none">{val}</p>
      {sub && <p className="text-xs text-sa-green-ink/50 mt-1.5">{sub}</p>}
    </div>
  )
}
