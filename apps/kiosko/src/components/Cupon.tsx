import { useEffect, useMemo, useState } from 'react'
import { autorizarCupon, cuponesVigentes, type CuponVigente } from '@shake/supabase'
import { descuentoDeCupon, mensajeDeError, mxn, valorDeUnShake } from '@shake/utils'
import type { ItemCarrito } from '@/store/carritoStore'
import { sb } from '@/lib/sb'

/**
 * Cupón de descuento (24/10/26, pedido de Perla para «Trick or Treat»).
 *
 * Se elige el cupón ($20, 10 %, 15 %…), el shake al que aplica y el PIN de
 * quien autoriza —la MISMA lista que las cortesías—. El PIN se revisa aquí,
 * y lo que queda es una autorización de 20 minutos: el descuento lo aplica
 * el servidor a la orden ya creada, ANTES de cobrar, con cualquier método.
 * El precio del shake no se toca; el descuento queda aparte, con su nombre
 * y quién lo autorizó.
 *
 * Lo que se enseña aquí (`descuentoDeCupon`) es la misma cuenta que hace el
 * servidor, para que el cajero pida el número correcto.
 */

export interface CuponEnPantalla {
  autorizacion_id: string
  nombre: string
  autorizo: string
  tipo: 'monto' | 'porcentaje'
  valor: number
  producto_id: string
  /** El renglón del carrito al que se aplica. */
  linea: string
}

/** Cuánto descuenta el cupón con el carrito de ahora (0 si ya no está el shake). */
export function descuentoEnPantalla(c: CuponEnPantalla | null, items: ItemCarrito[]): number {
  if (!c) return 0
  const r = items.find((i) => i.linea === c.linea)
  if (!r) return 0
  return descuentoDeCupon(c.tipo, c.valor, valorDeUnShake(r, items))
}

export function Cupon({
  items,
  aplicado,
  onAplicar,
  onQuitar,
}: {
  items: ItemCarrito[]
  aplicado: CuponEnPantalla | null
  onAplicar: (c: CuponEnPantalla) => void
  onQuitar: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [cupones, setCupones] = useState<CuponVigente[] | null>(null)
  const [cupon, setCupon] = useState<CuponVigente | null>(null)
  const [linea, setLinea] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!abierto || cupones) return
    cuponesVigentes(sb).then(setCupones).catch((e) => { setError(mensajeDeError(e)); setCupones([]) })
  }, [abierto, cupones])

  /** Los shakes del carrito a los que aplica el cupón elegido. */
  const elegibles = useMemo(
    () => (cupon ? items.filter((i) => !i.padreLinea && cupon.productos.includes(i.producto_id)) : []),
    [cupon, items],
  )
  // Con un solo shake no hay nada que elegir.
  useEffect(() => {
    if (elegibles.length === 1) setLinea(elegibles[0].linea)
    else if (!elegibles.some((e) => e.linea === linea)) setLinea(null)
  }, [elegibles, linea])

  const renglon = elegibles.find((e) => e.linea === linea) ?? null
  const base = renglon ? valorDeUnShake(renglon, items) : 0
  const descuento = cupon && renglon ? descuentoDeCupon(cupon.tipo, cupon.valor, base) : 0
  const listo = !!cupon && !!renglon && pin.length >= 4

  function cerrar() {
    setAbierto(false); setCupon(null); setLinea(null); setPin(''); setError(null)
  }

  async function autorizar() {
    if (!listo || enviando || !cupon || !renglon) return
    setEnviando(true); setError(null)
    try {
      const a = await autorizarCupon(sb, pin, cupon.id, renglon.producto_id)
      onAplicar({
        autorizacion_id: a.autorizacion_id,
        nombre: a.nombre,
        autorizo: a.autorizo,
        tipo: a.tipo,
        valor: a.valor,
        producto_id: renglon.producto_id,
        linea: renglon.linea,
      })
      cerrar()
    } catch (e) {
      setError(mensajeDeError(e))
      setPin('')
    } finally {
      setEnviando(false)
    }
  }

  function tecla(d: string) {
    setPin((p) => (p + d).slice(0, 8)); setError(null)
  }

  if (aplicado) {
    const d = descuentoEnPantalla(aplicado, items)
    return (
      <div className="flex-1 min-w-[45%]">
        <div className="w-full px-3 py-2 rounded-sa border border-sa-banana bg-sa-banana/20 text-sa-green-ink flex items-center justify-between gap-2">
          <span className="font-body text-sm leading-tight">
            🎟 {aplicado.nombre} · −{mxn(d)}
            <span className="block font-mono text-[10px] text-sa-green-ink/60">autorizó {aplicado.autorizo}</span>
          </span>
          <button
            type="button"
            onClick={onQuitar}
            className="font-mono text-[10px] uppercase tracking-wider text-sa-strawberry px-2 py-1"
          >
            Quitar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-[45%]">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full px-3 py-2.5 rounded-sa border border-sa-green-ink/15 bg-white text-sa-green-ink hover:border-sa-banana active:scale-95 transition-all text-left"
      >
        <span className="font-body text-sm leading-tight">🎟 Cupón</span>
      </button>
      {abierto && (
        <div
          data-no-recargar
          className="fixed inset-0 z-50 bg-sa-green-deep/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !enviando) cerrar() }}
        >
          <div className="w-full max-w-md p-5 rounded-sa-lg bg-sa-cream-paper shadow-2xl max-h-[95vh] overflow-y-auto">
            <p className="font-display text-2xl text-sa-green-ink text-center">Cupón de descuento</p>
            <p className="font-mono text-[11px] text-sa-green-ink/60 text-center mt-1">
              El precio no cambia · el descuento queda aparte con quién lo autorizó
            </p>

            {error && (
              <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-3 py-2 mt-3">
                <p className="text-sm text-sa-strawberry leading-snug">{error}</p>
              </div>
            )}

            <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mt-4 mb-1.5">¿Qué cupón trae?</p>
            {cupones === null ? (
              <p className="text-sm text-sa-green-ink/60">Cargando…</p>
            ) : cupones.length === 0 ? (
              <p className="text-sm text-sa-green-ink/60">No hay cupones vigentes.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cupones.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setCupon(c); setError(null) }}
                    className={`px-3 py-2 rounded-full text-sm transition-colors ${
                      cupon?.id === c.id ? 'bg-sa-green text-sa-cream' : 'border border-sa-green-ink/15 text-sa-green-ink/80'
                    }`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
            )}

            {cupon && (
              <>
                <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mt-4 mb-1.5">¿A qué shake?</p>
                {elegibles.length === 0 ? (
                  <p className="text-sm text-sa-strawberry">
                    No hay {cupon.familia.toLowerCase()} en la cuenta: este cupón solo aplica a {cupon.familia.toLowerCase()}.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {elegibles.map((e) => {
                      const b = valorDeUnShake(e, items)
                      return (
                        <button
                          key={e.linea}
                          type="button"
                          onClick={() => { setLinea(e.linea); setError(null) }}
                          className={`flex items-baseline justify-between gap-2 px-3 py-2 rounded-sa text-left text-sm ${
                            linea === e.linea ? 'bg-sa-green text-sa-cream' : 'border border-sa-green-ink/15 text-sa-green-ink'
                          }`}
                        >
                          <span>{e.nombre}{e.cantidad > 1 ? ` (uno de ${e.cantidad})` : ''}</span>
                          <span className="font-mono text-xs whitespace-nowrap">
                            {mxn(b)} → −{mxn(descuentoDeCupon(cupon.tipo, cupon.valor, b))}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {cupon && renglon && (
              <>
                <p className="text-sm text-sa-green-ink mt-3 text-center">
                  {renglon.nombre}: {mxn(base)} − <b>{mxn(descuento)}</b> = {mxn(base - descuento)}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mt-4 mb-1.5">
                  PIN de quien autoriza
                </p>
                <input
                  value={pin}
                  readOnly
                  type="password"
                  placeholder="••••"
                  className="w-full px-4 py-2.5 rounded-sa border-2 border-sa-green-ink/10 bg-white font-mono text-2xl text-center tracking-widest"
                />
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => tecla(d)}
                      disabled={enviando}
                      className="h-14 rounded-sa bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setPin((p) => p.slice(0, -1)); setError(null) }}
                    disabled={enviando || pin.length === 0}
                    className="h-14 rounded-sa border border-sa-green-ink/20 text-sa-green-ink font-mono text-xs uppercase tracking-wide disabled:opacity-40"
                  >
                    ⌫ Borrar
                  </button>
                  <button
                    type="button"
                    onClick={() => tecla('0')}
                    disabled={enviando}
                    className="h-14 rounded-sa bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => void autorizar()}
                    disabled={enviando || !listo}
                    className="h-14 rounded-sa bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40"
                  >
                    {enviando ? '…' : 'Aplicar'}
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={cerrar}
              disabled={enviando}
              className="w-full mt-3 py-2 font-mono text-xs uppercase tracking-wide text-sa-green-ink/60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
