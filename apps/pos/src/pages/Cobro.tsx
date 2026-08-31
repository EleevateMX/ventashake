import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { sb } from '../lib/sb'
import {
  crearOrden, cobrarOrden, cobrarOrdenDividido, canjearCupon, registrarAplicacionPromo,
} from '@shake/supabase'
import { imprimirTicket, type TicketData } from '@shake/ui'
import { mxn, mensajeDeError } from '@shake/utils'
import type { MetodoPago } from '@shake/types'
import {
  PagoDividido, DIVISION_INICIAL, partesDeDivision, type Division,
} from '@/components/pos/PagoDividido'

const METODOS: { key: MetodoPago; label: string; icon: string; pideRef?: boolean }[] = [
  { key: 'efectivo', label: 'Efectivo', icon: '💵' },
  { key: 'tarjeta', label: 'Tarjeta', icon: '💳' },
  { key: 'clip', label: 'Clip', icon: '📟', pideRef: true },
  { key: 'cortesia', label: 'Cortesía', icon: '🎁' },
  { key: 'otro', label: 'Otro', icon: '•', pideRef: true },
]

const CAMBIO_RAPIDO = [50, 100, 200, 500]

export function Cobro() {
  const navigate = useNavigate()
  const {
    empleado, almacen, corte,
    items, cliente, cupon, promo,
    subtotal, descuentoTotal, neto, limpiarOrden,
  } = usePosStore()

  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [referencia, setReferencia] = useState('')
  const [recibido, setRecibido] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** "Me das $100 en efectivo y el resto con tarjeta" (petición del 29/08/26). */
  const [dividido, setDividido] = useState(false)
  const [division, setDivision] = useState<Division>(DIVISION_INICIAL)

  // Guarda: sin corte o sin ítems no hay nada que cobrar.
  if (!corte || !almacen || items.length === 0) {
    navigate('/', { replace: true })
    return null
  }

  const totalNeto = neto()
  const metodoSel = METODOS.find((m) => m.key === metodo)!
  const recibidoNum = parseFloat(recibido) || 0
  const cambio = recibidoNum - totalNeto
  const { partes, error: errorDivision } = partesDeDivision(division, totalNeto)
  const listo = dividido
    ? partes !== null
    : metodo !== 'efectivo' || totalNeto <= 0 || recibidoNum >= totalNeto
  /** Lo que se imprime en el ticket como forma de pago. */
  const etiquetaPago = dividido && partes
    ? partes
        .map((p) => `${METODOS.find((m) => m.key === p.metodo)?.label ?? p.metodo} ${mxn(p.monto)}`)
        .join(' + ')
    : metodoSel.label

  async function confirmarPago() {
    if (procesando) return
    setProcesando(true)
    setError(null)
    try {
      const orden = await crearOrden(
        sb,
        {
          sucursal_id: almacen!.sucursal_id,
          almacen_id: almacen!.id,
          canal: 'pos',
          corte_id: corte!.id,
          cliente_id: cliente?.id ?? null,
          empleado_id: empleado?.id ?? null,
          descuento: descuentoTotal(),
        },
        items.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          precio_unitario: l.producto.precio,
          personalizacion: l.personalizacion,
        })),
      )
      // Cupón: canjear (marca usado + liga a la orden) antes de cobrar.
      if (cupon) await canjearCupon(sb, cupon.id, orden.id)
      // Promo: registrar su aplicación (throttle + reporte).
      if (promo && cliente) await registrarAplicacionPromo(sb, promo.id, cliente.id, orden.id)
      // Cobro inmediato aprobado → el trigger descuenta inventario y manda a cocina.
      // idempotencyKey: si esta llamada se reintenta (timeout de red, doble
      // tap) la base devuelve el mismo pago en vez de crear uno duplicado.
      // El servidor valida que las partes sumen el total ANTES de insertar
      // ninguna: no existe la orden cobrada a medias.
      if (dividido && partes) {
        await cobrarOrdenDividido(sb, orden.id, partes, {
          autorizadoPor: empleado?.id,
          idempotencyKey: crypto.randomUUID(),
        })
      } else {
        await cobrarOrden(sb, orden.id, metodo, totalNeto, {
          referencia: referencia.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        })
      }

      const gana = cliente ? Math.min(100, Math.floor(totalNeto / 10)) : 0
      const ticket: TicketData = {
        folio: orden.folio,
        fecha: new Date(),
        cajero: empleado?.nombre,
        canal: 'Caja',
        items: items.map((l) => ({
          cantidad: l.cantidad,
          nombre: l.producto.nombre,
          precioUnitario: l.producto.precio,
        })),
        descuento: descuentoTotal(),
        metodoPago: etiquetaPago,
        referenciaPago: dividido ? null : referencia.trim() || null,
        recibido: !dividido && metodo === 'efectivo' && recibidoNum > 0 ? recibidoNum : undefined,
        clienteNombre: cliente?.nombre ?? null,
        mancuernasGanadas: cliente ? gana : undefined,
        mancuernasSaldo: cliente ? cliente.mancuernas + gana : undefined,
        codigoRewards: cliente?.codigo ?? null,
      }
      imprimirTicket(ticket)

      limpiarOrden()
      navigate('/', { replace: true })
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-sa-cream-paper overflow-hidden">
      {/* Hero con total */}
      <header className="bg-sa-green-deep text-sa-cream flex-shrink-0">
        <div className="flex items-center gap-4 px-6 py-3 border-b border-sa-cream/10">
          <button
            onClick={() => navigate('/')}
            className="text-sa-cream/70 hover:text-sa-cream transition-colors text-2xl"
          >
            ←
          </button>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">Cobrar orden</p>
            <p className="font-display text-lg text-sa-cream">
              {items.length} {items.length === 1 ? 'producto' : 'productos'}
            </p>
          </div>
          {cliente && (
            <div className="ml-auto flex items-center gap-2 bg-sa-blueberry/20 px-4 py-2 rounded-full border border-sa-blueberry/30">
              <span>👤</span>
              <span className="font-mono text-sm text-sa-cream">{cliente.nombre}</span>
            </div>
          )}
        </div>
        <div className="px-6 py-6 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50 mb-2">Total a cobrar</p>
          <p className="font-display text-7xl text-sa-cream leading-none">{mxn(totalNeto)}</p>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Izquierda: método de pago */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Un solo interruptor. Dividir es la excepción, no un método más:
              meterlo entre los cinco iconos haría que se tocara por error. */}
          <div className="flex gap-2 mb-4">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => setDividido(v)}
                className={`flex-1 py-3 rounded-sa font-mono text-xs uppercase tracking-wide transition-all ${
                  dividido === v
                    ? 'bg-sa-green-ink text-sa-cream'
                    : 'bg-sa-cream-soft text-sa-green-ink/60 hover:bg-sa-cream-warm'
                }`}
              >
                {v ? 'Pago dividido' : 'Una sola forma de pago'}
              </button>
            ))}
          </div>

          {dividido && (
            <PagoDividido total={totalNeto} valor={division} onCambio={setDivision} />
          )}

          <div className={`grid grid-cols-5 gap-3 mb-5 ${dividido ? 'hidden' : ''}`}>
            {METODOS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetodo(m.key)}
                className={`flex flex-col items-center gap-2 py-5 rounded-sa bg-sa-cream-soft transition-all ${
                  metodo === m.key ? 'ring-4 ring-sa-green shadow-sa-sm' : 'hover:bg-sa-cream-warm'
                }`}
              >
                <span className="text-3xl">{m.icon}</span>
                <span className="font-display text-sm text-sa-green-ink">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Efectivo: recibido + cambio */}
          {!dividido && metodo === 'efectivo' && totalNeto > 0 && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Recibido
              </label>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sa-green-ink/40 text-xl">$</span>
                <input
                  type="number"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  placeholder={totalNeto.toFixed(2)}
                  className="w-full pl-10 pr-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                />
              </div>
              <div className="flex gap-2 mb-3">
                {CAMBIO_RAPIDO.filter((v) => v >= totalNeto).slice(0, 4).map((v) => (
                  <button
                    key={v}
                    onClick={() => setRecibido(String(v))}
                    className="flex-1 py-2.5 bg-sa-cream-warm hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                  >
                    ${v}
                  </button>
                ))}
                <button
                  onClick={() => setRecibido(totalNeto.toFixed(2))}
                  className="flex-1 py-2.5 bg-sa-banana/40 hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                >
                  Exacto
                </button>
              </div>
              {recibidoNum >= totalNeto && recibidoNum > 0 && (
                <div className="flex justify-between items-center bg-sa-mint/25 rounded-sa px-4 py-3 border border-sa-mint/50">
                  <span className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/70">Cambio</span>
                  <span className="font-display text-2xl text-sa-green">{mxn(cambio)}</span>
                </div>
              )}
            </div>
          )}

          {/* Referencia para Clip / Otro */}
          {!dividido && metodoSel.pideRef && (
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <label className="block font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                {metodo === 'clip' ? 'Referencia / folio del voucher Clip' : 'Referencia'}
              </label>
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder={metodo === 'clip' ? 'Cobra en el Stand 2 y captura el folio' : ''}
                className="w-full px-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              />
              {metodo === 'clip' && (
                <p className="font-mono text-xs text-sa-green-ink/50 mt-2 leading-relaxed">
                  Cobra el monto en la terminal Clip Stand 2 y confirma aquí con la referencia del
                  voucher. (La confirmación automática por webhook es una fase posterior.)
                </p>
              )}
            </div>
          )}

          {/* Puntos a ganar */}
          {cliente && (
            <div className="bg-sa-green/10 border border-sa-green/30 rounded-sa px-4 py-2.5 mb-4">
              <p className="font-mono text-xs text-sa-green-ink leading-tight">
                🏋️ {cliente.nombre} ganará ~{Math.min(100, Math.floor(totalNeto / 10))} mancuernas con esta compra
              </p>
            </div>
          )}

          {/* Lo que falta para poder cobrar dividido, dicho antes de tocar
              el botón — no después, con el cliente esperando. */}
          {dividido && errorDivision && !error && (
            <div className="bg-sa-banana/25 border border-sa-banana rounded-sa px-4 py-3 mb-4">
              <p className="font-mono text-sm text-sa-coffee">{errorDivision}</p>
            </div>
          )}

          {error && (
            <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-4">
              <p className="font-mono text-sm text-sa-strawberry">{error}</p>
            </div>
          )}
        </div>

        {/* Derecha: resumen + confirmar */}
        <div className="w-80 bg-white border-l border-sa-green-ink/10 flex flex-col p-5">
          <h3 className="font-display text-lg text-sa-green-ink mb-3">Ticket</h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 mb-4 font-mono text-sm">
            {items.map((l) => (
              <div key={l.lineaId} className="py-1 border-b border-dashed border-sa-green-ink/10">
                <div className="flex justify-between">
                  <span className="text-sa-green-ink/70 truncate flex-1 mr-2">×{l.cantidad} {l.producto.nombre}</span>
                  <span className="font-medium text-sa-green-ink flex-shrink-0">{mxn(l.producto.precio * l.cantidad)}</span>
                </div>
                {l.personalizacion && (
                  <p className="text-xs text-sa-strawberry leading-snug">📝 {l.personalizacion}</p>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-sa-green-ink/15 pt-3 space-y-1 mb-4 font-mono text-sm">
            <div className="flex justify-between text-sa-green-ink/60">
              <span>Subtotal</span>
              <span>{mxn(subtotal())}</span>
            </div>
            {descuentoTotal() > 0 && (
              <div className="flex justify-between text-sa-strawberry">
                <span>Descuento</span>
                <span>−{mxn(descuentoTotal())}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-sa-green-ink/10">
              <span className="font-display text-xl text-sa-green-ink">Total</span>
              <span className="font-display text-2xl text-sa-green-ink">{mxn(totalNeto)}</span>
            </div>
          </div>
          <button
            onClick={() => void confirmarPago()}
            disabled={!listo || procesando}
            className="w-full bg-sa-strawberry disabled:opacity-40 hover:brightness-110 active:scale-[0.98] text-white py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
          >
            {procesando
              ? 'Agitando…'
              : dividido
                ? `Cobrar en dos ${mxn(totalNeto)}`
                : `Confirmar pago ${mxn(totalNeto)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
