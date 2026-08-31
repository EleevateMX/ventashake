import React, { useEffect, useState } from 'react'
import { mxn, esBase, ordenarBases } from '@shake/utils'
import type { ExtraDeProducto } from '@shake/supabase'
import { nombreParaOrdenar } from '@shake/supabase'
import type { LineaCarrito } from '@/store/posStore'

interface Props {
  linea: LineaCarrito | null
  /** Extras de ESE producto, para poder cambiar la base sin teclear. */
  extras: ExtraDeProducto[]
  onCerrar: () => void
  onGuardar: (cantidad: number, personalizacion: string | null) => void
  onQuitar: () => void
}

/**
 * Corregir un renglón ya capturado.
 *
 * Petición de la sucursal: "modificar un pedido que ya está en el carrito,
 * sin tener que eliminarlo y volverlo a capturar". El caso real es de una
 * palabra —"ay, mejor deslactosada"— y costaba borrar la línea, buscar el
 * producto otra vez y volver a elegirlo todo, con el cliente enfrente.
 *
 * La nota viaja como texto separado por comas ("Leche Entera, Menos hielo"):
 * la base es el primer fragmento y lo demás son observaciones. Aquí se
 * separan para poder cambiar solo la base con un toque, y se vuelven a unir
 * al guardar. El campo de texto queda visible igual, porque hay
 * correcciones que ninguna lista de botones va a cubrir.
 *
 * Lo que NO hace: tocar los extras. En caja cada extra es su propia línea
 * del ticket —así cuesta, cobra y descuenta inventario—, así que se quitan
 * y se agregan como líneas, que es donde ya se pueden ver.
 */
export function ModalEditarLinea({ linea, extras, onCerrar, onGuardar, onQuitar }: Props) {
  const [cantidad, setCantidad] = useState(1)
  const [base, setBase] = useState<string | null>(null)
  const [resto, setResto] = useState('')

  const bases = ordenarBases(extras.filter((e) => esBase(e.nombre)))

  useEffect(() => {
    if (!linea) return
    setCantidad(linea.cantidad)
    const partes = (linea.personalizacion ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const conBase = partes.length > 0 && esBase(partes[0])
    setBase(conBase ? partes[0] : null)
    setResto((conBase ? partes.slice(1) : partes).join(', '))
  }, [linea])

  if (!linea) return null

  const nota = [base, resto.trim()].filter(Boolean).join(', ') || null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-sa-green-deep/60" onClick={onCerrar} />
      <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-sa-green-ink/10">
          <p className="font-mono text-[10px] uppercase tracking-widest text-sa-green-ink/45">
            Corregir el renglón
          </p>
          <h3 className="font-display text-2xl text-sa-green-ink leading-tight">
            {nombreParaOrdenar(linea.producto.nombre)}
          </h3>
          <p className="font-mono text-xs text-sa-green-ink/50 mt-0.5">
            {mxn(linea.producto.precio)} c/u
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
              Cantidad
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCantidad((n) => Math.max(1, n - 1))}
                className="w-11 h-11 rounded-full bg-white border border-sa-green-ink/15 text-sa-green-ink text-xl"
              >
                −
              </button>
              <span className="font-display text-3xl text-sa-green-ink w-10 text-center">{cantidad}</span>
              <button
                onClick={() => setCantidad((n) => n + 1)}
                className="w-11 h-11 rounded-full bg-sa-green text-sa-cream text-xl"
              >
                +
              </button>
              <span className="ml-auto font-mono text-sm text-sa-green-ink/60">
                {mxn(linea.producto.precio * cantidad)}
              </span>
            </div>
          </div>

          {bases.length > 0 && (
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
                Con qué se prepara
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {bases.map((b) => {
                  const activa = base === b.nombre
                  return (
                    <button
                      key={b.extra_id}
                      onClick={() => setBase(activa ? null : b.nombre)}
                      className={`px-3 py-2.5 rounded-sa text-left text-sm border transition-colors ${
                        activa
                          ? 'bg-sa-green text-sa-cream border-sa-green'
                          : 'bg-white border-sa-green-ink/10 text-sa-green-ink hover:border-sa-green/40'
                      }`}
                    >
                      {b.nombre}
                    </button>
                  )
                })}
              </div>
              {/* Una base con precio se cobra como línea aparte; cambiarla
                  aquí solo cambia lo que lee barra. Si el cliente se pasó a
                  una que cuesta, esa línea se agrega desde el catálogo. */}
              {base && bases.find((b) => b.nombre === base && b.precio > 0) && (
                <p className="font-mono text-[11px] text-sa-coffee bg-sa-banana/25 rounded-sa px-3 py-2 mt-2 leading-relaxed">
                  Esa base tiene costo. Cambiarla aquí solo cambia la comanda:
                  el cobro se agrega desde el catálogo, como cualquier extra.
                </p>
              )}
            </div>
          )}

          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 mb-2">
              Indicaciones para la estación
            </p>
            <input
              type="text"
              value={resto}
              onChange={(e) => setResto(e.target.value)}
              placeholder="Menos hielo, sin tomate…"
              className="w-full px-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa text-sm text-sa-green-ink focus:outline-none focus:ring-2 focus:ring-sa-green/30"
            />
            <p className="font-mono text-[11px] text-sa-green-ink/45 mt-2">
              Va a salir en la comanda como: <span className="text-sa-strawberry">{nota ?? '(sin nota)'}</span>
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-sa-green-ink/10 flex gap-2 items-center">
          <button
            onClick={onQuitar}
            className="px-4 py-2.5 border border-sa-strawberry/30 bg-white text-sa-strawberry rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-strawberry/10"
          >
            Quitar
          </button>
          <button
            onClick={onCerrar}
            className="px-4 py-2.5 border border-sa-green-ink/15 bg-white text-sa-green-ink/70 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-cream-warm"
          >
            Cancelar
          </button>
          <button
            onClick={() => onGuardar(cantidad, nota)}
            className="flex-1 bg-sa-green text-sa-cream py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
