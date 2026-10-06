/**
 * Los iconos de la app, dibujados.
 *
 * Antes eran emoji (🏋️ 🥤 📋 👤). Se ven distintos en cada telefono - en
 * iPhone son los de Apple, en Android los de Google, y en algunos
 * Android viejos ni siquiera existen y sale un cuadro -, no se pueden
 * tenir del color de la pestana activa, y a tamano de barra inferior son
 * demasiado detallados para leerse. Es el detalle que mas delata que algo
 * es una pagina web y no una app.
 *
 * Estos heredan `currentColor`, asi que la pestana activa los pinta de
 * amarillo sola, y estan dibujados con el grosor de trazo de la marca.
 */

type Props = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Mancuerna: la pestana de la tarjeta, y la unidad del programa. */
export function IconoMancuerna({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />
    </svg>
  )
}

/** Vaso con popote: el menu. */
export function IconoVaso({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z" />
      <path d="M5 7h14" />
      <path d="M14 7 16.5 3" />
    </svg>
  )
}

/** Lista: la actividad. */
export function IconoLista({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M9.5 4V3h5v1" />
      <path d="M9.5 10h5M9.5 14h5M9.5 17.5h3" />
    </svg>
  )
}

/** Persona: la cuenta. */
export function IconoPersona({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

/** Sandwich: la tarjeta de sellos de comida. */
export function IconoComida({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 9.5 12 5l8 4.5" />
      <path d="M4 9.5h16" />
      <path d="M4 13h16" />
      <path d="M4 13v2a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-2" />
    </svg>
  )
}

/** Regalo: el premio al final de la tarjeta de sellos. */
export function IconoRegalo({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 11h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z" />
      <path d="M3 7.5h18V11H3V7.5Z" />
      <path d="M12 7.5V21" />
      <path d="M12 7.5S10.5 3 8.2 3a2.2 2.2 0 0 0 0 4.5H12Z" />
      <path d="M12 7.5S13.5 3 15.8 3a2.2 2.2 0 0 1 0 4.5H12Z" />
    </svg>
  )
}

/** Palomita: un sello ya juntado. */
export function IconoPalomita({ className }: Props) {
  return (
    <svg {...base} className={className} strokeWidth={2.5} aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  )
}

/** Etiqueta de precio: la pestaña de Aliados. */
export function IconoEtiqueta({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** La tienda: la pestaña Personal. */
export function IconoTienda({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 9.5 4.5 4h15L21 9.5M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M4.5 11v9h15v-9M9.5 20v-5h5v5" />
    </svg>
  )
}

/** Tarjeta: la pestaña de la tarjeta. */
export function IconoTarjeta({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 14.5h4" />
    </svg>
  )
}

export function IconoLupa({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  )
}

export function IconoCamara({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.25" />
    </svg>
  )
}

export function IconoCampana({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function IconoDescarga({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </svg>
  )
}

export function IconoFlecha({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}

export function IconoBolsa({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M5 8h14l-1 12H6L5 8ZM9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  )
}

export function IconoMensaje({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5v-8Z" />
    </svg>
  )
}

export function IconoChispa({ className }: Props) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5" />
    </svg>
  )
}
