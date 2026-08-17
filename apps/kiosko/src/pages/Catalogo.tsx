import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@shake/ui'
import { useCarrito } from '@/store/carritoStore'
import { listarProductosParaVenta, listarExtras, listarProductosExtra } from '@shake/supabase'
import type { ProductoVenta, ExtraDeProducto } from '@shake/supabase'
import { sb } from '@/lib/sb'
import { ModalExtras } from '@/components/ModalExtras'

interface Categoria {
  id: string
  nombre: string
  orden: number
  cocinas: { id: string; nombre: string; slug: string } | null
}

export function Catalogo() {
  const navigate = useNavigate()
  const { agregar, agregarConExtras, totalItems } = useCarrito()
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [extras, setExtras] = useState<ExtraDeProducto[]>([])
  const [productosExtra, setProductosExtra] = useState<ProductoVenta[]>([])
  const [personalizando, setPersonalizando] = useState<ProductoVenta | null>(null)

  useEffect(() => {
    Promise.all([listarProductosParaVenta(sb), listarExtras(sb), listarProductosExtra(sb)])
      .then(([prods, exs, prodExtra]) => {
        setProductos(prods)
        setExtras(exs)
        setProductosExtra(prodExtra)
      })
      .catch(() => setProductos([]))
      .finally(() => setLoading(false))
  }, [])

  const extrasDe = (productoId: string) => extras.filter((e) => e.producto_id === productoId)

  /**
   * Si el producto ofrece extras (tipo de leche, adicionales), se abre el
   * modal para elegirlos; si no, se agrega directo. Así el "+" no obliga a
   * pasar por una pantalla extra en los productos que no la necesitan, como
   * un agua o un snack.
   */
  function tocarAgregar(p: ProductoVenta) {
    if (extrasDe(p.id).length > 0) {
      setPersonalizando(p)
      return
    }
    agregar({
      producto_id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      cocina_id: p.categorias?.cocinas?.id ?? '',
      imagen_url: p.imagen_url,
    })
  }

  /**
   * Cada extra entra como su PROPIA línea del carrito, igual que en el POS:
   * así cuesta, cobra y descuenta inventario como cualquier producto. Pero
   * ahora queda COLGADO del shake que lo lleva, no suelto en la lista.
   *
   * Ese vínculo es el que hace que la comanda imprima "+GALLETA" bajo el
   * shake correcto. Sin él, con dos shakes en el mismo pedido —uno con
   * galletas y otro sin— no hay forma de saber cuál las lleva, y en barra se
   * las ponen al vaso equivocado.
   *
   * La nota (el tipo de leche) sigue viajando pegada al shake.
   */
  function agregarPersonalizado(nota: string | null, elegidos: ExtraDeProducto[]) {
    const p = personalizando
    if (!p) return

    // Los repetidos se agrupan con su cantidad en vez de repetir la línea:
    // dos scoops son una línea de cantidad 2, no dos líneas de uno.
    const porExtra = new Map<string, { extra: ExtraDeProducto; cantidad: number }>()
    for (const e of elegidos) {
      const previo = porExtra.get(e.extra_id)
      porExtra.set(e.extra_id, { extra: e, cantidad: (previo?.cantidad ?? 0) + 1 })
    }

    agregarConExtras(
      {
        producto_id: p.id,
        nombre: p.nombre,
        precio: p.precio,
        cocina_id: p.categorias?.cocinas?.id ?? '',
        imagen_url: p.imagen_url,
        ...(nota ? { personalizacion: nota } : {}),
      },
      [...porExtra.values()].map(({ extra, cantidad }) => {
        const prod = productosExtra.find((x) => x.id === extra.extra_id)
        return {
          producto_id: extra.extra_id,
          nombre: extra.nombre,
          precio: extra.precio,
          cocina_id: prod?.categorias?.cocinas?.id ?? p.categorias?.cocinas?.id ?? '',
          imagen_url: null,
          porUnidad: cantidad,
        }
      }),
    )
    setPersonalizando(null)
  }

  const categorias = useMemo<Categoria[]>(() => {
    const map = new Map<string, Categoria>()
    productos.forEach((p) => {
      if (p.categoria_id && p.categorias && !map.has(p.categoria_id)) {
        map.set(p.categoria_id, {
          id: p.categoria_id,
          nombre: p.categorias.nombre,
          orden: p.categorias.orden,
          cocinas: p.categorias.cocinas,
        })
      }
    })
    return [...map.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  }, [productos])

  const productosFiltrados = categoriaActiva
    ? productos.filter((p) => p.categoria_id === categoriaActiva)
    : productos

  return (
    <div className="flex flex-col h-screen bg-sa-cream-paper">
      {/* Hero strip */}
      <header className="relative bg-sa-green-deep text-sa-cream px-8 pt-8 pb-10 overflow-hidden">
        <div className="absolute -right-6 -bottom-10 opacity-90 pointer-events-none select-none">
          <img
            src="/milo-transparent.png"
            alt=""
            className="h-56 w-auto drop-shadow-2xl"
          />
        </div>
        <div className="relative z-10 flex items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <img
              src="/logo.png"
              alt="Shakeaholic"
              className="h-20 w-auto drop-shadow-lg"
            />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-banana">
                #MENU · KIOSKO 01
              </p>
              <h1 className="font-display text-5xl leading-none mt-2 text-sa-cream">
                Shakeaholic
              </h1>
              <p className="font-body text-lg mt-3 max-w-md text-sa-cream/90">
                ¿Listo para mover esa proteína? Agitamos fruta, comida real y sabor sin pose fitness.
              </p>
              {/* Acceso a la invitación de lealtad: el cajero la muestra
                  cuando quiere ofrecerle el programa al cliente. */}
              <button
                onClick={() => navigate('/rewards')}
                className="mt-4 inline-flex items-center gap-2 bg-sa-banana/20 hover:bg-sa-banana/30 border border-sa-banana/40 text-sa-banana px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Únete a Rewards
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Categorías: TODAS visibles a la vez, envueltas en renglones.
          Antes era una fila con desplazamiento horizontal, y en una pantalla
          táctil eso esconde la mitad del menú: nadie arrastra una barra que
          no sabe que existe. Con ~10 categorías caben en dos renglones. */}
      <div className="bg-sa-cream-paper border-b border-sa-cream-warm">
        <div className="flex flex-wrap gap-2.5 px-8 py-4">
          <button
            onClick={() => setCategoriaActiva(null)}
            className={`flex-shrink-0 px-5 h-12 rounded-full font-mono text-sm uppercase tracking-wider transition-all ${
              categoriaActiva === null
                ? 'bg-sa-green text-sa-cream shadow-sa-sm'
                : 'bg-sa-cream-warm text-sa-green-ink hover:bg-sa-cream'
            }`}
          >
            Todo
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoriaActiva(cat.id)}
              className={`flex-shrink-0 px-5 h-12 rounded-full font-mono text-sm uppercase tracking-wider transition-all ${
                categoriaActiva === cat.id
                  ? 'bg-sa-green text-sa-cream shadow-sa-sm'
                  : 'bg-sa-cream-warm text-sa-green-ink hover:bg-sa-cream'
              }`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Productos */}
      <main className="flex-1 overflow-y-auto px-8 py-6 pb-32">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner className="w-12 h-12 text-sa-green" />
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
            <img src="/milo-transparent.png" alt="Milo" className="h-40 opacity-80" />
            <p className="font-display text-3xl text-sa-green-ink">
              Aún no agitamos nada
            </p>
            <p className="font-body text-sa-green-ink/70 max-w-sm">
              Conecta Supabase para llenar la barra con shakes, bowls y comida de verdad.
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-sa-green/70 mt-2">
              · sin polvo raro ·
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {productosFiltrados.map((producto) => (
              <div
                key={producto.id}
                className="group relative bg-sa-cream-soft rounded-sa-lg overflow-hidden shadow-sa-sm hover:shadow-sa transition-all active:scale-[0.98]"
              >
                <div className="relative">
                  {producto.imagen_url ? (
                    /* object-contain, no cover: las fotos son vasos verticales
                       sobre fondo blanco y `cover` les cortaba la tapa y el
                       popote. Se sube la altura porque al no recortar, la
                       imagen ocupa menos ancho. */
                    <div className="w-full h-56 bg-white flex items-center justify-center">
                      <img
                        src={producto.imagen_url}
                        alt={producto.nombre}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    /* Sin foto: en vez de un hueco gris, Milo se la comió. */
                    <div className="w-full h-56 bg-sa-cream-warm flex flex-col items-center justify-center gap-1">
                      <img src="/milo-transparent.png" alt="" className="h-24 opacity-80" />
                      <p className="font-mono text-[10px] uppercase tracking-wide text-sa-green-ink/45 text-center px-2">
                        Ups, se lo ha comido Milo
                      </p>
                    </div>
                  )}
                  <span className="absolute top-3 left-3 font-mono text-[10px] uppercase tracking-widest bg-sa-green-deep text-sa-cream px-2 py-1 rounded-full">
                    #{producto.id.slice(0, 4)}
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-display text-xl leading-tight text-sa-green-ink line-clamp-2">
                    {producto.nombre}
                  </p>
                  {producto.descripcion && (
                    <p className="font-body text-xs text-sa-green-ink/60 mt-1 line-clamp-2">
                      {producto.descripcion}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <p className="font-mono text-lg font-medium text-sa-green">
                      ${producto.precio.toFixed(2)}
                    </p>
                    <button
                      onClick={() => tocarAgregar(producto)}
                      className="w-14 h-14 rounded-full bg-sa-green text-sa-cream font-display text-3xl flex items-center justify-center shadow-sa-sm active:scale-95 transition-transform"
                      aria-label={`Agregar ${producto.nombre}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <ModalExtras
        producto={personalizando}
        extras={personalizando ? extrasDe(personalizando.id) : []}
        onCerrar={() => setPersonalizando(null)}
        onAgregar={agregarPersonalizado}
      />

      {/* Floating cart */}
      {totalItems() > 0 && (
        <button
          onClick={() => navigate('/carrito')}
          className="fixed bottom-8 right-8 z-20 flex items-center gap-3 bg-sa-strawberry text-white pl-6 pr-7 h-16 rounded-full shadow-sa active:scale-95 transition-transform"
        >
          <span className="font-display text-2xl">Tu shake</span>
          <span className="font-mono text-sm bg-white text-sa-strawberry rounded-full min-w-7 h-7 px-2 flex items-center justify-center font-medium">
            {totalItems()}
          </span>
        </button>
      )}
    </div>
  )
}
