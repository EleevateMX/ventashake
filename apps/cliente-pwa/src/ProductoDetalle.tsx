import milo from '@shake/brand/milo.png'
import { useEffect, useState, type ComponentType } from 'react'
import type { ProductoVenta } from '@shake/supabase'
import { mxn } from '@shake/utils'
import { useEstado, nombreVisible, esNuevo, type ExtraProducto } from './Estado'
import { Hoja, Etiqueta, Insignia, Boton, Enlace, Sheet } from './ui'
import { IconoBolsa, IconoChispa, IconoComida, IconoMancuerna, IconoVaso, IconoRegalo } from './Iconos'
import { PedidoSheet } from './Pedido'

/**
 * La ficha de un producto: foto grande, descripción, la promo que le aplica
 * hoy, con qué va (la misma lista de extras del kiosko) y «Lo quiero». Los
 * botones los decide gerencia (Admin → Rewards → Pedidos por la app).
 */
export function ProductoDetalle({ producto, alCerrar }: { producto: ProductoVenta | null; alCerrar: () => void }) {
  const { promos, destacados, resumen, pedidosConfig, extrasDe } = useEstado()
  const [extras, setExtras] = useState<ExtraProducto[] | null>(null)
  const [pidiendo, setPidiendo] = useState(false)

  useEffect(() => {
    setExtras(null)
    setPidiendo(false)
    if (!producto) return
    let vivo = true
    void extrasDe(producto.id).then((l) => { if (vivo) setExtras(l) }).catch(() => { if (vivo) setExtras([]) })
    return () => { vivo = false }
  }, [producto, extrasDe])

  if (!producto) return <Sheet abierta={false} alCerrar={alCerrar}>{null}</Sheet>
  const p = producto
  const nombre = nombreVisible(p.nombre)
  const promo = promos.find((x) => (x.productos ?? []).includes(p.id))
  const favorito = (resumen?.favoritos ?? []).some((f) => f.nombre.toLowerCase() === nombre.toLowerCase())
  const cfg = pedidosConfig
  const texto = `Hola, quiero un ${nombre} (${mxn(p.precio)}). Paso a recogerlo.`
  const whatsapp = `https://wa.me/529995044797?text=${encodeURIComponent(texto)}`

  return (
    <Sheet abierta alCerrar={alCerrar} alta>
      <div className="space-y-4 pt-2">
        <div className="w-full h-[260px] rounded-[24px] bg-sa-cream-paper overflow-hidden flex items-center justify-center">
          {p.imagen_url ? (
            <img src={p.imagen_url} alt={nombre} className="w-full h-full object-contain p-2.5" />
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <img src={milo} alt="" className="h-[120px] opacity-85" />
              <p className="text-[13px] font-semibold text-sa-green">Milo se lo comió</p>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {p.categorias?.nombre && <Etiqueta texto={p.categorias.nombre} />}
            {destacados[p.id] === 1 && <Insignia texto="Más pedido" />}
            {esNuevo(p) && <Insignia texto="Nuevo" menta />}
            {favorito && <Insignia texto="Tu favorito" menta />}
          </div>
          <h2 className="font-display text-[28px] leading-tight text-sa-cream mt-1.5">{nombre}</h2>
          <p className="font-mono text-xl font-medium text-sa-banana mt-1">{mxn(p.precio)}</p>
        </div>
        {p.descripcion && <p className="text-[15px] text-sa-cream/85 leading-snug">{p.descripcion}</p>}

        {promo && (
          <div className="rounded-[18px] bg-sa-banana p-4 text-sa-green-ink">
            <Etiqueta texto="Promo de hoy" className="!text-sa-green-ink/60" />
            <p className="font-display text-[22px] leading-tight mt-1">{promo.nombre}</p>
            {promo.descripcion && <p className="text-sm text-sa-green-ink/75 mt-1">{promo.descripcion}</p>}
          </div>
        )}

        {extras && extras.length > 0 && <ConQueVa extras={extras} />}

        {cfg?.activo && (
          cfg.abierto_ahora && resumen?.cliente ? (
            <div className="space-y-2">
              <Boton onClick={() => setPidiendo(true)}>
                <span className="inline-flex items-center gap-2"><IconoBolsa className="w-5 h-5" />Lo quiero · pedir y pagar</span>
              </Boton>
              <p className="text-xs text-sa-cream/50 text-center">Pagas con tarjeta aquí y pasas por él en {cfg.minutos_preparacion ?? 20} minutos.</p>
            </div>
          ) : !cfg.abierto_ahora ? (
            <p className="text-[13px] text-sa-cream/60 text-center">{cfg.mensaje_cerrado ?? `Recibimos pedidos de ${cfg.hora_inicio} a ${cfg.hora_fin}.`}</p>
          ) : null
        )}
        {cfg?.whatsapp && <Enlace href={whatsapp}>Pedir por WhatsApp</Enlace>}

        <Boton tono="tinta" onClick={alCerrar}>Cerrar</Boton>
      </div>
      {pidiendo && <PedidoSheet producto={p} extras={extras ?? []} alCerrar={() => setPidiendo(false)} />}
    </Sheet>
  )
}

/** «Proteína BIRDMAN FALCON - Chocolate» → «BIRDMAN FALCON · Chocolate». */
export function corto(nombre: string, grupo: string): string {
  let n = nombre
  for (const prefijo of [grupo, 'Proteína', 'Proteina']) {
    if (n.toLowerCase().startsWith(prefijo.toLowerCase() + ' ')) n = n.slice(prefijo.length + 1)
  }
  return n.replace(/ - /g, ' · ').trim()
}

/** Un icono por familia de extra, por el nombre. Lo demás, una chispa. */
function iconoExtra(nombre: string): ComponentType<{ className?: string }> {
  const n = nombre.toLowerCase()
  if (n.includes('galleta') || n.includes('cookie')) return IconoComida
  if (n.includes('doble') || n.includes('scoop')) return IconoMancuerna
  if (n.includes('agua') || n.includes('leche') || n.includes('café') || n.includes('cafe')) return IconoVaso
  if (n.includes('colágeno') || n.includes('colageno') || n.includes('probiotic') || n.includes('vitamin')) return IconoRegalo
  return IconoChispa
}

/**
 * Los extras agrupados como en el kiosko, pero para verse: las opciones de
 * cada grupo como pastillas (la de casa, resaltada) y los sueltos como
 * mosaicos con icono y precio.
 */
function ConQueVa({ extras }: { extras: ExtraProducto[] }) {
  const [todos, setTodos] = useState(false)
  const conGrupo = extras.filter((e) => (e.grupo ?? '') !== '')
  const grupos = [...new Set(conGrupo.map((e) => e.grupo!))].sort().map((g) => [g, conGrupo.filter((e) => e.grupo === g)] as const)
  const sueltos = extras.filter((e) => (e.grupo ?? '') === '')
  const mostrados = todos ? sueltos : sueltos.slice(0, 6)

  return (
    <Hoja titulo="Con qué va">
      {grupos.map(([grupo, lista]) => (
        <div key={grupo}>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sa-green-ink/50 mb-2">{grupo}</p>
          <div className="flex gap-2 overflow-x-auto sa-fila -mx-1 px-1 pb-0.5">
            {[...lista].sort((a, b) => Number(b.por_defecto === true) - Number(a.por_defecto === true) || a.nombre.localeCompare(b.nombre)).map((e) => {
              const casa = e.por_defecto === true
              return (
                <span key={e.extra_id} className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold ${casa ? 'bg-sa-green text-sa-cream' : 'bg-sa-cream-warm text-sa-green-ink'}`}>
                  {casa && <span className="text-[11px]">★</span>}
                  <span className="whitespace-nowrap">{corto(e.nombre, grupo)}</span>
                  {(e.precio ?? 0) > 0 && <span className="font-mono text-[11px] opacity-80">+{mxn(e.precio)}</span>}
                </span>
              )
            })}
          </div>
        </div>
      ))}
      {sueltos.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sa-green-ink/50 mb-2">Extras</p>
          <div className="grid grid-cols-2 gap-2.5">
            {mostrados.map((e) => {
              const Icono = iconoExtra(e.nombre)
              const cobra = (e.precio ?? 0) > 0
              return (
                <div key={e.extra_id} className="flex items-center gap-2.5 rounded-[14px] bg-sa-cream-warm/60 p-2.5">
                  <span className="w-8 h-8 shrink-0 rounded-[10px] bg-sa-mint/35 text-sa-green flex items-center justify-center"><Icono className="w-4 h-4" /></span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-sa-green-ink leading-tight line-clamp-2">{e.nombre}</p>
                    <p className={`font-mono text-[11px] font-medium ${cobra ? 'text-sa-green' : 'text-sa-green-ink/50'}`}>{cobra ? `+${mxn(e.precio)}` : 'incluido'}</p>
                  </div>
                </div>
              )
            })}
          </div>
          {sueltos.length > 6 && (
            <button onClick={() => setTodos((v) => !v)} className="mt-2 text-[13px] font-semibold text-sa-green">
              {todos ? 'Ver menos' : `Ver los ${sueltos.length} extras`}
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-sa-green-ink/50">★ la de casa. Pídelo como lo quieras en la barra.</p>
    </Hoja>
  )
}
