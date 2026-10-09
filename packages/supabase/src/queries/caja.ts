import type { Caja, CajaCorte, CorteResumen, Json } from '@shake/types'
import type { Conteo } from '@shake/utils'
import type { ShakeClient } from '../client'

export async function listarCajas(sb: ShakeClient): Promise<Caja[]> {
  const { data, error } = await sb.from('cajas').select('*').eq('activa', true).order('nombre')
  if (error) throw error
  return data
}

/** Corte abierto de una caja, o null si está cerrada. */
export async function corteAbierto(sb: ShakeClient, cajaId: string): Promise<CajaCorte | null> {
  const { data, error } = await sb
    .from('caja_cortes')
    .select('*')
    .eq('caja_id', cajaId)
    .eq('estado', 'abierta')
    .maybeSingle()
  if (error) throw error
  return data
}

/** Abre caja. La base garantiza un solo corte abierto por caja. */
/**
 * El desglose del cajon, separado por especie.
 *
 * La forma vive en `@shake/utils` (`Conteo`) porque el kiosko la escribe y
 * Admin la lee. Va separada porque el $20 existe como billete Y como
 * moneda: cuando compartian casilla, contar las monedas borraba los
 * billetes.
 *
 * En la base hay tambien filas con la forma vieja y plana
 * (`{"200": 2, "20": 4}`), de los cortes del 2 al 6 de septiembre. No se
 * reescriben: en esas, el `20` puede ser billetes, monedas o mezcla, y
 * adivinarlo seria inventar. `leerDesglose` de `@shake/utils` acepta las
 * dos formas y marca las viejas como ambiguas.
 */
export type DesgloseEfectivo = Conteo

/**
 * El fondo estándar con el que se abre la caja (lo fija gerencia en Admin →
 * Cortes). null = no hay fondo establecido y la pantalla no sugiere nada.
 * Al abrir, la base anota sola cuánto era (`caja_cortes.fondo_sugerido`),
 * así que lo que se abrió de verdad y lo que se esperaba quedan juntos.
 */
export async function fondoEstablecido(sb: ShakeClient): Promise<number | null> {
  const { data, error } = await sb.from('parametros').select('fondo_caja').eq('id', 'default').maybeSingle()
  if (error) throw error
  return data?.fondo_caja == null ? null : Number(data.fondo_caja)
}

export async function guardarFondoEstablecido(sb: ShakeClient, monto: number | null): Promise<void> {
  const { error } = await (sb.rpc as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ error: unknown }>)('fn_fondo_caja_guardar', { p_monto: monto })
  if (error) throw error
}

export async function abrirCaja(
  sb: ShakeClient,
  cajaId: string,
  fondoInicial: number,
  empleadoId?: string,
  /**
   * El desglose con el que se conto el fondo. Se guarda aparte del total
   * porque el total no sirve para reclamar nada: cuando el lunes falta un
   * billete de 500, lo que hace falta saber es cuantos habia el viernes.
   */
  desglose?: DesgloseEfectivo,
  /**
   * La incidencia de la entrega: qué pasó si lo recibido no es lo que el
   * turno anterior dejó. El fondo esperado NO se manda: lo pone la base
   * (trigger) a partir del corte anterior.
   */
  notasApertura?: string,
): Promise<CajaCorte> {
  const { data, error } = await sb
    .from('caja_cortes')
    .insert({
      caja_id: cajaId,
      fondo_inicial: fondoInicial,
      empleado_apertura_id: empleadoId ?? null,
      desglose_apertura: (desglose ?? null) as Json,
      notas_apertura: notasApertura?.trim() || null,
    })
    .select()
    .single()
  // Abrir caja exige el permiso `abrir_caja` en la base (RLS). Un rechazo
  // de RLS dice «row-level security», que no le dice nada a quien está en
  // la barra: se traduce a lo que sí pasa.
  if (error && (error as { code?: string }).code === '42501') {
    throw new Error('Tu usuario no tiene permiso de abrir la caja. Pídeselo a gerencia en Admin → Personal → Permisos.')
  }
  if (error) throw error
  return data
}

/**
 * El corte lo cerró alguien sin permiso y no trajo PIN de autorización.
 * La pantalla lo atrapa para pedir el PIN de quien sí pueda, en vez de
 * enseñar un error: no es una falla, es el candado haciendo su trabajo.
 */
export class RequiereAutorizacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'RequiereAutorizacion'
  }
}

/**
 * Cierra el corte con el candado DENTRO del servidor (`fn_cerrar_corte`).
 *
 * Antes era un UPDATE directo a `caja_cortes` que cualquiera del personal
 * podía hacer. Ahora el servidor mira quién tiene la sesión: si tiene el
 * permiso `cerrar_caja`, cierra; si no, exige `pinAutoriza` de alguien que
 * lo tenga y deja anotado quién autorizó. El empleado lo pone la sesión, no
 * la pantalla — el parámetro se conserva solo para no romper a quien llama.
 */
export async function cerrarCaja(
  sb: ShakeClient,
  corteId: string,
  efectivoContado: number,
  _empleadoId?: string,
  notas?: string,
  desglose?: DesgloseEfectivo,
  pinAutoriza?: string,
): Promise<{ autorizo: string | null }> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_cerrar_corte', {
    p_corte_id: corteId,
    p_efectivo: efectivoContado,
    p_desglose: desglose ?? null,
    p_notas: notas ?? null,
    p_pin_autoriza: pinAutoriza ?? null,
  })
  if (error) {
    const e = error as { message?: string; hint?: string }
    if (e.hint === 'requiere_autorizacion') throw new RequiereAutorizacion(e.message ?? 'Hace falta autorización.')
    throw error
  }
  return { autorizo: ((data ?? {}) as { autorizo?: string | null }).autorizo ?? null }
}

type RpcCaja = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

/** Lo que contesta el cierre con fondo. */
export interface CierreConFondo {
  autorizo: string | null
  folio: number | null
  retiro: number
  fondoDejado: number
  reposicion: number | null
}

/**
 * Cierra el corte dejando el fondo fijo (`fn_cerrar_corte_con_fondo`).
 *
 * Envuelve a `fn_cerrar_corte` en el servidor: el candado del corte es el
 * mismo (permiso o PIN de quien autoriza) y quien autoriza el corte es
 * quien autoriza la reposición. El servidor revisa que cada pieza del
 * fondo salga de lo contado y calcula el retiro; la pantalla solo propone.
 */
export async function cerrarCajaConFondo(
  sb: ShakeClient,
  corteId: string,
  efectivoContado: number,
  desglose: DesgloseEfectivo,
  desgloseFondo: DesgloseEfectivo,
  opciones: { reposicion?: number; notas?: string; pinAutoriza?: string } = {},
): Promise<CierreConFondo> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_cerrar_corte_con_fondo', {
    p_corte_id: corteId,
    p_efectivo: efectivoContado,
    p_desglose: desglose,
    p_desglose_fondo: desgloseFondo,
    p_reposicion: opciones.reposicion && opciones.reposicion > 0 ? opciones.reposicion : null,
    p_notas: opciones.notas ?? null,
    p_pin_autoriza: opciones.pinAutoriza ?? null,
  })
  if (error) {
    const e = error as { message?: string; hint?: string }
    if (e.hint === 'requiere_autorizacion') throw new RequiereAutorizacion(e.message ?? 'Hace falta autorización.')
    throw error
  }
  const r = (data ?? {}) as Record<string, unknown>
  return {
    autorizo: (r.autorizo as string | null) ?? null,
    folio: r.folio == null ? null : Number(r.folio),
    retiro: Number(r.retiro ?? 0),
    fondoDejado: Number(r.fondo_dejado ?? 0),
    reposicion: r.reposicion == null ? null : Number(r.reposicion),
  }
}

/** Lo que el turno anterior dejó en la caja, para quien la recibe. */
export interface FondoEntregado {
  corteId: string
  folio: number | null
  fondoEsperado: number
  reposicion: number | null
  desgloseFondo: DesgloseEfectivo | null
  entrego: string | null
  cerradoEn: string | null
}

/**
 * Cuánto debería traer la caja al abrir. null = el turno anterior no dejó
 * fondo registrado (lo cerró el POS, o es un corte de antes del 09/10) y la
 * apertura se comporta como siempre.
 */
export async function fondoEsperado(sb: ShakeClient, cajaId: string): Promise<FondoEntregado | null> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_fondo_esperado', { p_caja_id: cajaId })
  if (error) throw error
  if (!data) return null
  const r = data as Record<string, unknown>
  return {
    corteId: String(r.corte_id),
    folio: r.folio == null ? null : Number(r.folio),
    fondoEsperado: Number(r.fondo_esperado ?? 0),
    reposicion: r.reposicion == null ? null : Number(r.reposicion),
    desgloseFondo: (r.desglose_fondo as DesgloseEfectivo | null) ?? null,
    entrego: (r.entrego as string | null) ?? null,
    cerradoEn: (r.cerrado_en as string | null) ?? null,
  }
}

/**
 * Todo lo que va en el comprobante de un corte. Lo arma el servidor
 * (`fn_corte_comprobante`) para que el kiosko, Admin y el correo digan lo
 * mismo. Quien RECIBE es quien abrió el corte siguiente.
 */
export interface ComprobanteCorte {
  corte_id: string
  folio: number | null
  caja: string | null
  estado: string
  abierto_en: string
  cerrado_en: string | null
  abrio: string | null
  entrega: string | null
  autorizo: string | null
  num_ordenes: number | null
  fondo_inicial: number
  fondo_esperado_apertura: number | null
  ventas_efectivo: number
  efectivo_esperado: number
  efectivo_contado: number | null
  diferencia: number | null
  retiro: number | null
  fondo_dejado: number | null
  desglose_fondo: DesgloseEfectivo | null
  reposicion: number | null
  reposicion_autorizo: string | null
  notas: string | null
  total_tarjeta: number
  total_clip: number
  total_pagado: number
  recibe: string | null
  recibido_en: string | null
  recibido_contado: number | null
  recibido_esperado: number | null
  recibido_diferencia: number | null
  recibido_notas: string | null
  corte_siguiente_id: string | null
  corte_siguiente_folio: number | null
}

const NUMEROS_COMPROBANTE = [
  'folio', 'num_ordenes', 'fondo_inicial', 'fondo_esperado_apertura', 'ventas_efectivo',
  'efectivo_esperado', 'efectivo_contado', 'diferencia', 'retiro', 'fondo_dejado', 'reposicion',
  'total_tarjeta', 'total_clip', 'total_pagado', 'recibido_contado', 'recibido_esperado',
  'recibido_diferencia', 'corte_siguiente_folio',
] as const

export async function comprobanteCorte(sb: ShakeClient, corteId: string): Promise<ComprobanteCorte> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_corte_comprobante', { p_corte_id: corteId })
  if (error) throw error
  // numeric llega como número o como texto según el tamaño: se normaliza aquí
  // para que nadie sume un «3000.00» como cadena.
  const r = { ...(data as Record<string, unknown>) }
  for (const k of NUMEROS_COMPROBANTE) if (r[k] != null) r[k] = Number(r[k])
  return r as unknown as ComprobanteCorte
}

/** Las acciones de caja que se pueden dar o quitar por persona. */
export type Permiso = 'cobrar' | 'abrir_caja' | 'cerrar_caja' | 'descuento_manual'

export const PERMISOS: { id: Permiso; etiqueta: string; ayuda: string }[] = [
  { id: 'cobrar', etiqueta: 'Tomar y cobrar órdenes', ayuda: 'Entrar al kiosko en modo cajero y al POS.' },
  { id: 'abrir_caja', etiqueta: 'Abrir / iniciar caja', ayuda: 'Abrir el turno con su fondo.' },
  { id: 'cerrar_caja', etiqueta: 'Realizar cortes de caja', ayuda: 'Sin esto, el corte pide el PIN de quien sí pueda.' },
  { id: 'descuento_manual', etiqueta: 'Aplicar descuentos manuales', ayuda: 'En el POS. Sin esto, pide PIN de quien sí pueda.' },
]

/** Lo que puede quien tiene la sesión abierta. Sin sesión, nada. */
export async function misPermisos(sb: ShakeClient): Promise<Record<Permiso, boolean>> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_mis_permisos', {})
  if (error) throw error
  return (data ?? {}) as Record<Permiso, boolean>
}

/**
 * Autoriza con el PIN de alguien que tenga el permiso. El servidor compara
 * el PIN y el permiso; aquí solo llega el nombre de quien autorizó.
 */
export async function autorizarConPin(
  sb: ShakeClient,
  pin: string,
  permiso: Permiso,
): Promise<{ empleado_id: string; nombre: string }> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_autorizar_con_pin', {
    p_pin: pin,
    p_permiso: permiso,
  })
  if (error) throw error
  const filas = (data ?? []) as { empleado_id: string; nombre: string }[]
  if (!filas[0]) throw new Error('Ese PIN no puede autorizar esto.')
  return filas[0]
}

/** Una celda de la matriz de Admin → Personal → Permisos. */
export interface PermisoDePersona {
  empleado_id: string
  nombre: string
  rol: string
  es_gerencia: boolean
  permiso: Permiso
  permitido: boolean
  /** Lo que traería por su rol si nadie hubiera decidido. */
  por_rol: boolean
  /** Si gerencia lo decidió a mano (y no viene del rol). */
  a_mano: boolean
}

export async function permisosPersonal(sb: ShakeClient): Promise<PermisoDePersona[]> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_permisos_personal', {})
  if (error) throw error
  return (data ?? []) as PermisoDePersona[]
}

/** `null` devuelve a la persona a lo que trae su rol. */
export async function guardarPermiso(
  sb: ShakeClient,
  empleadoId: string,
  permiso: Permiso,
  permitido: boolean | null,
): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCaja)('fn_permiso_guardar', {
    p_empleado_id: empleadoId,
    p_permiso: permiso,
    p_permitido: permitido,
  })
  if (error) throw error
}

/** Totales del corte por método de pago (vw_corte_resumen). */
export async function resumenCorte(sb: ShakeClient, corteId: string): Promise<CorteResumen> {
  const { data, error } = await sb
    .from('vw_corte_resumen')
    .select('*')
    .eq('corte_id', corteId)
    .single()
  if (error) throw error
  return data
}

/** Un corte ya resumido, con quien lo abrio y cerro y el desglose contado. */
export interface CorteConDetalle extends CorteResumen {
  abrio: string | null
  cerro: string | null
  /**
   * Quién autorizó el corte cuando lo hizo alguien sin permiso (con su
   * PIN). Igual a `cerro` si quien cerró tenía permiso; null en los viejos.
   */
  autorizo: string | null
  desglose_apertura: DesgloseEfectivo | null
  desglose_cierre: DesgloseEfectivo | null
  /** Desde el 09/10: folio, lo retirado y el fondo que se dejó. null en los viejos. */
  folio: number | null
  retiro: number | null
  fondo_dejado: number | null
  desglose_fondo: DesgloseEfectivo | null
  reposicion: number | null
  /** Al abrir: lo que el turno anterior dejó, y la nota si no cuadró. */
  fondo_esperado: number | null
  notas_apertura: string | null
}

/**
 * El historial de cortes, para revisarlos desde Admin.
 *
 * Son dos consultas y no una: los totales viven en `vw_corte_resumen` (que
 * ya suma por metodo de pago) y el desglose con los nombres viven en la
 * tabla. Meterlo todo en la vista obligaria a tocarla cada vez que se
 * agregue una columna, y `create or replace view` borra las reloptions
 * -- ahi es donde se pierde el `security_invoker` sin que nadie lo note.
 */
export async function listarCortes(sb: ShakeClient, limite = 60): Promise<CorteConDetalle[]> {
  const { data: resumenes, error: e1 } = await sb
    .from('vw_corte_resumen')
    .select('*')
    .order('abierto_en', { ascending: false })
    .limit(limite)
  if (e1) throw e1

  const ids = (resumenes ?? []).map((r) => r.corte_id).filter(Boolean) as string[]
  if (ids.length === 0) return []

  const { data: detalles, error: e2 } = await sb
    .from('caja_cortes')
    .select(`
      id, desglose_apertura, desglose_cierre, folio, retiro, fondo_dejado, desglose_fondo, reposicion,
      fondo_esperado, notas_apertura,
      apertura:empleados!caja_cortes_empleado_apertura_id_fkey(nombre),
      cierre:empleados!caja_cortes_empleado_cierre_id_fkey(nombre),
      autorizacion:empleados!caja_cortes_cierre_autorizado_por_fkey(nombre)
    `)
    .in('id', ids)
  if (e2) throw e2

  const porId = new Map((detalles ?? []).map((d) => [d.id, d]))
  return (resumenes ?? []).map((r) => {
    const d = porId.get(r.corte_id as string)
    return {
      ...r,
      abrio: (d?.apertura as { nombre: string } | null)?.nombre ?? null,
      cerro: (d?.cierre as { nombre: string } | null)?.nombre ?? null,
      autorizo: (d?.autorizacion as { nombre: string } | null)?.nombre ?? null,
      desglose_apertura: (d?.desglose_apertura as DesgloseEfectivo | null) ?? null,
      desglose_cierre: (d?.desglose_cierre as DesgloseEfectivo | null) ?? null,
      folio: d?.folio ?? null,
      retiro: d?.retiro == null ? null : Number(d.retiro),
      fondo_dejado: d?.fondo_dejado == null ? null : Number(d.fondo_dejado),
      desglose_fondo: (d?.desglose_fondo as DesgloseEfectivo | null) ?? null,
      reposicion: d?.reposicion == null ? null : Number(d.reposicion),
      fondo_esperado: d?.fondo_esperado == null ? null : Number(d.fondo_esperado),
      notas_apertura: d?.notas_apertura ?? null,
    }
  })
}

/** Un ticket del turno, tal como lo busca gerencia: por folio o por nombre. */
export interface TicketDeCorte {
  id: string
  folio: number
  created_at: string
  total: number
  descuento: number | null
  pagado: boolean
  estado: string
  metodo_pago: string | null
  nombre_cliente: string | null
  es_demo: boolean
  cobro: string | null
}

/**
 * Los tickets de un turno.
 *
 * Se leen de la tabla y no por una funcion nueva a proposito: `ordenes` ya
 * es legible, asi que esto no abre ninguna superficie nueva ni depende de
 * una sesion que se pueda caducar. Despues de lo del 02/09, cada funcion
 * `SECURITY DEFINER` que no hace falta es una que no puede tumbar la caja.
 *
 * Trae TODAS las ordenes del turno, tambien las que no se cobraron: un
 * listado que solo ensena las cobradas esconde justo lo que el gerente
 * necesita ver cuando el corte no cuadra.
 */
export async function ticketsDeCorte(sb: ShakeClient, corteId: string): Promise<TicketDeCorte[]> {
  const { data, error } = await sb
    .from('ordenes')
    .select(`
      id, folio, created_at, total, descuento, pagado, estado, metodo_pago,
      nombre_cliente, es_demo,
      empleados:empleado_id (nombre)
    `)
    .eq('corte_id', corteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((o) => {
    const { empleados, ...resto } = o as typeof o & { empleados: { nombre: string } | null }
    return { ...resto, cobro: empleados?.nombre ?? null } as TicketDeCorte
  })
}

/** Un renglon del ticket, con sus extras colgando. */
export interface RenglonTicket {
  id: string
  producto: string
  cantidad: number
  precio_unitario: number
  personalizacion: string | null
  extras: RenglonTicket[]
}

export interface ParteCobrada {
  metodo: string
  monto: number
  estado: string
  parte: number | null
  proveedor: string | null
  created_at: string
}

export interface TicketDetalle {
  id: string
  folio: number
  created_at: string
  total: number
  descuento: number | null
  pagado: boolean
  estado: string
  metodo_pago: string | null
  nombre_cliente: string | null
  para_llevar: boolean | null
  es_demo: boolean
  cobro: string | null
  renglones: RenglonTicket[]
  pagos: ParteCobrada[]
}

/**
 * Un ticket completo, para consultarlo.
 *
 * Los extras van colgando de su producto, igual que en la comanda: con dos
 * bebidas en el mismo folio, plano no se sabe de cual era la creatina. Y
 * con la misma red que la comanda -- lo que no encuentra padre sube a
 * renglon propio en vez de desaparecer, porque un renglon invisible es
 * dinero que nadie explica.
 */
export async function detalleDeTicket(sb: ShakeClient, ordenId: string): Promise<TicketDetalle> {
  const { data, error } = await sb
    .from('ordenes')
    .select(`
      id, folio, created_at, total, descuento, pagado, estado, metodo_pago,
      nombre_cliente, para_llevar, es_demo,
      empleados:empleado_id (nombre),
      orden_items (id, cantidad, precio_unitario, personalizacion, padre_item_id, productos (nombre)),
      pagos (metodo, monto, estado, parte, proveedor, created_at)
    `)
    .eq('id', ordenId)
    .single()
  if (error) throw error

  const o = data as Record<string, unknown>
  const crudos = (o.orden_items ?? []) as Array<{
    id: string; cantidad: number; precio_unitario: number
    personalizacion: string | null; padre_item_id: string | null
    productos: { nombre: string } | null
  }>

  const aRenglon = (i: (typeof crudos)[number]): RenglonTicket => ({
    id: i.id,
    producto: i.productos?.nombre ?? '(producto borrado)',
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    personalizacion: i.personalizacion,
    extras: [],
  })

  const porId = new Map<string, RenglonTicket>()
  const renglones: RenglonTicket[] = []
  for (const i of crudos.filter((x) => !x.padre_item_id)) {
    const r = aRenglon(i)
    porId.set(i.id, r)
    renglones.push(r)
  }
  for (const i of crudos.filter((x) => x.padre_item_id)) {
    const padre = porId.get(i.padre_item_id as string)
    // Red de seguridad, la misma que la comanda: si el padre no esta, el
    // extra sube a renglon propio. Que salga solo es feo; que desaparezca
    // es dinero cobrado que no aparece en ningun lado.
    if (padre) padre.extras.push(aRenglon(i))
    else renglones.push(aRenglon(i))
  }

  const emp = o.empleados as { nombre: string } | null
  return {
    id: o.id as string,
    folio: o.folio as number,
    created_at: o.created_at as string,
    total: Number(o.total),
    descuento: o.descuento == null ? null : Number(o.descuento),
    pagado: Boolean(o.pagado),
    estado: String(o.estado),
    metodo_pago: (o.metodo_pago as string) ?? null,
    nombre_cliente: (o.nombre_cliente as string) ?? null,
    para_llevar: (o.para_llevar as boolean) ?? null,
    es_demo: Boolean(o.es_demo),
    cobro: emp?.nombre ?? null,
    renglones,
    pagos: ((o.pagos ?? []) as ParteCobrada[])
      .slice()
      .sort((a, b) => (a.parte ?? 0) - (b.parte ?? 0)),
  }
}

/** Quién recibe el comprobante de cada corte, y cómo van los últimos envíos. */
export interface CorreosCortes {
  correos: string[]
  ultimos: {
    id: number
    tipo: 'corte_cerrado' | 'entrega_con_diferencia' | 'reenvio'
    creado_en: string
    enviado_en: string | null
    intentos: number
    error: string | null
    folio: number | null
  }[]
}

export async function correosCortes(sb: ShakeClient): Promise<CorreosCortes> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_correos_cortes', {})
  if (error) throw error
  return (data ?? { correos: [], ultimos: [] }) as CorreosCortes
}

export async function guardarCorreosCortes(sb: ShakeClient, correos: string[]): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCaja)('fn_correos_cortes_guardar', { p_correos: correos })
  if (error) throw error
}

/** Vuelve a mandar el comprobante de un corte (gerencia). */
export async function reenviarComprobante(sb: ShakeClient, corteId: string): Promise<void> {
  const { error } = await (sb.rpc as unknown as RpcCaja)('fn_corte_reenviar_comprobante', { p_corte_id: corteId })
  if (error) throw error
}

/** Un renglón de Admin → Comprobantes. */
export interface ComprobanteResumen {
  corte_id: string
  folio: number | null
  caja: string | null
  abierto_en: string
  cerrado_en: string
  entrega: string | null
  recibe: string | null
  num_ordenes: number
  ventas_efectivo: number
  efectivo_contado: number | null
  diferencia: number | null
  retiro: number | null
  fondo_dejado: number | null
  reposicion: number | null
  recibido_contado: number | null
  recibido_diferencia: number | null
  recibido_notas: string | null
}

/**
 * Los comprobantes de un rango de fechas (días de Mérida, máximo un año).
 * Quién recibe sale del corte siguiente; lo arma el servidor.
 */
export async function comprobantesDeCortes(sb: ShakeClient, desde: string, hasta: string): Promise<ComprobanteResumen[]> {
  const { data, error } = await (sb.rpc as unknown as RpcCaja)('fn_comprobantes_cortes', { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  const num = (v: unknown) => (v == null ? null : Number(v))
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as ComprobanteResumen),
    folio: num(r.folio),
    num_ordenes: Number(r.num_ordenes ?? 0),
    ventas_efectivo: Number(r.ventas_efectivo ?? 0),
    efectivo_contado: num(r.efectivo_contado),
    diferencia: num(r.diferencia),
    retiro: num(r.retiro),
    fondo_dejado: num(r.fondo_dejado),
    reposicion: num(r.reposicion),
    recibido_contado: num(r.recibido_contado),
    recibido_diferencia: num(r.recibido_diferencia),
  }))
}
