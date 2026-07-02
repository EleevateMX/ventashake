// =====================================================================
// GENERADO desde el proyecto Supabase "Shakeaholic" (zyjtnaystsporbuzcmqk)
// Regenerar tras cada migración:
//   npx supabase gen types typescript --project-id zyjtnaystsporbuzcmqk --schema public
// No editar a mano.
// =====================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      almacenes: {
        Row: {
          activo: boolean
          id: string
          nombre: string
          sucursal_id: string
          tipo: Database["public"]["Enums"]["tipo_almacen"]
        }
        Insert: {
          activo?: boolean
          id?: string
          nombre: string
          sucursal_id: string
          tipo: Database["public"]["Enums"]["tipo_almacen"]
        }
        Update: {
          activo?: boolean
          id?: string
          nombre?: string
          sucursal_id?: string
          tipo?: Database["public"]["Enums"]["tipo_almacen"]
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      app_data: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string
          hash: string
          username: string
        }
        Insert: {
          created_at?: string
          hash: string
          username: string
        }
        Update: {
          created_at?: string
          hash?: string
          username?: string
        }
        Relationships: []
      }
      caja_cortes: {
        Row: {
          abierto_en: string
          caja_id: string
          cerrado_en: string | null
          efectivo_contado: number | null
          empleado_apertura_id: string | null
          empleado_cierre_id: string | null
          estado: Database["public"]["Enums"]["estado_corte"]
          fondo_inicial: number
          id: string
          notas: string | null
        }
        Insert: {
          abierto_en?: string
          caja_id: string
          cerrado_en?: string | null
          efectivo_contado?: number | null
          empleado_apertura_id?: string | null
          empleado_cierre_id?: string | null
          estado?: Database["public"]["Enums"]["estado_corte"]
          fondo_inicial?: number
          id?: string
          notas?: string | null
        }
        Update: {
          abierto_en?: string
          caja_id?: string
          cerrado_en?: string | null
          efectivo_contado?: number | null
          empleado_apertura_id?: string | null
          empleado_cierre_id?: string | null
          estado?: Database["public"]["Enums"]["estado_corte"]
          fondo_inicial?: number
          id?: string
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_cortes_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_cortes_empleado_apertura_id_fkey"
            columns: ["empleado_apertura_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_cortes_empleado_cierre_id_fkey"
            columns: ["empleado_cierre_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          activa: boolean
          id: string
          nombre: string
          sucursal_id: string
        }
        Insert: {
          activa?: boolean
          id?: string
          nombre: string
          sucursal_id: string
        }
        Update: {
          activa?: boolean
          id?: string
          nombre?: string
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activa: boolean
          cocina_id: string
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          cocina_id: string
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          cocina_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_cocina_id_fkey"
            columns: ["cocina_id"]
            isOneToOne: false
            referencedRelation: "cocinas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          codigo: string | null
          created_at: string
          email: string | null
          fecha_nacimiento: string | null
          id: string
          mancuernas: number
          nombre: string
          notas: string | null
          sabor_favorito: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          codigo?: string | null
          created_at?: string
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          mancuernas?: number
          nombre: string
          notas?: string | null
          sabor_favorito?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          codigo?: string | null
          created_at?: string
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          mancuernas?: number
          nombre?: string
          notas?: string | null
          sabor_favorito?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      cupones: {
        Row: {
          beneficio: string
          cliente_id: string
          codigo: string
          estado: Database["public"]["Enums"]["estado_cupon"]
          generado_en: string
          id: string
          orden_id_uso: string | null
          tipo: Database["public"]["Enums"]["tipo_cupon"]
          usado_en: string | null
          vence_en: string
        }
        Insert: {
          beneficio?: string
          cliente_id: string
          codigo?: string
          estado?: Database["public"]["Enums"]["estado_cupon"]
          generado_en?: string
          id?: string
          orden_id_uso?: string | null
          tipo?: Database["public"]["Enums"]["tipo_cupon"]
          usado_en?: string | null
          vence_en: string
        }
        Update: {
          beneficio?: string
          cliente_id?: string
          codigo?: string
          estado?: Database["public"]["Enums"]["estado_cupon"]
          generado_en?: string
          id?: string
          orden_id_uso?: string | null
          tipo?: Database["public"]["Enums"]["tipo_cupon"]
          usado_en?: string | null
          vence_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "cupones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      mancuernas_movimientos: {
        Row: {
          cliente_id: string
          created_at: string
          descripcion: string | null
          id: string
          orden_id: string | null
          puntos: number
          tipo: Database["public"]["Enums"]["tipo_mancuerna"]
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descripcion?: string | null
          id?: string
          orden_id?: string | null
          puntos: number
          tipo: Database["public"]["Enums"]["tipo_mancuerna"]
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          orden_id?: string | null
          puntos?: number
          tipo?: Database["public"]["Enums"]["tipo_mancuerna"]
        }
        Relationships: [
          {
            foreignKeyName: "mancuernas_movimientos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones: {
        Row: {
          activa: boolean
          categoria_gratis: string | null
          created_at: string
          descripcion: string | null
          dias_semana: number[] | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          min_compras_30d: number | null
          nombre: string
          sabor_favorito: string | null
          tipo: Database["public"]["Enums"]["tipo_promocion"]
          valor: number
          vence_en: string | null
        }
        Insert: {
          activa?: boolean
          categoria_gratis?: string | null
          created_at?: string
          descripcion?: string | null
          dias_semana?: number[] | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          min_compras_30d?: number | null
          nombre: string
          sabor_favorito?: string | null
          tipo: Database["public"]["Enums"]["tipo_promocion"]
          valor?: number
          vence_en?: string | null
        }
        Update: {
          activa?: boolean
          categoria_gratis?: string | null
          created_at?: string
          descripcion?: string | null
          dias_semana?: number[] | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          min_compras_30d?: number | null
          nombre?: string
          sabor_favorito?: string | null
          tipo?: Database["public"]["Enums"]["tipo_promocion"]
          valor?: number
          vence_en?: string | null
        }
        Relationships: []
      }
      promocion_aplicaciones: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          orden_id: string | null
          promocion_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          orden_id?: string | null
          promocion_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          orden_id?: string | null
          promocion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promocion_aplicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocion_aplicaciones_promocion_id_fkey"
            columns: ["promocion_id"]
            isOneToOne: false
            referencedRelation: "promociones"
            referencedColumns: ["id"]
          },
        ]
      }
      cocina_items: {
        Row: {
          cantidad: number
          estado: Database["public"]["Enums"]["estado_cocina"]
          id: string
          orden_item_id: string
          pedido_id: string
          personalizacion: string | null
          producto_id: string | null
        }
        Insert: {
          cantidad?: number
          estado?: Database["public"]["Enums"]["estado_cocina"]
          id?: string
          orden_item_id: string
          pedido_id: string
          personalizacion?: string | null
          producto_id?: string | null
        }
        Update: {
          cantidad?: number
          estado?: Database["public"]["Enums"]["estado_cocina"]
          id?: string
          orden_item_id?: string
          pedido_id?: string
          personalizacion?: string | null
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cocina_items_orden_item_id_fkey"
            columns: ["orden_item_id"]
            isOneToOne: true
            referencedRelation: "orden_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocina_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_cocina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocina_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocina_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
        ]
      }
      cocinas: {
        Row: {
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      empleados: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          created_at: string
          id: string
          nombre: string
          pin_hash: string | null
          rol_id: string
          sucursal_id: string | null
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          nombre: string
          pin_hash?: string | null
          rol_id: string
          sucursal_id?: string | null
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
          pin_hash?: string | null
          rol_id?: string
          sucursal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleados_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      insumo_categorias: {
        Row: {
          activa: boolean
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      insumos: {
        Row: {
          activo: boolean
          categoria_id: string | null
          codigo: string | null
          contenido: number
          costo_compra: number
          costo_unitario: number | null
          created_at: string
          fecha_caducidad: string | null
          ganancia_pct: number | null
          id: string
          marca: string | null
          nombre: string
          porciones: Json
          precio_individual: number | null
          presentacion: string | null
          proveedor: string | null
          stock_base: number | null
          tipo: Database["public"]["Enums"]["tipo_insumo"]
          ultima_compra: string | null
          unidad: string
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string | null
          contenido?: number
          costo_compra?: number
          costo_unitario?: number | null
          created_at?: string
          fecha_caducidad?: string | null
          ganancia_pct?: number | null
          id?: string
          marca?: string | null
          nombre: string
          porciones?: Json
          precio_individual?: number | null
          presentacion?: string | null
          proveedor?: string | null
          stock_base?: number | null
          tipo: Database["public"]["Enums"]["tipo_insumo"]
          ultima_compra?: string | null
          unidad?: string
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string | null
          contenido?: number
          costo_compra?: number
          costo_unitario?: number | null
          created_at?: string
          fecha_caducidad?: string | null
          ganancia_pct?: number | null
          id?: string
          marca?: string | null
          nombre?: string
          porciones?: Json
          precio_individual?: number | null
          presentacion?: string | null
          proveedor?: string | null
          stock_base?: number | null
          tipo?: Database["public"]["Enums"]["tipo_insumo"]
          ultima_compra?: string | null
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "insumo_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_movimientos: {
        Row: {
          almacen_id: string | null
          cantidad: number
          costo_unitario: number | null
          created_at: string
          id: string
          insumo_id: string
          nota: string | null
          referencia_id: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
        }
        Insert: {
          almacen_id?: string | null
          cantidad: number
          costo_unitario?: number | null
          created_at?: string
          id?: string
          insumo_id: string
          nota?: string | null
          referencia_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
        }
        Update: {
          almacen_id?: string | null
          cantidad?: number
          costo_unitario?: number | null
          created_at?: string
          id?: string
          insumo_id?: string
          nota?: string | null
          referencia_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
        }
        Relationships: [
          {
            foreignKeyName: "inventario_movimientos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_movimientos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_stock: {
        Row: {
          almacen_id: string
          id: string
          insumo_id: string
          stock_actual: number
          stock_minimo: number
        }
        Insert: {
          almacen_id: string
          id?: string
          insumo_id: string
          stock_actual?: number
          stock_minimo?: number
        }
        Update: {
          almacen_id?: string
          id?: string
          insumo_id?: string
          stock_actual?: number
          stock_minimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventario_stock_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          almacen_id: string
          cantidad_actual: number
          cantidad_inicial: number
          costo_unitario: number | null
          created_at: string
          fecha_caducidad: string | null
          id: string
          insumo_id: string
          numero_lote: string | null
        }
        Insert: {
          almacen_id: string
          cantidad_actual: number
          cantidad_inicial: number
          costo_unitario?: number | null
          created_at?: string
          fecha_caducidad?: string | null
          id?: string
          insumo_id: string
          numero_lote?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad_actual?: number
          cantidad_inicial?: number
          costo_unitario?: number | null
          created_at?: string
          fecha_caducidad?: string | null
          id?: string
          insumo_id?: string
          numero_lote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      mermas: {
        Row: {
          almacen_id: string
          cantidad: number
          created_at: string
          id: string
          insumo_id: string
          motivo: string | null
        }
        Insert: {
          almacen_id: string
          cantidad: number
          created_at?: string
          id?: string
          insumo_id: string
          motivo?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          created_at?: string
          id?: string
          insumo_id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mermas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mermas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_items: {
        Row: {
          cantidad: number
          cocina_slug: string | null
          id: string
          orden_id: string
          personalizacion: string | null
          precio_unitario: number
          producto_id: string
        }
        Insert: {
          cantidad: number
          cocina_slug?: string | null
          id?: string
          orden_id: string
          personalizacion?: string | null
          precio_unitario: number
          producto_id: string
        }
        Update: {
          cantidad?: number
          cocina_slug?: string | null
          id?: string
          orden_id?: string
          personalizacion?: string | null
          precio_unitario?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orden_items_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes: {
        Row: {
          almacen_id: string | null
          canal: Database["public"]["Enums"]["canal_orden"]
          cliente_id: string | null
          clip_recibo: string | null
          corte_id: string | null
          created_at: string
          descuento: number
          empleado_id: string | null
          estado: Database["public"]["Enums"]["estado_orden"]
          folio: number
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
          pagado: boolean
          sucursal_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          almacen_id?: string | null
          canal?: Database["public"]["Enums"]["canal_orden"]
          cliente_id?: string | null
          clip_recibo?: string | null
          corte_id?: string | null
          created_at?: string
          descuento?: number
          empleado_id?: string | null
          estado?: Database["public"]["Enums"]["estado_orden"]
          folio?: number
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          pagado?: boolean
          sucursal_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          almacen_id?: string | null
          canal?: Database["public"]["Enums"]["canal_orden"]
          cliente_id?: string | null
          clip_recibo?: string | null
          corte_id?: string | null
          created_at?: string
          descuento?: number
          empleado_id?: string | null
          estado?: Database["public"]["Enums"]["estado_orden"]
          folio?: number
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          pagado?: boolean
          sucursal_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "caja_cortes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "vw_corte_resumen"
            referencedColumns: ["corte_id"]
          },
          {
            foreignKeyName: "ordenes_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          autorizado_por: string | null
          clip_payload: Json | null
          clip_payment_id: string | null
          clip_terminal_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_pago"]
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          orden_id: string
          referencia: string | null
          updated_at: string
        }
        Insert: {
          autorizado_por?: string | null
          clip_payload?: Json | null
          clip_payment_id?: string | null
          clip_terminal_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          orden_id: string
          referencia?: string | null
          updated_at?: string
        }
        Update: {
          autorizado_por?: string | null
          clip_payload?: Json | null
          clip_payment_id?: string | null
          clip_terminal_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          orden_id?: string
          referencia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          clave_compras: string
          clave_traspaso: string
          food_cost_meta: number
          id: string
          iva: number
          mano_obra: number
          merma_default: number
          updated_at: string
        }
        Insert: {
          clave_compras?: string
          clave_traspaso?: string
          food_cost_meta?: number
          id?: string
          iva?: number
          mano_obra?: number
          merma_default?: number
          updated_at?: string
        }
        Update: {
          clave_compras?: string
          clave_traspaso?: string
          food_cost_meta?: number
          id?: string
          iva?: number
          mano_obra?: number
          merma_default?: number
          updated_at?: string
        }
        Relationships: []
      }
      pedidos_cocina: {
        Row: {
          cocina_id: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_cocina"]
          id: string
          orden_id: string
          updated_at: string
        }
        Insert: {
          cocina_id: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cocina"]
          id?: string
          orden_id: string
          updated_at?: string
        }
        Update: {
          cocina_id?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cocina"]
          id?: string
          orden_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cocina_cocina_id_fkey"
            columns: ["cocina_id"]
            isOneToOne: false
            referencedRelation: "cocinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cocina_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria_id: string | null
          codigo: string | null
          created_at: string
          descripcion: string | null
          es_reventa: boolean
          id: string
          imagen_url: string | null
          iva_incluido: boolean
          mano_obra: number
          merma_pct: number | null
          nombre: string
          precio: number
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          es_reventa?: boolean
          id?: string
          imagen_url?: string | null
          iva_incluido?: boolean
          mano_obra?: number
          merma_pct?: number | null
          nombre: string
          precio?: number
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          es_reventa?: boolean
          id?: string
          imagen_url?: string | null
          iva_incluido?: boolean
          mano_obra?: number
          merma_pct?: number | null
          nombre?: string
          precio?: number
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      recetas: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          nota: string | null
          producto_id: string
        }
        Insert: {
          cantidad?: number
          id?: string
          insumo_id: string
          nota?: string | null
          producto_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          nota?: string | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recetas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      sucursales: {
        Row: {
          activa: boolean
          created_at: string
          direccion: string | null
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          direccion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          direccion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      transferencia_items: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          transferencia_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          insumo_id: string
          transferencia_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          transferencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_items_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias: {
        Row: {
          created_at: string
          destino_id: string
          estado: string
          firma: string | null
          id: string
          origen_id: string
        }
        Insert: {
          created_at?: string
          destino_id: string
          estado?: string
          firma?: string | null
          id?: string
          origen_id: string
        }
        Update: {
          created_at?: string
          destino_id?: string
          estado?: string
          firma?: string | null
          id?: string
          origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_origen_id_fkey"
            columns: ["origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          cfdi_solicitado: boolean
          created_at: string
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          orden_id: string
          total: number
        }
        Insert: {
          cfdi_solicitado?: boolean
          created_at?: string
          id?: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          orden_id: string
          total: number
        }
        Update: {
          cfdi_solicitado?: boolean
          created_at?: string
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          orden_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: true
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_corte_resumen: {
        Row: {
          abierto_en: string | null
          caja: string | null
          caja_id: string | null
          cerrado_en: string | null
          corte_id: string | null
          diferencia: number | null
          efectivo_contado: number | null
          efectivo_esperado: number | null
          estado: Database["public"]["Enums"]["estado_corte"] | null
          fondo_inicial: number | null
          num_ordenes: number | null
          total_clip: number | null
          total_cortesia: number | null
          total_efectivo: number | null
          total_otro: number | null
          total_pagado: number | null
          total_tarjeta: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_cortes_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_costeo_producto: {
        Row: {
          codigo: string | null
          costo_con_merma: number | null
          costo_empaque: number | null
          costo_insumos: number | null
          costo_receta: number | null
          costo_total: number | null
          es_reventa: boolean | null
          food_cost_pct: number | null
          id: string | null
          iva_incluido: boolean | null
          mano_obra: number | null
          margen: number | null
          margen_pct: number | null
          nombre: string | null
          precio: number | null
          precio_con_iva: number | null
          precio_sin_iva: number | null
          precio_sugerido: number | null
        }
        Relationships: []
      }
      vw_productos_mas_vendidos: {
        Row: {
          categoria: string | null
          id: string | null
          nombre: string | null
          total_ingresos: number | null
          total_vendido: number | null
        }
        Relationships: []
      }
      vw_ventas_diarias: {
        Row: {
          clip: number | null
          cortesia: number | null
          dia: string | null
          efectivo: number | null
          num_ordenes: number | null
          otro: number | null
          sucursal_id: string | null
          tarjeta: number | null
          ticket_promedio: number | null
          total_ventas: number | null
        }
        Relationships: []
      }
      vw_stock_almacen: {
        Row: {
          almacen: string | null
          almacen_id: string | null
          almacen_tipo: Database["public"]["Enums"]["tipo_almacen"] | null
          bajo_minimo: boolean | null
          id: string | null
          insumo: string | null
          insumo_id: string | null
          insumo_tipo: Database["public"]["Enums"]["tipo_insumo"] | null
          stock_actual: number | null
          stock_minimo: number | null
          unidad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_stock_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_promos_cliente: {
        Args: { p_cliente: string }
        Returns: Database["public"]["Tables"]["promociones"]["Row"][]
      }
      fn_generar_cupones_cumpleanos: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      fn_expirar_cupones: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      fn_reactivacion: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
    }
    Enums: {
      canal_orden: "kiosko" | "pos" | "delivery"
      estado_cocina:
        | "pendiente"
        | "en_preparacion"
        | "listo"
        | "entregado"
        | "cancelado"
      estado_corte: "abierta" | "cerrada"
      estado_orden:
        | "pendiente"
        | "en_preparacion"
        | "lista"
        | "entregada"
        | "cancelada"
      estado_cupon: "activo" | "usado" | "expirado" | "cancelado"
      estado_pago: "pendiente" | "aprobado" | "rechazado" | "cancelado"
      metodo_pago: "clip" | "efectivo" | "tarjeta" | "cortesia" | "otro"
      tipo_almacen: "bodega" | "kiosko"
      tipo_cupon: "mancuernas" | "cumpleanos"
      tipo_insumo: "proteina" | "shake" | "alimento" | "empaque" | "reventa"
      tipo_mancuerna: "ganadas" | "canje" | "ajuste" | "promo" | "proximidad"
      tipo_movimiento: "compra" | "venta" | "traspaso" | "ajuste" | "merma"
      tipo_promocion: "descuento_pct" | "descuento_monto" | "producto_gratis"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      canal_orden: ["kiosko", "pos", "delivery"],
      estado_cocina: [
        "pendiente",
        "en_preparacion",
        "listo",
        "entregado",
        "cancelado",
      ],
      estado_corte: ["abierta", "cerrada"],
      estado_orden: [
        "pendiente",
        "en_preparacion",
        "lista",
        "entregada",
        "cancelada",
      ],
      estado_cupon: ["activo", "usado", "expirado", "cancelado"],
      estado_pago: ["pendiente", "aprobado", "rechazado", "cancelado"],
      metodo_pago: ["clip", "efectivo", "tarjeta", "cortesia", "otro"],
      tipo_almacen: ["bodega", "kiosko"],
      tipo_cupon: ["mancuernas", "cumpleanos"],
      tipo_insumo: ["proteina", "shake", "alimento", "empaque", "reventa"],
      tipo_mancuerna: ["ganadas", "canje", "ajuste", "promo", "proximidad"],
      tipo_movimiento: ["compra", "venta", "traspaso", "ajuste", "merma"],
      tipo_promocion: ["descuento_pct", "descuento_monto", "producto_gratis"],
    },
  },
} as const
