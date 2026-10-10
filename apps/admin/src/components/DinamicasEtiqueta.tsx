import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  dinamicasAdmin, guardarDinamica, activarDinamica, abrirRondaDinamica, entregarPremioDinamica,
  probarFrase, listarImpresoras, frasesAdmin,
  type DinamicaEtiqueta, type ResultadoDinamica, type ImpresoraAdmin,
} from '@shake/supabase'
import { mensajeDeError, limpiarFrase, renglonesFrase, problemaDeFrase } from '@shake/utils'
import { Panel, ErrorMsg, OkMsg, cx, Chip } from '../ui'

/**
 * Admin → Impresoras → Dinámicas con premios (10/10/26, «Trick or Shake»).
 *
 * La etiqueta del vaso hace de boleto: en la PRIMERA etiqueta de cada compra
 * con bebida, donde va la frase, sale el resultado con su folio. Cada ronda
 * se baraja completa en la base al abrirse, así que las cantidades son
 * exactas (ni una taza de más ni una de menos) y nadie —ni gerencia— ve qué
 * posición trae qué: aquí solo se ven conteos y lo que ya salió.
 *
 * Una reimpresión repite el mismo resultado sin gastar otro boleto. Al
 * acabarse la ronda se cierra sola; la siguiente se abre con un botón.
 */

const AGENTE_CON_DINAMICAS = '1.6.0'

function versionMenor(v: string | null, minima: string): boolean {
  if (!v) return true
  const a = v.split('.').map(Number)
  const b = minima.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}

const hora = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Merida', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—'

/** La que pidió gerencia, para no capturarla a mano. */
const TRICK_OR_SHAKE: Omit<DinamicaEtiqueta, 'id' | 'activa' | 'problema' | 'rondas' | 'premios' | 'estacion'> = {
  nombre: 'Halloween · Trick or Shake',
  desde: null, hasta: null,
  rondas_max: 3, tamano_ronda: 150,
  principal_desde: 100, principal_hasta: 150,
  resultados: [
    { nombre: 'TRICK', texto: 'TRICK! Sigue intentando', cantidad: 139, es_premio: false, es_principal: false, milo: false, orden: 1 },
    { nombre: 'LITTLE TREAT', texto: 'LITTLE TREAT Pide tu premio', cantidad: 10, es_premio: true, es_principal: false, milo: false, orden: 2 },
    { nombre: 'BIG TREAT', texto: 'BIG TREAT! Ganaste taza', cantidad: 1, es_premio: true, es_principal: true, milo: true, orden: 3 },
  ],
}

/** Cómo se verá en la etiqueta: dos renglones de 14, y el folio junto a la fecha. */
function Previa({ texto, milo }: { texto: string; milo: boolean }) {
  const renglones = renglonesFrase(limpiarFrase(texto))
  return (
    <div className="inline-flex items-center gap-3 rounded border border-dashed border-sa-green-ink/30 bg-white px-3 py-2">
      <div className="font-mono text-sm leading-tight text-sa-green-ink">
        {(renglones.length ? renglones : ['—']).map((r, i) => (
          <div key={i} className={i >= 2 ? 'text-red-600' : ''}>{r.padEnd(14, ' ')}</div>
        ))}
        <div className="text-[10px] text-sa-green-ink/50 mt-1">31/10 14:35  R1-047</div>
      </div>
      {milo && <img src="/milo-transparent.png" alt="Milo" className="h-10 w-auto opacity-80" />}
    </div>
  )
}

type Borrador = Omit<DinamicaEtiqueta, 'id' | 'activa' | 'problema' | 'rondas' | 'premios' | 'estacion'> & { id?: string }

function Editor({ inicial, yaEmpezo, onGuardada, onCancelar }: {
  inicial: Borrador
  yaEmpezo: boolean
  onGuardada: () => void
  onCancelar: () => void
}) {
  const [d, setD] = useState<Borrador>(inicial)
  const [conRango, setConRango] = useState(inicial.principal_desde != null || inicial.principal_hasta != null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const suma = d.resultados.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)
  const cuadra = suma === Number(d.tamano_ronda)
  const problemas = d.resultados.map((r) => problemaDeFrase(limpiarFrase(r.texto)))
  const premios = d.resultados.filter((r) => r.es_premio).reduce((s, r) => s + (Number(r.cantidad) || 0), 0)
  const principales = d.resultados.filter((r) => r.es_principal).reduce((s, r) => s + (Number(r.cantidad) || 0), 0)

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setD((x) => ({ ...x, [k]: v }))
  const setRes = (i: number, cambios: Partial<ResultadoDinamica>) =>
    setD((x) => ({ ...x, resultados: x.resultados.map((r, j) => (j === i ? { ...r, ...cambios } : r)) }))

  async function guardar() {
    setError(null)
    if (!d.nombre.trim()) { setError('Ponle nombre.'); return }
    if (problemas.some(Boolean)) { setError('Algún texto no cabe en la etiqueta (dos renglones de 14).'); return }
    setGuardando(true)
    try {
      await guardarDinamica(sb, {
        ...d,
        resultados: d.resultados.map((r, i) => ({ ...r, texto: limpiarFrase(r.texto), orden: i + 1 })),
        principal_desde: conRango ? d.principal_desde : null,
        principal_hasta: conRango ? d.principal_hasta : null,
      })
      onGuardada()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-3 rounded-sa border border-sa-green-ink/15 bg-sa-cream-soft/40 p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Nombre
          <input className={`${cx.input} mt-1`} value={d.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Desde
            <input type="date" className={`${cx.input} mt-1`} value={d.desde ?? ''} onChange={(e) => set('desde', e.target.value || null)} />
          </label>
          <label className="block text-sm">Hasta
            <input type="date" className={`${cx.input} mt-1`} value={d.hasta ?? ''} onChange={(e) => set('hasta', e.target.value || null)} />
          </label>
        </div>
        <label className="block text-sm">Número de rondas
          <input type="number" min={1} max={50} className={`${cx.input} mt-1`} value={d.rondas_max}
            onChange={(e) => set('rondas_max', Number(e.target.value) || 1)} />
        </label>
        <label className="block text-sm">Etiquetas por ronda
          <input type="number" min={1} max={5000} className={`${cx.input} mt-1`} value={d.tamano_ronda}
            onChange={(e) => set('tamano_ronda', Number(e.target.value) || 0)} />
        </label>
      </div>

      {yaEmpezo && (
        <p className="text-xs text-amber-900 bg-amber-100 rounded-sa px-3 py-2">
          La ronda abierta ya está barajada: si cambias cantidades, aplican a la siguiente ronda. Los textos
          sí cambian desde ya en lo que falta por salir.
        </p>
      )}

      <div>
        <p className="text-sm font-semibold text-sa-green-ink">Resultados por ronda</p>
        <div className="mt-2 space-y-3">
          {d.resultados.map((r, i) => (
            <div key={r.id ?? `n${i}`} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_90px] items-start">
              <input className={cx.input} value={r.nombre} placeholder="TRICK"
                onChange={(e) => setRes(i, { nombre: e.target.value })} />
              <div>
                <input className={cx.input} value={r.texto} placeholder="Lo que sale en la etiqueta"
                  onChange={(e) => setRes(i, { texto: e.target.value })} />
                {problemas[i] && <p className="text-xs text-red-600 mt-1">{problemas[i]}</p>}
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <Previa texto={r.texto} milo={r.milo} />
                  <label className="text-xs flex items-center gap-1">
                    <input type="checkbox" checked={r.es_premio} onChange={(e) => setRes(i, { es_premio: e.target.checked })} /> Es premio
                  </label>
                  <label className="text-xs flex items-center gap-1">
                    <input type="checkbox" checked={r.es_principal}
                      onChange={(e) => setRes(i, { es_principal: e.target.checked, es_premio: e.target.checked || r.es_premio })} /> Premio mayor
                  </label>
                  <label className="text-xs flex items-center gap-1">
                    <input type="checkbox" checked={r.milo} onChange={(e) => setRes(i, { milo: e.target.checked })} /> Con Milo
                  </label>
                  {d.resultados.length > 1 && (
                    <button className="text-xs text-red-600" onClick={() => setD((x) => ({ ...x, resultados: x.resultados.filter((_, j) => j !== i) }))}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
              <input type="number" min={0} className={cx.input} value={r.cantidad}
                onChange={(e) => setRes(i, { cantidad: Number(e.target.value) || 0 })} />
            </div>
          ))}
        </div>
        <button className={`${cx.btnSec} mt-3`} onClick={() => setD((x) => ({
          ...x, resultados: [...x.resultados, { nombre: '', texto: '', cantidad: 0, es_premio: false, es_principal: false, milo: false, orden: x.resultados.length + 1 }],
        }))}>+ Otro resultado</button>
        <p className="mt-3 text-sm">
          Total configurado:{' '}
          <b className={cuadra ? 'text-green-700' : 'text-red-600'}>{suma} / {d.tamano_ronda}</b>
          {!cuadra && <span className="text-red-600"> — tienen que sumar lo mismo que la ronda</span>}
        </p>
      </div>

      <div>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={conRango} onChange={(e) => {
            setConRango(e.target.checked)
            if (e.target.checked && d.principal_desde == null) setD((x) => ({ ...x, principal_desde: Math.max(1, Math.round(x.tamano_ronda * 2 / 3)), principal_hasta: x.tamano_ronda }))
          }} />
          El premio mayor solo puede salir entre ciertas participaciones
        </label>
        {conRango && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            entre la
            <input type="number" min={1} className={`${cx.input} w-24`} value={d.principal_desde ?? ''}
              onChange={(e) => set('principal_desde', Number(e.target.value) || null)} />
            y la
            <input type="number" min={1} className={`${cx.input} w-24`} value={d.principal_hasta ?? ''}
              onChange={(e) => set('principal_hasta', Number(e.target.value) || null)} />
            <span className={cx.muted}>de cada ronda. Los demás premios, en toda la ronda.</span>
          </div>
        )}
      </div>

      <div className="rounded-sa bg-white border border-sa-green-ink/10 px-3 py-2 text-sm">
        <b>Resumen:</b> {d.rondas_max * d.tamano_ronda} participaciones · {d.rondas_max * (premios - principales)} premios
        {' '}· {d.rondas_max * principales} premio{d.rondas_max * principales === 1 ? '' : 's'} mayor{d.rondas_max * principales === 1 ? '' : 'es'}.
        {' '}Una por compra con bebida; el resultado va en la primera etiqueta y no se repite al reimprimir.
      </div>

      {error && <ErrorMsg>{error}</ErrorMsg>}
      <div className="flex gap-2">
        <button className={cx.btnPrimary} disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button className={cx.btnSec} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

export function DinamicasEtiqueta() {
  const [lista, setLista] = useState<DinamicaEtiqueta[] | null>(null)
  const [impresoras, setImpresoras] = useState<ImpresoraAdmin[]>([])
  const [agentesViejos, setAgentesViejos] = useState<string[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargar = () => dinamicasAdmin(sb).then(setLista).catch((e) => setError(mensajeDeError(e)))
  useEffect(() => {
    void cargar()
    listarImpresoras(sb).then((l) => setImpresoras(l.filter((i) => i.activa))).catch(() => {})
    frasesAdmin(sb).then((f) => setAgentesViejos(f.agentes.filter((a) => versionMenor(a.version, AGENTE_CON_DINAMICAS)).map((a) => a.nombre))).catch(() => {})
  }, [])

  const avisar = (m: string) => { setOk(m); setTimeout(() => setOk(null), 5000) }
  async function accion(f: () => Promise<unknown>, msg: string) {
    setError(null)
    try { await f(); avisar(msg); await cargar() } catch (e) { setError(mensajeDeError(e)) }
  }

  if (!lista) return error ? <ErrorMsg>{error}</ErrorMsg> : <p className={cx.muted}>Cargando dinámicas…</p>

  const barra = impresoras.find((i) => /barra|bebida/i.test(i.nombre)) ?? impresoras[0]

  return (
    <Panel className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-sa-green-ink">Dinámicas con premios</h2>
          <p className={`${cx.muted} text-sm mt-1 max-w-2xl`}>
            La etiqueta del vaso como boleto: en la primera etiqueta de cada compra con bebida sale el resultado,
            con su folio, en lugar de la frase. Las cantidades por ronda son exactas y el orden es al azar; nadie
            ve qué sigue. Al reimprimir sale el mismo resultado sin gastar otro.
          </p>
        </div>
        <button className={cx.btnPrimary} onClick={() => setEditando('nueva')}>+ Nueva dinámica</button>
      </div>

      {agentesViejos.length > 0 && (
        <p className="mt-3 rounded-sa bg-amber-100 text-amber-900 px-3 py-2 text-sm">
          {agentesViejos.join(', ')}: el programa de la PC es anterior a la {AGENTE_CON_DINAMICAS} y todavía no imprime
          el resultado (sale la frase de siempre). Se actualiza solo al abrir la tienda: no prendas la dinámica hasta
          que diga {AGENTE_CON_DINAMICAS}.
        </p>
      )}
      {ok && <div className="mt-3"><OkMsg>{ok}</OkMsg></div>}
      {error && <div className="mt-3"><ErrorMsg>{error}</ErrorMsg></div>}

      {editando === 'nueva' && (
        <Editor inicial={{ ...TRICK_OR_SHAKE }} yaEmpezo={false}
          onGuardada={() => { setEditando(null); avisar('Guardada. Préndela cuando quieras que empiece.'); void cargar() }}
          onCancelar={() => setEditando(null)} />
      )}

      {lista.length === 0 && editando !== 'nueva' && (
        <p className={`${cx.muted} text-sm mt-4`}>Todavía no hay ninguna. «Nueva dinámica» trae lista la de Trick or Shake.</p>
      )}

      <div className="mt-4 space-y-5">
        {lista.map((d) => {
          const ultima = d.rondas[d.rondas.length - 1]
          const puedeAbrir = d.rondas.length > 0 && ultima?.cerrada_en && d.rondas.length < d.rondas_max
          return (
            <section key={d.id} className="rounded-sa border border-sa-green-ink/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg text-sa-green-ink">{d.nombre}</h3>
                <Chip tone={d.activa ? 'si' : 'neutral'}>{d.activa ? 'Prendida' : 'Apagada'}</Chip>
                <span className={`${cx.muted} text-xs`}>
                  {d.desde || d.hasta ? `${d.desde ?? '…'} → ${d.hasta ?? '…'}` : 'sin fechas'} · {d.rondas_max} ronda{d.rondas_max === 1 ? '' : 's'} de {d.tamano_ronda}
                  {d.principal_desde != null ? ` · premio mayor entre la ${d.principal_desde} y la ${d.principal_hasta ?? d.tamano_ronda}` : ''}
                </span>
                <div className="flex-1" />
                <button className={cx.btnSec} onClick={() => setEditando(editando === d.id ? null : d.id)}>Editar</button>
                <button className={d.activa ? cx.btnSec : cx.btnPrimary} disabled={!d.activa && !!d.problema}
                  onClick={() => void accion(() => activarDinamica(sb, d.id, !d.activa), d.activa ? 'Apagada: vuelven las frases.' : 'Prendida: la siguiente compra con bebida ya participa.')}>
                  {d.activa ? 'Apagar' : 'Prender'}
                </button>
              </div>
              {d.problema && <p className="text-sm text-red-600 mt-2">{d.problema}</p>}

              {editando === d.id && (
                <Editor inicial={{
                  id: d.id, nombre: d.nombre, desde: d.desde, hasta: d.hasta, rondas_max: d.rondas_max,
                  tamano_ronda: d.tamano_ronda, principal_desde: d.principal_desde, principal_hasta: d.principal_hasta,
                  resultados: d.resultados,
                }} yaEmpezo={d.rondas.length > 0}
                  onGuardada={() => { setEditando(null); avisar('Guardada.'); void cargar() }}
                  onCancelar={() => setEditando(null)} />
              )}

              {/* Probar en papel: el texto de cada resultado, como saldrá. */}
              {barra && (
                <div className="mt-3 flex flex-wrap gap-2 items-center text-xs">
                  <span className={cx.muted}>Probar en {barra.nombre} · gasta 1:</span>
                  {d.resultados.filter((r) => r.cantidad > 0).map((r) => (
                    <button key={r.id} className={cx.btnSec}
                      onClick={() => void accion(() => probarFrase(sb, barra.id, r.texto, r.milo), `Mandada la prueba de ${r.nombre}.`)}>
                      {r.nombre}
                    </button>
                  ))}
                </div>
              )}

              {d.rondas.length > 0 && (
                <div className="mt-4 space-y-2">
                  {d.rondas.map((ro) => (
                    <div key={ro.numero} className="text-sm">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <b>Ronda {ro.numero}</b>
                        <span>{ro.asignados} de {ro.total} participaciones</span>
                        <span className={cx.muted}>· quedan {ro.total - ro.asignados}</span>
                        <span className={cx.muted}>· {ro.cerrada_en ? `cerrada ${hora(ro.cerrada_en)}` : `abierta desde ${hora(ro.abierta_en)}`}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-sa-green-ink/10 overflow-hidden">
                        <div className="h-full bg-sa-green" style={{ width: `${ro.total ? (ro.asignados / ro.total) * 100 : 0}%` }} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        {(ro.por_resultado ?? []).filter((r) => r.total > 0).map((r) => (
                          <span key={r.nombre}>{r.nombre}: <b>{r.salieron}</b> de {r.total}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {puedeAbrir && (
                    <button className={cx.btnPrimary} onClick={() => void accion(() => abrirRondaDinamica(sb, d.id), `Ronda ${d.rondas.length + 1} abierta.`)}>
                      Abrir ronda {d.rondas.length + 1}
                    </button>
                  )}
                  {ultima?.cerrada_en && d.rondas.length >= d.rondas_max && (
                    <p className="text-sm text-green-700">Se completaron todas las rondas.</p>
                  )}
                </div>
              )}

              {d.premios.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-sa-green-ink">Premios que ya salieron</p>
                  <div className={`${cx.tableWrap} mt-2`}>
                    <table className={cx.table}>
                      <thead>
                        <tr className={cx.thead}>
                          <th className={cx.th}>Folio</th>
                          <th className={cx.th}>Premio</th>
                          <th className={cx.th}>Pedido</th>
                          <th className={cx.th}>Cuándo</th>
                          <th className={cx.th}>Entregado</th>
                        </tr>
                      </thead>
                      <tbody className={cx.tbody}>
                        {d.premios.map((p) => (
                          <tr key={p.boleto_id} className={`${cx.tr} ${p.principal ? 'bg-amber-50' : ''}`}>
                            <td className={`${cx.td} font-mono`}>{p.folio}</td>
                            <td className={cx.td}>{p.resultado}</td>
                            <td className={cx.td}>#{p.orden_folio ?? '—'}{p.cliente ? ` · ${p.cliente}` : ''}</td>
                            <td className={cx.td}>{hora(p.asignado_en)}</td>
                            <td className={cx.td}>
                              <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={!!p.entregado_en}
                                  onChange={(e) => void accion(() => entregarPremioDinamica(sb, p.boleto_id, e.target.checked), e.target.checked ? `${p.folio}: entregado.` : `${p.folio}: pendiente otra vez.`)} />
                                {p.entregado_en ? `${hora(p.entregado_en)}${p.entregado_por ? ` · ${p.entregado_por}` : ''}` : 'pendiente'}
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </Panel>
  )
}
