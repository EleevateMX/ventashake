import { useCallback, useEffect, useState } from 'react'
import {
  reglasChecador, personasConRegla, guardarReglaChecador,
  borrarReglaChecador, asignarReglaChecador,
  type ReglaChecador, type PersonaConRegla, type ConfigChecador,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '../../lib/sb'
import { ErrorMsg, Chip, cx } from '../../ui'

/**
 * Reglas del checador **por persona**, no una sola para todos.
 *
 * La mayoría hace 8 horas con 35 minutos de comida; Silvana entra 5:45 y
 * sale 1:15, y hay medios turnos. Con una sola regla el sistema calcula
 * bien a la mayoría y mal a todos los demás — y un número equivocado en
 * nómina se firma igual que uno bueno.
 *
 * Se hace con **reglas con nombre** («Turno completo», «Medio turno») que
 * se le asignan a la gente, no con una columna por persona. Así lo dijo el
 * negocio, y cambiar el medio turno de 4 a 5 horas se hace una vez en vez
 * de persona por persona. Quien necesita lo suyo tiene su propia regla de
 * una sola persona.
 *
 * **Un campo vacío hereda el de la regla general**, y quien no tenga regla
 * asignada se comporta exactamente como antes de que existieran. Es la
 * misma regla de respaldo que las observaciones y el «solo si…»: el día
 * del despliegue no se mueve ni un número.
 */

/** Lo que se teclea: todo texto, porque vacío significa «hereda». */
interface Borrador {
  id: string | null
  nombre: string
  hora_entrada: string
  hora_salida: string
  jornada_min: string
  tolerancia_min: string
  comida_min: string
  comida_max_min: string
  /** '' hereda · 'si' · 'no'. Tres estados, no dos. */
  comida_se_paga: '' | 'si' | 'no'
}

const VACIO: Borrador = {
  id: null, nombre: '', hora_entrada: '', hora_salida: '',
  jornada_min: '', tolerancia_min: '', comida_min: '', comida_max_min: '',
  comida_se_paga: '',
}

const aBorrador = (r: ReglaChecador): Borrador => ({
  id: r.id,
  nombre: r.nombre,
  hora_entrada: (r.hora_entrada ?? '').slice(0, 5),
  hora_salida: (r.hora_salida ?? '').slice(0, 5),
  jornada_min: r.jornada_min?.toString() ?? '',
  tolerancia_min: r.tolerancia_min?.toString() ?? '',
  comida_min: r.comida_min?.toString() ?? '',
  comida_max_min: r.comida_max_min?.toString() ?? '',
  comida_se_paga: r.comida_se_paga == null ? '' : r.comida_se_paga ? 'si' : 'no',
})

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))
const hora = (s: string): string | null => (s.trim() === '' ? null : s)

/** «5:45 → 13:15 son 450 min». Vale para decidir la jornada sin sacar cuentas. */
function minutosEntre(entrada: string, salida: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida)) return null
  const [he, me] = entrada.split(':').map(Number)
  const [hs, ms] = salida.split(':').map(Number)
  let d = hs * 60 + ms - (he * 60 + me)
  if (d <= 0) d += 24 * 60 // un turno que cruza la medianoche
  return d
}

const hhmm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`

export function ReglasPorPersona({
  general,
  onCerrar,
  onCambio,
}: {
  general: ConfigChecador
  onCerrar: () => void
  /** Al asignar o cambiar una regla el histórico ya no dice lo mismo. */
  onCambio: () => void
}) {
  const [reglas, setReglas] = useState<ReglaChecador[] | null>(null)
  const [personas, setPersonas] = useState<PersonaConRegla[]>([])
  const [error, setError] = useState<string | null>(null)
  const [edita, setEdita] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [rs, ps] = await Promise.all([reglasChecador(sb), personasConRegla(sb)])
      setReglas(rs)
      setPersonas(ps)
    } catch (e) {
      setError(mensajeDeError(e))
      setReglas([])
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function guardar() {
    if (!edita) return
    setGuardando(true); setError(null)
    try {
      await guardarReglaChecador(sb, {
        id: edita.id,
        nombre: edita.nombre,
        jornada_min: num(edita.jornada_min),
        tolerancia_min: num(edita.tolerancia_min),
        comida_min: num(edita.comida_min),
        comida_max_min: num(edita.comida_max_min),
        comida_se_paga: edita.comida_se_paga === '' ? null : edita.comida_se_paga === 'si',
        hora_entrada: hora(edita.hora_entrada),
        hora_salida: hora(edita.hora_salida),
      })
      setEdita(null)
      await cargar()
      onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(r: ReglaChecador) {
    const aviso = r.personas > 0
      ? `Quitar «${r.nombre}». ${r.personas} ${r.personas === 1 ? 'persona vuelve' : 'personas vuelven'} a la regla general. ¿Seguimos?`
      : `Quitar «${r.nombre}»?`
    if (!window.confirm(aviso)) return
    setError(null)
    try {
      await borrarReglaChecador(sb, r.id)
      await cargar()
      onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  async function asignar(p: PersonaConRegla, reglaId: string) {
    setError(null)
    try {
      await asignarReglaChecador(sb, p.empleado_id, reglaId || null)
      await cargar()
      onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const sugerida = edita ? minutosEntre(edita.hora_entrada, edita.hora_salida) : null

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-start justify-center p-6 overflow-y-auto">
      <div className="bg-sa-cream-paper rounded-sa-lg max-w-3xl w-full p-7 my-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="font-display text-3xl text-sa-green-ink leading-tight">
              Reglas por persona
            </p>
            <p className="text-sm text-sa-green-ink/65 mt-1.5 leading-relaxed">
              Una regla con nombre —«Turno completo», «Medio turno»— que se le
              asigna a quien le toque. <b>Lo que dejes vacío usa la regla
              general</b>, y quien no tenga regla asignada sigue calculándose
              exactamente como hasta hoy.
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="w-10 h-10 shrink-0 rounded-full bg-white border border-sa-green-ink/15 text-xl text-sa-green-ink/60"
          >
            ×
          </button>
        </div>

        {error && <ErrorMsg>{error}</ErrorMsg>}

        {/* ── Las reglas ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-sa-green-ink/50">
            Las reglas
          </p>
          {!edita && (
            <button onClick={() => setEdita({ ...VACIO })} className={cx.btnSec}>
              Nueva regla
            </button>
          )}
        </div>

        {edita ? (
          <div className="bg-white border border-sa-green-ink/15 rounded-sa p-5 mb-5">
            <label className="block mb-4">
              <span className={cx.label}>Nombre de la regla</span>
              <input
                value={edita.nombre}
                onChange={(e) => setEdita({ ...edita, nombre: e.target.value })}
                placeholder="Medio turno"
                autoFocus
                className={`${cx.input} mt-1`}
              />
              <span className="text-[11px] text-sa-green-ink/50 block mt-1 leading-snug">
                Es como se le asigna a la gente, así que conviene un nombre que
                diga a quién le toca.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <label>
                <span className={cx.label}>Entra a las</span>
                <input
                  type="time" value={edita.hora_entrada}
                  onChange={(e) => setEdita({ ...edita, hora_entrada: e.target.value })}
                  className={`${cx.input} mt-1 font-mono`}
                />
              </label>
              <label>
                <span className={cx.label}>Sale a las</span>
                <input
                  type="time" value={edita.hora_salida}
                  onChange={(e) => setEdita({ ...edita, hora_salida: e.target.value })}
                  className={`${cx.input} mt-1 font-mono`}
                />
              </label>
            </div>
            <p className="text-[11px] text-sa-green-ink/55 -mt-2 mb-4 leading-snug">
              El horario de reloj es lo único que permite decir <b>«llegó tarde»</b>.
              Sin él, el histórico cuenta las horas pero no las compara contra nada.
            </p>

            {sugerida != null && (
              <p className="text-[12px] text-sa-green-ink/70 mb-4">
                De {edita.hora_entrada} a {edita.hora_salida} son{' '}
                <b>{sugerida} minutos</b> ({hhmm(sugerida)}).{' '}
                {edita.jornada_min !== sugerida.toString() && (
                  <button
                    onClick={() => setEdita({ ...edita, jornada_min: sugerida.toString() })}
                    className="text-sa-green underline"
                  >
                    usar como jornada
                  </button>
                )}
              </p>
            )}

            <div className="space-y-3">
              {([
                ['jornada_min', 'Jornada esperada (minutos)', general.jornada_min],
                ['comida_min', 'Minutos de comida esperados', general.comida_min],
                ['comida_max_min', 'Comida larga a partir de', general.comida_max_min],
                ['tolerancia_min', 'Tolerancia para el retardo (minutos)', general.tolerancia_min],
              ] as const).map(([campo, etiqueta, dflt]) => (
                <label key={campo} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-sa-green-ink">{etiqueta}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      value={edita[campo]}
                      onChange={(e) => setEdita({ ...edita, [campo]: e.target.value })}
                      placeholder={dflt.toString()}
                      className="w-24 px-3 py-2 border border-sa-green-ink/15 rounded text-right font-mono text-sm"
                    />
                    <span className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 w-24">
                      {edita[campo].trim() === '' ? `general: ${dflt}` : ''}
                    </span>
                  </span>
                </label>
              ))}

              <label className="flex items-center justify-between gap-4 pt-3 border-t border-dashed border-sa-green-ink/15">
                <span>
                  <span className="text-sm text-sa-green-ink">La comida se paga</span>
                  <span className="text-[11px] text-sa-green-ink/50 block leading-snug">
                    Apagado, se resta de las horas trabajadas el <b>tiempo real</b>{' '}
                    entre salida y regreso, no los minutos esperados.
                  </span>
                </span>
                <select
                  value={edita.comida_se_paga}
                  onChange={(e) =>
                    setEdita({ ...edita, comida_se_paga: e.target.value as Borrador['comida_se_paga'] })
                  }
                  className="px-3 py-2 border border-sa-green-ink/15 rounded text-sm bg-white shrink-0"
                >
                  <option value="">Como la general ({general.comida_se_paga ? 'sí' : 'no'})</option>
                  <option value="si">Sí se paga</option>
                  <option value="no">No se paga</option>
                </select>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEdita(null)}
                className="px-5 py-3 rounded-sa font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 border border-sa-green-ink/15 bg-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => void guardar()}
                disabled={guardando || edita.nombre.trim() === ''}
                className="flex-1 bg-sa-green text-sa-cream py-3 rounded-sa-lg font-display text-lg disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Guardar la regla'}
              </button>
            </div>
          </div>
        ) : reglas === null ? (
          <p className={`${cx.muted} text-sm mb-5`}>Cargando…</p>
        ) : reglas.length === 0 ? (
          <p className="text-sm text-sa-green-ink/60 bg-white border border-sa-green-ink/12 rounded-sa px-4 py-3 mb-5 leading-relaxed">
            Todavía no hay ninguna. Mientras no la haya, todo el mundo se calcula
            con la regla general — que es exactamente como funciona hoy.
          </p>
        ) : (
          <div className="space-y-2 mb-5">
            {reglas.map((r) => (
              <div key={r.id} className="bg-white border border-sa-green-ink/15 rounded-sa px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-display text-xl text-sa-green-ink leading-tight">
                    {r.nombre}
                  </span>
                  <span className="flex items-center gap-3">
                    <Chip tone="neutral">
                      {r.personas} {r.personas === 1 ? 'persona' : 'personas'}
                    </Chip>
                    <button onClick={() => setEdita(aBorrador(r))} className="text-[11px] text-sa-green underline">
                      Editar
                    </button>
                    <button onClick={() => void borrar(r)} className="text-[11px] text-sa-strawberry underline">
                      Quitar
                    </button>
                  </span>
                </div>
                <p className="font-mono text-[11px] text-sa-green-ink/60 mt-1.5 leading-relaxed">
                  {r.hora_entrada && r.hora_salida
                    ? `${r.hora_entrada.slice(0, 5)}–${r.hora_salida.slice(0, 5)} · `
                    : ''}
                  jornada {r.jornada_min ?? `${general.jornada_min} (general)`} min ·
                  comida {r.comida_min ?? `${general.comida_min} (general)`} min ·
                  {r.comida_se_paga == null
                    ? ' comida como la general'
                    : r.comida_se_paga ? ' comida pagada' : ' comida descontada'}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Quién usa cuál ───────────────────────────────────────────── */}
        <p className="font-mono text-[11px] uppercase tracking-widest text-sa-green-ink/50 mb-3 pt-4 border-t border-sa-green-ink/15">
          Quién usa cuál
        </p>
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead className={cx.thead}>
              <tr>
                <th className={cx.th}>Quién</th>
                <th className={cx.th}>Su regla</th>
                <th className={cx.th}>Le queda</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {personas.filter((p) => p.activo).map((p) => (
                <tr key={p.empleado_id} className={cx.tr}>
                  <td className={cx.td}>{p.nombre}</td>
                  <td className={cx.td}>
                    <select
                      value={p.regla_id ?? ''}
                      onChange={(e) => void asignar(p, e.target.value)}
                      className="px-3 py-1.5 border border-sa-green-ink/15 rounded text-sm bg-white"
                    >
                      <option value="">La general</option>
                      {(reglas ?? []).map((r) => (
                        <option key={r.id} value={r.id}>{r.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td className={`${cx.td} font-mono text-[11px] text-sa-green-ink/60`}>
                    {p.hora_entrada && p.hora_salida
                      ? `${p.hora_entrada.slice(0, 5)}–${p.hora_salida.slice(0, 5)} · `
                      : ''}
                    {p.jornada_min} min · comida {p.comida_min} min ·{' '}
                    {p.comida_se_paga ? 'pagada' : 'descontada'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-sa-green-ink/50 mt-3 leading-snug">
          Cambiar una regla <b>recalcula el histórico que se muestra</b>: las horas
          salen de las checadas, que no se tocan. Lo que cambia es con qué se
          comparan y cuánto se descuenta.
        </p>
      </div>
    </div>
  )
}
