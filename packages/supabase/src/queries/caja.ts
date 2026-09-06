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
): Promise<CajaCorte> {
  const { data, error } = await sb
    .from('caja_cortes')
    .insert({
      caja_id: cajaId,
      fondo_inicial: fondoInicial,
      empleado_apertura_id: empleadoId ?? null,
      desglose_apertura: (desglose ?? null) as Json,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cerrarCaja(
  sb: ShakeClient,
  corteId: string,
  efectivoContado: number,
  empleadoId?: string,
  notas?: string,
  desglose?: DesgloseEfectivo,
): Promise<void> {
  const { error } = await sb
    .from('caja_cortes')
    .update({
      estado: 'cerrada',
      cerrado_en: new Date().toISOString(),
      efectivo_contado: efectivoContado,
      empleado_cierre_id: empleadoId ?? null,
      notas: notas ?? null,
      desglose_cierre: (desglose ?? null) as Json,
    })
    .eq('id', corteId)
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
  desglose_apertura: DesgloseEfectivo | null
  desglose_cierre: DesgloseEfectivo | null
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
      id, desglose_apertura, desglose_cierre,
      apertura:empleados!caja_cortes_empleado_apertura_id_fkey(nombre),
      cierre:empleados!caja_cortes_empleado_cierre_id_fkey(nombre)
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
      desglose_apertura: (d?.desglose_apertura as DesgloseEfectivo | null) ?? null,
      desglose_cierre: (d?.desglose_cierre as DesgloseEfectivo | null) ?? null,
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
