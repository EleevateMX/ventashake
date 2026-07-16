import React, { useState, useMemo } from 'react'
import { usePosStore } from '@/store/posStore'
import { mxn } from '@shake/utils'
import type { ProductoVenta } from '@shake/supabase'
import type { CategoriaPOS } from '@/hooks/useProductosPOS'

interface Props {
  productos: ProductoVenta[]
  categorias: CategoriaPOS[]
}

export function CatalogoBusqueda({ productos, categorias }: Props) {
  const agregarItem = usePosStore((s) => s.agregarItem)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const coincideBusqueda = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
      const coincideCategoria = !categoriaActiva || p.categoria_id === categoriaActiva
      return coincideBusqueda && coincideCategoria
    })
  }, [productos, busqueda, categoriaActiva])

  return (
    <div className="flex flex-col h-full">
      {/* Buscador */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sa-green-ink/50 text-lg">🔍</span>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setCategoriaActiva(null) }}
            placeholder="Buscar shake, café, lo que sea…"
            className="w-full pl-11 pr-10 py-3 bg-white rounded-sa-lg text-sa-green-ink placeholder:font-mono placeholder:text-sa-green-ink/40 placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-sa-green/30 border border-sa-green-ink/10 transition-all"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sa-green-ink/40 hover:text-sa-strawberry"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filtros por categoría */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0">
        <button
          onClick={() => setCategoriaActiva(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors ${
            !categoriaActiva
              ? 'bg-sa-green text-sa-cream'
              : 'bg-sa-cream-soft text-sa-green-ink/60 hover:bg-sa-cream-warm'
          }`}
        >
          Todos
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoriaActiva(cat.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full font-mono text-xs uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
              categoriaActiva === cat.id
                ? 'bg-sa-green text-sa-cream'
                : 'bg-sa-cream-soft text-sa-green-ink/60 hover:bg-sa-cream-warm'
            }`}
          >
            {cat.cocinas && <span>{cat.cocinas.slug === 'alimentos' ? '🍽️' : '🥤'}</span>}
            {cat.nombre}
          </button>
        ))}
      </div>

      {/* Grid de productos */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {productosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-sa-green-ink/40">
            <p className="font-mono text-sm uppercase tracking-wide">Nada por aquí</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {productosFiltrados.map((p) => (
              <button
                key={p.id}
                onClick={() => agregarItem(p)}
                className="flex flex-col items-center p-3 bg-white rounded-sa shadow-sa-sm border border-sa-green-ink/5 hover:border-sa-green/30 hover:-translate-y-0.5 active:scale-95 transition-all text-left group"
              >
                {p.imagen_url ? (
                  <img src={p.imagen_url} alt={p.nombre} className="w-16 h-16 rounded-sa object-cover mb-2" />
                ) : (
                  <div className="w-16 h-16 rounded-sa bg-sa-cream-soft border border-sa-green-ink/5 flex items-center justify-center text-3xl mb-2">
                    {p.categorias?.cocinas?.slug === 'alimentos' ? '🍽️' : '🥤'}
                  </div>
                )}
                <p className="font-display text-sm text-sa-green-ink text-center leading-tight line-clamp-2 w-full">
                  {p.nombre}
                </p>
                <p className="font-mono text-sm font-medium text-sa-strawberry mt-2">{mxn(p.precio)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
