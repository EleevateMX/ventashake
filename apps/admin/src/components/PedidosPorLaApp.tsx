import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { configPedidosApp, guardarConfigPedidosApp, type ConfigPedidosApp } from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { Field, cx } from '../ui'

/**
 * El interruptor de «pedidos por la app» y sus reglas. Nace apagado.
 *
 * Prendido: en la app aparece «Lo quiero · pedir y pagar». El cliente paga
 * con tarjeta en una página de Clip, la orden entra a cocina como cualquier
 * venta y recibe un push cuando está lista. Si no paga en 20 minutos, la
 * orden caduca sola. WhatsApp es un botón aparte, también apagable.
 */
export function PedidosPorLaApp() {
  const [cfg, setCfg] = useState<ConfigPedidosApp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    configPedidosApp(sb).then(setCfg).catch((e) => setError(mensajeDeError(e)))
  }, [])

  async function guardar(cambios: Partial<ConfigPedidosApp>) {
    if (!cfg) return
    if (cambios.activo === true && !confirm('¿Prender los pedidos por la app? Los clientes van a poder pagar y pedir desde su teléfono. Antes conviene haber hecho un pago de prueba.')) return
    setGuardando(true); setError(null); setOk(null)
    try {
      setCfg(await guardarConfigPedidosApp(sb, cambios))
      setOk('Guardado.')
    } catch (e) { setError(mensajeDeError(e)) } finally { setGuardando(false) }
  }

  if (!cfg) return <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5"><p className={cx.muted}>{error ?? 'Cargando pedidos por la app…'}</p></section>

  return (
    <section className={`rounded-sa-lg border p-5 ${cfg.activo ? 'border-sa-mint bg-sa-mint/10' : 'border-sa-green-ink/10 bg-white'}`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="font-display text-xl text-sa-green-ink">Pedidos por la app</h2>
        <span className={`font-mono text-xs uppercase tracking-wide ${cfg.activo ? 'text-sa-green' : 'text-sa-green-ink/50'}`}>
          {cfg.activo ? (cfg.abierto_ahora ? 'Prendido · recibiendo ahora' : 'Prendido · fuera de horario') : 'Apagado'}
        </span>
      </div>
      <p className="text-xs text-sa-green-ink/60 mb-4">
        El cliente paga con tarjeta en la app (Clip) y pasa a recoger. La orden entra a cocina como cualquier venta
        y le avisamos por push cuando está lista. Sin pago en 20 minutos, caduca sola.
      </p>
      {error && <p className="text-sm text-sa-strawberry mb-3">{error}</p>}
      {ok && <p className="text-sm text-sa-green mb-3">{ok}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 py-2">
          <input type="checkbox" checked={cfg.activo} disabled={guardando} onChange={(e) => void guardar({ activo: e.target.checked })} />
          <span className="text-sm text-sa-green-ink"><b>Pedir y pagar en la app</b> (Clip)</span>
        </label>
        <label className="flex items-center gap-3 py-2">
          <input type="checkbox" checked={cfg.whatsapp} disabled={guardando} onChange={(e) => void guardar({ whatsapp: e.target.checked })} />
          <span className="text-sm text-sa-green-ink"><b>Botón de WhatsApp</b> en el menú</span>
        </label>
        <Field label="Recibimos pedidos de">
          <div className="flex items-center gap-2">
            <input className={cx.input} type="time" value={cfg.hora_inicio} disabled={guardando} onChange={(e) => void guardar({ hora_inicio: e.target.value })} />
            <span className={cx.muted}>a</span>
            <input className={cx.input} type="time" value={cfg.hora_fin} disabled={guardando} onChange={(e) => void guardar({ hora_fin: e.target.value })} />
          </div>
        </Field>
        <Field label="Minutos de preparación que prometemos">
          <input className={cx.input} type="number" min={5} max={120} value={cfg.minutos_preparacion} disabled={guardando}
            onChange={(e) => { const n = Number(e.target.value); if (n >= 5 && n <= 120) void guardar({ minutos_preparacion: n }) }} />
        </Field>
        <Field label="Mensaje fuera de horario (opcional)">
          <input className={cx.input} value={cfg.mensaje_cerrado ?? ''} placeholder="Recibimos pedidos de 7:00 a 20:30." disabled={guardando}
            onBlur={(e) => { if ((e.target.value || null) !== cfg.mensaje_cerrado) void guardar({ mensaje_cerrado: e.target.value || null }) }}
            onChange={(e) => setCfg({ ...cfg, mensaje_cerrado: e.target.value })} />
        </Field>
      </div>
    </section>
  )
}
