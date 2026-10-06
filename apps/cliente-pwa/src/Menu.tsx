import { useMemo, useState } from 'react'
import type { ProductoVenta } from '@shake/supabase'
import { mxn } from '@shake/utils'
import { useEstado, nombreVisible, esNuevo, resumenPromo, type Promo } from './Estado'
import { Etiqueta, Insignia, Chip, Foto, Cargando, Enlace, Titulo } from './ui'
import { IconoLupa } from './Iconos'
import { ProductoDetalle } from './ProductoDetalle'

const WHATSAPP = 'https://wa.me/529995044797'
const ORDEN_FAMILIAS = ['Shakes', 'Alimentos', 'Bebidas', 'De temporada', 'Snacks', 'Más']

/**
 * La carta viva de la barra: la misma tabla `productos` que leen el kiosko
 * y la app de iOS, con la misma foto. Las categorías se agrupan en
 * familias para que la gente llegue a lo suyo sin pasar por 250 shakes.
 * Arriba de cada familia van los más pedidos (el lugar lo manda el
 * servidor por lo vendido en 60 días; la app no cuenta nada).
 */
export function familiaDe(categoria: string): string | null {
  const c = categoria.toLowerCase()
  if (c.includes('temporada')) return 'De temporada'
  if (/^(scoops|suplementos|extras|recargas|ventas especiales)/.test(c)) return null
  if (c.startsWith('shakes')) return 'Shakes'
  if (c.startsWith('alimentos') || c.startsWith('combos')) return 'Alimentos'
  if (c.startsWith('snacks')) return 'Snacks'
  for (const b of ['bebidas', 'café', 'cafe', 'tés', 'tes', 'kombucha', 'collagen', 'amino', 'hydration', 'energy', 'drinks']) {
    if (c.includes(b)) return 'Bebidas'
  }
  return 'Más'
}

/** Sin acentos ni mayúsculas: «matcha» encuentra «Coco Matcha Cloud». */
export const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Seccion { familia: string; destacados: ProductoVenta[]; categorias: [string, ProductoVenta[]][] }

export function MenuTab() {
  const { menu, destacados, promos, resumen, pedidosConfig, cargarMenu } = useEstado()
  const [familia, setFamilia] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<ProductoVenta | null>(null)

  const favoritos = useMemo(() => new Set((resumen?.favoritos ?? []).map((f) => plano(f.nombre))), [resumen])

  const secciones = useMemo<Seccion[]>(() => {
    const porFamilia = new Map<string, Map<string, ProductoVenta[]>>()
    const ordenCat = new Map<string, number>()
    for (const p of menu ?? []) {
      const cat = p.categorias?.nombre
      const f = cat ? familiaDe(cat) : null
      if (!cat || !f) continue
      if (!porFamilia.has(f)) porFamilia.set(f, new Map())
      const cats = porFamilia.get(f)!
      if (!cats.has(cat)) cats.set(cat, [])
      cats.get(cat)!.push(p)
      ordenCat.set(cat, p.categorias?.orden ?? 999)
    }
    return ORDEN_FAMILIAS.flatMap((f) => {
      const cats = porFamilia.get(f)
      if (!cats) return []
      const categorias = [...cats.entries()].sort((a, b) => (ordenCat.get(a[0]) ?? 999) - (ordenCat.get(b[0]) ?? 999) || a[0].localeCompare(b[0]))
      const top = categorias.flatMap(([, ps]) => ps)
        .filter((p) => destacados[p.id] != null)
        .sort((a, b) => destacados[a.id] - destacados[b.id] || (ordenCat.get(a.categorias?.nombre ?? '') ?? 999) - (ordenCat.get(b.categorias?.nombre ?? '') ?? 999))
        .slice(0, 4)
      return [{ familia: f, destacados: top, categorias }]
    })
  }, [menu, destacados])

  const q = plano(busqueda.trim())
  const resultados = useMemo(() => {
    if (q.length < 2) return []
    return (menu ?? []).filter((p) => {
      const cat = p.categorias?.nombre
      if (!cat || !familiaDe(cat)) return false
      return plano(nombreVisible(p.nombre)).includes(q) || plano(p.descripcion ?? '').includes(q) || plano(cat).includes(q)
    })
  }, [menu, q])

  const fila = (p: ProductoVenta) => (
    <FilaProducto key={p.id} producto={p} lugar={destacados[p.id]} favorito={favoritos.has(plano(nombreVisible(p.nombre)))} onClick={() => setAbierto(p)} />
  )

  return (
    <>
      <Titulo texto="Menú">
        <button onClick={() => void cargarMenu()} className="font-mono text-[10px] uppercase tracking-wider text-sa-cream/50 pb-1.5">Actualizar</button>
      </Titulo>
      <Etiqueta texto="Lo que hay hoy en la barra" className="mb-3" />
      {menu === null ? (
        <Cargando texto="Cargando el menú" />
      ) : secciones.length === 0 ? (
        <p className="text-sa-cream/60 text-[15px]">El menú no está disponible ahora.</p>
      ) : (
        <>
          <label className="flex items-center gap-2.5 rounded-[14px] bg-sa-cream-paper px-3.5 py-2.5 mb-3">
            <IconoLupa className="w-5 h-5 text-sa-green-ink/50 shrink-0" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Busca un shake, un wrap, un café…"
              autoCorrect="off" autoCapitalize="none" spellCheck={false}
              className="flex-1 min-w-0 bg-transparent text-[15px] text-sa-green-ink outline-none placeholder:text-sa-green-ink/45"
            />
            {busqueda && <button onClick={() => setBusqueda('')} className="text-sa-green-ink/40 text-lg leading-none" aria-label="Borrar">×</button>}
          </label>

          {q.length >= 2 ? (
            resultados.length === 0
              ? <p className="text-sa-cream/60 text-[15px]">Nada con «{busqueda}». Milo tampoco lo encontró.</p>
              : <div className="space-y-2.5">{resultados.map(fila)}</div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto sa-fila -mx-4 px-4 pb-1 mb-2">
                <Chip texto="Todo" activa={familia === null} onClick={() => setFamilia(null)} />
                {secciones.map((s) => (
                  <Chip key={s.familia} texto={s.familia} activa={familia === s.familia} onClick={() => setFamilia(familia === s.familia ? null : s.familia)} />
                ))}
              </div>
              {familia === null && <Novedades promos={promos} menu={menu} abrir={setAbierto} />}
              {secciones.filter((s) => familia === null || s.familia === familia).map((s) => (
                <section key={s.familia}>
                  <h2 className="sticky top-0 z-10 font-display text-2xl text-sa-banana py-2 bg-sa-green-deep">{s.familia}</h2>
                  {s.destacados.length > 0 && <MasPedidos productos={s.destacados} abrir={setAbierto} />}
                  <div className="space-y-2.5 mb-3">
                    {s.categorias.map(([cat, ps]) => (
                      <div key={cat} className="space-y-2.5">
                        {s.categorias.length > 1 && <p className="font-mono text-[11px] tracking-[0.15em] text-sa-cream/55 pt-1.5">{cat}</p>}
                        {ps.map(fila)}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {pedidosConfig?.whatsapp && <div className="pt-2"><Enlace href={WHATSAPP} tono="platano">Pedir por WhatsApp</Enlace></div>}
            </>
          )}
        </>
      )}
      <ProductoDetalle producto={abierto} alCerrar={() => setAbierto(null)} />
    </>
  )
}

/** Los más pedidos de la familia: fotos grandes en fila. */
function MasPedidos({ productos, abrir }: { productos: ProductoVenta[]; abrir: (p: ProductoVenta) => void }) {
  return (
    <div className="mb-3">
      <Etiqueta texto="Los más pedidos" clara className="mb-2" />
      <div className="flex gap-3 overflow-x-auto sa-fila -mx-4 px-4 pb-1">
        {productos.map((p) => <TarjetaFoto key={p.id} producto={p} lado={150} onClick={() => abrir(p)} />)}
      </div>
    </div>
  )
}

function TarjetaFoto({ producto: p, lado, onClick }: { producto: ProductoVenta; lado: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: lado }} className="shrink-0 text-left active:scale-[0.98] transition-transform">
      <Foto url={p.imagen_url} nombre={nombreVisible(p.nombre)} lado={lado} />
      <p className="text-sm font-semibold text-sa-cream mt-1.5 leading-tight line-clamp-2">{nombreVisible(p.nombre)}</p>
      <p className="font-mono text-[13px] font-medium text-sa-banana mt-0.5">{mxn(p.precio)}</p>
    </button>
  )
}

/** Una tarjeta por producto: la foto a la izquierda, el nombre y el precio. */
function FilaProducto({ producto: p, lugar, favorito, onClick }: { producto: ProductoVenta; lugar?: number; favorito: boolean; onClick: () => void }) {
  const nuevo = esNuevo(p)
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3.5 rounded-[18px] bg-sa-cream-paper p-2.5 text-left active:scale-[0.99] transition-transform">
      <Foto url={p.imagen_url} nombre={nombreVisible(p.nombre)} lado={76} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-sa-green-ink leading-tight line-clamp-2">{nombreVisible(p.nombre)}</p>
        {(lugar === 1 || nuevo || favorito) && (
          <div className="flex gap-1.5 mt-1">
            {lugar === 1 && <Insignia texto="Más pedido" />}
            {nuevo && <Insignia texto="Nuevo" menta />}
            {favorito && <Insignia texto="Tu favorito" menta />}
          </div>
        )}
        {p.descripcion && <p className="text-xs text-sa-green-ink/55 leading-snug mt-0.5 line-clamp-2">{p.descripcion}</p>}
        <p className="font-mono text-sm font-medium text-sa-green mt-0.5">{mxn(p.precio)}</p>
      </div>
    </button>
  )
}

/** Novedades: las promos de hoy y lo que entró al catálogo en 15 días. Solo sale si hay algo. */
function Novedades({ promos, menu, abrir }: { promos: Promo[]; menu: ProductoVenta[]; abrir: (p: ProductoVenta) => void }) {
  const nuevos = menu.filter((p) => esNuevo(p) && p.categorias?.nombre && familiaDe(p.categorias.nombre))
  if (promos.length === 0 && nuevos.length === 0) return null
  return (
    <div className="mb-3">
      <h2 className="font-display text-2xl text-sa-banana py-2">Novedades</h2>
      <div className="space-y-2.5">
        {promos.map((promo) => {
          const afectados = menu.filter((p) => (promo.productos ?? []).includes(p.id))
          return (
            <button
              key={promo.id}
              onClick={() => { if (afectados.length === 1) abrir(afectados[0]) }}
              className="w-full flex items-center gap-3.5 rounded-[18px] bg-sa-banana p-3 text-left active:scale-[0.99] transition-transform"
            >
              <span className="font-display text-xl text-sa-green-ink bg-sa-cream rounded-xl px-3 py-2 shrink-0">{resumenPromo(promo, mxn)}</span>
              <span className="min-w-0">
                <span className="block font-semibold text-base text-sa-green-ink leading-tight">{promo.nombre}</span>
                <span className="block text-[13px] text-sa-green-ink/75 leading-snug line-clamp-2">
                  {promo.descripcion || afectados.slice(0, 3).map((p) => nombreVisible(p.nombre)).join(' · ')}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {nuevos.length > 0 && (
        <div className="mt-3">
          <Etiqueta texto="Nuevo en la barra" clara className="mb-2" />
          <div className="flex gap-3 overflow-x-auto sa-fila -mx-4 px-4 pb-1">
            {nuevos.slice(0, 8).map((p) => <TarjetaFoto key={p.id} producto={p} lado={120} onClick={() => abrir(p)} />)}
          </div>
        </div>
      )}
    </div>
  )
}
