import { useState } from 'react'
import { mxn, refrescarContraCatalogo, totalRefrescado, type VentaRefrescada } from '@shake/utils'
import { leerEspera, quitarDeEspera, type VentaEnEspera } from '@/store/espera'
import type { ItemCarrito } from '@/store/carritoStore'

type Refrescada = VentaRefrescada<ItemCarrito>

/**
 * Las ventas apartadas, para retomarlas.
 *
 * Retomar no es "volver a pintar lo de antes": la venta se refresca contra
 * el catálogo vivo primero, y si algo cambió mientras esperaba **se dice
 * antes de seguir**. El servidor cobra el precio de hoy, así que una
 * pantalla que muestre el de hace veinte minutos le haría decir al cajero
 * un número que la terminal no va a pedir.
 */
export function VentasEnEspera({
  catalogo, hayCarrito, onRetomar, onCerrar,
}: {
  catalogo: Array<{ id: string; nombre: string; precio: number }>
  /** Si ya hay algo en pantalla, retomar lo pisaría: hay que avisar. */
  hayCarrito: boolean
  onRetomar: (v: VentaEnEspera, refrescada: Refrescada) => void
  onCerrar: () => void
}) {
  const [lista, setLista] = useState<VentaEnEspera[]>(() => leerEspera())
  /** La que se está por retomar, con lo que le pasó mientras esperaba. */
  const [revisando, setRevisando] = useState<{ v: VentaEnEspera; r: Refrescada } | null>(null)

  function intentarRetomar(v: VentaEnEspera) {
    const r = refrescarContraCatalogo(v.items, catalogo)
    const cambio = r.desaparecidos.length > 0 || r.cambiosDePrecio.length > 0
    // Sin cambios y sin nada que pisar, no hay nada que preguntar: se
    // retoma y ya. Una confirmación que siempre dice "todo bien" enseña a
    // darle a Aceptar sin leer, y entonces deja de servir el día que sí
    // tiene algo que decir.
    if (!cambio && !hayCarrito) return onRetomar(v, r)
    setRevisando({ v, r })
  }

  function descartar(id: string) {
    setLista(quitarDeEspera(id))
    setRevisando(null)
  }

  const totalDe = (r: Refrescada) => totalRefrescado(r.items)

  if (revisando) {
    const { v, r } = revisando
    return (
      <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-center justify-center p-6">
        <div className="bg-sa-cream-paper rounded-sa-lg max-w-lg w-full p-7 space-y-5 max-h-[85vh] overflow-y-auto">
          <p className="font-display text-3xl text-sa-green-ink leading-tight">
            Antes de retomar «{v.etiqueta}»
          </p>

          {hayCarrito && (
            <p className="font-mono text-xs text-sa-coffee bg-sa-banana/25 rounded-sa px-4 py-3 leading-relaxed">
              Ya hay algo en pantalla y se va a reemplazar. Si esa venta
              también te sirve, apártala primero.
            </p>
          )}

          {r.desaparecidos.length > 0 && (
            <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3">
              <p className="font-mono text-xs uppercase tracking-wide text-sa-strawberry mb-1">
                Ya no están a la venta · se quitaron
              </p>
              <p className="font-body text-sm text-sa-green-ink">
                {r.desaparecidos.join(', ')}
              </p>
            </div>
          )}

          {r.cambiosDePrecio.length > 0 && (
            <div className="bg-white rounded-sa px-4 py-3 border border-sa-green-ink/10">
              <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Cambiaron de precio
              </p>
              {r.cambiosDePrecio.map((c) => (
                <div key={c.nombre} className="flex justify-between font-body text-sm text-sa-green-ink">
                  <span>{c.nombre}</span>
                  <span className="font-mono">
                    <s className="text-sa-green-ink/40">{mxn(c.antes)}</s> {mxn(c.ahora)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-baseline border-t border-dashed border-sa-green-ink/15 pt-3">
            <span className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60">
              Total de hoy
            </span>
            <span className="font-display text-3xl text-sa-green">{mxn(totalDe(r))}</span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setRevisando(null)}
              className="px-6 py-4 rounded-sa font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 border border-sa-green-ink/15 bg-white"
            >
              Volver
            </button>
            <button
              onClick={() => onRetomar(v, r)}
              disabled={r.items.length === 0}
              className="flex-1 bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-xl hover:bg-sa-green-deep transition-colors disabled:opacity-40"
            >
              {r.items.length === 0 ? 'No queda nada que cobrar' : 'Retomar esta venta'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-center justify-center p-6">
      <div className="bg-sa-cream-paper rounded-sa-lg max-w-lg w-full p-7 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-3xl text-sa-green-ink leading-tight">
              Ventas en espera
            </p>
            <p className="font-mono text-xs uppercase tracking-wider text-sa-green-ink/55 mt-1">
              Se borran solas a las 12 horas
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="w-11 h-11 shrink-0 rounded-full bg-white border border-sa-green-ink/15 text-2xl text-sa-green-ink/60"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {lista.length === 0 ? (
          <p className="font-body text-base text-sa-green-ink/60 py-8 text-center">
            No hay ninguna apartada. Cuando una cuenta tenga que esperar,
            déjala en espera desde la pantalla de pago.
          </p>
        ) : (
          lista
            .slice()
            .reverse()
            .map((v) => {
              const piezas = v.items.filter((i) => !i.padreLinea).reduce((s, i) => s + i.cantidad, 0)
              const hora = new Date(v.guardadaEn).toLocaleTimeString('es-MX', {
                hour: '2-digit', minute: '2-digit',
              })
              return (
                <div
                  key={v.id}
                  className="bg-white rounded-sa-lg p-5 border border-sa-green-ink/10 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-2xl text-sa-green-ink leading-tight truncate">
                      {v.etiqueta}
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-sa-green-ink/55 mt-1">
                      {piezas} {piezas === 1 ? 'producto' : 'productos'} · {mxn(v.total)} · {hora}
                    </p>
                  </div>
                  <button
                    onClick={() => descartar(v.id)}
                    className="px-4 py-3 rounded-sa font-mono text-[11px] uppercase tracking-wide text-sa-strawberry border border-sa-strawberry/30"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={() => intentarRetomar(v)}
                    className="px-6 py-3 rounded-sa-lg bg-sa-green text-sa-cream font-display text-lg hover:bg-sa-green-deep transition-colors"
                  >
                    Retomar
                  </button>
                </div>
              )
            })
        )}
      </div>
    </div>
  )
}
