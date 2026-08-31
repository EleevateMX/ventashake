import { create } from 'zustand'
import { descuentoPromo as calcDescuentoPromo } from '@shake/supabase'
import type { ProductoVenta, ClienteConLealtad } from '@shake/supabase'
import type { Empleado } from '@shake/supabase'
import type { Almacen, Caja, CajaCorte, Cupon, Promocion } from '@shake/types'
import {
  leerEspera, guardarEspera, etiquetaDeVenta, type VentaEnEspera,
} from './espera'

/**
 * Línea del ticket: producto real del catálogo + cantidad.
 * `lineaId` da identidad propia a la línea porque el mismo producto puede
 * ir dos veces en la orden con personalización distinta (un wrap "sin
 * lechuga" y otro normal son líneas separadas, no una de cantidad 2).
 */
export interface LineaCarrito {
  lineaId: string
  producto: ProductoVenta
  cantidad: number
  personalizacion: string | null
}

function nuevaLineaId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `l-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Descuento manual (autorización de caja) — se suma al `descuento` de la orden. */
export interface DescuentoManual {
  tipo: 'porcentaje' | 'monto'
  valor: number
}

interface PosStore {
  // --- Sesión del cajero ---
  empleado: Empleado | null
  iniciarSesion: (empleado: Empleado) => void
  cerrarSesion: () => void

  // --- Contexto de caja (bootstrap real: almacén kiosko + caja + corte) ---
  almacen: Almacen | null
  caja: Caja | null
  corte: CajaCorte | null
  setContexto: (ctx: { almacen: Almacen; caja: Caja; corte: CajaCorte | null }) => void
  setCorte: (corte: CajaCorte | null) => void

  // --- Orden activa ---
  items: LineaCarrito[]
  cliente: ClienteConLealtad | null
  cupon: Cupon | null
  promo: Promocion | null
  promosDisp: Promocion[]
  descuentoManual: DescuentoManual | null

  agregarItem: (p: ProductoVenta, personalizacion?: string | null) => void
  /** Corregir un renglón sin borrarlo y volverlo a capturar. */
  editarItem: (lineaId: string, cambios: { cantidad?: number; personalizacion?: string | null }) => void
  incrementar: (lineaId: string) => void
  decrementar: (lineaId: string) => void
  quitarItem: (lineaId: string) => void
  setCliente: (cliente: ClienteConLealtad | null) => void
  setCupon: (cupon: Cupon | null) => void
  setPromo: (promo: Promocion | null) => void
  setPromosDisp: (promos: Promocion[]) => void
  setDescuentoManual: (d: DescuentoManual | null) => void
  limpiarOrden: () => void

  // --- Ventas apartadas (esta caja, este navegador) ---
  enEspera: VentaEnEspera[]
  apartarVenta: () => void
  retomarVenta: (id: string, catalogo?: ProductoVenta[]) => void
  descartarVenta: (id: string) => void

  // --- Cálculos (reglas de negocio reales) ---
  subtotal: () => number
  itemsElegiblesCupon: (cup: Cupon) => LineaCarrito[]
  descuentoCupon: () => number
  descuentoPromoMonto: () => number
  descuentoManualMonto: () => number
  descuentoTotal: () => number
  neto: () => number
  totalItems: () => number
}

export const usePosStore = create<PosStore>((set, get) => ({
  empleado: null,

  iniciarSesion: (empleado) => set({ empleado }),

  cerrarSesion: () =>
    set({
      empleado: null,
      almacen: null,
      caja: null,
      corte: null,
      items: [],
      cliente: null,
      cupon: null,
      promo: null,
      promosDisp: [],
      descuentoManual: null,
    }),

  almacen: null,
  caja: null,
  corte: null,

  setContexto: ({ almacen, caja, corte }) => set({ almacen, caja, corte }),
  setCorte: (corte) => set({ corte }),

  items: [],
  cliente: null,
  cupon: null,
  promo: null,
  promosDisp: [],
  descuentoManual: null,

  agregarItem: (p, personalizacion = null) =>
    set((state) => {
      const nota = personalizacion?.trim() || null
      // Solo se agrupa con una línea existente del mismo producto si ambas
      // van sin personalización; con nota distinta va como línea aparte.
      const i = state.items.findIndex(
        (l) => l.producto.id === p.id && !l.personalizacion && !nota,
      )
      if (i >= 0) {
        const items = [...state.items]
        items[i] = { ...items[i], cantidad: items[i].cantidad + 1 }
        return { items }
      }
      return {
        items: [
          ...state.items,
          { lineaId: nuevaLineaId(), producto: p, cantidad: 1, personalizacion: nota },
        ],
      }
    }),

  /**
   * Corregir un renglón: la cantidad, o con qué se prepara.
   *
   * Antes había que borrarlo y volverlo a capturar — con extras y todo — solo
   * porque el cliente dijo "ay, mejor deslactosada". Una cantidad de cero
   * borra la línea, igual que bajarle con el menos.
   */
  editarItem: (lineaId, cambios) =>
    set((state) => ({
      items: state.items
        .map((l) => {
          if (l.lineaId !== lineaId) return l
          return {
            ...l,
            cantidad: cambios.cantidad ?? l.cantidad,
            personalizacion:
              cambios.personalizacion === undefined
                ? l.personalizacion
                : cambios.personalizacion?.trim() || null,
          }
        })
        .filter((l) => l.cantidad > 0),
    })),

  incrementar: (lineaId) =>
    set((state) => ({
      items: state.items.map((l) =>
        l.lineaId === lineaId ? { ...l, cantidad: l.cantidad + 1 } : l,
      ),
    })),

  decrementar: (lineaId) =>
    set((state) => ({
      items: state.items
        .map((l) => (l.lineaId === lineaId ? { ...l, cantidad: l.cantidad - 1 } : l))
        .filter((l) => l.cantidad > 0),
    })),

  quitarItem: (lineaId) =>
    set((state) => ({ items: state.items.filter((l) => l.lineaId !== lineaId) })),

  setCliente: (cliente) => set({ cliente }),
  setCupon: (cupon) => set({ cupon }),
  setPromo: (promo) => set({ promo }),
  setPromosDisp: (promosDisp) => set({ promosDisp }),
  setDescuentoManual: (descuentoManual) => set({ descuentoManual }),

  limpiarOrden: () =>
    set({
      items: [],
      cliente: null,
      cupon: null,
      promo: null,
      promosDisp: [],
      descuentoManual: null,
    }),

  enEspera: leerEspera(),

  /**
   * Aparta la venta actual y deja la caja lista para el siguiente cliente.
   * No cobra, no crea orden: solo guarda el carrito.
   */
  apartarVenta: () =>
    set((state) => {
      if (state.items.length === 0) return {}
      const venta: VentaEnEspera = {
        id: nuevaLineaId(),
        guardadaEn: new Date().toISOString(),
        etiqueta: etiquetaDeVenta(state.items, state.cliente),
        items: state.items,
        cliente: state.cliente,
        cupon: state.cupon,
        promo: state.promo,
        promosDisp: state.promosDisp,
        descuentoManual: state.descuentoManual,
      }
      const enEspera = [...state.enEspera, venta]
      guardarEspera(enEspera)
      return {
        enEspera,
        items: [], cliente: null, cupon: null, promo: null,
        promosDisp: [], descuentoManual: null,
      }
    }),

  /**
   * Retoma una venta apartada. Si se le pasa el catálogo vivo, los precios
   * se refrescan: el servidor cobra el precio de HOY, así que mostrar el de
   * hace rato haría que el total en pantalla y el cobrado no coincidieran.
   * Un producto que ya no existe se cae del carrito — cobrarlo tampoco se
   * podría.
   */
  retomarVenta: (id, catalogo) =>
    set((state) => {
      const venta = state.enEspera.find((v) => v.id === id)
      if (!venta) return {}
      const items = catalogo
        ? venta.items
            .map((l) => {
              const vivo = catalogo.find((p) => p.id === l.producto.id)
              return vivo ? { ...l, producto: vivo } : null
            })
            .filter((l): l is typeof venta.items[number] => l !== null)
        : venta.items
      const enEspera = state.enEspera.filter((v) => v.id !== id)
      guardarEspera(enEspera)
      return {
        enEspera,
        items,
        cliente: venta.cliente,
        cupon: venta.cupon,
        promo: venta.promo,
        promosDisp: venta.promosDisp,
        descuentoManual: venta.descuentoManual,
      }
    }),

  descartarVenta: (id) =>
    set((state) => {
      const enEspera = state.enEspera.filter((v) => v.id !== id)
      guardarEspera(enEspera)
      return { enEspera }
    }),

  subtotal: () => get().items.reduce((s, l) => s + l.producto.precio * l.cantidad, 0),

  // Ítems elegibles para un cupón: cumpleaños solo shakes; otros cualquiera.
  itemsElegiblesCupon: (cup) => {
    const items = get().items
    if (cup.tipo === 'cumpleanos') {
      return items.filter((l) => l.producto.categorias?.nombre === 'Shakes')
    }
    return items
  },

  // El cupón cubre (gratis) el ítem elegible más caro, 1 unidad.
  descuentoCupon: () => {
    const { cupon } = get()
    if (!cupon) return 0
    const eleg = get().itemsElegiblesCupon(cupon)
    if (eleg.length === 0) return 0
    return Math.max(...eleg.map((l) => l.producto.precio))
  },

  descuentoPromoMonto: () => {
    const { promo, items } = get()
    if (!promo) return 0
    // items expandidos por unidad (precio + categoría) para calcular la promo.
    const planos = items.flatMap((l) =>
      Array.from({ length: l.cantidad }, () => ({
        precio: l.producto.precio,
        categoria: l.producto.categorias?.nombre ?? null,
      })),
    )
    return calcDescuentoPromo(promo, planos)
  },

  descuentoManualMonto: () => {
    const { descuentoManual } = get()
    if (!descuentoManual) return 0
    const sub = get().subtotal()
    if (descuentoManual.tipo === 'porcentaje') {
      return Math.min(sub, sub * (descuentoManual.valor / 100))
    }
    return Math.min(descuentoManual.valor, sub)
  },

  // Descuento combinado: cupón + promo + descuento manual de caja.
  descuentoTotal: () =>
    get().descuentoCupon() + get().descuentoPromoMonto() + get().descuentoManualMonto(),

  neto: () => Math.max(0, get().subtotal() - get().descuentoTotal()),

  totalItems: () => get().items.reduce((s, l) => s + l.cantidad, 0),
}))
