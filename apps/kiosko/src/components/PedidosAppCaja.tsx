import React, { useEffect, useState } from 'react'
import { entregarPedidoAppEnCaja, type PedidoAppCaja } from '@shake/supabase'
import { mensajeDeError, mxn } from '@shake/utils'
import { sb } from '@/lib/sb'
import { useCarrito } from '@/store/carritoStore'
import { usePedidosApp } from '@/store/pedidosApp'
import { BotonTicket } from '@/components/BotonTicket'

/**
 * «Pedidos de la app» en la caja (17/11/26).
 *
 * Tres piezas:
 *   - BotonPedidosApp: el chip junto a «en espera», solo si hay pendientes.
 *   - AvisoPedidoApp: el anuncio que sale sobre cualquier pantalla cuando
 *     llega uno nuevo (también a media venta; no tapa los botones de cobro).
 *   - PanelPedidosApp: la lista completa, con lo de mostrador resaltado y
 *     el botón «Marcar como entregado».
 *
 * Lo de mostrador NO imprime etiqueta (así sigue): aquí es donde se ve.
 */

const ESTADO: Record<string, { texto: string; clase: string }> = {
  recibido: { texto: 'Pagado · por preparar', clase: 'bg-sa-banana text-sa-coffee' },
  preparando: { texto: 'En preparación', clase: 'bg-sa-mango/80 text-white' },
  listo: { texto: 'Listo · espera al cliente', clase: 'bg-sa-mint text-sa-green-ink' },
  entregado: { texto: 'Entregado', clase: 'bg-sa-green-ink/10 text-sa-green-ink/60' },
}

const PARTE: Record<string, string> = {
  pendiente: 'pendiente', en_preparacion: 'preparando', listo: '✓ listo', entregado: '✓ entregado', cancelado: 'cancelado',
}

export function BotonPedidosApp() {
  const n = usePedidosApp((s) => s.pedidos.filter((p) => p.estado !== 'entregado').length)
  const abrir = usePedidosApp((s) => s.setAbierto)
  if (n === 0) return null
  return (
    <button
      onClick={() => abrir(true)}
      className="inline-flex items-center gap-2 bg-sa-strawberry text-white px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide shadow-sa-sm"
    >
      <span aria-hidden>🛍️</span>
      {n} pedido{n === 1 ? '' : 's'} de la app
    </button>
  )
}

export function AvisoPedidoApp() {
  const aviso = usePedidosApp((s) => s.aviso)
  const cerrar = usePedidosApp((s) => s.cerrarAviso)
  const abrir = usePedidosApp((s) => s.setAbierto)

  // Se queda 25 s: lo suficiente para que alguien voltee, sin quedarse
  // tapando la pantalla del cliente.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(cerrar, 25_000)
    return () => clearTimeout(t)
  }, [aviso, cerrar])

  if (!aviso) return null
  const mostrador = aviso.renglones.filter((r) => r.mostrador)
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[min(640px,calc(100vw-2rem))]" role="alert">
      <div className="rounded-sa-lg bg-sa-green-deep text-sa-cream shadow-sa border-2 border-sa-strawberry px-5 py-4 flex items-center gap-4">
        <span className="text-3xl shrink-0" aria-hidden>🛍️</span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-sa-strawberry">Nuevo pedido desde la app · para recoger</p>
          <p className="font-display text-2xl leading-tight truncate">
            #{aviso.folio} · {aviso.nombre ?? 'Cliente'}
          </p>
          <p className="text-sm text-sa-cream/80 truncate">
            {aviso.preparar_a ? `Para las ${aviso.preparar_a} · ` : ''}{aviso.items}
          </p>
          {mostrador.length > 0 && (
            <p className="text-sm text-sa-banana truncate">
              📦 Del mostrador: {mostrador.map((r) => `${r.cantidad}× ${r.nombre}`).join(', ')}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => abrir(true)} className="px-4 py-2 rounded-full bg-sa-cream text-sa-green-ink font-semibold text-sm">Ver</button>
          <button onClick={cerrar} className="px-4 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider text-sa-cream/60">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

export function PanelPedidosApp() {
  const abierto = usePedidosApp((s) => s.abierto)
  const setAbierto = usePedidosApp((s) => s.setAbierto)
  const pedidos = usePedidosApp((s) => s.pedidos)
  const refrescar = usePedidosApp((s) => s.refrescar)
  const [verEntregados, setVerEntregados] = useState(false)

  useEffect(() => { if (abierto) void refrescar() }, [abierto, refrescar])

  if (!abierto) return null
  const pendientes = pedidos.filter((p) => p.estado !== 'entregado')
  const entregados = pedidos.filter((p) => p.estado === 'entregado')

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-center justify-center p-6" data-no-recargar onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
      <div className="bg-sa-cream-paper rounded-sa-lg shadow-sa w-full max-w-3xl max-h-full flex flex-col">
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3 border-b border-sa-green-ink/10">
          <div>
            <h2 className="font-display text-3xl text-sa-green-ink leading-none">Pedidos de la app</h2>
            <p className="text-sm text-sa-green-ink/60 mt-1">Pagados en la app, para recoger. Se quedan aquí hasta que los entregues.</p>
          </div>
          <button onClick={() => setAbierto(false)} className="w-11 h-11 rounded-full bg-sa-green-ink/5 text-sa-green-ink text-xl shrink-0" aria-label="Cerrar">✕</button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-4">
          {pendientes.length === 0 && (
            <p className="rounded-sa bg-sa-mint/15 px-4 py-6 text-center text-sa-green-ink">No hay pedidos de la app por entregar.</p>
          )}
          {pendientes.map((p) => <TarjetaPedido key={p.id} p={p} />)}

          {entregados.length > 0 && (
            <div>
              <button onClick={() => setVerEntregados((v) => !v)} className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/60 underline underline-offset-4">
                {verEntregados ? 'Ocultar' : 'Ver'} entregados hoy ({entregados.length})
              </button>
              {verEntregados && <div className="mt-3 space-y-3">{entregados.map((p) => <TarjetaPedido key={p.id} p={p} />)}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TarjetaPedido({ p }: { p: PedidoAppCaja }) {
  const cajero = useCarrito((s) => s.cajero)
  const refrescar = usePedidosApp((s) => s.refrescar)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const est = ESTADO[p.estado] ?? ESTADO.recibido
  const deCocina = p.renglones.filter((r) => !r.mostrador)
  const deMostrador = p.renglones.filter((r) => r.mostrador)
  const entregado = p.estado === 'entregado'

  async function entregar() {
    setTrabajando(true); setError(null)
    try {
      const r = await entregarPedidoAppEnCaja(sb, p.id, cajero?.id ?? null)
      if (!r.ok) setError(r.error ?? 'No se pudo marcar.')
      await refrescar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className={`rounded-sa-lg border-2 bg-white p-5 ${entregado ? 'border-sa-green-ink/10 opacity-70' : 'border-sa-strawberry/40'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-sa-strawberry">Pedido desde la app · para recoger</p>
          <p className="font-display text-4xl text-sa-green-ink leading-none mt-1">#{p.folio}</p>
          <p className="text-lg font-semibold text-sa-green-ink mt-1">{p.nombre ?? 'Cliente'}</p>
          <p className="font-mono text-xs text-sa-green-ink/55 mt-1">
            Pidió {p.hora}{p.preparar_a ? ` · para las ${p.preparar_a}` : ''} · {mxn(p.total)}
          </p>
        </div>
        <span className={`px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider ${est.clase}`}>{est.texto}</span>
      </div>

      {p.nota && <p className="mt-3 rounded-sa bg-sa-cream-soft px-3 py-2 text-sm text-sa-green-ink">💬 {p.nota}</p>}

      {deCocina.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/50 mb-1">
            Se prepara en {p.partes.map((x) => `${x.estacion} (${PARTE[x.estado] ?? x.estado})`).join(' · ') || 'barra/cocina'}
          </p>
          <Renglones lista={deCocina} />
        </div>
      )}

      {deMostrador.length > 0 && (
        <div className="mt-4 rounded-sa bg-sa-banana/25 border border-sa-banana px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-sa-coffee mb-1">📦 Del mostrador · tómalo tú (no tiene comanda)</p>
          <Renglones lista={deMostrador} />
        </div>
      )}

      {!entregado && (
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => void entregar()}
            disabled={trabajando || !p.puede_entregar}
            className="h-12 px-6 rounded-full bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40"
          >
            {trabajando ? 'Marcando…' : '✓ Marcar como entregado'}
          </button>
          <BotonTicket ordenId={p.id} folio={p.folio} tono="claro" compacto reimprimir={false} />
          {!p.puede_entregar && (
            <span className="text-sm text-sa-green-ink/60">Se puede entregar cuando barra o cocina lo marque listo.</span>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-sa-strawberry">{error}</p>}
    </div>
  )
}

function Renglones({ lista }: { lista: PedidoAppCaja['renglones'] }) {
  return (
    <ul className="space-y-1.5">
      {lista.map((r, i) => (
        <li key={i} className="text-sa-green-ink">
          <span className="font-semibold">{r.cantidad}× {r.nombre}</span>
          {r.extras.length > 0 && (
            <span className="block pl-6 text-sm text-sa-green-ink/70">
              {r.extras.map((e) => `+ ${e.cantidad > 1 ? `${e.cantidad}× ` : ''}${e.nombre}`).join(' · ')}
            </span>
          )}
          {r.personalizacion && <span className="block pl-6 text-sm text-sa-green-ink/60 italic">{r.personalizacion}</span>}
        </li>
      ))}
    </ul>
  )
}
