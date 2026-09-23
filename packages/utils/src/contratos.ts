/**
 * Rellenar una plantilla de contrato con los datos de una persona.
 *
 * **Esto no redacta nada.** El texto legal lo escribe (o lo revisa) un
 * abogado y vive en la plantilla; aquí solo se sustituyen variables y se
 * hace que el documento concuerde en género. Es la única parte del
 * problema que un programa puede resolver bien: un contrato mal redactado
 * es peor que no tener uno, porque en una junta una cláusula inválida no
 * protege y sí puede usarse en contra.
 *
 * Vive en `@shake/utils` y no dentro de la pantalla porque es lo que se
 * puede probar: que «la trabajadora» concuerde, que los días de descanso
 * se lean como los diría una persona, y —sobre todo— que **no quede
 * ninguna variable sin llenar**. Un contrato impreso con un `{{SALARIO}}`
 * a la vista es de los errores que se firman sin que nadie lo note.
 */

export type Genero = 'm' | 'f' | 'x'

export interface DatosDeContrato {
  genero: Genero
  nombre: string
  puesto?: string | null
  salarioDiario?: number | null
  fechaIngreso?: string | null
  tipoContrato?: string | null
  jornada?: string | null
  /** 0 = domingo … 6 = sábado. Los asigna la empresa. */
  diasDescanso?: number[] | null
  empresa: string
  lugar: string
  /** Para poder fijarla en las pruebas; por omisión, hoy. */
  hoy?: Date
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * «domingo», «domingo y lunes», «domingo, lunes y martes».
 *
 * Con la coma antes de la «y» se lee como una lista de sistema; sin ella,
 * como algo que escribió una persona. En un contrato que alguien va a
 * leer en voz alta, importa.
 */
export function listaDeDias(dias: number[] | null | undefined): string {
  const limpios = [...new Set((dias ?? []).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
  if (limpios.length === 0) return 'los que acuerden las partes'
  const nombres = limpios.map((d) => DIAS[d])
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * Cómo se nombra a la persona en el documento.
 *
 * El neutro no es «trabajador/a» con diagonal: en un documento que se
 * firma, la diagonal se lee mal y obliga a tachar una de las dos. «LA
 * PERSONA TRABAJADORA» concuerda solo y no obliga a nadie a declarar nada.
 */
export function tratamiento(genero: Genero): { articulo: string; sustantivo: string } {
  if (genero === 'm') return { articulo: 'EL', sustantivo: 'TRABAJADOR' }
  if (genero === 'f') return { articulo: 'LA', sustantivo: 'TRABAJADORA' }
  return { articulo: 'LA PERSONA', sustantivo: 'TRABAJADORA' }
}

const pesos = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fechaLarga = (iso: string | null | undefined) => {
  if (!iso) return ''
  // Se fija el mediodía UTC para que la fecha no se recorra un día al
  // pasar por el huso: Mérida es UTC−6 y `new Date('2026-01-01')` cae en
  // el 31 de diciembre a las 18:00.
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Merida',
  })
}

export interface ContratoLleno {
  texto: string
  /** Las variables que la plantilla pedía y no se pudieron llenar. */
  faltantes: string[]
}

export function llenarContrato(plantilla: string, d: DatosDeContrato): ContratoLleno {
  const { articulo, sustantivo } = tratamiento(d.genero)
  const valores: Record<string, string> = {
    EL_LA: articulo,
    TRABAJADOR: sustantivo,
    NOMBRE: d.nombre?.trim() ?? '',
    PUESTO: d.puesto?.trim() ?? '',
    SALARIO_DIARIO: pesos(d.salarioDiario),
    FECHA_INGRESO: fechaLarga(d.fechaIngreso),
    TIPO_CONTRATO: d.tipoContrato?.trim() ?? '',
    JORNADA: d.jornada?.trim() ?? '',
    DIAS_DESCANSO: listaDeDias(d.diasDescanso),
    EMPRESA: d.empresa?.trim() ?? '',
    LUGAR: d.lugar?.trim() ?? '',
    FECHA_HOY: fechaLarga(
      (d.hoy ?? new Date()).toLocaleDateString('en-CA', { timeZone: 'America/Merida' }),
    ),
  }

  const faltantes: string[] = []
  const texto = plantilla.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_todo, clave: string) => {
    const v = valores[clave]
    // Una variable que la plantilla pide y nadie lleno se REPORTA, no se
    // borra: dejarla vacia esconde el hueco, y el contrato sale con una
    // linea en blanco donde iba el salario.
    if (v === undefined || v === '') {
      faltantes.push(clave)
      return `{{${clave}}}`
    }
    return v
  })

  return { texto, faltantes: [...new Set(faltantes)] }
}
