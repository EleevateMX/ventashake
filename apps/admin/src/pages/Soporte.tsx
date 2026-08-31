import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  reportesSoporte, priorizarReporte, cerrarReporte, anotarReporte,
  autopruebaPos, revisarSistema, listarImpresoras,
  type ReporteSoporte, type PasoAutoprueba, type RevisionSistema, type ImpresoraAdmin,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, cx } from '../ui'

/**
 * La consola de quien mantiene el sistema. NO es para la tienda.
 *
 * Admin lo usan los dueños: precios, empleados, ventas. Esta pestaña es la
 * otra mitad del trabajo —la que se hace con el código en la mano— y por eso
 * solo aparece para el rol `admin`. La gerencia ni la ve.
 *
 * La diferencia con "Peticiones" no es de permisos, es de para qué sirve:
 *   · Peticiones responde "¿qué quiere la tienda?".
 *   · Esto responde "¿qué me llevo a la próxima sesión, y con qué contexto?".
 *
 * Por eso lo importante aquí es el botón de abajo: arma el **brief** —el
 * estado del sistema, los tickets marcados y sus notas— en un bloque de
 * texto listo para pegar. La sesión empieza con todo escrito en vez de
 * empezar por reconstruir de memoria qué había quedado pendiente.
 */

const PRIORIDAD_TXT: Record<number, string> = { 1: 'Ahora', 2: 'Pronto', 3: 'Algún día' }

export default function Soporte() {
  const [lista, setLista] = useState<ReporteSoporte[] | null>(null)
  const [impresoras, setImpresoras] = useState<ImpresoraAdmin[]>([])
  const [revision, setRevision] = useState<RevisionSistema[] | null>(null)
  const [prueba, setPrueba] = useState<PasoAutoprueba[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [respuesta, setRespuesta] = useState<Record<string, string>>({})
  const [verCerradas, setVerCerradas] = useState(false)

  async function cargar() {
    try {
      const [r, i, v] = await Promise.all([
        reportesSoporte(sb, 100), listarImpresoras(sb), revisarSistema(sb),
      ])
      setLista(r)
      setImpresoras(i.filter((x) => x.activa))
      setRevision(v)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  const abiertas = useMemo(() => (lista ?? []).filter((r) => r.estado !== 'cerrado'), [lista])
  const sesion = useMemo(() => abiertas.filter((r) => r.para_sesion), [abiertas])
  const vistas = verCerradas ? (lista ?? []) : abiertas

  async function tocar(id: string, fn: () => Promise<void>, aviso?: string) {
    setOcupado(id); setError(null); setOk(null)
    try { await fn(); if (aviso) setOk(aviso); await cargar() }
    catch (e) { setError(mensajeDeError(e)) }
    finally { setOcupado(null) }
  }

  /**
   * El brief. Todo lo que hace falta para retomar, en texto plano.
   *
   * Se copia al portapapeles porque el destino es un chat, no otra pantalla:
   * cualquier cosa más elaborada (un enlace, un archivo) añade un paso donde
   * no hace falta ninguno.
   */
  function brief(): string {
    const l: string[] = []
    l.push('# Sesión Shakeaholic — ' + new Date().toLocaleString('es-MX'))
    l.push('')
    l.push('## Cómo está el sistema')
    for (const v of revision ?? []) {
      l.push(`- ${v.ok ? 'OK ' : '!! '} ${v.area}: ${v.detalle}${v.ok ? '' : ` → ${v.que_hacer}`}`)
    }
    for (const i of impresoras) {
      l.push(`- ${i.conectada ? 'OK ' : '!! '} ${i.nombre}: agente ${i.agente_version ?? '?'}`)
    }
    if (prueba) {
      l.push('')
      l.push('## Venta de prueba')
      for (const p of prueba) l.push(`- ${p.ok ? 'OK ' : '!! '} ${p.paso}: ${p.detalle}`)
    }
    l.push('')
    l.push(`## Para esta sesión (${sesion.length})`)
    if (sesion.length === 0) l.push('- (nada marcado)')
    for (const r of sesion) {
      l.push(`- [${r.tipo}] ${PRIORIDAD_TXT[r.prioridad ?? 0] ?? 'sin prioridad'} — ${r.sintoma}`)
      if (r.notas_internas) l.push(`      nota: ${r.notas_internas}`)
    }
    const resto = abiertas.filter((r) => !r.para_sesion)
    if (resto.length > 0) {
      l.push('')
      l.push(`## Abierto pero no marcado (${resto.length})`)
      for (const r of resto) l.push(`- [${r.tipo}] ${r.sintoma}`)
    }
    return l.join('\n')
  }

  async function copiarBrief() {
    const txt = brief()
    try {
      await navigator.clipboard.writeText(txt)
      setOk('Brief copiado. Pégalo al abrir la sesión.')
    } catch {
      // clipboard falla en http o sin permiso: se enseña para copiar a mano
      // en vez de dejar un botón que no hace nada.
      setError('No se pudo copiar solo. Selecciónalo del cuadro de abajo.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Soporte"
        subtitle="La consola de quien mantiene el sistema. La tienda no ve esta pestaña."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <Panel title="Antes de empezar">
        <div className="flex flex-wrap gap-3">
          <button
            className={cx.btnPrimary}
            disabled={ocupado === 'prueba'}
            onClick={() => void tocar('prueba', async () => { setPrueba(await autopruebaPos(sb)) })}
          >
            {ocupado === 'prueba' ? 'Probando…' : 'Probar una venta'}
          </button>
          <button
            className="border border-sa-green-ink/20 text-sa-green-ink px-5 py-2.5 rounded-full text-sm hover:border-sa-green transition-colors"
            onClick={() => void copiarBrief()}
          >
            Copiar brief de la sesión
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 mt-5">
          {(revision ?? []).map((v, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className={v.ok ? 'text-sa-green' : 'text-sa-strawberry'}>{v.ok ? '✓' : '✕'}</span>
              <span className="text-sa-green-ink/80">{v.area}</span>
              <span className="text-sa-green-ink/45 ml-auto font-mono text-xs text-right">{v.detalle}</span>
            </div>
          ))}
          {impresoras.map((i) => (
            <div key={i.id} className="flex items-start gap-2 text-sm">
              <span className={i.conectada ? 'text-sa-green' : 'text-sa-strawberry'}>{i.conectada ? '✓' : '✕'}</span>
              <span className="text-sa-green-ink/80">{i.nombre}</span>
              <span className="text-sa-green-ink/45 ml-auto font-mono text-xs">{i.agente_version ?? '?'}</span>
            </div>
          ))}
        </div>

        {prueba && (
          <div className="mt-5 space-y-1">
            {prueba.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={p.ok ? 'text-sa-green' : 'text-sa-strawberry'}>{p.ok ? '✓' : '✕'}</span>
                <span className="text-sa-green-ink/80 flex-1">{p.paso}</span>
                <span className="font-mono text-xs text-sa-green-ink/45">{p.detalle}</span>
              </div>
            ))}
          </div>
        )}

        <details className="mt-5">
          <summary className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/45 cursor-pointer">
            Ver el brief en texto
          </summary>
          <pre className="mt-2 bg-white border border-sa-green-ink/10 rounded-sa p-4 text-xs overflow-x-auto whitespace-pre-wrap text-sa-green-ink/80">
            {brief()}
          </pre>
        </details>
      </Panel>

      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className={cx.h3}>
          Tickets · {sesion.length} para esta sesión, {abiertas.length} abiertos
        </h3>
        <button
          onClick={() => setVerCerradas(!verCerradas)}
          className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/45 hover:text-sa-green-ink"
        >
          {verCerradas ? 'Ocultar cerrados' : 'Ver cerrados'}
        </button>
      </div>

      {!lista && !error && <Loading>Cargando…</Loading>}

      <div className="space-y-3">
        {vistas.map((r) => (
          <Panel key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/45">
                  {new Date(r.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  {' · '}{r.quien}{' · '}{r.tipo}
                  {r.prioridad ? ` · ${PRIORIDAD_TXT[r.prioridad]}` : ''}
                  {(r.contexto?.origen as string) ? ` · ${r.contexto.origen as string}` : ''}
                </p>
                <p className="text-sa-green-ink mt-1 leading-relaxed">{r.sintoma}</p>
                {(r.contexto?.nota as string) && (
                  <p className="text-sm text-sa-green-ink/55 mt-1 leading-relaxed">{r.contexto.nota as string}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.para_sesion && r.estado !== 'cerrado' && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sa-green text-sa-cream">
                    Sesión
                  </span>
                )}
                {r.estado === 'cerrado' && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sa-mint/30 text-sa-green-ink">
                    Cerrado
                  </span>
                )}
              </div>
            </div>

            {/* La foto que se guardo al reportar. Plegada: casi nunca hace
                falta, y cuando hace falta es lo unico que importa. */}
            {Array.isArray(r.contexto?.revision) && (r.contexto.revision as unknown[]).length > 0 && (
              <details className="mt-3">
                <summary className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40 cursor-pointer">
                  Cómo estaba el sistema cuando lo reportaron
                </summary>
                <pre className="mt-2 bg-white border border-sa-green-ink/10 rounded-sa p-3 text-[11px] overflow-x-auto text-sa-green-ink/70">
                  {JSON.stringify(r.contexto, null, 2)}
                </pre>
              </details>
            )}

            {r.estado !== 'cerrado' && (
              <div className="mt-4 pt-4 border-t border-sa-green-ink/10 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[1, 2, 3].map((p) => (
                    <button
                      key={p}
                      disabled={ocupado === r.id}
                      onClick={() => void tocar(r.id, () => priorizarReporte(sb, r.id, { prioridad: p }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                        r.prioridad === p
                          ? 'bg-sa-green-ink text-sa-cream'
                          : 'bg-white border border-sa-green-ink/15 text-sa-green-ink/50'
                      }`}
                    >
                      {PRIORIDAD_TXT[p]}
                    </button>
                  ))}
                  <button
                    disabled={ocupado === r.id}
                    onClick={() => void tocar(r.id, () => priorizarReporte(sb, r.id, { paraSesion: !r.para_sesion }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                      r.para_sesion
                        ? 'bg-sa-green text-sa-cream'
                        : 'bg-white border border-sa-green-ink/15 text-sa-green-ink/50'
                    }`}
                  >
                    {r.para_sesion ? '✓ En la sesión' : 'Meter a la sesión'}
                  </button>
                </div>

                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40">
                    Nota de trabajo — no la ve la tienda
                  </span>
                  <textarea
                    className={`${cx.input} mt-1 min-h-[60px] text-sm`}
                    placeholder="Dónde está el problema, qué hay que tocar, qué ya se descartó."
                    value={notas[r.id] ?? r.notas_internas ?? ''}
                    onChange={(e) => setNotas({ ...notas, [r.id]: e.target.value })}
                    onBlur={() => {
                      const v = notas[r.id]
                      if (v !== undefined && v !== (r.notas_internas ?? '')) {
                        void tocar(r.id, () => anotarReporte(sb, r.id, v))
                      }
                    }}
                  />
                </div>

                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/40">
                    Respuesta — esta sí la lee quien lo pidió
                  </span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <input
                      className={`${cx.input} flex-1 min-w-[240px] text-sm`}
                      placeholder="Qué se hizo."
                      value={respuesta[r.id] ?? ''}
                      onChange={(e) => setRespuesta({ ...respuesta, [r.id]: e.target.value })}
                    />
                    <button
                      className={cx.btnPrimary}
                      disabled={ocupado === r.id || (respuesta[r.id] ?? '').trim().length < 5}
                      onClick={() => void tocar(r.id, async () => {
                        await cerrarReporte(sb, r.id, (respuesta[r.id] ?? '').trim())
                        setRespuesta({ ...respuesta, [r.id]: '' })
                      }, 'Cerrado. Quien lo pidió ya ve la respuesta.')}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {r.estado === 'cerrado' && r.respuesta && (
              <p className="text-sm text-sa-green-ink/70 mt-3 border-l-2 border-sa-green/30 pl-3 leading-relaxed">
                {r.respuesta}
              </p>
            )}
          </Panel>
        ))}
      </div>
    </div>
  )
}
