import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePosStore } from '@/store/posStore'
import { crearOrden, isSupabaseConfigured, descontarWalletCliente, descontarGiftCard, buscarGiftCard, agregarPuntosCliente } from '@pos/supabase'
import type { MetodoPago, PagoItem } from '../types'

const METODOS: { key: MetodoPago; label: string; icon: string }[] = [
  { key: 'efectivo', label: 'Efectivo', icon: '💵' },
  { key: 'tarjeta_credito', label: 'Crédito', icon: '💳' },
  { key: 'tarjeta_debito', label: 'Débito', icon: '💳' },
  { key: 'qr', label: 'QR', icon: '📱' },
  { key: 'wallet', label: 'Wallet', icon: '💰' },
]

const CAMBIO_RAPIDO = [50, 100, 200, 500]

const DEMO_GC = [
  { codigo: 'GIFT-2024', saldo: 150 },
  { codigo: 'GIFT-PROMO', saldo: 50 },
  { codigo: 'GIFT-BDAY', saldo: 200 },
]

export function Cobro() {
  const navigate = useNavigate()
  const { total, clienteActivo, marcarPagado, items, montoDescuento, montoPromos, promocionesAplicadas, notas, sucursalId, descuento } = usePosStore()

  const [modo, setModo] = useState<'simple' | 'mixto'>('simple')
  const [metodoPrincipal, setMetodoPrincipal] = useState<MetodoPago>('efectivo')
  const [recibido, setRecibido] = useState('')
  const [pagos, setPagos] = useState<PagoItem[]>([])
  const [montoPago, setMontoPago] = useState('')
  const [procesando, setProcesando] = useState(false)

  // Wallet local state
  const [usarWallet, setUsarWallet] = useState(false)

  // Gift card local state
  const [gcExpandido, setGcExpandido] = useState(false)
  const [gcCodigo, setGcCodigo] = useState('')
  const [gcDescuento, setGcDescuento] = useState(0)
  const [gcError, setGcError] = useState('')
  const [gcAplicada, setGcAplicada] = useState<{ codigo: string; saldo: number } | null>(null)

  const totalOrden = total()
  const walletDisponible = clienteActivo?.wallet_saldo ?? 0
  const walletUsado = usarWallet ? Math.min(walletDisponible, totalOrden) : 0
  const restanteConDescuentos = Math.max(0, totalOrden - walletUsado - gcDescuento)

  const recibidoNum = parseFloat(recibido) || 0
  const cambio = recibidoNum - restanteConDescuentos

  const totalPagado = pagos.reduce((s, p) => s + p.monto, 0)
  const restanteMixto = Math.max(0, restanteConDescuentos - totalPagado)

  function aplicarGiftCard() {
    const found = DEMO_GC.find((g) => g.codigo === gcCodigo.trim().toUpperCase())
    if (!found) {
      setGcError('Gift Card no encontrada')
      return
    }
    if (found.saldo <= 0) {
      setGcError('Gift Card sin saldo')
      return
    }
    const descuento = Math.min(found.saldo, totalOrden)
    setGcDescuento(descuento)
    setGcAplicada({ codigo: found.codigo, saldo: found.saldo })
    setGcError('')
  }

  function quitarGiftCard() {
    setGcDescuento(0)
    setGcAplicada(null)
    setGcCodigo('')
    setGcError('')
  }

  function agregarPago(metodo: MetodoPago) {
    const monto = parseFloat(montoPago) || restanteMixto
    if (monto <= 0) return
    setPagos((prev) => [...prev, { metodo, monto: Math.min(monto, restanteMixto) }])
    setMontoPago('')
  }

  async function confirmarPago() {
    setProcesando(true)

    const metodoPagoFinal: MetodoPago = modo === 'simple'
      ? metodoPrincipal
      : (pagos[0]?.metodo ?? 'efectivo')

    let folio = `A-${Date.now().toString(36).slice(-4).toUpperCase()}`

    if (isSupabaseConfigured) {
      try {
        const orden = await crearOrden(
          {
            sucursal_id: sucursalId,
            canal: 'pos',
            metodo_pago: metodoPagoFinal,
            total: totalOrden,
            descuento: montoDescuento() + montoPromos(),
            cliente_id: clienteActivo?.id ?? null,
            notas: notas || null,
            pagos_mixtos: modo === 'mixto' ? pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })) : undefined,
          },
          items.map((i) => ({
            producto_id: i.producto_id,
            cantidad: i.cantidad,
            precio_unitario: i.precio,
            cocina_id: i.cocina_id,
            personalizacion: i.personalizacion ?? null,
          })),
        )
        folio = `A-${orden.folio}`

        // Run loyalty transactions (wallet, gift card, points) — non-blocking
        const transactions: Promise<void>[] = []

        // 1. Deduct wallet if used
        if (walletUsado > 0 && clienteActivo?.id) {
          transactions.push(
            descontarWalletCliente(clienteActivo.id, walletUsado, orden.id)
          )
        }

        // 2. Deduct gift card if applied
        if (gcAplicada && gcDescuento > 0) {
          transactions.push(
            buscarGiftCard(gcAplicada.codigo).then(gc => {
              if (gc) return descontarGiftCard(gc.id, gcDescuento)
            })
          )
        }

        // 3. Add points: 1 punto per $10 spent (floor)
        if (clienteActivo?.id) {
          const puntosGanados = Math.floor(totalOrden / 10)
          if (puntosGanados > 0) {
            transactions.push(
              agregarPuntosCliente(clienteActivo.id, puntosGanados, orden.id)
            )
          }
        }

        await Promise.allSettled(transactions)
      } catch (err) {
        console.error('Error al guardar orden en Supabase:', err)
        // fall through — folio already set from timestamp above
      }
    } else {
      await new Promise((r) => setTimeout(r, 800))
    }

    marcarPagado(folio)
    navigate('/')
    setProcesando(false)
  }

  const listoSimple = restanteConDescuentos <= 0
    || (metodoPrincipal !== 'efectivo' || recibidoNum >= restanteConDescuentos)
  const listo = modo === 'simple' ? listoSimple : totalPagado >= restanteConDescuentos

  return (
    <div className="h-screen flex flex-col bg-sa-cream-paper overflow-hidden">
      {/* Hero strip with total */}
      <header className="bg-sa-green-deep text-sa-cream flex-shrink-0">
        <div className="flex items-center gap-4 px-6 py-3 border-b border-sa-cream/10">
          <button
            onClick={() => navigate('/')}
            className="text-sa-cream/70 hover:text-sa-cream transition-colors text-2xl"
          >
            ←
          </button>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50">
              Cobrar orden
            </p>
            <p className="font-display text-lg text-sa-cream">
              {items.length} {items.length === 1 ? 'producto' : 'productos'}
            </p>
          </div>
          {clienteActivo && (
            <div className="ml-auto flex items-center gap-2 bg-sa-blueberry/20 px-4 py-2 rounded-full border border-sa-blueberry/30">
              <span>👤</span>
              <span className="font-mono text-sm text-sa-cream">{clienteActivo.nombre}</span>
            </div>
          )}
        </div>
        <div className="px-6 py-6 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-sa-cream/50 mb-2">
            Total a cobrar
          </p>
          <p className="font-display text-7xl text-sa-cream leading-none">
            ${totalOrden.toFixed(2)}
          </p>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: payment options */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Mode toggle */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setModo('simple')}
              className={`flex-1 py-3 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
                modo === 'simple'
                  ? 'bg-sa-green text-sa-cream'
                  : 'bg-sa-cream-soft text-sa-green-ink/60 hover:bg-sa-cream-warm'
              }`}
            >
              Un método
            </button>
            <button
              onClick={() => setModo('mixto')}
              className={`flex-1 py-3 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
                modo === 'mixto'
                  ? 'bg-sa-green text-sa-cream'
                  : 'bg-sa-cream-soft text-sa-green-ink/60 hover:bg-sa-cream-warm'
              }`}
            >
              Pago mixto
            </button>
          </div>

          {modo === 'simple' ? (
            <>
              {/* Single method selection */}
              <div className="grid grid-cols-5 gap-3 mb-5">
                {METODOS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetodoPrincipal(m.key)}
                    className={`flex flex-col items-center gap-2 py-5 rounded-sa bg-sa-cream-soft transition-all ${
                      metodoPrincipal === m.key
                        ? 'ring-4 ring-sa-green shadow-sa-sm'
                        : 'hover:bg-sa-cream-warm'
                    }`}
                  >
                    <span className="text-3xl">{m.icon}</span>
                    <span className="font-display text-sm text-sa-green-ink">{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Cash received */}
              {metodoPrincipal === 'efectivo' && restanteConDescuentos > 0 && (
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
                      placeholder={restanteConDescuentos.toFixed(2)}
                      className="w-full pl-10 pr-4 py-3 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-2xl text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                    />
                  </div>
                  {/* Quick amount buttons */}
                  <div className="flex gap-2 mb-3">
                    {CAMBIO_RAPIDO.filter((v) => v >= restanteConDescuentos).slice(0, 4).map((v) => (
                      <button
                        key={v}
                        onClick={() => setRecibido(String(v))}
                        className="flex-1 py-2.5 bg-sa-cream-warm hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                      >
                        ${v}
                      </button>
                    ))}
                    <button
                      onClick={() => setRecibido(restanteConDescuentos.toFixed(2))}
                      className="flex-1 py-2.5 bg-sa-banana/40 hover:bg-sa-banana rounded-full font-mono text-sm text-sa-green-ink transition-colors"
                    >
                      Exacto
                    </button>
                  </div>
                  {recibidoNum >= restanteConDescuentos && (
                    <div className="flex justify-between items-center bg-sa-mint/25 rounded-sa px-4 py-3 border border-sa-mint/50">
                      <span className="font-mono text-sm uppercase tracking-wide text-sa-green-ink/70">
                        Cambio
                      </span>
                      <span className="font-display text-2xl text-sa-green">
                        ${cambio.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Mixed payment mode */
            <div className="bg-white rounded-sa p-5 shadow-sa-sm mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">
                  Pagos registrados
                </p>
                <p className="font-mono text-sm text-sa-green-ink/60">
                  Pendiente: <span className="font-bold text-sa-strawberry">${restanteMixto.toFixed(2)}</span>
                </p>
              </div>

              {/* Added payments */}
              {pagos.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 border-b border-sa-green-ink/10">
                  <span className="text-sm text-sa-green-ink capitalize">{p.metodo.replace('_', ' ')}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-sa-green-ink">${p.monto.toFixed(2)}</span>
                    <button
                      onClick={() => setPagos((prev) => prev.filter((_, j) => j !== i))}
                      className="text-sa-strawberry/70 hover:text-sa-strawberry text-xs"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {/* Add payment */}
              {restanteMixto > 0 && (
                <div className="mt-4 space-y-3">
                  <input
                    type="number"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    placeholder={`Monto (máx $${restanteMixto.toFixed(2)})`}
                    className="w-full px-4 py-2.5 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                  />
                  <div className="grid grid-cols-5 gap-2">
                    {METODOS.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => agregarPago(m.key)}
                        className="flex flex-col items-center gap-1 py-3 bg-sa-cream-soft hover:bg-sa-cream-warm rounded-sa transition-all"
                      >
                        <span className="text-lg">{m.icon}</span>
                        <span className="font-mono text-[10px] uppercase text-sa-green-ink/70">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Wallet toggle */}
          {clienteActivo && walletDisponible > 0 && (
            <div className="bg-white rounded-sa p-4 shadow-sa-sm mb-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-sa-green-ink">
                  💰 Pagar con Wallet · ${walletDisponible.toFixed(2)} disponibles
                </span>
                <button
                  onClick={() => setUsarWallet((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    usarWallet ? 'bg-sa-green' : 'bg-sa-green-ink/20'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      usarWallet ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {usarWallet && walletUsado > 0 && (
                <p className="font-mono text-xs text-sa-green-ink/60 mt-2">
                  Restante a cobrar: <span className="font-bold text-sa-green-ink">${restanteConDescuentos.toFixed(2)}</span>
                </p>
              )}
            </div>
          )}

          {/* Gift card collapsible */}
          {clienteActivo && (
            <div className="bg-white rounded-sa shadow-sa-sm mb-3">
              <button
                onClick={() => setGcExpandido((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 font-mono text-sm text-sa-green-ink/70"
              >
                <span>🎁 ¿Tiene Gift Card?</span>
                <span className="text-xs">{gcExpandido ? '▲' : '▼'}</span>
              </button>
              {gcExpandido && (
                <div className="px-4 pb-4">
                  {gcAplicada ? (
                    <div className="flex items-center justify-between bg-sa-mint/20 rounded-sa px-3 py-2 border border-sa-mint/40">
                      <span className="font-mono text-sm text-sa-green-ink">
                        Gift Card aplicada · −${gcDescuento.toFixed(2)}
                      </span>
                      <button
                        onClick={quitarGiftCard}
                        className="text-sa-strawberry/70 hover:text-sa-strawberry text-xs ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={gcCodigo}
                          onChange={(e) => { setGcCodigo(e.target.value); setGcError('') }}
                          placeholder="Código gift card"
                          className="flex-1 px-3 py-2 bg-sa-cream-soft border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                        />
                        <button
                          onClick={aplicarGiftCard}
                          className="px-4 py-2 bg-sa-green text-sa-cream rounded-sa font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
                        >
                          Aplicar
                        </button>
                      </div>
                      {gcError && (
                        <p className="font-mono text-xs text-sa-strawberry mt-1.5">{gcError}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Puntos a ganar */}
          {clienteActivo && (
            <div className="bg-sa-green/10 border border-sa-green/30 rounded-sa px-4 py-2.5 mb-4">
              <p className="font-mono text-xs text-sa-green-ink leading-tight">
                ⭐ {clienteActivo.nombre} ganará ~{Math.floor(totalOrden / 10)} puntos con esta compra
              </p>
            </div>
          )}
        </div>

        {/* Right: order summary + confirm */}
        <div className="w-80 bg-white border-l border-sa-green-ink/10 flex flex-col p-5">
          <h3 className="font-display text-lg text-sa-green-ink mb-3">Ticket</h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 mb-4 font-mono text-sm">
            {items.map((item) => (
              <div key={item.producto_id} className="flex justify-between py-1 border-b border-dashed border-sa-green-ink/10">
                <span className="text-sa-green-ink/70 truncate flex-1 mr-2">
                  ×{item.cantidad} {item.nombre}
                </span>
                <span className="font-medium text-sa-green-ink flex-shrink-0">
                  ${(item.precio * item.cantidad).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-sa-green-ink/15 pt-3 space-y-1 mb-4 font-mono text-sm">
            {montoDescuento() > 0 && (
              <div className="flex justify-between text-sa-strawberry">
                <span>Descuento manual</span>
                <span>−${montoDescuento().toFixed(2)}</span>
              </div>
            )}
            {montoPromos() > 0 && promocionesAplicadas.map((p) => (
              <div key={p.promo.id} className="flex justify-between text-sa-green">
                <span className="truncate flex-1 mr-2">🎟️ {p.razon}</span>
                <span className="flex-shrink-0">−${p.descuento.toFixed(2)}</span>
              </div>
            ))}
            {gcDescuento > 0 && (
              <div className="flex justify-between text-sa-green">
                <span>🎁 Gift Card</span>
                <span>−${gcDescuento.toFixed(2)}</span>
              </div>
            )}
            {usarWallet && walletUsado > 0 && (
              <div className="flex justify-between text-sa-blueberry">
                <span>💰 Wallet</span>
                <span>−${walletUsado.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-sa-green-ink/10">
              <span className="font-display text-xl text-sa-green-ink">Total</span>
              <span className="font-display text-2xl text-sa-green-ink">${restanteConDescuentos.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={confirmarPago}
            disabled={!listo || procesando}
            className="w-full bg-sa-strawberry disabled:opacity-40 hover:brightness-110 active:scale-[0.98] text-white py-4 rounded-sa-lg font-display text-xl shadow-sa-sm transition-all"
          >
            {procesando ? 'Agitando…' : 'Confirmar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}
