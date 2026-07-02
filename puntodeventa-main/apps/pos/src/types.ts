export interface Empleado {
  id: string
  nombre: string
  rol: string
  pin: string
  sucursal_id: string | null
}

export interface Producto {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  imagen_url: string | null
  categoria_id: string
  activo: boolean
  categorias: {
    id: string
    nombre: string
    cocinas: { id: string; nombre: string; slug: string } | null
  } | null
}

export interface Categoria {
  id: string
  nombre: string
  cocina_id: string
  cocinas: { id: string; nombre: string; slug: string } | null
}

export interface ItemOrdenPOS {
  producto_id: string
  nombre: string
  precio: number
  cantidad: number
  cocina_id: string
  imagen_url: string | null
  personalizacion?: string
}

export interface ClientePOS {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  puntos: number
  wallet_saldo: number
  nivel: string
}

export type MetodoPago = 'efectivo' | 'tarjeta_credito' | 'tarjeta_debito' | 'qr' | 'wallet'

export interface PagoItem {
  metodo: MetodoPago
  monto: number
}
