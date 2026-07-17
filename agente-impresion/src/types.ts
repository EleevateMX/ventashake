export interface PrinterConfig {
  /** Identificador local (solo para logs, no viaja a la base). */
  id: string
  descripcion?: string
  /** agente_token de la fila en `impresoras` (Admin → Impresoras). */
  token: string
  /**
   * node-thermal-printer interface string:
   *  - Red:  "tcp://IP:PUERTO"        (la mayoría de impresoras 80mm/58mm)
   *  - USB (Linux):   "/dev/usb/lp0"
   *  - USB (Windows): "printer:NombreCompartidoDeLaImpresora"
   */
  interface: string
  anchoPapel: '58mm' | '80mm'
  copias: number
  corteAutomatico: boolean
  buzzer: boolean
}

export type EstadoTrabajoImpresion =
  | 'pending'
  | 'claimed'
  | 'printing'
  | 'printed'
  | 'retry'
  | 'failed'
  | 'cancelled'

export interface ItemComanda {
  cantidad: number
  nombre: string
  personalizacion?: string | null
}

export interface PayloadComanda {
  folio?: number
  canal?: string
  estacion?: string
  creado_en?: string
  cajero?: string | null
  cliente?: string | null
  items?: ItemComanda[]
  prueba?: boolean
  impresora?: string
  hora?: string
}

export interface TrabajoImpresion {
  id: string
  orden_id: string | null
  pedido_id: string | null
  estacion_id: string | null
  printer_id: string | null
  tipo_documento: 'comanda' | 'ticket'
  payload: PayloadComanda
  estado: EstadoTrabajoImpresion
  intentos: number
  max_intentos: number
  numero_copia: number
  created_at: string
}
