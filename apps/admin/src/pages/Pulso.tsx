import { useEffect, useRef, useState } from 'react'
import { sb } from '../lib/sb'
import { pulsoDesarrollo } from '@shake/supabase'
import type { PulsoDesarrollo } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'

/**
 * El pulso: minuto a minuto, y enfocado en lo que se atora.
 *
 * "En vivo" contesta *cómo va el día* para gerencia. Esto contesta la
 * pregunta del que sostiene el sistema: **qué está roto ahora**.
 *
 * Lo importante de la gráfica no son las barras altas: son los **huecos**.
 * Un minuto con pedidos levantados y cero cobrados es la firma exacta de
 * la tienda parada. El 2 de septiembre eso pasó de 07:28 a 07:31 y no lo
 * vio nadie hasta que llegó una foto por WhatsApp; con esta pantalla
 * abierta se ve solo.
 */

const CADA = 15_000

function Barra({ m, max }: { m: PulsoDesarrollo['latido'][number]; max: number }) {
  const alto = (n: number) => (max === 0 ? 0 : Math.round((n / max) * 100))
  // Levantó pedidos y no cobró ninguno: eso es lo que hay que ver de lejos.
  const atorado = m.levantadas > 0 && m.cobradas === 0
  return (
    <div className="flex-1 min-w-0 flex flex-col justify-end h-24 group relative" title={
      `${m.etiqueta} · ${m.levantadas} levantadas · ${m.cobradas} cobradas · ${m.impresas} impresas` +
      (m.fallidas ? ` · ${m.fallidas} fallidas` : '')
    }>
      {atorado && (
        <div className="absolute inset-x-0 top-0 bottom-0 bg-red-500/15 rounded-sm pointer-events-none" />
      )}
      <div className="flex items-end gap-[1px] h-full">
        <div
          className="flex-1 bg-neutral-400/50 dark:bg-neutral-500/50 rounded-t-sm min-h-[2px]"
          style={{ height: `${alto(m.levantadas)}%` }}
        />
        <div
          className={`flex-1 rounded-t-sm min-h-[2px] ${atorado ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ height: `${alto(m.cobradas)}%` }}
        />
      </div>
    </div>
  )
}

function Semaforo({
  titulo, valor, malo, detalle,
}: { titulo: string; valor: number | string; malo: boolean; detalle?: string }) {
  return (
    <div
      className={`rounded-lg p-4 ${
        malo
          ? 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200'
          : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200'
      }`}
    >
      <p className="text-3xl font-semibold leading-none tabular-nums">{valor}</p>
      <p className="font-mono text-[10px] uppercase tracking-wider mt-2 opacity-70">{titulo}</p>
      {detalle && <p className="font-mono text-[10px] mt-1 opacity-60">{detalle}</p>}
    </div>
  )
}

export default function Pulso() {
  const [p, setP] = useState<PulsoDesarrollo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hace, setHace] = useState(0)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    const traer = () =>
      pulsoDesarrollo(sb)
        .then((d) => { if (vivo.current) { setP(d); setError(null); setHace(0) } })
        .catch((e) => { if (vivo.current) setError(mensajeDeError(e)) })
    void traer()
    const t = setInterval(traer, CADA)
    const s = setInterval(() => setHace((h) => h + 1), 1000)
    return () => { vivo.current = false; clearInterval(t); clearInterval(s) }
  }, [])

  if (error && !p) {
    return (
      <div>
        <PageHeader title="Pulso" subtitle="Minuto a minuto — solo desarrollo" />
        <ErrorMsg>{error}</ErrorMsg>
        <Panel>
          <p className={cx.muted}>
            Esta pantalla es solo del rol <strong>desarrollo</strong>. El servidor
            truena a propósito para cualquier otro, en vez de mostrar una
            pantalla vacía que parecería que no está pasando nada.
          </p>
        </Panel>
      </div>
    )
  }
  if (!p) return <Loading>Tomando el pulso…</Loading>

  const max = Math.max(1, ...p.latido.map((m) => Math.max(m.levantadas, m.cobradas)))
  const ultimos = p.latido.slice(-15)
  const levantadas = ultimos.reduce((t, m) => t + m.levantadas, 0)
  const cobradas = ultimos.reduce((t, m) => t + m.cobradas, 0)
  // La pregunta que importa: ¿se está levantando venta que no se cobra?
  const parada = levantadas >= 3 && cobradas === 0
  const atorada = p.atorado.ordenes_cobrando.length

  return (
    <div>
      <PageHeader
        title="Pulso"
        subtitle={`Minuto a minuto · se refresca solo · hace ${hace}s`}
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {parada && (
        <div className="rounded-lg p-5 mb-5 bg-red-600 text-white">
          <p className="text-2xl font-semibold">La tienda no está cobrando</p>
          <p className="mt-1 opacity-90">
            {levantadas} pedidos levantados en el último cuarto de hora y ninguno
            cobrado. Revisa el cobro antes que nada.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4 mb-6">
        <Semaforo
          titulo="Atoradas en cobro"
          valor={atorada}
          malo={atorada > 0}
          detalle={atorada > 0 ? 'llevan más de 3 min sin resolverse' : 'ninguna'}
        />
        <Semaforo
          titulo="Impresión pendiente"
          valor={p.atorado.impresion_pendiente}
          malo={p.atorado.impresion_pendiente > 0}
          detalle={p.atorado.impresion_pendiente > 0 ? 'más de 90 s en cola' : 'el papel fluye'}
        />
        <Semaforo
          titulo="Efectivo mixto colgado"
          valor={p.atorado.efectivo_mixto_colgado}
          malo={p.atorado.efectivo_mixto_colgado > 0}
          detalle={p.atorado.efectivo_mixto_colgado > 0 ? 'mixtos que no cuajaron' : 'limpio'}
        />
        <Semaforo
          titulo="Sin pagar hoy"
          valor={p.infra.ordenes_sin_pagar_hoy}
          malo={p.infra.ordenes_sin_pagar_hoy > 5}
        />
      </div>

      <Panel>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h3 className={cx.h3}>Última hora, minuto a minuto</h3>
          <p className="font-mono text-[10px] uppercase tracking-wider opacity-60">
            <span className="inline-block w-2 h-2 rounded-sm bg-neutral-400 mr-1" />levantadas
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 ml-3 mr-1" />cobradas
            <span className="inline-block w-2 h-2 rounded-sm bg-red-500/30 ml-3 mr-1" />sin cobrar
          </p>
        </div>
        <div className="flex gap-[2px] mt-4">
          {p.latido.map((m) => <Barra key={m.minuto} m={m} max={max} />)}
        </div>
        <div className="flex justify-between font-mono text-[10px] opacity-50 mt-1">
          <span>{p.latido[0]?.etiqueta}</span>
          <span>{p.latido[Math.floor(p.latido.length / 2)]?.etiqueta}</span>
          <span>{p.latido[p.latido.length - 1]?.etiqueta}</span>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2 mt-5">
        <Panel>
          <h3 className={`${cx.h3} mb-3`}>Atoradas en cobro</h3>
          {atorada === 0 ? (
            <p className={cx.muted}>Ninguna. Todo lo que se levantó se resolvió.</p>
          ) : (
            <>
              <p className={`${cx.muted} mb-2`}>
                Se mandaron a la terminal y nunca se resolvieron. Casi siempre es
                la Clip Stand apagada o su app cerrada.
              </p>
              {p.atorado.ordenes_cobrando.map((o) => (
                <div key={o.folio} className="flex items-baseline justify-between gap-3 py-1 border-b border-current/5 last:border-0">
                  <span className="font-mono text-xs opacity-60">#{o.folio}</span>
                  <span className="font-mono text-xs tabular-nums">{mxn(Number(o.total))}</span>
                  <span className="font-mono text-[10px] opacity-50 w-20 text-right">
                    hace {o.minutos > 90 ? `${Math.round(o.minutos / 60)} h` : `${o.minutos} min`}
                  </span>
                </div>
              ))}
            </>
          )}
        </Panel>

        <Panel>
          <h3 className={`${cx.h3} mb-3`}>Lo que dijo la terminal (6 h)</h3>
          {p.fallos_de_clip.length === 0 ? (
            <p className={cx.muted}>Ningún rechazo.</p>
          ) : (
            p.fallos_de_clip.map((f, i) => (
              <div key={i} className="py-1.5 border-b border-current/5 last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs opacity-60">{f.hora} · #{f.folio}</span>
                  <span className="font-mono text-xs tabular-nums">{mxn(Number(f.monto))}</span>
                </div>
                <p className="font-mono text-[10px] opacity-70 mt-0.5">{f.codigo}</p>
                {f.mensaje && (
                  <p className="font-mono text-[10px] opacity-50 leading-snug">{f.mensaje}</p>
                )}
              </div>
            ))
          )}
        </Panel>
      </div>

      <Panel className="mt-5">
        <h3 className={`${cx.h3} mb-3`}>Las máquinas</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {p.infra.impresoras.map((i) => (
              <div key={i.nombre} className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-sm">{i.nombre}</span>
                <span className="font-mono text-[10px] opacity-60">v{i.version ?? '?'}</span>
                <span
                  className={`font-mono text-[10px] ${
                    i.hace_segundos > 60 ? 'text-red-600 dark:text-red-400 font-semibold' : 'opacity-60'
                  }`}
                >
                  late hace {i.hace_segundos}s
                </span>
              </div>
            ))}
          </div>
          <div className="font-mono text-[11px] space-y-1 opacity-80">
            <p>
              Modo del kiosko: <strong>{p.infra.modo_kiosko ?? '?'}</strong>
              {p.infra.modo_kiosko !== 'cajero' && (
                <span className="text-red-600 dark:text-red-400"> ← no es «cajero»</span>
              )}
            </p>
            <p>
              Corte abierto:{' '}
              {p.infra.corte_horas == null ? (
                'ninguno'
              ) : (
                <>
                  <strong>{p.infra.corte_horas} h</strong>
                  {p.infra.corte_horas > 24 && (
                    <span className="text-red-600 dark:text-red-400"> ← lleva días sin cerrarse</span>
                  )}
                </>
              )}
            </p>
            <p>Comandas fallidas (24 h): {p.atorado.comandas_fallidas_24h}</p>
          </div>
        </div>
      </Panel>
    </div>
  )
}
