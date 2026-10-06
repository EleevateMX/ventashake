import { useState } from 'react'
import type { Aliado } from '@shake/supabase'
import { useEstado } from './Estado'
import { Hoja, Etiqueta, Boton, Sheet, Cargando, Titulo } from './ui'
import { IconoFlecha, IconoMensaje } from './Iconos'

/**
 * Las marcas con las que colaboramos: logos, qué son, cómo contactarlos y
 * la promo que tienen con Shakeaholic. Lo administra gerencia en Admin →
 * Aliados; aquí solo se pinta.
 */

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export function LogoAliado({ aliado, lado }: { aliado: Aliado; lado: number }) {
  const [rota, setRota] = useState(false)
  return (
    <span style={{ width: lado, height: lado }} className="shrink-0 rounded-[18px] bg-sa-cream-paper flex items-center justify-center overflow-hidden" aria-label={aliado.nombre}>
      {aliado.logo_url && !rota
        ? <img src={aliado.logo_url} alt="" className="w-full h-full object-contain p-3" onError={() => setRota(true)} />
        : <span className="font-display text-[26px] text-sa-green">{iniciales(aliado.nombre)}</span>}
    </span>
  )
}

/** Los logos en fila, para la tarjeta. */
export function AliadosFila() {
  const { aliados } = useEstado()
  const [abierto, setAbierto] = useState<Aliado | null>(null)
  if (!aliados || aliados.length === 0) return null
  return (
    <div className="mb-3">
      <Etiqueta texto="Aliados Shakeaholic" clara className="mb-2.5" />
      <div className="flex gap-3 overflow-x-auto sa-fila -mx-4 px-4 pb-1">
        {aliados.map((a) => (
          <button key={a.id} onClick={() => setAbierto(a)} className="active:scale-95 transition-transform"><LogoAliado aliado={a} lado={84} /></button>
        ))}
      </div>
      <AliadoDetalle aliado={abierto} alCerrar={() => setAbierto(null)} />
    </div>
  )
}

/** La pestaña «Aliados»: todas las marcas, con su promo a la vista. */
export function AliadosTab() {
  const { aliados, cargarAliados } = useEstado()
  const [abierto, setAbierto] = useState<Aliado | null>(null)
  return (
    <>
      <Titulo texto="Aliados">
        <button onClick={() => void cargarAliados()} className="font-mono text-[10px] uppercase tracking-wider text-sa-cream/50 pb-1.5">Actualizar</button>
      </Titulo>
      <Etiqueta texto="Marcas que te consienten con tu tarjeta" className="mb-3" />
      {aliados === null ? (
        <Cargando />
      ) : aliados.length === 0 ? (
        <Hoja>
          <p className="font-semibold text-base">Pronto.</p>
          <p className="text-sm text-sa-green-ink/65">Estamos cerrando alianzas con marcas de Mérida para que tu tarjeta valga también fuera de la barra.</p>
        </Hoja>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {aliados.map((a) => (
            <button key={a.id} onClick={() => setAbierto(a)} className="rounded-[20px] bg-sa-cream-paper p-3.5 text-left active:scale-[0.98] transition-transform">
              <LogoAliado aliado={a} lado={64} />
              <p className="text-[15px] font-semibold text-sa-green-ink leading-tight mt-2.5 line-clamp-2">{a.nombre}</p>
              {a.promo_titulo && <p className="text-xs font-medium text-sa-green mt-1 line-clamp-2">{a.promo_titulo}</p>}
            </button>
          ))}
        </div>
      )}
      <AliadoDetalle aliado={abierto} alCerrar={() => setAbierto(null)} />
    </>
  )
}

/** La hoja del aliado: logo, qué son, la promo en amarillo y los botones de contacto que tengan dato. */
export function AliadoDetalle({ aliado, alCerrar }: { aliado: Aliado | null; alCerrar: () => void }) {
  if (!aliado) return <Sheet abierta={false} alCerrar={alCerrar}>{null}</Sheet>
  const a = aliado
  const contactos: { texto: string; href: string }[] = []
  if (a.whatsapp) contactos.push({ texto: 'WhatsApp', href: `https://wa.me/52${a.whatsapp.replace(/\D/g, '')}` })
  if (a.instagram) contactos.push({ texto: 'Instagram', href: `https://instagram.com/${a.instagram.replace('@', '')}` })
  if (a.web) contactos.push({ texto: 'Sitio web', href: a.web.startsWith('http') ? a.web : `https://${a.web}` })
  if (a.telefono) contactos.push({ texto: 'Llamar', href: `tel:${a.telefono.replace(/\D/g, '')}` })
  if (a.direccion) contactos.push({ texto: a.direccion, href: `https://maps.google.com/?q=${encodeURIComponent(a.direccion)}` })

  return (
    <Sheet abierta alCerrar={alCerrar}>
      <div className="space-y-4 pt-3">
        <div className="flex items-center gap-3.5">
          <LogoAliado aliado={a} lado={72} />
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-sa-cream leading-tight">{a.nombre}</h2>
            <Etiqueta texto="Aliado de Shakeaholic" />
          </div>
        </div>
        {a.descripcion && <p className="text-[15px] text-sa-cream/85 leading-snug">{a.descripcion}</p>}
        {a.promo_titulo && (
          <div className="rounded-[18px] bg-sa-banana p-4 text-sa-green-ink">
            <Etiqueta texto="Promo con tu tarjeta" className="!text-sa-green-ink/60" />
            <p className="font-display text-[22px] leading-tight mt-1">{a.promo_titulo}</p>
            {a.promo_texto && <p className="text-sm text-sa-green-ink/75 mt-1">{a.promo_texto}</p>}
          </div>
        )}
        {contactos.length > 0 && (
          <div className="space-y-2.5">
            {contactos.map((c) => (
              <a key={c.href} href={c.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-[14px] bg-sa-cream/10 px-3.5 py-3 text-sa-cream">
                <IconoMensaje className="w-5 h-5 shrink-0 opacity-80" />
                <span className="text-[15px] font-medium flex-1 min-w-0 truncate">{c.texto}</span>
                <IconoFlecha className="w-4 h-4 opacity-50" />
              </a>
            ))}
          </div>
        )}
        <Boton tono="tinta" onClick={alCerrar}>Cerrar</Boton>
      </div>
    </Sheet>
  )
}
