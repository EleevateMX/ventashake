import React, { useState } from 'react'
import { mxn } from '@shake/utils'
import type { ProductoVenta, ExtraDeProducto } from '@shake/supabase'

interface Props {
  producto: ProductoVenta | null
  extras: ExtraDeProducto[]
  onCerrar: () => void
  onAgregar: (nota: string | null, extrasElegidos: ExtraDeProducto[]) => void
}

/** Las leches SUSTITUYEN la del shake, así que se elige una sola. */
const esLeche = (nombre: string) => /^leche/i.test(nombre.trim())

/**
 * Las galletas son una promoción: +$5 por 2 piezas, una vez por shake. Se
 * eligen como grupo de opción única (ninguna / chocolate / vainilla) en vez
 * de con cantidad, porque no se puede pedir la promo dos veces ni combinar
 * los dos sabores en el mismo shake.
 */
const esGalleta = (nombre: string) => /galleta/i.test(nombre.trim())

/**
 * Al tocar "+" en un shake: elegir tipo de leche, adicionales (creatina,
 * matcha, otro scoop…) y escribir alguna indicación.
 *
 * Dos comportamientos distintos a propósito:
 *   · Leche  → una sola, como radio. Cambiar de leche no es sumar otra leche.
 *   · Extras → cantidad, con + y −. Sí se acumulan.
 *
 * Los extras en $0 se muestran igual: el tipo de leche es información que la
 * cocina necesita en la comanda aunque no cueste. Cuando el negocio les ponga
 * precio en Admin → Extras, empiezan a cobrar solos sin tocar nada aquí.
 */
export function ModalExtras({ producto, extras, onCerrar, onAgregar }: Props) {
  const [nota, setNota] = useState('')
  const [leche, setLeche] = useState<string | null>(null)
  const [galleta, setGalleta] = useState<string | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})

  if (!producto) return null

  const leches = extras.filter((e) => esLeche(e.nombre))
  const galletas = extras.filter((e) => esGalleta(e.nombre))
  const adicionales = extras.filter((e) => !esLeche(e.nombre) && !esGalleta(e.nombre))

  const lecheElegida = leches.find((l) => l.extra_id === leche) ?? null
  const galletaElegida = galletas.find((g) => g.extra_id === galleta) ?? null
  const totalExtras =
    (lecheElegida?.precio ?? 0) +
    (galletaElegida?.precio ?? 0) +
    adicionales.reduce((s, e) => s + e.precio * (cantidades[e.extra_id] ?? 0), 0)

  function cambiar(id: string, delta: number) {
    setCantidades((prev) => {
      const n = Math.max(0, (prev[id] ?? 0) + delta)
      const next = { ...prev }
      if (n === 0) delete next[id]
      else next[id] = n
      return next
    })
  }

  function limpiar() {
    setNota(''); setLeche(null); setGalleta(null); setCantidades({})
  }

  function confirmar() {
    const elegidos = [
      ...(lecheElegida ? [lecheElegida] : []),
      ...(galletaElegida ? [galletaElegida] : []),
      ...adicionales.flatMap((e) =>
        Array.from({ length: cantidades[e.extra_id] ?? 0 }, () => e),
      ),
    ]
    onAgregar(nota.trim() || null, elegidos)
    limpiar()
  }

  return (
    <div className="fixed inset-0 z-50 bg-sa-green-deep/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-sa-cream-paper rounded-sa-lg w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl">
        <header className="px-6 pt-6 pb-4 border-b border-sa-green-ink/10">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-sa-green/70">
            Personaliza tu shake
          </p>
          <h2 className="font-display text-3xl text-sa-green-ink leading-tight mt-1">
            {producto.nombre}
          </h2>
          {producto.descripcion && (
            <p className="font-body text-sm text-sa-green-ink/60 mt-1">{producto.descripcion}</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {leches.length > 0 && (
            <section>
              <h3 className="font-display text-xl text-sa-green-ink">Tipo de leche</h3>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                Elige una · sustituye la de la receta
              </p>
              <div className="grid grid-cols-2 gap-2">
                {leches.map((l) => {
                  const activa = leche === l.extra_id
                  return (
                    <button
                      key={l.extra_id}
                      onClick={() => setLeche(activa ? null : l.extra_id)}
                      className={`px-4 py-3 rounded-sa text-left transition-all border-2 ${
                        activa
                          ? 'bg-sa-green text-sa-cream border-sa-green'
                          : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-green/40'
                      }`}
                    >
                      <span className="font-display text-base leading-tight block">{l.nombre}</span>
                      {l.precio > 0 && (
                        <span className="font-mono text-xs opacity-70">+{mxn(l.precio)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {galletas.length > 0 && (
            <section>
              <h3 className="font-display text-xl text-sa-green-ink">Galletas</h3>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                Opcional · 2 piezas · una sola vez por shake
              </p>
              <div className="grid grid-cols-2 gap-2">
                {galletas.map((g) => {
                  const activa = galleta === g.extra_id
                  return (
                    <button
                      key={g.extra_id}
                      onClick={() => setGalleta(activa ? null : g.extra_id)}
                      className={`px-4 py-3 rounded-sa text-left transition-all border-2 ${
                        activa
                          ? 'bg-sa-strawberry text-white border-sa-strawberry'
                          : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-strawberry/40'
                      }`}
                    >
                      <span className="font-display text-base leading-tight block">{g.nombre}</span>
                      <span className="font-mono text-xs opacity-80">+{mxn(g.precio)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {adicionales.length > 0 && (
            <section>
              <h3 className="font-display text-xl text-sa-green-ink">Adicionales</h3>
              <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/40 mb-3">
                Se suman al shake
              </p>
              <div className="space-y-2">
                {adicionales.map((e) => {
                  const n = cantidades[e.extra_id] ?? 0
                  return (
                    <div
                      key={e.extra_id}
                      className="flex items-center justify-between gap-3 bg-white rounded-sa px-4 py-3 border border-sa-green-ink/10"
                    >
                      <div className="min-w-0">
                        <p className="font-display text-base text-sa-green-ink leading-tight">{e.nombre}</p>
                        <p className="font-mono text-xs text-sa-green-ink/50">
                          {e.precio > 0 ? `+${mxn(e.precio)}` : 'Sin costo'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => cambiar(e.extra_id, -1)}
                          disabled={n === 0}
                          className="w-10 h-10 rounded-full bg-sa-cream-warm text-sa-green-ink font-display text-xl disabled:opacity-30 active:scale-95"
                          aria-label={`Quitar ${e.nombre}`}
                        >
                          −
                        </button>
                        <span className="font-display text-lg w-6 text-center text-sa-green-ink">{n}</span>
                        <button
                          onClick={() => cambiar(e.extra_id, 1)}
                          className="w-10 h-10 rounded-full bg-sa-green text-sa-cream font-display text-xl active:scale-95"
                          aria-label={`Agregar ${e.nombre}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-display text-xl text-sa-green-ink mb-2">Indicaciones</h3>
            <textarea
              value={nota}
              onChange={(ev) => setNota(ev.target.value.slice(0, 140))}
              placeholder="Sin azúcar, poco hielo…"
              rows={2}
              className="w-full rounded-sa border border-sa-green-ink/15 px-4 py-3 font-body text-base text-sa-green-ink placeholder:text-sa-green-ink/30 focus:outline-none focus:ring-2 focus:ring-sa-green/30 resize-none"
            />
          </section>
        </div>

        <footer className="px-6 py-4 border-t border-sa-green-ink/10 flex items-center gap-3">
          <button
            onClick={() => { limpiar(); onCerrar() }}
            className="px-5 py-3 rounded-sa font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 hover:text-sa-green-ink"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            className="flex-1 bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-xl hover:bg-sa-green-deep transition-colors active:scale-[0.98]"
          >
            Agregar · {mxn(producto.precio + totalExtras)}
          </button>
        </footer>
      </div>
    </div>
  )
}
