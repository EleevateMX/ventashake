import { useState } from 'react'
import {
  guardarDiasDeRegla, quitarDiasDeRegla,
  type DiaDeRegla, type HorarioDeDias,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '../../lib/sb'
import { cx } from '../../ui'

/**
 * Horario distinto por día de la semana, dentro de UNA regla.
 *
 * El turno de tarde entra 14:30 entre semana y 14:00 el fin; hay quien
 * repone horas el sábado. Con un solo horario por regla el sistema marcaba
 * retardos que no eran y dejaba pasar los que sí.
 *
 * Se capturan **grupos de días** («S y D → 14:00 a 22:00») porque así lo
 * piensa el negocio, pero se guardan día por día: cambiar el sábado después
 * no obliga a rehacer el domingo. Un día sin nada aquí usa el horario de la
 * regla, y lo que se deje vacío también — la misma regla de respaldo de
 * siempre.
 */

/** En el orden de la semana de la tienda: lunes primero. dow: 0 = domingo. */
export const DIAS_SEMANA = [
  { dow: 1, corto: 'L', largo: 'Lun' },
  { dow: 2, corto: 'M', largo: 'Mar' },
  { dow: 3, corto: 'M', largo: 'Mié' },
  { dow: 4, corto: 'J', largo: 'Jue' },
  { dow: 5, corto: 'V', largo: 'Vie' },
  { dow: 6, corto: 'S', largo: 'Sáb' },
  { dow: 0, corto: 'D', largo: 'Dom' },
] as const

const nombreDia = (dow: number) => DIAS_SEMANA.find((d) => d.dow === dow)?.largo ?? '?'

/** «Lun–Vie», «Sáb · Dom», «Mar · Jue». */
export function nombreDias(dows: number[]): string {
  const orden = DIAS_SEMANA.map((d) => d.dow).filter((d) => dows.includes(d))
  const idx = orden.map((d) => DIAS_SEMANA.findIndex((x) => x.dow === d))
  const seguidos = idx.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (seguidos) return `${nombreDia(orden[0])}–${nombreDia(orden[orden.length - 1])}`
  return orden.map(nombreDia).join(' · ')
}

/** Los días con exactamente los mismos valores van juntos en un renglón. */
export function agruparDias(dias: DiaDeRegla[]): { dows: number[]; h: HorarioDeDias }[] {
  const m = new Map<string, { dows: number[]; h: HorarioDeDias }>()
  for (const d of dias) {
    const h: HorarioDeDias = {
      hora_entrada: d.hora_entrada, hora_salida: d.hora_salida,
      jornada_min: d.jornada_min, tolerancia_min: d.tolerancia_min,
      comida_min: d.comida_min, comida_max_min: d.comida_max_min,
      comida_se_paga: d.comida_se_paga,
    }
    const k = JSON.stringify(h)
    const g = m.get(k) ?? { dows: [], h }
    g.dows.push(d.dow)
    m.set(k, g)
  }
  const orden = (dow: number) => DIAS_SEMANA.findIndex((x) => x.dow === dow)
  return [...m.values()].sort((a, b) => Math.min(...a.dows.map(orden)) - Math.min(...b.dows.map(orden)))
}

/** «14:00–22:00 · tolerancia 10 · comida pagada». Solo lo que ese día cambia. */
export function resumenHorario(h: HorarioDeDias): string {
  const partes: string[] = []
  if (h.hora_entrada && h.hora_salida) partes.push(`${h.hora_entrada.slice(0, 5)}–${h.hora_salida.slice(0, 5)}`)
  if (h.jornada_min != null) partes.push(`jornada ${h.jornada_min} min`)
  if (h.tolerancia_min != null) partes.push(`tolerancia ${h.tolerancia_min} min`)
  if (h.comida_min != null) partes.push(`comida ${h.comida_min} min`)
  if (h.comida_max_min != null) partes.push(`comida larga desde ${h.comida_max_min} min`)
  if (h.comida_se_paga != null) partes.push(h.comida_se_paga ? 'comida pagada' : 'comida descontada')
  return partes.join(' · ')
}

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))

export function HorarioPorDia({
  reglaId, dias, onCambio,
}: {
  reglaId: string
  /** Los días configurados de ESTA regla. */
  dias: DiaDeRegla[]
  onCambio: () => Promise<void>
}) {
  const [marcados, setMarcados] = useState<number[]>([])
  const [entrada, setEntrada] = useState('')
  const [salida, setSalida] = useState('')
  const [tolerancia, setTolerancia] = useState('')
  const [jornada, setJornada] = useState('')
  const [comida, setComida] = useState('')
  const [sePaga, setSePaga] = useState<'' | 'si' | 'no'>('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const grupos = agruparDias(dias)
  const configurados = new Set(dias.map((d) => d.dow))
  const libres = DIAS_SEMANA.filter((d) => !configurados.has(d.dow)).map((d) => d.dow)

  function alternar(dow: number) {
    setMarcados((m) => (m.includes(dow) ? m.filter((x) => x !== dow) : [...m, dow]))
  }

  /** Editar un renglón: sube sus valores al formulario y marca sus días. */
  function editar(g: { dows: number[]; h: HorarioDeDias }) {
    setMarcados(g.dows)
    setEntrada(g.h.hora_entrada?.slice(0, 5) ?? '')
    setSalida(g.h.hora_salida?.slice(0, 5) ?? '')
    setTolerancia(g.h.tolerancia_min?.toString() ?? '')
    setJornada(g.h.jornada_min?.toString() ?? '')
    setComida(g.h.comida_min?.toString() ?? '')
    setSePaga(g.h.comida_se_paga == null ? '' : g.h.comida_se_paga ? 'si' : 'no')
  }

  async function guardar() {
    setOcupado(true); setError(null)
    try {
      await guardarDiasDeRegla(sb, reglaId, marcados, {
        hora_entrada: entrada || null,
        hora_salida: salida || null,
        jornada_min: num(jornada),
        tolerancia_min: num(tolerancia),
        comida_min: num(comida),
        comida_max_min: null,
        comida_se_paga: sePaga === '' ? null : sePaga === 'si',
      })
      setMarcados([]); setEntrada(''); setSalida(''); setTolerancia('')
      setJornada(''); setComida(''); setSePaga('')
      await onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  async function quitar(dows: number[]) {
    setOcupado(true); setError(null)
    try {
      await quitarDiasDeRegla(sb, reglaId, dows)
      await onCambio()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-dashed border-sa-green-ink/20">
      <p className="text-sm font-medium text-sa-green-ink">Horario distinto por día</p>
      <p className="text-[11px] text-sa-green-ink/55 mt-1 mb-3 leading-snug">
        Para cuando no todos los días son iguales: el fin de semana entra más temprano,
        o el sábado repone horas. Marca los días, pon su horario y guarda. <b>Lo que
        dejes vacío usa el de arriba</b>, y los días que no toques también.
      </p>

      {grupos.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {grupos.map((g) => (
            <div key={g.dows.join(',')} className="flex items-center gap-3 flex-wrap bg-sa-cream-soft/60 rounded-sa px-3 py-2">
              <span className="font-mono text-xs font-bold text-sa-green-ink w-24">{nombreDias(g.dows)}</span>
              <span className="font-mono text-[11px] text-sa-green-ink/70 flex-1">{resumenHorario(g.h)}</span>
              <button disabled={ocupado} onClick={() => editar(g)} className="text-[11px] text-sa-green underline">
                Cambiar
              </button>
              <button disabled={ocupado} onClick={() => void quitar(g.dows)} className="text-[11px] text-sa-strawberry underline">
                Quitar
              </button>
            </div>
          ))}
          {libres.length > 0 && (
            <p className="font-mono text-[11px] text-sa-green-ink/50 px-3">
              {nombreDias(libres)}: el horario de arriba
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-sa-strawberry mb-2">{error}</p>}

      <div className="bg-white border border-sa-green-ink/12 rounded-sa p-3">
        <div className="flex gap-1.5 mb-3">
          {DIAS_SEMANA.map((d) => (
            <button
              key={d.dow}
              type="button"
              onClick={() => alternar(d.dow)}
              title={d.largo}
              className={`w-9 h-9 rounded-full font-mono text-xs font-bold transition-colors ${
                marcados.includes(d.dow)
                  ? 'bg-sa-green text-sa-cream'
                  : 'bg-sa-cream-soft text-sa-green-ink/60 hover:bg-sa-mint/30'
              }`}
            >
              {d.corto}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label className="text-[11px] text-sa-green-ink/60">
            Entra
            <input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} className={`${cx.input} !py-1.5 mt-0.5 font-mono`} />
          </label>
          <label className="text-[11px] text-sa-green-ink/60">
            Sale
            <input type="time" value={salida} onChange={(e) => setSalida(e.target.value)} className={`${cx.input} !py-1.5 mt-0.5 font-mono`} />
          </label>
          <label className="text-[11px] text-sa-green-ink/60">
            Tolerancia (min)
            <input type="number" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} placeholder="igual" className={`${cx.input} !py-1.5 mt-0.5 font-mono`} />
          </label>
          <label className="text-[11px] text-sa-green-ink/60">
            Jornada (min)
            <input type="number" value={jornada} onChange={(e) => setJornada(e.target.value)} placeholder="igual" className={`${cx.input} !py-1.5 mt-0.5 font-mono`} />
          </label>
          <label className="text-[11px] text-sa-green-ink/60">
            Comida (min)
            <input type="number" value={comida} onChange={(e) => setComida(e.target.value)} placeholder="igual" className={`${cx.input} !py-1.5 mt-0.5 font-mono`} />
          </label>
          <label className="text-[11px] text-sa-green-ink/60">
            La comida se paga
            <select value={sePaga} onChange={(e) => setSePaga(e.target.value as typeof sePaga)} className={`${cx.input} !py-1.5 mt-0.5`}>
              <option value="">igual</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <button
          disabled={ocupado || marcados.length === 0}
          onClick={() => void guardar()}
          className={`${cx.btnPrimary} mt-3`}
        >
          {marcados.length === 0 ? 'Marca los días' : `Guardar para ${nombreDias(marcados)}`}
        </button>
      </div>
    </div>
  )
}
