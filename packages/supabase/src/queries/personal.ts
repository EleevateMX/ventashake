import type { ShakeClient } from '../client'

/**
 * Todo lo que es del PERSONAL y no de la venta: datos laborales,
 * expediente y contratos.
 *
 * Vive aparte de `catalogo.ts` porque son dos mundos con dueños distintos
 * — uno lo toca la barra todo el día, el otro solo gerencia— y porque
 * aquí hay **datos personales**: nombres completos, salarios, INE y actas.
 * Todas estas funciones piden gerencia (`fn_es_jefe()`) y están cerradas a
 * `anon` y a PUBLIC; ninguna la llama el kiosko.
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
const rpc = async <T>(sb: ShakeClient, fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (sb.rpc as unknown as Rpc)(fn, args)
  if (error) throw error
  return data as T
}

// ------------------------------ laboral ------------------------------

export interface DatosLaborales {
  empleado_id: string
  /** Solo para que el contrato concuerde: 'x' escribe en neutro. */
  genero: 'm' | 'f' | 'x'
  nombre_completo: string | null
  puesto: string | null
  salario_diario: number | null
  fecha_ingreso: string | null
  tipo_contrato: string | null
  jornada: string | null
  /** 0 = domingo … 6 = sábado. Los asigna la empresa. */
  dias_descanso: number[]
}

export const laboralDe = (sb: ShakeClient, empleadoId: string) =>
  rpc<DatosLaborales | null>(sb, 'fn_laboral_de', { p_empleado_id: empleadoId })

export const guardarLaboral = (sb: ShakeClient, d: DatosLaborales) =>
  rpc<void>(sb, 'fn_laboral_guardar', {
    p_empleado_id: d.empleado_id,
    p_genero: d.genero,
    p_nombre_completo: d.nombre_completo,
    p_puesto: d.puesto,
    p_salario_diario: d.salario_diario,
    p_fecha_ingreso: d.fecha_ingreso,
    p_tipo_contrato: d.tipo_contrato,
    p_jornada: d.jornada,
    p_dias_descanso: d.dias_descanso,
  })

// ----------------------------- expediente -----------------------------

export interface RequisitoExpediente {
  id: string
  nombre: string
  descripcion: string | null
  obligatorio: boolean
  caduca: boolean
  orden: number
  activo: boolean
}

export interface RenglonExpediente {
  requisito_id: string
  nombre: string
  descripcion: string | null
  obligatorio: boolean
  caduca: boolean
  documento_id: string | null
  archivo_ruta: string | null
  archivo_nombre: string | null
  entregado_en: string | null
  vence_en: string | null
  nota: string | null
  recibido_por: string | null
  vencido: boolean
}

export interface ResumenExpediente {
  empleado_id: string
  nombre: string
  rol: string
  obligatorios: number
  entregados: number
  faltantes: number
  vencidos: number
}

export const requisitosExpediente = (sb: ShakeClient) =>
  rpc<RequisitoExpediente[]>(sb, 'fn_expediente_requisitos')

export const expedienteDe = (sb: ShakeClient, empleadoId: string) =>
  rpc<RenglonExpediente[]>(sb, 'fn_expediente_de', { p_empleado_id: empleadoId })

export const resumenExpediente = (sb: ShakeClient) =>
  rpc<ResumenExpediente[]>(sb, 'fn_expediente_resumen')

export const marcarDocumento = (
  sb: ShakeClient,
  empleadoId: string,
  requisitoId: string,
  archivo: { ruta: string; nombre: string } | null,
  venceEn: string | null,
  nota: string | null,
) =>
  rpc<string>(sb, 'fn_expediente_marcar', {
    p_empleado_id: empleadoId,
    p_requisito_id: requisitoId,
    p_archivo_ruta: archivo?.ruta ?? null,
    p_archivo_nombre: archivo?.nombre ?? null,
    p_vence_en: venceEn,
    p_nota: nota,
  })

export const quitarDocumento = (sb: ShakeClient, documentoId: string) =>
  rpc<void>(sb, 'fn_expediente_quitar', { p_documento_id: documentoId })

/**
 * Abrir el archivo de alguien queda anotado. Con datos personales, saber
 * quién los consultó es parte de cuidarlos: sin bitácora, una fuga no
 * tiene de dónde empezar a investigarse.
 */
export const registrarAccesoExpediente = (sb: ShakeClient, documentoId: string) =>
  rpc<void>(sb, 'fn_expediente_registrar_acceso', { p_documento_id: documentoId })

/**
 * El bucket `expedientes` es **privado**, a diferencia de los otros tres.
 * Por eso no hay URL pública: se pide una firmada que dura poco. Una URL
 * eterna al INE de alguien es una fuga esperando a que la reenvíen.
 */
export async function urlFirmadaExpediente(
  sb: ShakeClient,
  ruta: string,
  segundos = 120,
): Promise<string> {
  const { data, error } = await sb.storage.from('expedientes').createSignedUrl(ruta, segundos)
  if (error) throw error
  return data.signedUrl
}

export async function subirAExpediente(
  sb: ShakeClient,
  empleadoId: string,
  requisitoId: string,
  archivo: File,
): Promise<{ ruta: string; nombre: string }> {
  const ext = archivo.name.split('.').pop()?.toLowerCase() ?? 'bin'
  // La ruta lleva el momento para que reemplazar un documento -una INE
  // renovada- no pise el anterior en el almacenamiento.
  const ruta = `${empleadoId}/${requisitoId}-${Date.now()}.${ext}`
  const { error } = await sb.storage.from('expedientes').upload(ruta, archivo, { upsert: false })
  if (error) throw error
  return { ruta, nombre: archivo.name }
}

// ------------------------------ contratos -----------------------------

export interface PlantillaContrato {
  id: string
  nombre: string
  cuerpo: string
  activa: boolean
}

export interface ContratoGenerado {
  id: string
  generado_en: string
  plantilla: string | null
  quien: string | null
}

export const plantillasContrato = (sb: ShakeClient) =>
  rpc<PlantillaContrato[]>(sb, 'fn_contrato_plantillas')

export const guardarPlantilla = (sb: ShakeClient, id: string | null, nombre: string, cuerpo: string) =>
  rpc<string>(sb, 'fn_contrato_plantilla_guardar', { p_id: id, p_nombre: nombre, p_cuerpo: cuerpo })

/**
 * Guarda el contrato **ya armado**. El texto se congela a propósito: si
 * mañana cambia la plantilla o el salario, el que ya se imprimió y se
 * firmó no debe cambiar con ellos.
 */
export const generarContrato = (
  sb: ShakeClient, empleadoId: string, plantillaId: string, cuerpoFinal: string,
) =>
  rpc<string>(sb, 'fn_contrato_generar', {
    p_empleado_id: empleadoId,
    p_plantilla_id: plantillaId,
    p_cuerpo_final: cuerpoFinal,
  })

export const contratosDe = (sb: ShakeClient, empleadoId: string) =>
  rpc<ContratoGenerado[]>(sb, 'fn_contratos_de', { p_empleado_id: empleadoId })

export const textoDeContrato = (sb: ShakeClient, id: string) =>
  rpc<string>(sb, 'fn_contrato_texto', { p_id: id })
