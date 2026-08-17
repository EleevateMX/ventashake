/**
 * Iconos de la casa, en SVG. La PWA no usa emojis: el trazo toma el color
 * del texto (currentColor) para vivir dentro de la paleta de la marca, y la
 * personalidad la pone Milo.
 */

interface Props {
  className?: string
}

/** La mancuerna: la moneda del programa. */
export const IconMancuerna = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <rect x="1" y="9" width="2.6" height="6" rx="1" />
    <rect x="4.4" y="6.5" width="3.1" height="11" rx="1.2" />
    <rect x="8.3" y="10.9" width="7.4" height="2.2" rx="1.1" />
    <rect x="16.5" y="6.5" width="3.1" height="11" rx="1.2" />
    <rect x="20.4" y="9" width="2.6" height="6" rx="1" />
  </svg>
)

/** Cupón de recompensa. */
export const IconRegalo = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    <path d="M12 8v12" />
    <path d="M12 8c-4.2 0-5.2-4.6-2.4-4.6C11.2 3.4 12 5.6 12 8Z" />
    <path d="M12 8c4.2 0 5.2-4.6 2.4-4.6C12.8 3.4 12 5.6 12 8Z" />
  </svg>
)

/** Cupón de cumpleaños. */
export const IconPastel = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M4 20h16" />
    <path d="M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6" />
    <path d="M5 16c1.5 1.2 3 .2 3-.8 0 1 1.5 2 3 .8 1.5-1.2 3-.2 3 .8 0-1 1.5-2 3-.8" />
    <path d="M12 12V9" />
    <path d="M12 6.5c-.8-.8-.8-2 0-2.9.8.9.8 2.1 0 2.9Z" />
  </svg>
)

/** Ticket de compra, para el historial. */
export const IconRecibo = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Z" />
    <path d="M9.5 8h5M9.5 12h5" />
  </svg>
)

/** Estrella, para lo que siempre pide. */
export const IconEstrella = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2.8l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.1l6.1-.7L12 2.8Z" />
  </svg>
)
