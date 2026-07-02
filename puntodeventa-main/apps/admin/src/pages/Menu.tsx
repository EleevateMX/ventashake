import React, { useState } from 'react'
import { useMenu, type ProductoConCategoria, type CategoriaConCocina } from '../hooks/useMenu'
import { ModalProducto } from '../components/menu/ModalProducto'
import { ModalCategoria } from '../components/menu/ModalCategoria'

type Tab = 'productos' | 'categorias'

const IconFork = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
  </svg>
)
const IconCup = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>
  </svg>
)
const IconGrid = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
)
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)

const COCINA_ICON: Record<string, JSX.Element> = {
  alimentos: <IconFork />,
  bebidas: <IconCup />,
}

const COCINA_COLOR: Record<string, string> = {
  alimentos: 'bg-sa-mango/15 text-sa-mango',
  bebidas: 'bg-sa-blueberry/15 text-sa-blueberry',
}

export function Menu() {
  const {
    productos,
    categorias,
    cocinas,
    loading,
    error,
    isSupabaseConfigured,
    agregarProducto,
    editarProducto,
    borrarProducto,
    toggleProducto,
    agregarCategoria,
    editarCategoria,
    borrarCategoria,
  } = useMenu()

  const [tab, setTab] = useState<Tab>('productos')
  const [busqueda, setBusqueda] = useState('')
  const [filtroCocina, setFiltroCocina] = useState('')
  const [productoEditar, setProductoEditar] = useState<ProductoConCategoria | null>(null)
  const [modalProductoOpen, setModalProductoOpen] = useState(false)
  const [categoriaEditar, setCategoriaEditar] = useState<CategoriaConCocina | null>(null)
  const [modalCategoriaOpen, setModalCategoriaOpen] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<{ tipo: 'producto' | 'categoria'; id: string; nombre: string } | null>(null)
  const [eliminando, setEliminando] = useState(false)

  // --- Filtros productos ---
  const productosFiltrados = productos.filter((p) => {
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const coincideCocina =
      !filtroCocina || p.categorias?.cocinas?.id === filtroCocina
    return coincideBusqueda && coincideCocina
  })

  // --- Filtros categorías ---
  const categoriasFiltradas = categorias.filter((c) => {
    return !filtroCocina || c.cocina_id === filtroCocina
  })

  // --- Conteo de productos por categoría ---
  const productosPorCategoria = (catId: string) =>
    productos.filter((p) => p.categoria_id === catId).length

  function abrirNuevoProducto() {
    setProductoEditar(null)
    setModalProductoOpen(true)
  }

  function abrirEditarProducto(p: ProductoConCategoria) {
    setProductoEditar(p)
    setModalProductoOpen(true)
  }

  function abrirNuevaCategoria() {
    setCategoriaEditar(null)
    setModalCategoriaOpen(true)
  }

  function abrirEditarCategoria(c: CategoriaConCocina) {
    setCategoriaEditar(c)
    setModalCategoriaOpen(true)
  }

  async function confirmarEliminar() {
    if (!confirmEliminar) return
    setEliminando(true)
    try {
      if (confirmEliminar.tipo === 'producto') {
        await borrarProducto(confirmEliminar.id)
      } else {
        await borrarCategoria(confirmEliminar.id)
      }
    } finally {
      setEliminando(false)
      setConfirmEliminar(null)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="p-8 bg-sa-cream-paper min-h-screen">
        <h2 className="text-3xl font-display text-sa-green-ink mb-6">Gestión de Menú</h2>
        <div className="bg-sa-banana/20 border border-sa-banana/40 rounded-sa p-8 text-center">
          <span className="text-4xl">🔌</span>
          <p className="text-sa-coffee font-semibold mt-3">Supabase no está configurado</p>
          <p className="text-sa-coffee/80 text-sm mt-1">
            Configura <code className="bg-sa-banana/30 font-mono px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
            <code className="bg-sa-banana/30 font-mono px-1 rounded">VITE_SUPABASE_ANON_KEY</code> en tu <code className="bg-sa-banana/30 font-mono px-1 rounded">.env</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-sa-cream-paper">
      {/* Header */}
      <div className="px-8 pt-8 pb-0 bg-sa-cream-paper">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-display text-sa-green-ink">Gestión de Menú</h2>
          <button
            onClick={tab === 'productos' ? abrirNuevoProducto : abrirNuevaCategoria}
            className="bg-sa-green hover:bg-sa-green-deep text-sa-cream px-5 py-2.5 rounded-sa font-medium text-sm transition-colors"
          >
            + {tab === 'productos' ? 'Nuevo producto' : 'Nueva categoría'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-sa-cream-warm p-1 rounded-sa w-fit">
          {(['productos', 'categorias'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setBusqueda('') }}
              className={`px-5 py-2 rounded-sa text-sm font-medium transition-all capitalize ${
                tab === t
                  ? 'bg-sa-green text-sa-cream shadow-sa-sm'
                  : 'text-sa-green-ink/60 hover:text-sa-green-ink'
              }`}
            >
              {t === 'productos'
                ? <><IconFork /> Productos ({productos.length})</>
                : <><IconGrid /> Categorías ({categorias.length})</>
              }
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="px-8 py-4 bg-sa-cream-paper flex items-center gap-3 border-b border-sa-green-ink/10">
        {/* Cocina filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setFiltroCocina('')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !filtroCocina ? 'bg-sa-green-ink text-sa-cream' : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:border-sa-green-ink/30'
            }`}
          >
            Todas
          </button>
          {cocinas.map((c) => (
            <button
              key={c.id}
              onClick={() => setFiltroCocina(c.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                filtroCocina === c.id
                  ? 'bg-sa-green-ink text-sa-cream'
                  : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:border-sa-green-ink/30'
              }`}
            >
              {COCINA_ICON[c.slug] ?? <IconFork />} {c.nombre}
            </button>
          ))}
        </div>

        {/* Search — solo en productos */}
        {tab === 'productos' && (
          <div className="relative ml-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sa-green-ink/50"><IconSearch /></span>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto..."
              className="pl-8 pr-4 py-1.5 border border-sa-green-ink/15 rounded-sa text-sm focus:outline-none focus:ring-2 focus:ring-sa-green/40 bg-white w-52"
            />
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {error && (
          <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 text-sa-strawberry rounded-sa px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sa-green-ink/50 gap-3">
            <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Cargando...
          </div>
        ) : tab === 'productos' ? (
          productosFiltrados.length === 0 ? (
            <EmptyState
              icon={<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>}
              mensaje={busqueda ? 'Sin resultados para tu búsqueda' : 'No hay productos aún'}
              accion={!busqueda ? 'Crea el primer producto' : undefined}
              onAccion={!busqueda ? abrirNuevoProducto : undefined}
            />
          ) : (
            <TablaProductos
              productos={productosFiltrados}
              onEditar={abrirEditarProducto}
              onEliminar={(p) => setConfirmEliminar({ tipo: 'producto', id: p.id, nombre: p.nombre })}
              onToggle={toggleProducto}
            />
          )
        ) : categoriasFiltradas.length === 0 ? (
          <EmptyState
            icon={<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>}
            mensaje="No hay categorías aún"
            accion="Crea la primera categoría"
            onAccion={abrirNuevaCategoria}
          />
        ) : (
          <TablaCategorias
            categorias={categoriasFiltradas}
            productosPorCategoria={productosPorCategoria}
            onEditar={abrirEditarCategoria}
            onEliminar={(c) => setConfirmEliminar({ tipo: 'categoria', id: c.id, nombre: c.nombre })}
          />
        )}
      </div>

      {/* Modales */}
      <ModalProducto
        open={modalProductoOpen}
        onClose={() => setModalProductoOpen(false)}
        onGuardar={productoEditar
          ? (input) => editarProducto(productoEditar.id, input)
          : agregarProducto
        }
        producto={productoEditar}
        categorias={categorias}
      />

      <ModalCategoria
        open={modalCategoriaOpen}
        onClose={() => setModalCategoriaOpen(false)}
        onGuardar={categoriaEditar
          ? (input) => editarCategoria(categoriaEditar.id, input)
          : agregarCategoria
        }
        categoria={categoriaEditar}
        cocinas={cocinas}
      />

      {/* Diálogo de confirmación de eliminación */}
      {confirmEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sa-green-ink/50 backdrop-blur-sm" onClick={() => setConfirmEliminar(null)} />
          <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa p-6 w-full max-w-sm border border-sa-green-ink/5">
            <h3 className="text-2xl font-display text-sa-green-ink mb-2">¿Eliminar {confirmEliminar.tipo}?</h3>
            <p className="text-sa-green-ink/70 text-sm mb-5">
              Se eliminará <span className="font-medium text-sa-green-ink">"{confirmEliminar.nombre}"</span> permanentemente.
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmEliminar(null)}
                className="flex-1 border border-sa-green-ink/15 text-sa-green-ink py-2.5 rounded-sa font-medium text-sm hover:bg-sa-cream-warm/50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminar}
                disabled={eliminando}
                className="flex-1 bg-sa-strawberry disabled:opacity-50 text-white py-2.5 rounded-sa font-medium text-sm hover:opacity-90"
              >
                {eliminando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function EmptyState({
  icon,
  mensaje,
  accion,
  onAccion,
}: {
  icon: React.ReactNode
  mensaje: string
  accion?: string
  onAccion?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-sa-green-ink/50 gap-4">
      <span className="opacity-30">{icon}</span>
      <p className="text-lg font-medium">{mensaje}</p>
      {accion && onAccion && (
        <button
          onClick={onAccion}
          className="text-sa-green hover:text-sa-green-deep underline-offset-2 hover:underline text-sm font-medium"
        >
          {accion} →
        </button>
      )}
    </div>
  )
}

function TablaProductos({
  productos,
  onEditar,
  onEliminar,
  onToggle,
}: {
  productos: ProductoConCategoria[]
  onEditar: (p: ProductoConCategoria) => void
  onEliminar: (p: ProductoConCategoria) => void
  onToggle: (id: string, activo: boolean) => void
}) {
  return (
    <div className="bg-white rounded-sa shadow-sa-sm border border-sa-green-ink/5 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-sa-cream-soft border-b border-sa-green-ink/10 text-left text-sa-green-ink/60 font-mono text-xs uppercase tracking-wide">
            <th className="px-5 py-3 font-medium">Producto</th>
            <th className="px-5 py-3 font-medium">Categoría</th>
            <th className="px-5 py-3 font-medium">Cocina</th>
            <th className="px-5 py-3 font-medium text-right">Precio</th>
            <th className="px-5 py-3 font-medium text-center">Activo</th>
            <th className="px-5 py-3 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sa-green-ink/5">
          {productos.map((p) => {
            const slug = p.categorias?.cocinas?.slug ?? ''
            return (
              <tr key={p.id} className="hover:bg-sa-cream-soft/50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    {p.imagen_url ? (
                      <img
                        src={p.imagen_url}
                        alt={p.nombre}
                        className="w-10 h-10 rounded-lg object-cover border border-sa-green-ink/10 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-sa-cream-warm flex items-center justify-center text-lg flex-shrink-0">
                        {COCINA_ICON[slug] ?? <IconFork />}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sa-green-ink">{p.nombre}</p>
                      {p.descripcion && (
                        <p className="text-sa-green-ink/50 text-xs truncate max-w-[200px]">{p.descripcion}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-sa-green-ink/70">{p.categorias?.nombre ?? '—'}</td>
                <td className="px-5 py-3">
                  {slug ? (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${COCINA_COLOR[slug] ?? 'bg-sa-cream-warm text-sa-green-ink/70'}`}>
                      {COCINA_ICON[slug]} {p.categorias?.cocinas?.nombre}
                    </span>
                  ) : (
                    <span className="text-sa-green-ink/40">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-sa-green-ink">
                  ${p.precio.toFixed(2)}
                </td>
                <td className="px-5 py-3 text-center">
                  <button
                    onClick={() => onToggle(p.id, !p.activo)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      p.activo ? 'bg-sa-green' : 'bg-sa-green-ink/20'
                    }`}
                    aria-label={p.activo ? 'Desactivar' : 'Activar'}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        p.activo ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEditar(p)}
                      className="px-3 py-1.5 text-xs font-medium border border-sa-green-ink/15 rounded-lg hover:bg-sa-cream-soft text-sa-green-ink"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onEliminar(p)}
                      className="px-3 py-1.5 text-xs font-medium border border-sa-strawberry/30 rounded-lg hover:bg-sa-strawberry/10 text-sa-strawberry"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TablaCategorias({
  categorias,
  productosPorCategoria,
  onEditar,
  onEliminar,
}: {
  categorias: CategoriaConCocina[]
  productosPorCategoria: (id: string) => number
  onEditar: (c: CategoriaConCocina) => void
  onEliminar: (c: CategoriaConCocina) => void
}) {
  return (
    <div className="bg-white rounded-sa shadow-sa-sm border border-sa-green-ink/5 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-sa-cream-soft border-b border-sa-green-ink/10 text-left text-sa-green-ink/60 font-mono text-xs uppercase tracking-wide">
            <th className="px-5 py-3 font-medium">Categoría</th>
            <th className="px-5 py-3 font-medium">Cocina</th>
            <th className="px-5 py-3 font-medium text-center">Productos</th>
            <th className="px-5 py-3 font-medium text-center">Activa</th>
            <th className="px-5 py-3 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sa-green-ink/5">
          {categorias.map((c) => {
            const slug = c.cocinas?.slug ?? ''
            const total = productosPorCategoria(c.id)
            return (
              <tr key={c.id} className="hover:bg-sa-cream-soft/50 transition-colors">
                <td className="px-5 py-3 font-medium text-sa-green-ink">{c.nombre}</td>
                <td className="px-5 py-3">
                  {slug ? (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${COCINA_COLOR[slug] ?? 'bg-sa-cream-warm text-sa-green-ink/70'}`}>
                      {COCINA_ICON[slug]} {c.cocinas?.nombre}
                    </span>
                  ) : (
                    <span className="text-sa-green-ink/40">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center">
                  <span className="bg-sa-cream-warm text-sa-green-ink/70 px-2.5 py-1 rounded-full text-xs font-mono">
                    {total} {total === 1 ? 'producto' : 'productos'}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.activa ? 'bg-sa-mint/30 text-sa-green-ink' : 'bg-sa-cream-warm text-sa-green-ink/60'
                    }`}
                  >
                    {c.activa ? '● Activa' : '○ Inactiva'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEditar(c)}
                      className="px-3 py-1.5 text-xs font-medium border border-sa-green-ink/15 rounded-lg hover:bg-sa-cream-soft text-sa-green-ink"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onEliminar(c)}
                      disabled={total > 0}
                      title={total > 0 ? 'Elimina primero los productos de esta categoría' : ''}
                      className="px-3 py-1.5 text-xs font-medium border border-sa-strawberry/30 rounded-lg hover:bg-sa-strawberry/10 text-sa-strawberry disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
