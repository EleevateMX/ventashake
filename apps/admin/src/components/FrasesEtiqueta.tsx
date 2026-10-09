import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  frasesAdmin, guardarFrase, guardarTemporada, probarFrase, listarImpresoras,
  type FrasesAdmin, type FraseEtiqueta, type TemporadaEtiqueta, type ImpresoraAdmin,
} from '@shake/supabase'
import { mensajeDeError, limpiarFrase, renglonesFrase, problemaDeFrase } from '@shake/utils'
import { Panel, ErrorMsg, OkMsg, cx, Chip } from '../ui'

/**
 * Admin → Impresoras → Frases de la etiqueta (09/10/26).
 *
 * Las frases del pie («Nacido para entrenar»…) vivían escritas dentro del
 * agente. Ahora cada una tiene NOMBRE para encontrarla, se agrupan por
 * TEMPORADA (Halloween, Navidad…) y la temporada —o la frase— puede llevar
 * a Milo. Mientras una temporada activa cubra la fecha de hoy, salen solo
 * sus frases; si no, las «de siempre».
 *
 * El agente de la PC las baja cada 10 minutos desde la versión 1.5.0.
 */

const AGENTE_CON_FRASES = '1.5.0'

function versionMenor(v: string | null, minima: string): boolean {
  if (!v) return true
  const a = v.split('.').map(Number)
  const b = minima.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(mmdd: string): string {
  const [m, d] = mmdd.split('-').map(Number)
  return `${d} ${MESES[(m || 1) - 1]}`
}

/** Cómo se verá en la etiqueta: dos renglones de 14. */
function Previa({ texto, milo }: { texto: string; milo: boolean }) {
  const renglones = renglonesFrase(limpiarFrase(texto))
  return (
    <div className="inline-flex items-center gap-3 rounded border border-dashed border-sa-green-ink/30 bg-white px-3 py-2">
      <div className="font-mono text-sm leading-tight text-sa-green-ink">
        {(renglones.length ? renglones : ['—']).map((r, i) => (
          <div key={i} className={i >= 2 ? 'text-red-600' : ''}>{r.padEnd(14, ' ')}</div>
        ))}
      </div>
      {milo && <img src="/milo-transparent.png" alt="Milo" className="h-10 w-auto opacity-80" />}
    </div>
  )
}

function EditorFrase({
  inicial, temporadas, impresoras, onGuardada, onCancelar,
}: {
  inicial: Partial<FraseEtiqueta> & { temporada_id: string | null }
  temporadas: TemporadaEtiqueta[]
  impresoras: ImpresoraAdmin[]
  onGuardada: () => void
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial.nombre ?? '')
  const [texto, setTexto] = useState(inicial.texto ?? '')
  const [temporada, setTemporada] = useState<string>(inicial.temporada_id ?? '')
  const [milo, setMilo] = useState(inicial.con_milo ?? false)
  const [activa, setActiva] = useState(inicial.activa ?? true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [impresora, setImpresora] = useState(impresoras[0]?.id ?? '')
  const limpio = limpiarFrase(texto)
  const problema = problemaDeFrase(limpio)
  const tempMilo = temporadas.find((t) => t.id === temporada)?.con_milo ?? false

  async function guardar(archivar = false) {
    setError(null)
    try {
      await guardarFrase(sb, {
        id: inicial.id ?? null, nombre: nombre.trim() || limpio.slice(0, 40), texto: limpio,
        temporada_id: temporada || null, activa, con_milo: milo, archivar,
      })
      onGuardada()
    } catch (e) { setError(mensajeDeError(e)) }
  }

  async function probar() {
    setError(null)
    try {
      await probarFrase(sb, impresora, limpio, milo || tempMilo)
      setAviso('Sale en la impresora en unos segundos (gasta 1 etiqueta).')
      setTimeout(() => setAviso(null), 6000)
    } catch (e) { setError(mensajeDeError(e)) }
  }

  return (
    <div className="rounded-sa border border-sa-green-ink/15 bg-sa-cream-soft p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className={`${cx.muted} block text-xs mb-1`}>Nombre (para encontrarla)</span>
          <input id="frase-nombre" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Halloween – calabaza" className={`${cx.input} !py-2 w-full`} />
        </label>
        <label className="text-sm">
          <span className={`${cx.muted} block text-xs mb-1`}>Temporada</span>
          <select id="frase-temporada" value={temporada} onChange={(e) => setTemporada(e.target.value)} className={`${cx.input} !py-2 w-full`}>
            <option value="">De siempre</option>
            {temporadas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
      </div>
      <label className="text-sm block">
        <span className={`${cx.muted} block text-xs mb-1`}>Frase (dos renglones de 14 letras; sin acentos)</span>
        <input id="frase-texto" value={texto} maxLength={40} onChange={(e) => setTexto(e.target.value)} placeholder="Boo! Feliz Halloween" className={`${cx.input} !py-2 w-full font-mono`} />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <Previa texto={texto} milo={milo || tempMilo} />
        <label className="text-sm inline-flex items-center gap-2">
          <input id="frase-milo" type="checkbox" checked={milo} onChange={(e) => setMilo(e.target.checked)} />
          Con Milo{tempMilo && !milo ? ' (ya lo pone la temporada)' : ''}
        </label>
        <label className="text-sm inline-flex items-center gap-2">
          <input id="frase-activa" type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Prendida
        </label>
      </div>
      {texto && limpio !== texto.trim() && (
        <p className={`${cx.muted} text-xs`}>Se guardará como «{limpio}»: la impresora no tiene acentos.</p>
      )}
      {problema && texto.trim() && <p className="text-sm text-red-600">{problema}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}
      <div className="flex flex-wrap gap-2 items-center">
        <button className={cx.btnPrimary} disabled={!!problema} onClick={() => void guardar()}>Guardar</button>
        <button className={cx.btnSec} onClick={onCancelar}>Cancelar</button>
        {impresoras.length > 0 && (
          <span className="inline-flex items-center gap-2 ml-auto">
            <select id="frase-impresora" value={impresora} onChange={(e) => setImpresora(e.target.value)} className={`${cx.input} !py-1.5 text-sm`}>
              {impresoras.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
            <button className={`${cx.btnSec} whitespace-nowrap`} disabled={!!problema || !impresora} onClick={() => void probar()}>Probar · gasta 1</button>
          </span>
        )}
        {inicial.id && (
          <button className="text-xs text-red-600 underline" onClick={() => void guardar(true)}>Quitar frase</button>
        )}
      </div>
    </div>
  )
}

function EditorTemporada({
  inicial, onGuardada, onCancelar,
}: { inicial: Partial<TemporadaEtiqueta>; onGuardada: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(inicial.nombre ?? '')
  const [desde, setDesde] = useState(inicial.desde ?? '')
  const [hasta, setHasta] = useState(inicial.hasta ?? '')
  const [milo, setMilo] = useState(inicial.con_milo ?? true)
  const [activa, setActiva] = useState(inicial.activa ?? false)
  const [error, setError] = useState<string | null>(null)
  const ok = /^\d{2}-\d{2}$/.test(desde) && /^\d{2}-\d{2}$/.test(hasta) && nombre.trim()

  async function guardar() {
    setError(null)
    try {
      await guardarTemporada(sb, { id: inicial.id ?? null, nombre: nombre.trim(), desde, hasta, activa, con_milo: milo })
      onGuardada()
    } catch (e) { setError(mensajeDeError(e)) }
  }

  return (
    <div className="rounded-sa border border-sa-green-ink/15 bg-sa-cream-soft p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className={`${cx.muted} block text-xs mb-1`}>Temporada</span>
          <input id="temp-nombre" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} placeholder="Día de muertos" className={`${cx.input} !py-2 w-full`} />
        </label>
        <label className="text-sm">
          <span className={`${cx.muted} block text-xs mb-1`}>Desde (mes-día)</span>
          <input id="temp-desde" value={desde} maxLength={5} onChange={(e) => setDesde(e.target.value)} placeholder="10-28" className={`${cx.input} !py-2 w-full font-mono`} />
        </label>
        <label className="text-sm">
          <span className={`${cx.muted} block text-xs mb-1`}>Hasta (mes-día)</span>
          <input id="temp-hasta" value={hasta} maxLength={5} onChange={(e) => setHasta(e.target.value)} placeholder="11-02" className={`${cx.input} !py-2 w-full font-mono`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2"><input id="temp-milo" type="checkbox" checked={milo} onChange={(e) => setMilo(e.target.checked)} /> Todas sus frases con Milo</label>
        <label className="inline-flex items-center gap-2"><input id="temp-activa" type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Prendida</label>
      </div>
      <p className={`${cx.muted} text-xs`}>
        Puede cruzar el año: del 12-01 al 01-06 es diciembre y la primera semana de enero.
        Una temporada prendida sin frases no cambia nada.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className={cx.btnPrimary} disabled={!ok} onClick={() => void guardar()}>Guardar</button>
        <button className={cx.btnSec} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

export function FrasesEtiqueta() {
  const [datos, setDatos] = useState<FrasesAdmin | null>(null)
  const [impresoras, setImpresoras] = useState<ImpresoraAdmin[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  /** Qué se está editando: una frase (id o 'nueva:<temporada>') o una temporada. */
  const [editando, setEditando] = useState<string | null>(null)

  const cargar = () =>
    frasesAdmin(sb).then(setDatos).catch((e) => setError(mensajeDeError(e)))
  useEffect(() => {
    void cargar()
    listarImpresoras(sb).then((l) => setImpresoras(l.filter((i) => i.activa))).catch(() => {})
  }, [])

  const listo = () => { setEditando(null); setOk('Guardado. La impresora lo toma en menos de 10 minutos.'); setTimeout(() => setOk(null), 5000); void cargar() }

  const grupos = useMemo(() => {
    if (!datos) return []
    const deSiempre = { id: '', nombre: 'De siempre', temporada: null as TemporadaEtiqueta | null }
    return [deSiempre, ...datos.temporadas.map((t) => ({ id: t.id, nombre: t.nombre, temporada: t }))]
  }, [datos])

  if (!datos) return error ? <ErrorMsg>{error}</ErrorMsg> : <p className={cx.muted}>Cargando frases…</p>

  // ¿Qué sale HOY? La primera temporada prendida que cubre hoy y tiene frases.
  const vigente = datos.temporadas.find((t) =>
    t.activa && t.cubre_hoy && datos.frases.some((f) => f.temporada_id === t.id && f.activa))
  const agentesViejos = datos.agentes.filter((a) => versionMenor(a.version, AGENTE_CON_FRASES))

  return (
    <Panel className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-sa-green-ink">Frases de la etiqueta</h2>
          <p className={`${cx.muted} text-sm mt-1 max-w-2xl`}>
            Lo que sale al pie de cada etiqueta. Cada frase lleva un nombre para encontrarla; las de una
            temporada salen solo en sus fechas y, si quieres, con Milo.
          </p>
        </div>
        <p className="text-sm">
          Hoy sale: <b>{vigente ? `temporada ${vigente.nombre}` : 'las de siempre'}</b>
        </p>
      </div>

      {agentesViejos.length > 0 && (
        <p className="mt-3 rounded-sa bg-amber-100 text-amber-900 px-3 py-2 text-sm">
          {agentesViejos.map((a) => a.nombre).join(', ')}: el programa de la PC es anterior a la versión
          {' '}{AGENTE_CON_FRASES} y sigue imprimiendo las frases de siempre. Se actualiza solo al abrir la tienda.
        </p>
      )}
      {ok && <div className="mt-3"><OkMsg>{ok}</OkMsg></div>}
      {error && <div className="mt-3"><ErrorMsg>{error}</ErrorMsg></div>}

      <div className="mt-4 space-y-6">
        {grupos.map((g) => {
          const frases = datos.frases.filter((f) => (f.temporada_id ?? '') === g.id)
          const t = g.temporada
          return (
            <section key={g.id || 'siempre'}>
              <div className="flex flex-wrap items-center gap-2 border-b border-sa-green-ink/10 pb-2">
                <h3 className="font-semibold text-sa-green-ink">{g.nombre}</h3>
                {t && <span className={`${cx.muted} text-xs`}>{fechaCorta(t.desde)} – {fechaCorta(t.hasta)}</span>}
                {t && <Chip tone={t.activa ? 'si' : 'neutral'}>{t.activa ? 'prendida' : 'apagada'}</Chip>}
                {t?.con_milo && <Chip tone="neutral">con Milo</Chip>}
                {t && vigente?.id === t.id && <Chip tone="si">saliendo hoy</Chip>}
                <span className="ml-auto flex gap-3">
                  {t && <button className="text-xs underline" onClick={() => setEditando(`temp:${t.id}`)}>Editar temporada</button>}
                  <button className="text-xs underline" onClick={() => setEditando(`nueva:${g.id}`)}>+ Agregar frase</button>
                </span>
              </div>
              {t && editando === `temp:${t.id}` && (
                <div className="mt-2"><EditorTemporada inicial={t} onGuardada={listo} onCancelar={() => setEditando(null)} /></div>
              )}
              {editando === `nueva:${g.id}` && (
                <div className="mt-2">
                  <EditorFrase inicial={{ temporada_id: g.id || null }} temporadas={datos.temporadas} impresoras={impresoras} onGuardada={listo} onCancelar={() => setEditando(null)} />
                </div>
              )}
              {frases.length === 0 && editando !== `nueva:${g.id}` && (
                <p className={`${cx.muted} text-sm mt-2`}>Sin frases todavía.</p>
              )}
              <ul className="mt-2 divide-y divide-sa-green-ink/5">
                {frases.map((f) => (
                  <li key={f.id} className="py-2">
                    {editando === f.id ? (
                      <EditorFrase inicial={f} temporadas={datos.temporadas} impresoras={impresoras} onGuardada={listo} onCancelar={() => setEditando(null)} />
                    ) : (
                      <button className="w-full text-left flex items-center gap-3" onClick={() => setEditando(f.id)}>
                        <span className={`font-medium ${f.activa ? 'text-sa-green-ink' : 'text-sa-green-ink/40 line-through'}`}>{f.nombre}</span>
                        <span className={`${cx.muted} font-mono text-xs`}>{f.texto}</span>
                        {(f.con_milo || t?.con_milo) && <Chip tone="neutral">Milo</Chip>}
                        <span className="ml-auto text-xs underline opacity-60">editar</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {editando === 'temp:nueva' ? (
          <EditorTemporada inicial={{}} onGuardada={listo} onCancelar={() => setEditando(null)} />
        ) : (
          <button className={cx.btnSec} onClick={() => setEditando('temp:nueva')}>+ Nueva temporada</button>
        )}
      </div>
    </Panel>
  )
}
