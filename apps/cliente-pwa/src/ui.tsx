import milo from '@shake/brand/milo.png'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Las piezas de interfaz que comparten todas las pantallas: la hoja crema,
 * la etiqueta en versalitas, la insignia, el botón, la hoja deslizante y
 * la foto con Milo. Son las mismas de la app de iOS (Hoja, Etiqueta,
 * Insignia, BotonPrincipal, Foto), para que las dos se vean iguales.
 */

export function Hoja({ titulo, children, className = '' }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-sa-lg p-5 mb-3 bg-sa-cream-paper text-sa-green-ink shadow-sa space-y-3 ${className}`}>
      {titulo && <h2 className="font-display text-lg text-sa-green leading-tight">{titulo}</h2>}
      {children}
    </section>
  )
}

export function Etiqueta({ texto, clara = false, className = '' }: { texto: string; clara?: boolean; className?: string }) {
  return (
    <p className={`font-mono text-[10px] uppercase tracking-[0.2em] ${clara ? 'text-sa-cream/70' : 'text-sa-banana'} ${className}`}>
      {texto}
    </p>
  )
}

export function Insignia({ texto, menta = false }: { texto: string; menta?: boolean }) {
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sa-green-ink ${menta ? 'bg-sa-mint' : 'bg-sa-banana'}`}>
      {texto}
    </span>
  )
}

type Tono = 'platano' | 'verde' | 'tinta' | 'suave'
const TONOS: Record<Tono, string> = {
  platano: 'bg-sa-banana text-sa-green-ink',
  verde: 'bg-sa-green text-sa-cream',
  tinta: 'bg-sa-green-ink text-sa-cream',
  suave: 'bg-sa-cream/10 text-sa-cream',
}

export function Boton({
  children, onClick, tono = 'platano', disabled, className = '', type = 'button',
}: {
  children: ReactNode; onClick?: () => void; tono?: Tono; disabled?: boolean; className?: string; type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-sa-lg font-display text-xl py-3.5 active:scale-[0.98] transition-transform disabled:opacity-40 ${TONOS[tono]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Enlace({ href, children, tono = 'suave' }: { href: string; children: ReactNode; tono?: Tono }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-full rounded-sa-lg font-body font-semibold text-base py-3.5 text-center active:scale-[0.98] transition-transform ${TONOS[tono]}`}
    >
      {children}
    </a>
  )
}

/**
 * La hoja que sube desde abajo (como las `sheet` de iOS). Al abrir, el
 * fondo deja de desplazarse; al cerrar, vuelve. Se cierra tocando fuera.
 */
export function Sheet({ abierta, alCerrar, children, alta = false }: { abierta: boolean; alCerrar: () => void; children: ReactNode; alta?: boolean }) {
  useEffect(() => {
    if (!abierta) return
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar() }
    window.addEventListener('keydown', tecla)
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', tecla) }
  }, [abierta, alCerrar])

  if (!abierta) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-sa-green-ink/70 sa-aparece" onClick={alCerrar} aria-label="Cerrar" />
      <div className={`relative w-full max-w-lg bg-sa-green-deep rounded-t-[28px] shadow-sa sa-sube overflow-y-auto overscroll-contain ${alta ? 'h-[94dvh]' : 'max-h-[88dvh]'}`}>
        <div className="sticky top-0 z-10 flex justify-center pt-2.5 pb-1 bg-sa-green-deep">
          <span className="w-10 h-1.5 rounded-full bg-sa-cream/25" />
        </div>
        <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}

/** Pantalla completa sobre blanco: lo que un lector de QR necesita. */
export function PantallaBlanca({ children, alCerrar }: { children: ReactNode; alCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-5 px-6 text-sa-green-ink">
      {children}
      <button onClick={alCerrar} className="mt-2 w-full max-w-[260px] rounded-sa-lg bg-sa-green-ink text-sa-cream font-display text-xl py-3.5">
        Cerrar
      </button>
    </div>
  )
}

/** La foto del producto, o Milo que se lo comió. */
export function Foto({ url, nombre, lado, redondeo = 'rounded-[14px]', className = '' }: { url: string | null; nombre: string; lado: number; redondeo?: string; className?: string }) {
  // Si la foto no carga, Milo se la comió: un hueco gris se ve roto.
  const [rota, setRota] = useState(false)
  return (
    <div
      style={{ width: lado, height: lado }}
      className={`shrink-0 overflow-hidden bg-sa-cream-warm flex items-center justify-center ${redondeo} ${className}`}
      aria-label={url ? nombre : `${nombre}, sin foto`}
    >
      {url && !rota ? (
        <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setRota(true)} />
      ) : (
        <SeLoComio lado={lado} />
      )}
    </div>
  )
}

export function SeLoComio({ lado }: { lado: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <img src={milo} alt="" style={{ width: lado * 0.56 }} className="opacity-85" />
      <p className={`text-center font-semibold text-sa-green leading-[1.05] ${lado > 100 ? 'text-xs' : 'text-[9px]'}`}>
        Milo se<br />lo comió
      </p>
    </div>
  )
}

export function Chip({ texto, activa, onClick }: { texto: string; activa: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors active:scale-95 ${
        activa ? 'bg-sa-banana text-sa-green-ink' : 'bg-sa-cream/10 text-sa-cream'
      }`}
    >
      {texto}
    </button>
  )
}

export function Cifra({ valor, pie }: { valor: string; pie: string }) {
  return (
    <div>
      <p className="font-mono text-xl font-medium text-sa-green leading-none">{valor}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sa-green-ink/50 mt-1">{pie}</p>
    </div>
  )
}

export function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-[0.15em] text-sa-green-ink/50 mb-1">{titulo}</span>
      {children}
    </label>
  )
}

export const claseInput = 'w-full rounded-xl bg-white border border-sa-green-ink/10 px-3 py-3 text-base text-sa-green-ink outline-none focus:border-sa-green'

export function Cargando({ texto }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-sa-cream/60">
      <span className="w-6 h-6 rounded-full border-2 border-sa-banana border-t-transparent animate-spin" />
      {texto && <p className="font-mono text-xs uppercase tracking-widest">{texto}</p>}
    </div>
  )
}

/** Un toque de vibración donde iOS daría háptica. En iPhone no existe y no pasa nada. */
export const tacto = {
  ligero: () => navigator.vibrate?.(8),
  exito: () => navigator.vibrate?.([10, 40, 14]),
  error: () => navigator.vibrate?.([30, 40, 30]),
}

/** Título de pantalla, como `Pantalla(titulo:)` en iOS. */
export function Titulo({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pt-2 pb-3">
      <h1 className="font-display text-[34px] leading-none text-sa-cream">{texto}</h1>
      {children}
    </div>
  )
}
