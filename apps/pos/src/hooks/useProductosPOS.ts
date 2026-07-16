import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { listarProductosParaVenta } from '@shake/supabase'
import type { ProductoVenta } from '@shake/supabase'

/** Categoría derivada del catálogo (con su cocina/estación) para los filtros. */
export interface CategoriaPOS {
  id: string
  nombre: string
  cocinas: { id: string; nombre: string; slug: string } | null
}

export function useProductosPOS() {
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarProductosParaVenta(sb)
      .then(setProductos)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  // Las categorías se derivan del propio catálogo (no hay query aparte).
  const categorias = useMemo<CategoriaPOS[]>(() => {
    const map = new Map<string, CategoriaPOS>()
    for (const p of productos) {
      if (p.categorias) map.set(p.categorias.id, p.categorias)
    }
    return [...map.values()]
  }, [productos])

  return { productos, categorias, loading, error }
}
