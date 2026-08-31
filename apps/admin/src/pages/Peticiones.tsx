import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  reportesSoporte, reportarSoporte, type ReporteSoporte, type TipoReporte,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'

/**
 * Pedir algo, y ver en qué quedó.
 *
 * Antes esto vivía en WhatsApp. Un mensaje traía siete cosas, se contestaban
 * dos, y a la semana nadie recordaba cuáles quedaron — ni quién lo había
 * pedido, ni si ya estaba hecho. La lista del 29/08 es el ejemplo exacto.
 *
 * Esta pantalla es la de **quien pide**: escribe, y después ve el estado y
 * la respuesta. Lo que NO trae es la cola: priorizar, meter algo a la
 * próxima sesión de trabajo y darlo por resuelto vive en **Soporte**, que
 * solo abre desarrollo.
 *
 * No es desconfianza, es que son dos trabajos distintos. Una cola donde
 * quien pide también decide la prioridad deja de ser una agenda y pasa a
 * ser una lista donde todo es urgente — y entonces no sirve para planear
 * nada. El candado real está en la base (`fn_priorizar_reporte` y
 * `fn_cerrar_reporte` exigen `fn_es_soporte()`); aquí solo se dejan de
 * pintar botones que de todos modos no funcionarían.
 */

const PRIORIDADES: Record<number, { label: string; clase: string }> = {
  1: { label: 'Ahora', clase: 'bg-sa-strawberry text-white' },
  2: { label: 'Pronto', clase: 'bg-sa-banana text-sa-coffee' },
  3: { label: 'Algún día', clase: 'bg-sa-cream-warm text-sa-green-ink/70' },
}

type Filtro = 'abierto' | 'sesion' | 'cerrado'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'abierto', label: 'Pendientes' },
  { id: 'sesion', label: 'En la próxima sesión' },
  { id: 'cerrado', label: 'Ya resueltas' },
]

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

export default function Peticiones() {
  const [lista, setLista] = useState<ReporteSoporte[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('abierto')
  const [texto, setTexto] = useState('')
  const [tipoNuevo, setTipoNuevo] = useState<TipoReporte>('peticion')
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function cargar() {
    try {
      setLista(await reportesSoporte(sb, 100))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  const vistas = useMemo(() => {
    const l = lista ?? []
    if (filtro === 'cerrado') return l.filter((r) => r.estado === 'cerrado')
    const abiertas = l.filter((r) => r.estado !== 'cerrado')
    return filtro === 'sesion' ? abiertas.filter((r) => r.para_sesion) : abiertas
  }, [lista, filtro])

  const cuantas = useMemo(() => {
    const abiertas = (lista ?? []).filter((r) => r.estado !== 'cerrado')
    return {
      abierto: abiertas.length,
      sesion: abiertas.filter((r) => r.para_sesion).length,
      cerrado: (lista ?? []).filter((r) => r.estado === 'cerrado').length,
    }
  }, [lista])

  async function tocar(id: string, fn: () => Promise<void>) {
    setOcupado(id)
    setError(null)
    try { await fn(); await cargar() }
    catch (e) { setError(mensajeDeError(e)) }
    finally { setOcupado(null) }
  }

  return (
    <div>
      <PageHeader
        title="Peticiones"
        subtitle="Pide lo que haga falta, y aquí mismo ves en qué quedó"
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <Panel title="Anotar algo">
        <p className="text-sm text-sa-green-ink/70 leading-relaxed">
          Lo que te llegue por WhatsApp o de viva voz, déjalo aquí. Lo que no se
          escribe se pierde, y lo que se pierde se vuelve a pedir dentro de un mes.
          Escríbelo como lo dirías: no hace falta saber cómo se arregla.
        </p>
        <div className="flex gap-2 mt-3">
          {(['peticion', 'falla'] as TipoReporte[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipoNuevo(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                tipoNuevo === t
                  ? 'bg-sa-green-ink text-sa-cream'
                  : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15'
              }`}
            >
              {t === 'peticion' ? 'Quieren que haga algo' : 'Algo se rompió'}
            </button>
          ))}
        </div>
        <textarea
          className={`${cx.input} mt-3 min-h-[80px]`}
          placeholder='Ej.: "Los clientes piden pagar mitad en efectivo y mitad con tarjeta."'
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button
          className={`${cx.btnPrimary} mt-3`}
          disabled={ocupado === 'nuevo' || texto.trim().length < 10}
          onClick={() => void tocar('nuevo', async () => {
            await reportarSoporte(sb, texto.trim(), null, { origen: 'Admin' }, tipoNuevo)
            setTexto('')
          })}
        >
          {ocupado === 'nuevo' ? 'Guardando…' : 'Anotar'}
        </button>
      </Panel>

      <div className="flex flex-wrap gap-2 mt-6 mb-4">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filtro === f.id
                ? 'bg-sa-green-ink text-sa-cream'
                : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:border-sa-green-ink/30'
            }`}
          >
            {f.label}
            <span className="ml-2 font-mono text-xs opacity-60">{cuantas[f.id]}</span>
          </button>
        ))}
      </div>

      {!lista && !error && <Loading>Cargando…</Loading>}

      <div className="space-y-3">
        {vistas.map((r) => (
          <Panel key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/45">
                  {fecha(r.creado_en)} · {r.quien} · {r.tipo === 'peticion' ? 'petición' : 'falla'}
                  {(r.contexto?.origen as string) ? ` · ${r.contexto.origen as string}` : ''}
                </p>
                <p className="text-sa-green-ink mt-1 leading-relaxed">{r.sintoma}</p>
                {(r.contexto?.nota as string) && (
                  <p className="text-sm text-sa-green-ink/60 mt-1.5 leading-relaxed">
                    {r.contexto.nota as string}
                  </p>
                )}
                {r.respuesta && (
                  <p className="text-sm text-sa-green-ink/70 mt-2 border-l-2 border-sa-green/30 pl-3 leading-relaxed">
                    {r.respuesta}
                  </p>
                )}
              </div>
              {/* Estado, de solo lectura. Quién decide la prioridad y cuándo
                  se da por resuelto vive en Soporte — ver el comentario de
                  arriba. Aquí se ve en qué quedó, que es lo que importa a
                  quien lo pidió. */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {r.estado === 'cerrado' ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sa-mint/30 text-sa-green-ink">
                    Resuelta
                  </span>
                ) : r.para_sesion ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-sa-green text-sa-cream">
                    En la próxima sesión
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white border border-sa-green-ink/15 text-sa-green-ink/50">
                    Anotada
                  </span>
                )}
                {r.estado !== 'cerrado' && r.prioridad != null && PRIORIDADES[r.prioridad] && (
                  <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${PRIORIDADES[r.prioridad].clase}`}>
                    {PRIORIDADES[r.prioridad].label}
                  </span>
                )}
              </div>
            </div>
          </Panel>
        ))}

        {lista && vistas.length === 0 && (
          <Panel>
            <p className={cx.muted}>
              {filtro === 'sesion'
                ? 'Todavía nada marcado para la próxima sesión de trabajo.'
                : filtro === 'cerrado'
                  ? 'Aún no hay peticiones resueltas.'
                  : 'Nada pendiente. Si algo hace falta, anótalo arriba.'}
            </p>
          </Panel>
        )}
      </div>
    </div>
  )
}
