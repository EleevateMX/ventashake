export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ─── Enums ───────────────────────────────────────────────────────────────────
export type CocinaSlug = 'alimentos' | 'bebidas'
export type EstadoOrden = 'pendiente' | 'en_preparacion' | 'lista' | 'entregada' | 'cancelada'
export type MetodoPago = 'mercado_pago' | 'efectivo' | 'tarjeta_credito' | 'tarjeta_debito' | 'qr' | 'wallet' | 'puntos'
export type CanalOrden = 'kiosko' | 'pos' | 'delivery'
export type RolUsuario = 'admin' | 'cocina' | 'cajero'
export type RolEmpleado = 'cajero' | 'cocina' | 'bebidas' | 'supervisor' | 'gerente' | 'administrador'
export type TipoMovimiento = 'venta' | 'ajuste_manual' | 'compra'
export type TipoAlmacen = 'central' | 'sucursal'
export type EstadoTransferencia = 'pendiente' | 'enviada' | 'recibida' | 'cancelada'
export type NivelCliente = 'bronce' | 'plata' | 'oro' | 'platino'
export type TipoMovimientoPuntos = 'ganados' | 'canjeados' | 'expirados' | 'ajuste'
export type TipoMovimientoWallet = 'recarga' | 'pago' | 'regalo' | 'devolucion'
export type SlugPlataforma = 'uber_eats' | 'didi_food' | 'rappi'
export type TipoPromocion = 'descuento_porcentaje' | 'descuento_monto' | 'combo' | 'segunda_unidad' | 'regalo'
export type TipoMerma = 'vencimiento' | 'accidente' | 'calidad' | 'otro'

// ─── Database ─────────────────────────────────────────────────────────────────
export interface Database {
  public: {
    Tables: {
      // ── Core ──
      cocinas: {
        Row: { id: string; nombre: string; slug: CocinaSlug }
        Insert: { id?: string; nombre: string; slug: CocinaSlug }
        Update: { id?: string; nombre?: string; slug?: CocinaSlug }
        Relationships: []
      }
      sucursales: {
        Row: { id: string; nombre: string; direccion: string | null; telefono: string | null; activa: boolean; created_at: string }
        Insert: { id?: string; nombre: string; direccion?: string | null; telefono?: string | null; activa?: boolean; created_at?: string }
        Update: { id?: string; nombre?: string; direccion?: string | null; telefono?: string | null; activa?: boolean }
        Relationships: []
      }
      // ── Menú ──
      categorias: {
        Row: { id: string; nombre: string; cocina_id: string; activa: boolean }
        Insert: { id?: string; nombre: string; cocina_id: string; activa?: boolean }
        Update: { id?: string; nombre?: string; cocina_id?: string; activa?: boolean }
        Relationships: []
      }
      productos: {
        Row: { id: string; nombre: string; descripcion: string | null; precio: number; imagen_url: string | null; categoria_id: string; activo: boolean }
        Insert: { id?: string; nombre: string; descripcion?: string | null; precio: number; imagen_url?: string | null; categoria_id: string; activo?: boolean }
        Update: { id?: string; nombre?: string; descripcion?: string | null; precio?: number; imagen_url?: string | null; categoria_id?: string; activo?: boolean }
        Relationships: []
      }
      productos_sucursal: {
        Row: { id: string; producto_id: string; sucursal_id: string; activo: boolean; precio_override: number | null }
        Insert: { id?: string; producto_id: string; sucursal_id: string; activo?: boolean; precio_override?: number | null }
        Update: { id?: string; producto_id?: string; sucursal_id?: string; activo?: boolean; precio_override?: number | null }
        Relationships: []
      }
      // ── Inventario ──
      insumos: {
        Row: { id: string; nombre: string; unidad: string; stock_actual: number; stock_minimo: number; costo_unitario: number }
        Insert: { id?: string; nombre: string; unidad: string; stock_actual?: number; stock_minimo?: number; costo_unitario?: number }
        Update: { id?: string; nombre?: string; unidad?: string; stock_actual?: number; stock_minimo?: number; costo_unitario?: number }
        Relationships: []
      }
      recetas: {
        Row: { id: string; producto_id: string; insumo_id: string; cantidad: number }
        Insert: { id?: string; producto_id: string; insumo_id: string; cantidad: number }
        Update: { id?: string; producto_id?: string; insumo_id?: string; cantidad?: number }
        Relationships: []
      }
      almacenes: {
        Row: { id: string; nombre: string; tipo: TipoAlmacen; sucursal_id: string | null; activo: boolean }
        Insert: { id?: string; nombre: string; tipo?: TipoAlmacen; sucursal_id?: string | null; activo?: boolean }
        Update: { id?: string; nombre?: string; tipo?: TipoAlmacen; sucursal_id?: string | null; activo?: boolean }
        Relationships: []
      }
      inventario_stock: {
        Row: { id: string; almacen_id: string; insumo_id: string; stock_actual: number; stock_minimo: number }
        Insert: { id?: string; almacen_id: string; insumo_id: string; stock_actual?: number; stock_minimo?: number }
        Update: { id?: string; almacen_id?: string; insumo_id?: string; stock_actual?: number; stock_minimo?: number }
        Relationships: []
      }
      lotes: {
        Row: { id: string; insumo_id: string; almacen_id: string; numero_lote: string | null; cantidad_inicial: number; cantidad_actual: number; costo_unitario: number | null; fecha_vencimiento: string | null; created_at: string }
        Insert: { id?: string; insumo_id: string; almacen_id: string; numero_lote?: string | null; cantidad_inicial: number; cantidad_actual: number; costo_unitario?: number | null; fecha_vencimiento?: string | null; created_at?: string }
        Update: { id?: string; insumo_id?: string; almacen_id?: string; numero_lote?: string | null; cantidad_inicial?: number; cantidad_actual?: number; costo_unitario?: number | null; fecha_vencimiento?: string | null }
        Relationships: []
      }
      mermas: {
        Row: { id: string; insumo_id: string; almacen_id: string; lote_id: string | null; cantidad: number; tipo: TipoMerma; notas: string | null; registrado_por: string | null; created_at: string }
        Insert: { id?: string; insumo_id: string; almacen_id: string; lote_id?: string | null; cantidad: number; tipo: TipoMerma; notas?: string | null; registrado_por?: string | null; created_at?: string }
        Update: { id?: string; insumo_id?: string; almacen_id?: string; lote_id?: string | null; cantidad?: number; tipo?: TipoMerma; notas?: string | null; registrado_por?: string | null }
        Relationships: []
      }
      transferencias: {
        Row: { id: string; origen_id: string; destino_id: string; estado: EstadoTransferencia; notas: string | null; creado_por: string | null; confirmado_por: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; origen_id: string; destino_id: string; estado?: EstadoTransferencia; notas?: string | null; creado_por?: string | null; confirmado_por?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; origen_id?: string; destino_id?: string; estado?: EstadoTransferencia; notas?: string | null; creado_por?: string | null; confirmado_por?: string | null; updated_at?: string }
        Relationships: []
      }
      transferencia_items: {
        Row: { id: string; transferencia_id: string; insumo_id: string; cantidad: number }
        Insert: { id?: string; transferencia_id: string; insumo_id: string; cantidad: number }
        Update: { id?: string; transferencia_id?: string; insumo_id?: string; cantidad?: number }
        Relationships: []
      }
      inventario_movimientos: {
        Row: { id: string; insumo_id: string; almacen_id: string | null; cantidad: number; tipo: TipoMovimiento; referencia_id: string | null; created_at: string }
        Insert: { id?: string; insumo_id: string; almacen_id?: string | null; cantidad: number; tipo: TipoMovimiento; referencia_id?: string | null; created_at?: string }
        Update: { id?: string; insumo_id?: string; almacen_id?: string | null; cantidad?: number; tipo?: TipoMovimiento; referencia_id?: string | null }
        Relationships: []
      }
      // ── Órdenes ──
      ordenes: {
        Row: { id: string; folio: number; estado: EstadoOrden; total: number; metodo_pago: MetodoPago | null; pagado: boolean; sucursal_id: string | null; cliente_id: string | null; empleado_id: string | null; canal: CanalOrden | null; propina: number; descuento: number; notas: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; folio?: number; estado?: EstadoOrden; total: number; metodo_pago?: MetodoPago | null; pagado?: boolean; sucursal_id?: string | null; cliente_id?: string | null; empleado_id?: string | null; canal?: CanalOrden | null; propina?: number; descuento?: number; notas?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; folio?: number; estado?: EstadoOrden; total?: number; metodo_pago?: MetodoPago | null; pagado?: boolean; sucursal_id?: string | null; cliente_id?: string | null; empleado_id?: string | null; canal?: CanalOrden | null; propina?: number; descuento?: number; notas?: string | null; updated_at?: string }
        Relationships: []
      }
      orden_items: {
        Row: { id: string; orden_id: string; producto_id: string; cantidad: number; precio_unitario: number; personalizacion: string | null; cocina_id: string }
        Insert: { id?: string; orden_id: string; producto_id: string; cantidad: number; precio_unitario: number; personalizacion?: string | null; cocina_id: string }
        Update: { id?: string; orden_id?: string; producto_id?: string; cantidad?: number; precio_unitario?: number; personalizacion?: string | null; cocina_id?: string }
        Relationships: []
      }
      orden_pagos: {
        Row: { id: string; orden_id: string; metodo: MetodoPago; monto: number; referencia: string | null; created_at: string }
        Insert: { id?: string; orden_id: string; metodo: MetodoPago; monto: number; referencia?: string | null; created_at?: string }
        Update: { id?: string; orden_id?: string; metodo?: MetodoPago; monto?: number; referencia?: string | null }
        Relationships: []
      }
      ventas: {
        Row: { id: string; orden_id: string; total: number; metodo_pago: MetodoPago; cfdi_solicitado: boolean; facturapi_id: string | null; created_at: string }
        Insert: { id?: string; orden_id: string; total: number; metodo_pago: MetodoPago; cfdi_solicitado?: boolean; facturapi_id?: string | null; created_at?: string }
        Update: { id?: string; orden_id?: string; total?: number; metodo_pago?: MetodoPago; cfdi_solicitado?: boolean; facturapi_id?: string | null }
        Relationships: []
      }
      // ── Delivery ──
      plataformas_delivery: {
        Row: { id: string; nombre: string; slug: SlugPlataforma; activa: boolean }
        Insert: { id?: string; nombre: string; slug: SlugPlataforma; activa?: boolean }
        Update: { id?: string; nombre?: string; slug?: SlugPlataforma; activa?: boolean }
        Relationships: []
      }
      ordenes_delivery: {
        Row: { id: string; orden_id: string | null; plataforma_id: string; sucursal_id: string; id_externo: string; estado_plataforma: string | null; datos_raw: Json | null; created_at: string }
        Insert: { id?: string; orden_id?: string | null; plataforma_id: string; sucursal_id: string; id_externo: string; estado_plataforma?: string | null; datos_raw?: Json | null; created_at?: string }
        Update: { id?: string; orden_id?: string | null; plataforma_id?: string; sucursal_id?: string; id_externo?: string; estado_plataforma?: string | null; datos_raw?: Json | null }
        Relationships: []
      }
      // ── Loyalty ──
      clientes: {
        Row: { id: string; nombre: string; email: string | null; telefono: string | null; nivel: NivelCliente; puntos: number; wallet_saldo: number; activo: boolean; created_at: string }
        Insert: { id?: string; nombre: string; email?: string | null; telefono?: string | null; nivel?: NivelCliente; puntos?: number; wallet_saldo?: number; activo?: boolean; created_at?: string }
        Update: { id?: string; nombre?: string; email?: string | null; telefono?: string | null; nivel?: NivelCliente; puntos?: number; wallet_saldo?: number; activo?: boolean }
        Relationships: []
      }
      puntos_movimientos: {
        Row: { id: string; cliente_id: string; puntos: number; tipo: TipoMovimientoPuntos; orden_id: string | null; descripcion: string | null; created_at: string }
        Insert: { id?: string; cliente_id: string; puntos: number; tipo: TipoMovimientoPuntos; orden_id?: string | null; descripcion?: string | null; created_at?: string }
        Update: { id?: string; cliente_id?: string; puntos?: number; tipo?: TipoMovimientoPuntos; orden_id?: string | null; descripcion?: string | null }
        Relationships: []
      }
      wallet_movimientos: {
        Row: { id: string; cliente_id: string; monto: number; tipo: TipoMovimientoWallet; orden_id: string | null; descripcion: string | null; created_at: string }
        Insert: { id?: string; cliente_id: string; monto: number; tipo: TipoMovimientoWallet; orden_id?: string | null; descripcion?: string | null; created_at?: string }
        Update: { id?: string; cliente_id?: string; monto?: number; tipo?: TipoMovimientoWallet; orden_id?: string | null; descripcion?: string | null }
        Relationships: []
      }
      gift_cards: {
        Row: { id: string; codigo: string; saldo: number; saldo_inicial: number; activa: boolean; cliente_id: string | null; vence_en: string | null; created_at: string }
        Insert: { id?: string; codigo: string; saldo: number; saldo_inicial: number; activa?: boolean; cliente_id?: string | null; vence_en?: string | null; created_at?: string }
        Update: { id?: string; codigo?: string; saldo?: number; saldo_inicial?: number; activa?: boolean; cliente_id?: string | null; vence_en?: string | null }
        Relationships: []
      }
      promociones: {
        Row: { id: string; nombre: string; descripcion: string | null; tipo: TipoPromocion; valor: number | null; codigo: string | null; activa: boolean; aplica_a: string | null; referencia_id: string | null; fecha_inicio: string | null; fecha_fin: string | null; horas_inicio: string | null; horas_fin: string | null; sucursal_id: string | null; condiciones: Json | null; created_at: string }
        Insert: { id?: string; nombre: string; descripcion?: string | null; tipo: TipoPromocion; valor?: number | null; codigo?: string | null; activa?: oolean; aplica_a?: string | null; referencia_id?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null; horas_inicio?: string | null; horas_fin?: string | null; sucursal_id?: string | null; condiciones?: Json | null; created_at?: string }
        Update: { id?: string; nombre?: string; descripcion?: string | null; tipo?: TipoPromocion; valor?: number | null; codigo?: string | null; activa?: boolean; aplica_a?: string | null; referencia_id?: string | null; fecha_inicio?: string | null; fecha_fin?: string | null; horas_inicio?: string | null; horas_fin?: string | null; sucursal_id?: string | null; condiciones?: Json | null }
        Relationships: []
      }
      // ── RRHH ──
      empleados: {
        Row: { id: string; usuario_id: string | null; nombre: string; email: string | null; telefono: string | null; sucursal_id: string | null; rol: RolEmpleado; pin: string | null; activo: boolean; created_at: string }
        Insert: { id?: string; usuario_id?: string | null; nombre: string; email?: string | null; telefono?: string | null; sucursal_id?: string | null; rol?: RolEmpleado; pin?: string | null; activo?: boolean; created_at?: string }
        Update: { id?: string; usuario_id?: string | null; nombre?: string; email?: string | null; telefono?: string | null; sucursal_id?: string | null; rol?: RolEmpleado; pin?: string | null; activo?: boolean }
        Relationships: []
      }
      turnos: {
        Row: { id: string; empleado_id: string; sucursal_id: string; inicio: string; fin: string | null; notas: string | null }
        Insert: { id?: string; empleado_id: string; sucursal_id: string; inicio?: string; fin?: string | null; notas?: string | null }
        Update: { id?: string; empleado_id?: string; sucursal_id?: string; inicio?: string; fin?: string | null; notas?: string | null }
        Relationships: []
      }
      asistencias: {
        Row: { id: string; empleado_id: string; sucursal_id: string; tipo: 'entrada' | 'salida'; created_at: string }
        Insert: { id?: string; empleado_id: string; sucursal_id: string; tipo: 'entrada' | 'salida'; created_at?: string }
        Update: { id?: string; empleado_id?: string; sucursal_id?: string; tipo?: 'entrada' | 'salida' }
        Relationships: []
      }
      cortes_caja: {
        Row: { id: string; sucursal_id: string; empleado_id: string; turno_id: string | null; fecha_inicio: string; fecha_fin: string; num_ordenes: number; total_efectivo: number; total_tarjeta: number; total_qr: number; total_wallet: number; total_general: number; notas: string | null; created_at: string }
        Insert: { id?: string; sucursal_id: string; empleado_id: string; turno_id?: string | null; fecha_inicio: string; fecha_fin: string; num_ordenes?: number; total_efectivo?: number; total_tarjeta?: number; total_qr?: number; total_wallet?: number; total_general?: number; notas?: string | null; created_at?: string }
        Update: { id?: string; sucursal_id?: string; empleado_id?: string; turno_id?: string | null; fecha_inicio?: string; fecha_fin?: string; num_ordenes?: number; total_efectivo?: number; total_tarjeta?: number; total_qr?: number; total_wallet?: number; total_general?: number; notas?: string | null }
        Relationships: []
      }
      // ── Usuarios ──
      usuarios: {
        Row: { id: string; nombre: string; email: string; rol: RolUsuario }
        Insert: { id?: string; nombre: string; email: string; rol?: RolUsuario }
        Update: { id?: string; nombre?: string; email?: string; rol?: RolUsuario }
        Relationships: []
      }
      // ── Auditoría ──
      bitacora: {
        Row: { id: string; usuario_id: string | null; accion: string; tabla: string | null; registro_id: string | null; datos_antes: Json | null; datos_nuevo: Json | null; ip: string | null; created_at: string }
        Insert: { id?: string; usuario_id?: string | null; accion: string; tabla?: string | null; registro_id?: string | null; datos_antes?: Json | null; datos_nuevo?: Json | null; ip?: string | null; created_at?: string }
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      canal_orden: CanalOrden
      estado_orden: EstadoOrden
      estado_transferencia: EstadoTransferencia
      metodo_pago: MetodoPago
      nivel_cliente: NivelCliente
      rol_empleado: RolEmpleado
      rol_usuario: RolUsuario
      slug_plataforma: SlugPlataforma
      tipo_almacen: TipoAlmacen
      tipo_merma: TipoMerma
      tipo_movimiento: TipoMovimiento
      tipo_movimiento_puntos: TipoMovimientoPuntos
      tipo_movimiento_wallet: TipoMovimientoWallet
      tipo_promocion: TipoPromocion
    }
  }
}
