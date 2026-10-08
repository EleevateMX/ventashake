/**
 * La comanda que arma el KIOSKO cuando no hay internet (08/10/26).
 *
 * Con internet la arma la base (`fn_crear_pedidos_cocina` → la cola de
 * impresión) y el agente solo la imprime. Sin internet el kiosko se la pasa
 * directo al agente por la red de la tienda, así que tiene que repartirla él
 * con las MISMAS reglas, o barra y cocina reciben cosas distintas según
 * haya o no internet:
 *
 *   - Cada producto va a la estación de su categoría.
 *   - Un extra sigue a su PRODUCTO, salvo que el vínculo diga otra cosa
 *     (Admin → Extras → «se prepara en»): el café del combo va a barra.
 *   - Lo que se va a otra estación viaja como renglón propio marcado
 *     «COMBO», igual que en la etiqueta de siempre.
 *   - Lo que su categoría no manda a pantalla (las bebidas de anaquel) no
 *     gasta etiqueta.
 *
 * Sin precios, como toda comanda.
 */

export interface ItemParaComanda {
  linea: string
  padreLinea?: string | null
  nombre: string
  cantidad: number
  personalizacion?: string | null
  /** Slug de la estación de su categoría: 'bebidas' | 'alimentos'. */
  estacion: string
  /** `false` si su categoría no va a pantalla. Ausente = sí va. */
  vaAPantalla?: boolean | null
  /** Solo extras: la estación que fija el vínculo con su producto. */
  estacionVinculo?: string | null
}

export interface ComandaDeEstacion {
  /** Slug: lo que decide la impresora. */
  slug: string
  payload: {
    ticket: string
    estacion: string
    canal: 'pos'
    creado_en: string
    cajero: string | null
    cliente: string | null
    para_llevar: boolean | null
    items: Array<{
      cantidad: number
      nombre: string
      personalizacion: string | null
      extras: Array<{ nombre: string; cantidad: number }>
    }>
  }
}

const NOMBRE_ESTACION: Record<string, string> = { bebidas: 'Bebidas', alimentos: 'Alimentos' }

export function comandasSinInternet(
  items: ItemParaComanda[],
  datos: {
    ticket: string
    creadoEn: string
    cajero?: string | null
    cliente?: string | null
    paraLlevar?: boolean | null
    nombresEstacion?: Record<string, string>
  },
): ComandaDeEstacion[] {
  const porLinea = new Map(items.map((i) => [i.linea, i]))
  const padreDe = (i: ItemParaComanda) => (i.padreLinea ? porLinea.get(i.padreLinea) ?? null : null)
  const estacionDe = (i: ItemParaComanda): string => {
    const padre = padreDe(i)
    if (!padre) return i.estacion
    return i.estacionVinculo || padre.estacion
  }
  const vaAPantalla = (i: ItemParaComanda) => i.vaAPantalla !== false

  const nombres = { ...NOMBRE_ESTACION, ...(datos.nombresEstacion ?? {}) }
  const orden: string[] = []
  const porEstacion = new Map<string, ComandaDeEstacion['payload']['items']>()
  const renglones = (slug: string) => {
    let r = porEstacion.get(slug)
    if (!r) {
      r = []
      porEstacion.set(slug, r)
      orden.push(slug)
    }
    return r
  }

  for (const base of items) {
    if (padreDe(base) || !vaAPantalla(base)) continue
    const slug = estacionDe(base)
    const extras = items
      .filter((x) => x.padreLinea === base.linea && vaAPantalla(x) && estacionDe(x) === slug)
      .map((x) => ({ nombre: x.nombre, cantidad: x.cantidad }))
    renglones(slug).push({
      cantidad: base.cantidad,
      nombre: base.nombre,
      personalizacion: base.personalizacion?.trim() || null,
      extras,
    })
  }

  // La parte que se prepara en OTRA estación: renglón propio, marcado.
  for (const x of items) {
    const padre = padreDe(x)
    if (!padre || !vaAPantalla(x)) continue
    const slug = estacionDe(x)
    if (slug === estacionDe(padre)) continue
    const nota = ['COMBO', x.personalizacion?.trim()].filter(Boolean).join(' · ')
    renglones(slug).push({ cantidad: x.cantidad, nombre: x.nombre, personalizacion: nota, extras: [] })
  }

  return orden.map((slug) => ({
    slug,
    payload: {
      ticket: datos.ticket,
      estacion: nombres[slug] ?? slug,
      canal: 'pos',
      creado_en: datos.creadoEn,
      cajero: datos.cajero ?? null,
      cliente: datos.cliente?.trim() || null,
      para_llevar: datos.paraLlevar ?? null,
      items: porEstacion.get(slug) ?? [],
    },
  }))
}

/**
 * Folio provisional de una venta sin internet: «S-01», «S-02»… reinicia
 * cada día de Mérida. Es lo que se le dice al cliente y lo que sale en la
 * etiqueta; el folio de verdad lo pone la base cuando la venta se registra.
 */
export function folioSinInternet(n: number): string {
  return `S-${String(Math.max(1, Math.floor(n))).padStart(2, '0')}`
}
