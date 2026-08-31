import type {
  Orden,
  OrdenInsert,
  Pago,
  PagoInsert,
  MetodoPago,
} from '@shake/types'
import type { ShakeClient } from '../client'

export interface NuevaOrdenItem {
  producto_id: string
  cantidad: number
  /**
   * @deprecated ya no se envía a la base: el precio real se recalcula en
   * el servidor desde `productos.precio` (fn_crear_orden). Se conserva el
   * campo en la interfaz solo por compatibilidad de las apps que ya lo
   * llenan al armar el carrito; se ignora silenciosamente.
   */
  precio_unitario?: number
  personalizacion?: string | null
  /**
   * Etiqueta que pone el cliente para poder referirse a esta línea antes de
   * que exista en la base. El servidor genera el uuid real; esto solo sirve
   * para resolver `padre_linea` dentro del mismo envío.
   */
  linea?: string
  /**
   * Si esta línea es un extra, la `linea` del producto al que acompaña.
   * Sin esto, la base no sabe de cuál shake son las galletas — y con dos
   * shakes en el pedido, la comanda se las pega al equivocado.
   */
  padre_linea?: string | null
}

// rpc no está en los tipos generados; se castea el nombre (mismo patrón que empleados.ts).
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
async function rpc<T>(sb: ShakeClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (sb.rpc as unknown as RpcFn)(fn, args)
  if (error) throw error
  return data as T
}

/**
 * Crea la orden con sus items en estado pendiente (sin pagar), en una sola
 * transacción atómica del lado del servidor (RPC `fn_crear_orden`). El
 * precio de cada línea y el total se RECALCULAN en la base desde
 * `productos.precio` — el cliente ya no puede mandar un precio ni un total
 * manipulado (ver docs/auditoria-produccion.md, hallazgos C1/C2/A1).
 */
export async function crearOrden(
  sb: ShakeClient,
  // `nombre_cliente` va aparte del tipo generado: es "a nombre de quién va
  // el pedido" (para gritar/etiquetar), independiente de la ficha de lealtad.
  orden: OrdenInsert & { nombre_cliente?: string | null; para_llevar?: boolean | null },
  items: NuevaOrdenItem[],
): Promise<Orden> {
  return rpc<Orden>(sb, 'fn_crear_orden', {
    p_sucursal_id: orden.sucursal_id ?? null,
    p_almacen_id: orden.almacen_id ?? null,
    p_canal: orden.canal,
    p_items: items.map((i) => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      personalizacion: i.personalizacion ?? null,
      ...(i.linea ? { linea: i.linea } : {}),
      ...(i.padre_linea ? { padre_linea: i.padre_linea } : {}),
    })),
    p_corte_id: orden.corte_id ?? null,
    p_empleado_id: orden.empleado_id ?? null,
    p_cliente_id: orden.cliente_id ?? null,
    p_descuento: orden.descuento ?? 0,
    p_es_demo: orden.es_demo ?? false,
    p_nombre_cliente: orden.nombre_cliente ?? null,
    // null = no se preguntó. No es lo mismo que 'para comer aquí'.
    p_para_llevar: orden.para_llevar ?? null,
  })
}

/**
 * Registra un pago en estado `pendiente` (inofensivo: no dispara nada).
 * Aprobar un pago (estado='aprobado') SOLO puede hacerse vía `cobrarOrden`
 * (RPC `fn_cobrar_orden`, que valida el monto contra el total real de la
 * orden); la base rechaza cualquier INSERT directo con estado='aprobado'.
 */
export async function registrarPago(sb: ShakeClient, pago: PagoInsert): Promise<Pago> {
  const { data, error } = await sb.from('pagos').insert({ ...pago, estado: 'pendiente' }).select().single()
  if (error) throw error
  return data
}

/**
 * Atajo del flujo de caja: pago inmediato aprobado (efectivo/manual), vía
 * la RPC `fn_cobrar_orden` — idempotente (un reintento o doble clic nunca
 * crea un segundo pago aprobado) y valida que `monto` coincida con el
 * total real de la orden calculado por el servidor.
 *
 * `opts.idempotencyKey`: opcional, UUID generado por el cliente por
 * intento de cobro. Si el mismo intento se reenvía (timeout de red, doble
 * tap), se devuelve el pago ya creado en vez de duplicarlo.
 */
export async function cobrarOrden(
  sb: ShakeClient,
  ordenId: string,
  metodo: MetodoPago,
  monto: number,
  opts: { referencia?: string; autorizadoPor?: string; idempotencyKey?: string } = {},
): Promise<Pago> {
  return rpc<Pago>(sb, 'fn_cobrar_orden', {
    p_orden_id: ordenId,
    p_metodo: metodo,
    p_monto: monto,
    p_referencia: opts.referencia ?? null,
    p_autorizado_por: opts.autorizadoPor ?? null,
    p_idempotency_key: opts.idempotencyKey ?? null,
  })
}

/** Una parte de un cobro dividido: con qué se paga y cuánto. */
export interface PartePago {
  metodo: MetodoPago
  monto: number
  referencia?: string | null
}

/**
 * Cobrar una orden en partes ("$100 en efectivo y el resto con tarjeta").
 *
 * El servidor valida que las partes SUMEN el total antes de insertar
 * ninguna: una orden a medio cobrar es peor que una sin cobrar. Y el
 * candado contra el doble cobro sigue puesto — solo que ahora es por
 * (orden, parte) en vez de por orden, así que un segundo cobro entero
 * choca igual que siempre.
 *
 * `idempotencyKey`: un solo UUID para todo el intento; el servidor deriva
 * el de cada parte. Reenviar el mismo intento devuelve los mismos pagos.
 */
export async function cobrarOrdenDividido(
  sb: ShakeClient,
  ordenId: string,
  partes: PartePago[],
  opts: { autorizadoPor?: string; idempotencyKey?: string } = {},
): Promise<Pago[]> {
  return rpc<Pago[]>(sb, 'fn_cobrar_orden_dividido', {
    p_orden_id: ordenId,
    p_partes: partes.map((p) => ({
      metodo: p.metodo,
      monto: p.monto,
      referencia: p.referencia ?? null,
    })),
    p_autorizado_por: opts.autorizadoPor ?? null,
    p_idempotency_key: opts.idempotencyKey ?? null,
  })
}

/**
 * Arranca un cobro mixto contra la terminal: una parte en efectivo y el
 * resto con tarjeta.
 *
 * **La tarjeta va primero, y esa es toda la idea.** Esto NO cobra el
 * efectivo: lo deja apuntado como pago pendiente, que no cuenta en el
 * corte ni marca la orden pagada. Después se manda el resto a la terminal;
 * cuando Clip autoriza, el efectivo se aprueba en la misma transacción.
 *
 * Si el efectivo se cobrara antes y la tarjeta fallara, quedaría dinero en
 * el cajón y una venta a medias. Así, mientras la terminal no autorice no
 * hay nada comprometido: cancelar es gratis.
 *
 * Devuelve el monto que le toca a la tarjeta (el servidor lo recalcula
 * igual al mandar el cobro; esto es para poder mostrarlo).
 */
export async function iniciarCobroMixto(
  sb: ShakeClient,
  ordenId: string,
  efectivo: number,
  tarjeta: number,
): Promise<number> {
  return rpc<number>(sb, 'fn_cobrar_mixto_iniciar', {
    p_orden_id: ordenId,
    p_efectivo: efectivo,
    p_tarjeta: tarjeta,
  })
}

/**
 * Borra el efectivo apuntado. Se llama en CUALQUIER salida que no sea
 * "la terminal autorizó": rechazo, cancelación, tiempo agotado o error.
 *
 * Rebota si ya hay un cobro aprobado — a esas alturas ya no es cancelar,
 * es devolver, y eso no se hace desde aquí.
 */
export async function cancelarCobroMixto(sb: ShakeClient, ordenId: string): Promise<void> {
  await rpc(sb, 'fn_cobrar_mixto_cancelar', { p_orden_id: ordenId })
}

export async function cancelarOrden(sb: ShakeClient, ordenId: string): Promise<void> {
  const { error } = await sb.from('ordenes').update({ estado: 'cancelada' }).eq('id', ordenId)
  if (error) throw error
}

/**
 * Nombres de pedido más usados, para los chips de la pantalla de pago.
 *
 * No hay tabla de nombres: se aprenden solos de `ordenes.nombre_cliente`,
 * así que cada venta con nombre hace más lista la siguiente. Vienen los más
 * frecuentes primero y sin demos ni textos que no parecen nombre.
 */
export async function nombresPedidoFrecuentes(sb: ShakeClient, limite = 30): Promise<string[]> {
  const filas = await rpc<Array<{ nombre: string; veces: number }>>(
    sb, 'fn_nombres_pedido_frecuentes', { p_limite: limite },
  )
  return (filas ?? []).map((f) => f.nombre)
}

/** Una fila del registro de nombres de Admin. */
export interface NombreRegistrado {
  nombre: string
  veces: number
  total: number
  ticket: number
  primera_vez: string
  ultima_vez: string
}

/**
 * El registro de nombres para Admin: quién repite, cuánto lleva gastado y
 * cuándo vino la última vez.
 *
 * Va por RPC y pide ser jefe, a diferencia de `nombresPedidoFrecuentes`
 * (los chips del kiosko): aquí sale dinero, y eso no puede viajar por la
 * llave pública.
 */
export async function nombresRegistrados(
  sb: ShakeClient,
  dias = 90,
  limite = 200,
): Promise<NombreRegistrado[]> {
  const filas = await rpc<NombreRegistrado[]>(
    sb, 'fn_nombres_registro', { p_dias: dias, p_limite: limite },
  )
  return filas ?? []
}

// ------------------------- historial de pedidos ----------------------

export interface HistorialExtra {
  nombre: string
  cantidad: number
}

export interface HistorialItem {
  cantidad: number
  nombre: string
  personalizacion: string | null
  extras: HistorialExtra[]
}

export interface PedidoHistorial {
  folio: number
  /** Null cuando el pedido se levantó sin nombre. */
  nombre: string | null
  total: number
  /** Hora local de la sucursal, 'HH:MM'. */
  hora: string
  items: HistorialItem[]
}

/**
 * Los últimos pedidos pagados (RPC `fn_historial_pedidos`): folio, nombre,
 * hora y renglones con sus extras. Va por RPC y no por SELECT porque el
 * kiosko puede estar como anon y las tablas de órdenes no se abren para
 * eso — la función devuelve solo lo que esta pantalla enseña, tope 10.
 */
export async function historialPedidos(sb: ShakeClient, limite = 5): Promise<PedidoHistorial[]> {
  return rpc<PedidoHistorial[]>(sb, 'fn_historial_pedidos', { p_limite: limite })
}

// --------------------------- panel en vivo ---------------------------

export interface PanelEnVivo {
  ahora: string
  dia: { ordenes: number; total: number; ticket: number }
  /** Lo pagado desde que se abrió la caja (o desde medianoche sin corte). */
  turno: { ordenes: number; total: number }
  /** Suma aprobada de hoy por método: {efectivo: 1855, clip: 586.5, ...} */
  por_metodo: Record<string, number>
  corte: { desde: string; fondo: number; abrio: string | null } | null
  en_cocina: { estacion: string; estado: string; folio: number; nombre: string | null; minutos: number }[]
  pedidos_recientes: { folio: number; nombre: string | null; hora: string; total: number; canal: string; items: string }[]
  top_productos: { nombre: string; cantidad: number }[]
  impresoras: { nombre: string; en_linea: boolean; ultima_impresion: string | null; version: string | null }[]
  /** Trabajos de impresión esperando >90 s: 0 = el papel fluye. */
  impresion_atorada: number
  /** Bitácora del día (máx 40, más nuevo primero): cobros, comandas, impresiones, caja. */
  registro: { ts: string; hora: string; tipo: string; texto: string }[]
}

/**
 * La foto del momento para el panel "En vivo" del Admin (RPC
 * `fn_panel_en_vivo`). Un solo viaje con todo; el servidor exige
 * fn_es_jefe() — a cualquier otro le truena, no le regresa datos vacíos.
 */
export async function panelEnVivo(sb: ShakeClient, todosLosPedidos = false): Promise<PanelEnVivo> {
  return rpc<PanelEnVivo>(sb, 'fn_panel_en_vivo', { p_todos_los_pedidos: todosLosPedidos })
}
