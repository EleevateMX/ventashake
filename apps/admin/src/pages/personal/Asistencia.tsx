import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  asistenciaResumen, asistenciaDelDia, corregirChecada,
  configChecador, guardarConfigChecador,
  type DiaDeAsistencia, type ChecadaDelDia, type ConfigChecador,
} from '@shake/supabase'
import { mensajeDeError, hoyEnMerida } from '@shake/utils'
import { sb } from '../../lib/sb'
import { PageHeader, Panel, Loading, ErrorMsg, OkMsg, Chip, cx } from '../../ui'

/**
 * El histórico del reloj checador.
 *
 * El turno **se calcula** de los eventos, no se guarda: por eso un día sin
 * salida sale marcado como pendiente en vez de romper la tabla. Y una
 * checada corregida no desaparece — se sigue viendo en el detalle del día,
 * con quién la corrigió y por qué. Un historial que se puede editar no es
 * evidencia de nada.
 */

/** Los últimos 7 días, en fecha de Mérida (que es la del negocio). */
function rangoPorDefecto(): { desde: string; hasta: string } {
  const hasta = hoyEnMerida()
  const d = new Date(`${hasta}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 6)
  return { desde: d.toISOString().slice(0, 10), hasta }
}

const hhmm = (min: number | null) =>
  min == null ? '—' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`

export default function Asistencia() {
  const [{ desde, hasta }, setRango] = useState(rangoPorDefecto)
  const [dias, setDias] = useState<DiaDeAsistencia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<{ dia: string; filas: ChecadaDelDia[] } | null>(null)
  const [cfg, setCfg] = useState<ConfigChecador | null>(null)
  const [verReglas, setVerReglas] = useState(false)
  const [ubicando, setUbicando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setDias(await asistenciaResumen(sb, desde, hasta))
    } catch (e) {
      setError(mensajeDeError(e))
      setDias([])
    }
  }, [desde, hasta])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { configChecador(sb).then(setCfg).catch(() => {}) }, [])

  /**
   * Las reglas del checador. Estaban escritas dentro de la función —las
   * 16 horas del turno colgado— y cambiarlas obligaba a desplegar. El
   * servidor valida los topes: un turno máximo de 200 horas no es una
   * configuración, es un error de dedo que ensucia el histórico.
   */
  /**
   * El punto de la tienda se toma con el navegador de quien lo esta
   * configurando, **parado ahi**. Escribirlo a mano desde un mapa suena
   * mas limpio y no lo es: un par de decenas de metros de diferencia es
   * justo el margen que despues rebota a quien si esta en la barra.
   */
  function marcarAqui() {
    if (!cfg || !('geolocation' in navigator)) {
      setError('Este dispositivo no puede dar su ubicacion.')
      return
    }
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCfg({ ...cfg, tienda_lat: p.coords.latitude, tienda_lon: p.coords.longitude })
        setUbicando(false)
      },
      () => {
        setError('No se pudo leer la ubicacion. Dale permiso al navegador.')
        setUbicando(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  async function guardarReglas() {
    if (!cfg) return
    setGuardando(true)
    setError(null)
    try {
      await guardarConfigChecador(sb, cfg)
      setAviso('Reglas guardadas. Aplican de la siguiente checada en adelante.')
      setTimeout(() => setAviso(null), 8000)
      setVerReglas(false)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  async function verDia(dia: string) {
    setError(null)
    try {
      setDetalle({ dia, filas: await asistenciaDelDia(sb, dia) })
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  /**
   * Corregir pide motivo y **agrega** una checada que reemplaza a la
   * vieja. El servidor rechaza una corrección sin motivo: una corrección
   * que no dice por qué no sirve para nada el día que alguien pregunte.
   */
  async function corregir(f: ChecadaDelDia, dia: string) {
    const hora = window.prompt(
      `Hora correcta de la ${f.tipo} de ${f.nombre} el ${dia} (formato 24 h, por ejemplo 09:15):`,
      f.hora,
    )
    if (!hora) return
    if (!/^\d{1,2}:\d{2}$/.test(hora.trim())) {
      setError('La hora va como 09:15.')
      return
    }
    const nota = window.prompt('¿Por qué se corrige? (queda guardado a tu nombre)')
    if (!nota?.trim()) {
      setError('Sin motivo no se puede corregir.')
      return
    }
    try {
      // Mérida es UTC−6 todo el año, así que la hora local se manda con su
      // huso explícito: sin él, el servidor la leería como UTC y la
      // corrección caería seis horas antes.
      await corregirChecada(sb, f.id, `${dia}T${hora.trim().padStart(5, '0')}:00-06:00`, nota.trim())
      setAviso('Corrección registrada. La checada original se conserva en el detalle.')
      setTimeout(() => setAviso(null), 8000)
      await verDia(dia)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  const porPersona = useMemo(() => {
    const m = new Map<string, { nombre: string; minutos: number; dias: number; pendientes: number }>()
    for (const d of dias ?? []) {
      const a = m.get(d.empleado_id) ?? { nombre: d.nombre, minutos: 0, dias: 0, pendientes: 0 }
      a.minutos += d.minutos_trabajados ?? 0
      a.dias += 1
      if (d.sin_salida) a.pendientes += 1
      m.set(d.empleado_id, a)
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [dias])

  function exportar() {
    const filas = [
      ['Empleado', 'Día', 'Entrada', 'Salida', 'Min. bruto', 'Min. comida',
       'Min. trabajados', 'Sin salida', 'Comida abierta', 'Comida larga', 'Corregido'],
      ...(dias ?? []).map((d) => [
        d.nombre, d.dia, d.entrada_hora ?? '', d.salida_hora ?? '',
        d.minutos_bruto == null ? '' : String(d.minutos_bruto),
        String(d.minutos_comida),
        d.minutos_trabajados == null ? '' : String(d.minutos_trabajados),
        d.sin_salida ? 'sí' : '', d.comida_abierta ? 'sí' : '',
        d.comida_larga ? 'sí' : '', d.corregido ? 'sí' : '',
      ]),
    ]
    // El BOM es lo que hace que Excel en español no parta los acentos.
    const csv = '﻿' + filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `asistencia-${desde}-a-${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (dias === null) return <Loading>Cargando el checador…</Loading>

  return (
    <div>
      <PageHeader
        title="Asistencia"
        subtitle="Las checadas del personal. La hora la pone el servidor, y nada se borra."
        action={
          <div className="flex gap-3">
            <button
              onClick={() => setVerReglas(true)}
              disabled={!cfg}
              className="px-5 py-3 rounded-sa-lg bg-white border border-sa-green-ink/15 text-sa-green-ink font-display text-lg disabled:opacity-40"
            >
              Reglas
            </button>
            <button
              onClick={exportar}
              disabled={dias.length === 0}
              className="px-5 py-3 rounded-sa-lg bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40"
            >
              Exportar a Excel
            </button>
          </div>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {aviso && <OkMsg>{aviso}</OkMsg>}

      <Panel className="mb-4">
        <div className="flex items-end gap-4 flex-wrap">
          <label className="text-sm text-sa-green-ink/70">
            Desde
            <input
              type="date" value={desde}
              onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
              className="ml-2 px-3 py-2 border border-sa-green-ink/15 rounded font-mono text-sm"
            />
          </label>
          <label className="text-sm text-sa-green-ink/70">
            Hasta
            <input
              type="date" value={hasta}
              onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
              className="ml-2 px-3 py-2 border border-sa-green-ink/15 rounded font-mono text-sm"
            />
          </label>
        </div>
      </Panel>

      {porPersona.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          {porPersona.map((p) => (
            <Panel key={p.nombre}>
              <p className="font-display text-2xl text-sa-green-ink leading-tight">{p.nombre}</p>
              <p className="font-mono text-sm text-sa-green-ink/70 mt-1">
                {hhmm(p.minutos)} en {p.dias} {p.dias === 1 ? 'día' : 'días'}
              </p>
              {p.pendientes > 0 && (
                <p className="text-[12px] text-sa-strawberry mt-2 leading-snug">
                  {p.pendientes} {p.pendientes === 1 ? 'día' : 'días'} sin checar salida — esas
                  horas no están contadas.
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}

      {dias.length === 0 ? (
        <Panel>
          <p className="text-sa-green-ink/70">
            Nadie ha checado en este rango. Se checa en el kiosko, con el botón
            <b> Checar</b> de arriba.
          </p>
        </Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead className={cx.thead}>
              <tr>
                <th className={cx.th}>Día</th>
                <th className={cx.th}>Quién</th>
                <th className={cx.th}>Entrada</th>
                <th className={cx.th}>Salida</th>
                <th className={cx.thNum}>Comida</th>
                <th className={cx.thNum}>Trabajado</th>
                <th className={cx.th}></th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {dias.map((d) => (
                <tr key={`${d.empleado_id}-${d.dia}`} className={cx.tr}>
                  <td className={`${cx.td} font-mono text-xs`}>{d.dia}</td>
                  <td className={cx.td}>{d.nombre}</td>
                  <td className={`${cx.td} font-mono`}>{d.entrada_hora ?? '—'}</td>
                  <td className={`${cx.td} font-mono`}>
                    {d.salida_hora ?? (
                      <Chip tone="no">sin checar salida</Chip>
                    )}
                  </td>
                  <td className={cx.tdNum}>
                    {d.minutos_comida > 0 ? `${d.minutos_comida} min` : '—'}
                    {d.comida_larga && <span className="text-sa-strawberry"> ⚑</span>}
                  </td>
                  <td className={cx.tdNum} title={`De entrada a salida: ${hhmm(d.minutos_bruto)}`}>
                    {hhmm(d.minutos_trabajados)}
                  </td>
                  <td className={cx.td}>
                    {d.corregido && <Chip tone="neutral">corregido</Chip>}{' '}
                    {d.comida_abierta && <Chip tone="no">sin regreso de comida</Chip>}{' '}
                    <button
                      onClick={() => void verDia(d.dia)}
                      className="text-[11px] text-sa-green underline"
                    >
                      ver checadas
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {verReglas && cfg && (
        <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-center justify-center p-6">
          <div className="bg-sa-cream-paper rounded-sa-lg max-w-lg w-full p-7 max-h-[85vh] overflow-y-auto">
            <p className="font-display text-3xl text-sa-green-ink leading-tight">
              Reglas del checador
            </p>
            <p className="text-sm text-sa-green-ink/60 mt-1 mb-6 leading-relaxed">
              Aplican de la siguiente checada en adelante. Lo ya registrado no se
              recalcula — sería reescribir historia.
            </p>

            <div className="space-y-4">
              {([
                ['comida_min', 'Minutos de comida esperados', 'Solo referencia, para comparar contra lo real.'],
                ['comida_max_min', 'Comida larga a partir de', 'Una comida más larga sale marcada en el histórico.'],
                ['jornada_min', 'Jornada esperada (minutos)', 'Cuánto debería durar un turno completo.'],
                ['tolerancia_min', 'Tolerancia (minutos)', 'Margen antes de contar un retardo.'],
                ['turno_max_horas', 'Turno abierto caduca a las (horas)', 'Una entrada más vieja ya no cuenta: es de ayer y se olvidó checar salida.'],
              ] as const).map(([campo, etiqueta, ayuda]) => (
                <div key={campo}>
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm text-sa-green-ink">{etiqueta}</span>
                    <input
                      type="number"
                      value={cfg[campo]}
                      onChange={(e) =>
                        setCfg({ ...cfg, [campo]: Number(e.target.value) || 0 })
                      }
                      className="w-24 px-3 py-2 border border-sa-green-ink/15 rounded text-right font-mono text-sm"
                    />
                  </label>
                  <p className="text-[11px] text-sa-green-ink/50 mt-1 leading-snug">{ayuda}</p>
                </div>
              ))}

              <label className="flex items-start gap-3 pt-2 border-t border-dashed border-sa-green-ink/15">
                <input
                  type="checkbox"
                  checked={cfg.comida_se_paga}
                  onChange={(e) => setCfg({ ...cfg, comida_se_paga: e.target.checked })}
                  className="w-4 h-4 mt-1 accent-sa-green shrink-0"
                />
                <span>
                  <span className="text-sm text-sa-green-ink">La comida se paga</span>
                  <p className="text-[11px] text-sa-green-ink/50 mt-0.5 leading-snug">
                    Si está apagado, los minutos de comida se restan de las horas
                    trabajadas. Es la casilla que mueve el número de la nómina, así
                    que conviene confirmarla con tu contador.
                  </p>
                </span>
              </label>
            </div>

            <div className="mt-7 pt-6 border-t border-sa-green-ink/15">
              <p className="font-display text-2xl text-sa-green-ink leading-tight">
                Desde el telefono
              </p>
              <p className="text-sm text-sa-green-ink/65 mt-1.5 mb-4 leading-relaxed">
                Deja checar con el celular, pero solo si el telefono esta cerca de
                la tienda. <b>No prueba lo mismo que el kiosko</b> — un telefono
                puede mentir sobre donde esta, asi que estas checadas quedan
                marcadas aparte y con su distancia. Lo damos por bueno para
                entradas y salidas del dia a dia, no como evidencia formal.
              </p>

              <label className="flex items-start gap-3 mb-4">
                <input
                  type="checkbox"
                  checked={cfg.telefono_activo}
                  onChange={(e) => setCfg({ ...cfg, telefono_activo: e.target.checked })}
                  className="w-4 h-4 mt-1 accent-sa-green shrink-0"
                />
                <span>
                  <span className="text-sm text-sa-green-ink">Permitir checar desde el telefono</span>
                  <p className="text-[11px] text-sa-green-ink/50 mt-0.5 leading-snug">
                    Apagado, el link del telefono contesta que hay que checar en la barra.
                  </p>
                </span>
              </label>

              <div className="bg-white border border-sa-green-ink/12 rounded-sa px-4 py-3 mb-4">
                <p className="text-sm text-sa-green-ink mb-1">Donde esta la tienda</p>
                {cfg.tienda_lat != null && cfg.tienda_lon != null ? (
                  <p className="font-mono text-[12px] text-sa-green-ink/70">
                    {cfg.tienda_lat.toFixed(5)}, {cfg.tienda_lon.toFixed(5)}
                  </p>
                ) : (
                  <p className="text-[12px] text-sa-strawberry">
                    Sin marcar. Mientras no este, el telefono no deja checar a nadie.
                  </p>
                )}
                <button
                  onClick={() => marcarAqui()}
                  disabled={ubicando}
                  className="mt-2 text-[11px] text-sa-green underline disabled:opacity-50"
                >
                  {ubicando ? 'Leyendo tu ubicacion...' : 'Marcar este punto como la tienda'}
                </button>
                <p className="text-[11px] text-sa-green-ink/50 mt-1.5 leading-snug">
                  Hazlo <b>parado en la barra</b>, desde este mismo dispositivo. El
                  sistema no adivina donde esta la tienda, y una coordenada de otro
                  lado deja la geocerca midiendo contra el lugar equivocado.
                </p>
              </div>

              {([
                ['radio_m', 'Radio permitido (metros)', 'Que tan lejos del punto se acepta. 120 m cubre el local y su banqueta sin abarcar la calle de enfrente.'],
                ['precision_max_m', 'Precision minima exigida (metros)', 'Si el telefono dice "estoy aqui, mas o menos 500 m", no se acepta: una ubicacion vaga no acota nada.'],
              ] as const).map(([campo, etiqueta, ayuda]) => (
                <div key={campo} className="mb-3">
                  <label className="flex items-center justify-between gap-4">
                    <span className="text-sm text-sa-green-ink">{etiqueta}</span>
                    <input
                      type="number"
                      value={cfg[campo]}
                      onChange={(e) => setCfg({ ...cfg, [campo]: Number(e.target.value) || 0 })}
                      className="w-24 px-3 py-2 border border-sa-green-ink/15 rounded text-right font-mono text-sm"
                    />
                  </label>
                  <p className="text-[11px] text-sa-green-ink/50 mt-1 leading-snug">{ayuda}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-7">
              <button
                onClick={() => { setVerReglas(false); configChecador(sb).then(setCfg).catch(() => {}) }}
                className="px-6 py-4 rounded-sa font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 border border-sa-green-ink/15 bg-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => void guardarReglas()}
                disabled={guardando}
                className="flex-1 bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-xl disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Guardar reglas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalle && (
        <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-center justify-center p-6">
          <div className="bg-sa-cream-paper rounded-sa-lg max-w-2xl w-full p-7 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="font-display text-3xl text-sa-green-ink leading-tight">
                  Checadas del {detalle.dia}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/50 mt-1">
                  Todas, incluidas las corregidas
                </p>
              </div>
              <button
                onClick={() => setDetalle(null)}
                className="w-10 h-10 shrink-0 rounded-full bg-white border border-sa-green-ink/15 text-xl text-sa-green-ink/60"
              >
                ×
              </button>
            </div>

            {detalle.filas.length === 0 ? (
              <p className="text-sa-green-ink/60 py-6 text-center">Nadie checó ese día.</p>
            ) : (
              <div className="space-y-2">
                {detalle.filas.map((f) => (
                  <div
                    key={f.id}
                    className={`bg-white rounded-sa border px-4 py-3 ${
                      f.reemplazado
                        ? 'border-sa-green-ink/10 opacity-60'
                        : 'border-sa-green-ink/15'
                    }`}
                  >
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-mono text-lg text-sa-green-ink">{f.hora}</span>
                      <span className="text-sa-green-ink">{f.nombre}</span>
                      <Chip tone={f.tipo === 'entrada' ? 'si' : 'neutral'}>{f.tipo}</Chip>
                      {f.reemplazado && <Chip tone="no">reemplazada</Chip>}
                      {f.corrige_evento_id && <Chip tone="neutral">es una corrección</Chip>}
                      {f.origen === 'telefono' && (
                        <Chip tone="neutral">
                          telefono{f.distancia_m != null && ` · a ${f.distancia_m} m`}
                        </Chip>
                      )}
                      <span className="font-mono text-[11px] text-sa-green-ink/40 ml-auto">
                        {f.pantalla || f.origen}
                      </span>
                    </div>
                    {f.nota && (
                      <p className="text-[12px] text-sa-green-ink/70 mt-1.5 leading-snug">
                        {f.nota}
                        {f.autorizo && <span className="text-sa-green-ink/45"> · {f.autorizo}</span>}
                      </p>
                    )}
                    {!f.reemplazado && !f.corrige_evento_id && (
                      <button
                        onClick={() => void corregir(f, detalle.dia)}
                        className="mt-2 text-[11px] text-sa-green underline"
                      >
                        Corregir esta hora
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
