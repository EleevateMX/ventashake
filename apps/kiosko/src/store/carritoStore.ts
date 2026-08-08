import { create } from 'zustand'
import {
  displayItemAdded,
  displayItemRemoved,
  displayCartCleared,
} from '../sync'

export interface ItemCarrito {
  producto_id: string
  nombre: string
  precio: number
  cantidad: number
  cocina_id: string
  imagen_url: string | null
  personalizacion?: string
}

export interface UsuarioKiosko {
  /**
   * Solo existe cuando el cliente entró con Google desde el propio kiosko.
   * Cuando lo identifica el cajero (por QR o teléfono) no hay sesión de Auth
   * de por medio, y aun así la compra le suma mancuernas: lo que necesita la
   * orden es `clienteId`, no la sesión.
   */
  authId?: string | null
  nombre: string
  email?: string | null
  clienteId: string | null
  /** Saldo en el momento de identificarlo, para mostrarlo sin volver a leer. */
  mancuernas?: number
}

/** Empleado con el turno abierto en esta pantalla (solo en modo cajero). */
export interface CajeroTurno {
  id: string
  nombre: string
  rol: string
}

interface CarritoStore {
  items: ItemCarrito[]
  usuario: UsuarioKiosko | null
  /**
   * Se mantiene entre pedidos a propósito: el cajero abre turno una vez y
   * levanta pedidos toda su jornada. `limpiar()` vacía el carrito y al
   * cliente, pero NO cierra el turno.
   */
  cajero: CajeroTurno | null
  agregar: (item: Omit<ItemCarrito, 'cantidad'>) => void
  quitar: (producto_id: string) => void
  incrementar: (producto_id: string) => void
  decrementar: (producto_id: string) => void
  limpiar: () => void
  setUsuario: (u: UsuarioKiosko | null) => void
  setCajero: (c: CajeroTurno | null) => void
  total: () => number
  totalItems: () => number
}

export const useCarrito = create<CarritoStore>((set, get) => ({
  items: [],
  usuario: null,
  cajero: null,

  agregar: (item) => {
    let nuevaCantidad = 1
    set((state) => {
      const existe = state.items.find((i) => i.producto_id === item.producto_id)
      nuevaCantidad = existe ? existe.cantidad + 1 : 1
      return {
        items: existe
          ? state.items.map((i) =>
              i.producto_id === item.producto_id ? { ...i, cantidad: i.cantidad + 1 } : i,
            )
          : [...state.items, { ...item, cantidad: 1 }],
      }
    })
    const { total, totalItems } = get()
    displayItemAdded(
      { id: item.producto_id, nombre: item.nombre, cantidad: nuevaCantidad, precio: item.precio },
      total(),
      totalItems(),
    )
  },

  quitar: (producto_id) => {
    set((state) => ({ items: state.items.filter((i) => i.producto_id !== producto_id) }))
    const { total, totalItems } = get()
    if (totalItems() === 0) {
      displayCartCleared()
    } else {
      displayItemRemoved(producto_id, total(), totalItems())
    }
  },

  incrementar: (producto_id) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.producto_id === producto_id ? { ...i, cantidad: i.cantidad + 1 } : i,
      ),
    }))
    const { items, total, totalItems } = get()
    const item = items.find((i) => i.producto_id === producto_id)
    if (item) {
      displayItemAdded(
        { id: item.producto_id, nombre: item.nombre, cantidad: item.cantidad, precio: item.precio },
        total(),
        totalItems(),
      )
    }
  },

  decrementar: (producto_id) => {
    set((state) => ({
      items: state.items
        .map((i) => (i.producto_id === producto_id ? { ...i, cantidad: i.cantidad - 1 } : i))
        .filter((i) => i.cantidad > 0),
    }))
    const { items, total, totalItems } = get()
    const item = items.find((i) => i.producto_id === producto_id)
    if (!item) {
      if (totalItems() === 0) {
        displayCartCleared()
      } else {
        displayItemRemoved(producto_id, total(), totalItems())
      }
    } else {
      displayItemAdded(
        { id: item.producto_id, nombre: item.nombre, cantidad: item.cantidad, precio: item.precio },
        total(),
        totalItems(),
      )
    }
  },

  limpiar: () => {
    set({ items: [], usuario: null })
    displayCartCleared()
  },

  setUsuario: (usuario) => set({ usuario }),

  setCajero: (cajero) => set({ cajero }),

  total: () => get().items.reduce((sum, i) => sum + i.precio * i.cantidad, 0),

  totalItems: () => get().items.reduce((sum, i) => sum + i.cantidad, 0),
}))
