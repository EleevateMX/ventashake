import { useEffect, useRef, useState } from 'react'
import { rewardsParaCaja, validarCodigoCanje, type RewardsCaja } from '@shake/supabase'
import { digitosDeCanje, mensajeDeError, mxn, normalizarCodigoEscaneado } from '@shake/utils'
import { sb } from '@/lib/sb'
import { useReglasMancuernas } from '@/lib/reglasMancuernas'
import type { ItemCarrito } from '@/store/carritoStore'

/**
 * El canje, en la caja.
 *
 * Aparece solo si el cliente identificado trae algo que usar; si no, la
 * pantalla de cobro se queda igual de simple que siempre. Nada aquí cobra
 * ni descuenta: solo recoge la decisión del cajero. El descuento lo aplica
 * el servidor sobre la orden ya creada, que es lo único que la caja puede
 * verificar contra el total.
 */

export interface DecisionRewards {
  /** Cuántas mancuernas usar. 0 = ninguna. */
  mancuernas: number
  /** El producto del carrito que va gratis con la tarjeta de sellos. */
  sello: { tipo: 'bebida' | 'alimento'; productoId: string; nombre: string } | null
}

export const SIN_REWARDS: DecisionRewards = { mancuernas: 0, sello: null }

/**
 * Clientes cuyo código de canje ya se validó en esta pantalla, con hasta
 * cuándo vale (el servidor da 20 min). Vive fuera del componente para que
 * un repintado o volver al carrito no lo vuelva a pedir.
 */
const validados = new Map<string, number>()

export function PanelRewards({
  clienteId, items, total, decision, onCambiar, onCodigoEscrito,
}: {
  clienteId: string
  items: ItemCarrito[]
  total: number
  decision: DecisionRewards
  onCambiar: (d: DecisionRewards) => void
  /** Si el lector tecleó el código dentro del nombre del pedido, se quita de ahí. */
  onCodigoEscrito?: (texto: string) => void
}) {
  const [datos, setDatos] = useState<RewardsCaja | null>(null)
  const reglas = useReglasMancuernas()
  const [, repintar] = useState(0)
  const pideCodigo = reglas.exigir_codigo_canje === true
  const autorizado = !pideCodigo || (validados.get(clienteId) ?? 0) > Date.now()

  useEffect(() => {
    let vivo = true
    rewardsParaCaja(sb, clienteId)
      .then((r) => { if (vivo) setDatos(r) })
      // Que falle esto no puede impedir cobrar: se cobra sin canje.
      .catch(() => { if (vivo) setDatos(null) })
    return () => { vivo = false }
  }, [clienteId])

  if (!datos?.existe) return null

  const tasa = datos.tasa ?? 10
  const disponible = datos.total ?? 0
  // El monedero no da cambio: nunca más de lo que cuesta la orden. Se
  // calcula sobre el total YA con el premio de sellos descontado, porque
  // así es como lo va a recortar el servidor.
  const yaGratis = decision.sello
    ? items.find((i) => i.producto_id === decision.sello!.productoId)?.precio ?? 0
    : 0
  const totalTrasSello = Math.max(0, total - yaGratis)
  const tope = Math.min(disponible, Math.floor(totalTrasSello * tasa))

  const tarjetaLista = (datos.sellos ?? []).filter((s) => s.listo)
  const hayAlgo = tope > 0 || tarjetaLista.length > 0
  if (!hayAlgo) return null

  if (!autorizado) {
    return (
      <CodigoDeCanje
        nombre={datos.nombre?.split(' ')[0] ?? 'el cliente'}
        resumen={[
          tarjetaLista.length > 0 ? `tarjeta de ${tarjetaLista.map((t) => (t.tipo === 'bebida' ? 'bebidas' : 'comida')).join(' y ')} llena` : null,
          tope > 0 ? `${disponible.toLocaleString('es-MX')} mancuernas (${mxn(datos.vale_pesos ?? 0)})` : null,
        ].filter(Boolean).join(' · ')}
        clienteId={clienteId}
        onCodigoEscrito={onCodigoEscrito}
        onValidado={(hasta) => { validados.set(clienteId, hasta); repintar((n) => n + 1) }}
      />
    )
  }

  return (
    <section className="rounded-sa-lg border-2 border-sa-banana bg-sa-banana/10 p-4 mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="font-display text-lg text-sa-green-ink leading-none">
          Rewards de {datos.nombre?.split(' ')[0]}
        </p>
        <span className="font-mono text-[11px] text-sa-green-ink/55">{datos.codigo}</span>
      </div>

      {/* ── Tarjeta de sellos ───────────────────────────────────────── */}
      {tarjetaLista.map((s) => {
        // El premio tiene que estar YA en el carrito: el servidor pone ese
        // renglón en $0 para que la comanda y el inventario sigan bien.
        const elegibles = items.filter(
          (i) => s.premios.includes(i.producto_id) && i.precio > 0,
        )
        const etiqueta = s.tipo === 'bebida' ? 'bebidas' : 'comida'

        return (
          <div key={s.tipo} className="mb-3">
            <p className="text-sm text-sa-green-ink/80 mb-1.5">
              <b>Tarjeta de {etiqueta} llena</b> ({s.tiene}/{s.requeridos}) — una va por cuenta de la casa.
            </p>

            {elegibles.length === 0 ? (
              <p className="text-[13px] text-sa-green-ink/55 leading-snug">
                Nada en el carrito califica todavía. Agrega la {etiqueta} que se lleva gratis
                y aparece aquí.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {elegibles.map((i) => {
                  const puesto = decision.sello?.productoId === i.producto_id
                  return (
                    <button
                      key={i.linea}
                      onClick={() =>
                        onCambiar({
                          ...decision,
                          sello: puesto
                            ? null
                            : { tipo: s.tipo, productoId: i.producto_id, nombre: i.nombre },
                        })
                      }
                      className={`rounded-sa px-3 py-2 text-sm border-2 transition-colors ${
                        puesto
                          ? 'bg-sa-green text-sa-cream border-sa-green'
                          : 'bg-white text-sa-green-ink border-sa-green-ink/15'
                      }`}
                    >
                      {puesto ? '✓ ' : ''}{i.nombre} · {mxn(i.precio)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Mancuernas ──────────────────────────────────────────────── */}
      {tope > 0 && (
        <div>
          <p className="text-sm text-sa-green-ink/80">
            Tiene <b>{disponible.toLocaleString('es-MX')} mancuernas</b> ({mxn(datos.vale_pesos ?? 0)}).
            {tope < disponible && <> Para esta orden alcanzan {tope.toLocaleString('es-MX')}.</>}
          </p>

          <div className="flex flex-wrap gap-2 mt-2">
            <BotonMonto
              activo={decision.mancuernas === 0}
              onClick={() => onCambiar({ ...decision, mancuernas: 0 })}
            >
              No usar
            </BotonMonto>
            {[0.25, 0.5].map((f) => {
              const n = Math.floor(tope * f)
              if (n <= 0) return null
              return (
                <BotonMonto
                  key={f}
                  activo={decision.mancuernas === n}
                  onClick={() => onCambiar({ ...decision, mancuernas: n })}
                >
                  {mxn(n / tasa)}
                </BotonMonto>
              )
            })}
            <BotonMonto
              activo={decision.mancuernas === tope}
              onClick={() => onCambiar({ ...decision, mancuernas: tope })}
            >
              Todo · {mxn(tope / tasa)}
            </BotonMonto>
          </div>

          {decision.mancuernas > 0 && (
            <p className="font-mono text-xs text-sa-green-ink/70 mt-2">
              {decision.mancuernas.toLocaleString('es-MX')} mancuernas ·
              queda por pagar <b>{mxn(Math.max(0, totalTrasSello - decision.mancuernas / tasa))}</b>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function BotonMonto({
  activo, onClick, children,
}: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sa px-3 py-2 text-sm border-2 transition-colors ${
        activo
          ? 'bg-sa-green text-sa-cream border-sa-green'
          : 'bg-white text-sa-green-ink border-sa-green-ink/15'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * El paso del código de canje (17/11/26). El QR fijo de Rewards se puede
 * fotografiar; el código de 6 dígitos de la app cambia cada 30 s. Se escanea
 * (el lector teclea SHKR-…) o se teclea en el pad. Solo aparece con el
 * interruptor de Admin → Rewards prendido.
 */
function CodigoDeCanje({
  nombre, resumen, clienteId, onValidado, onCodigoEscrito,
}: {
  nombre: string
  resumen: string
  clienteId: string
  onValidado: (hasta: number) => void
  onCodigoEscrito?: (texto: string) => void
}) {
  const [codigo, setCodigo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const buffer = useRef({ texto: '', ultima: 0 })

  async function validar(texto: string) {
    const d = digitosDeCanje(texto)
    if (!d) { setError('Son 6 dígitos.'); return }
    setTrabajando(true); setError(null)
    try {
      const r = await validarCodigoCanje(sb, clienteId, d)
      if (r.ok) onValidado(r.valido_hasta ? new Date(r.valido_hasta).getTime() : Date.now() + 15 * 60_000)
      else { setError(r.error ?? 'Ese código no sirve.'); setCodigo('') }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setTrabajando(false)
    }
  }

  // El lector: ráfaga de teclas que termina en Enter y dice SHKR-…
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const ahora = performance.now()
      const b = buffer.current
      if (ahora - b.ultima > 60) b.texto = ''
      b.ultima = ahora
      if (e.key === 'Enter') {
        const crudo = b.texto
        b.texto = ''
        if (/^SHKR-\d{6}$/.test(normalizarCodigoEscaneado(crudo))) {
          e.preventDefault()
          e.stopPropagation()
          onCodigoEscrito?.(crudo)
          void validar(crudo)
        }
        return
      }
      if (e.key.length === 1) b.texto += e.key
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  function tocar(t: string) {
    setError(null)
    if (t === '⌫') { setCodigo((c) => c.slice(0, -1)); return }
    const n = (codigo + t).slice(0, 6)
    setCodigo(n)
    if (n.length === 6) void validar(n)
  }

  return (
    <section className="rounded-sa-lg border-2 border-sa-banana bg-sa-banana/10 p-4 mb-4" data-no-recargar>
      <p className="font-display text-lg text-sa-green-ink leading-none">Rewards de {nombre}</p>
      <p className="text-sm text-sa-green-ink/75 mt-1.5">
        Tiene {resumen}. Para usarlo, pídele el <b>código de canje</b> de su app
        (Tu tarjeta → «Canjear en caja»): escanéalo o teclea los 6 números.
      </p>
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <div className="font-mono text-3xl tracking-[0.3em] text-sa-green-ink bg-white rounded-sa px-4 py-2 min-w-[11ch] text-center">
          {(codigo + '······').slice(0, 6)}
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '⌫'].map((t) => (
            <button key={t} onClick={() => tocar(t)} disabled={trabajando}
              className="w-11 h-11 rounded-sa bg-white border border-sa-green-ink/15 font-mono text-lg text-sa-green-ink disabled:opacity-40">
              {t}
            </button>
          ))}
        </div>
      </div>
      {trabajando && <p className="text-sm text-sa-green-ink/60 mt-2">Revisando…</p>}
      {error && <p className="text-sm text-sa-strawberry mt-2">{error}</p>}
      <p className="text-[12px] text-sa-green-ink/50 mt-2">Sin el código se cobra normal y sí suma mancuernas; solo no se usan.</p>
    </section>
  )
}
