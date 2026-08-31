import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  reportesSoporte, reportarSoporte, priorizarReporte, cerrarReporte,
  type ReporteSoporte, type TipoReporte,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'

/**
 * La cola de lo que la tienda pide y de lo que se rompió.
 *
 * Antes esto vivía en WhatsApp. Un mensaje traía siete cosas, se contestaban
 * dos, y a la semana nadie recordaba cuáles quedaron — ni quién lo había
 * pedido, ni si ya estaba hecho. La lista del 29/08 es el ejemplo exacto.
 *
 * Aquí cada petición tiene dueño, fecha, prioridad y una marca: **entra en
 * la próxima sesión de trabajo**. Esa marca es la agenda; lo demás es
 * inventario. Y quien pidió algo ve en qué quedó, que es lo único que hace
 * que la gente vuelva a pedir por aquí en vez de por mensaje.
 */

const PRIORIDADES: { valor: number; label: string; clase: string }[] = [
  { valor: 1, label: 'Ahora', clase: 'bg-sa-strawberry text-white' },
  { valor: 2, label: 'Pronto', clase: 'bg-sa-banana text-sa-coffee' },
  { valor: 3, label: 'Algún día', clase: 'bg-sa-cream-warm text-sa-green-ink/70' },
]

type Filtro = 'sesion' | 'peticion' | 'falla' | 'cerrado'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'sesion', label: 'Para la próxima sesión' },
  { id: 'peticion', label: 'Peticiones' },
  { id: 'falla', label: 'Fallas' },
  { id: 'cerrado', label: 'Ya resueltas' },
]

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

export default function Peticiones() {
  const [lista, setLista] = useState<ReporteSoporte[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('sesion')
  const [texto, setTexto] = useState('')
  const [tipoNuevo, setTipoNuevo] = useState<TipoReporte>('peticion')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState('')

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
    if (filtro === 'sesion') return abiertas.filter((r) => r.para_sesion)
    return abiertas.filter((r) => r.tipo === filtro)
  }, [lista, filtro])

  const cuantas = useMemo(() => {
    const l = (lista ?? []).filter((r) => r.estado !== 'cerrado')
    return {
      sesion: l.filter((r) => r.para_sesion).length,
      peticion: l.filter((r) => r.tipo === 'peticion').length,
      falla: l.filter((r) => r.tipo === 'falla').length,
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
        subtitle="Lo que la tienda pide y lo que se rompió, en una sola cola"
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <Panel title="Anotar algo">
        <p className="text-sm text-sa-green-ink/70 leading-relaxed">
          Lo que te llegue por WhatsApp o de viva voz, déjalo aquí. Lo que no se
          escribe se pierde, y lo que se pierde se vuelve a pedir dentro de un mes.
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
              {r.estado === 'cerrado' && (
                <span className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-sa-mint/30 text-sa-green-ink">
                  Resuelta
                </span>
              )}
            </div>

            {r.estado !== 'cerrado' && (
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-sa-green-ink/10">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.valor}
                    disabled={ocupado === r.id}
                    onClick={() => void tocar(r.id, () =>
                      priorizarReporte(sb, r.id, { prioridad: p.valor }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      r.prioridad === p.valor
                        ? p.clase
                        : 'bg-white border border-sa-green-ink/15 text-sa-green-ink/50 hover:border-sa-green-ink/35'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

                <button
                  disabled={ocupado === r.id}
                  onClick={() => void tocar(r.id, () =>
                    priorizarReporte(sb, r.id, { paraSesion: !r.para_sesion }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    r.para_sesion
                      ? 'bg-sa-green text-sa-cream'
                      : 'bg-white border border-sa-green-ink/15 text-sa-green-ink/50 hover:border-sa-green'
                  }`}
                >
                  {r.para_sesion ? '✓ En la próxima sesión' : 'Meter a la sesión'}
                </button>

                <button
                  onClick={() => { setCerrando(cerrando === r.id ? null : r.id); setRespuesta('') }}
                  className="ml-auto font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/45 hover:text-sa-green-ink"
                >
                  Marcar resuelta
                </button>
              </div>
            )}

            {cerrando === r.id && (
              <div className="mt-3">
                <textarea
                  className={`${cx.input} min-h-[70px]`}
                  placeholder="Qué se hizo. Lo lee quien lo pidió — decir “listo” no le sirve de nada."
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                />
                <button
                  className={`${cx.btnPrimary} mt-2`}
                  disabled={ocupado === r.id || respuesta.trim().length < 5}
                  onClick={() => void tocar(r.id, async () => {
                    await cerrarReporte(sb, r.id, respuesta.trim())
                    setCerrando(null); setRespuesta('')
                  })}
                >
                  Cerrar con esta respuesta
                </button>
              </div>
            )}
          </Panel>
        ))}

        {lista && vistas.length === 0 && (
          <Panel>
            <p className={cx.muted}>
              {filtro === 'sesion'
                ? 'Nada marcado para la próxima sesión todavía. Márcalo desde “Peticiones”.'
                : 'Nada por aquí.'}
            </p>
          </Panel>
        )}
      </div>
    </div>
  )
}
