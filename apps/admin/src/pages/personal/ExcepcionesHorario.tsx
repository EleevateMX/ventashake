import { useCallback, useEffect, useState } from 'react'
import {
  personasConRegla, excepcionesHorario, guardarExcepcionHorario, borrarExcepcionHorario,
  type PersonaConRegla, type ExcepcionHorario,
} from '@shake/supabase'
import { mensajeDeError, hoyEnMerida, diasAntesEnMerida } from '@shake/utils'
import { sb } from '../../lib/sb'
import { ErrorMsg, cx } from '../../ui'

/**
 * Excepción de horario de UNA fecha, para una persona.
 *
 * «Solo este sábado entra a las 15:00»: se cambia ese día sin tocar su
 * regla, y al siguiente vuelve sola a su horario. El retardo y la salida
 * anticipada de ese día se calculan contra la excepción.
 *
 * El **motivo es obligatorio**, y lo exige el servidor: una excepción sin
 * motivo es un retardo borrado sin rastro. Queda anotado quién la puso.
 */

const DIA_MS = 86_400_000
/** hoy + n días, en fecha de Mérida. */
const diasDespues = (n: number) =>
  new Date(Date.parse(`${hoyEnMerida()}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)

export function ExcepcionesHorario({
  onCerrar, onCambio,
}: {
  onCerrar: () => void
  /** Una excepción cambia lo que dice el histórico de ese día. */
  onCambio: () => void
}) {
  const [personas, setPersonas] = useState<PersonaConRegla[]>([])
  const [lista, setLista] = useState<ExcepcionHorario[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [empleadoId, setEmpleadoId] = useState('')
  const [dia, setDia] = useState(hoyEnMerida())
  const [entrada, setEntrada] = useState('')
  const [salida, setSalida] = useState('')
  const [nota, setNota] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [ps, xs] = await Promise.all([
        personasConRegla(sb),
        excepcionesHorario(sb, diasAntesEnMerida(30), diasDespues(120)),
      ])
      setPersonas(ps.filter((p) => p.activo))
      setLista(xs)
    } catch (e) {
      setError(mensajeDeError(e))
      setLista([])
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const elegida = personas.find((p) => p.empleado_id === empleadoId)

  async function guardar() {
    setOcupado(true); setError(null)
    try {
      await guardarExcepcionHorario(sb, {
        empleadoId, dia,
        horaEntrada: entrada || null, horaSalida: salida || null,
        jornadaMin: null, toleranciaMin: null,
        nota,
      })
      setEntrada(''); setSalida(''); setNota('')
      await cargar()
      onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  async function quitar(x: ExcepcionHorario) {
    if (!window.confirm(`¿Quitar la excepción de ${x.nombre} del ${x.dia}? Ese día vuelve a su horario normal.`)) return
    setOcupado(true); setError(null)
    try {
      await borrarExcepcionHorario(sb, x.id)
      await cargar()
      onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-start justify-center p-6 overflow-y-auto">
      <div className="bg-sa-cream-paper rounded-sa-lg max-w-2xl w-full p-7 my-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="font-display text-3xl text-sa-green-ink leading-tight">Excepción de un día</p>
            <p className="text-sm text-sa-green-ink/65 mt-1.5 leading-relaxed">
              Cambia el horario de <b>una fecha</b> sin tocar su regla: «solo este sábado
              entra a las 15:00». Al día siguiente vuelve sola a su horario normal.
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

        <div className="bg-white border border-sa-green-ink/15 rounded-sa p-5 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <label className="col-span-2 sm:col-span-1">
              <span className={cx.label}>Quién</span>
              <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={`${cx.input} mt-1`}>
                <option value="">Elige…</option>
                {personas.map((p) => <option key={p.empleado_id} value={p.empleado_id}>{p.nombre}</option>)}
              </select>
            </label>
            <label className="col-span-2 sm:col-span-1">
              <span className={cx.label}>Qué día</span>
              <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={`${cx.input} mt-1 font-mono`} />
            </label>
            <label>
              <span className={cx.label}>Entra a las</span>
              <input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} className={`${cx.input} mt-1 font-mono`} />
            </label>
            <label>
              <span className={cx.label}>Sale a las</span>
              <input type="time" value={salida} onChange={(e) => setSalida(e.target.value)} className={`${cx.input} mt-1 font-mono`} />
            </label>
          </div>
          {elegida && (
            <p className="text-[11px] text-sa-green-ink/55 mt-2">
              Su horario de siempre: {elegida.regla ?? 'la regla general'}
              {elegida.hora_entrada && elegida.hora_salida
                ? ` · ${elegida.hora_entrada.slice(0, 5)}–${elegida.hora_salida.slice(0, 5)}`
                : ''}
              {' '}(si su regla cambia por día de la semana, ese día manda la excepción).
            </p>
          )}
          <label className="block mt-4">
            <span className={cx.label}>Motivo</span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Cambio de turno con Ana · repone horas del martes"
              className={`${cx.input} mt-1`}
            />
            <span className="text-[11px] text-sa-green-ink/50 block mt-1">
              Obligatorio: una excepción sin motivo es un retardo borrado sin rastro.
            </span>
          </label>
          <button
            disabled={ocupado || !empleadoId || !dia || !entrada || !salida || !nota.trim()}
            onClick={() => void guardar()}
            className="w-full mt-5 bg-sa-green text-sa-cream py-3 rounded-sa-lg font-display text-lg disabled:opacity-50"
          >
            {ocupado ? 'Guardando…' : 'Guardar la excepción'}
          </button>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-widest text-sa-green-ink/50 mb-3">
          Excepciones (del último mes en adelante)
        </p>
        {lista === null ? (
          <p className={`${cx.muted} text-sm`}>Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-sa-green-ink/60">No hay ninguna.</p>
        ) : (
          <div className="space-y-2">
            {lista.map((x) => (
              <div key={x.id} className="bg-white border border-sa-green-ink/15 rounded-sa px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-sa-green-ink">
                    <b>{x.nombre}</b> · <span className="font-mono">{x.dia}</span>
                    {x.hora_entrada && x.hora_salida && (
                      <span className="font-mono"> · {x.hora_entrada.slice(0, 5)}–{x.hora_salida.slice(0, 5)}</span>
                    )}
                  </p>
                  <p className="text-[12px] text-sa-green-ink/60 mt-0.5">
                    {x.nota}{x.creada_por ? ` — puso ${x.creada_por}` : ''}
                  </p>
                </div>
                <button disabled={ocupado} onClick={() => void quitar(x)} className="text-[11px] text-sa-strawberry underline shrink-0">
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
