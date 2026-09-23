/**
 * Convertir el texto de un contrato en bloques con forma, para poder
 * pintarlo como un documento y no como una nota de bloc.
 *
 * **Por qué esto no vive en la pantalla.** Un contrato se ve en la vista
 * previa y se imprime en otra ventana; si el maquetado viviera en el
 * componente, las dos se separarían y lo que se revisa dejaría de ser lo
 * que se firma. Es la misma lección de `extras.ts` y `observaciones.ts`.
 *
 * Acepta dos formas de escribir, porque las dos van a pasar:
 *
 * 1. **Con marcas**, para la plantilla que armamos nosotros:
 *    `# Título`, `## Sección`, `---` para una raya, `- ` para viñetas y
 *    `[[FIRMAS: Uno | Otro]]` para el bloque de firmas.
 * 2. **Texto pelón**, que es lo que va a llegar pegado del abogado. Ahí
 *    se deduce: una línea corta en MAYÚSCULAS sola es un encabezado, y
 *    «PRIMERA.-» al principio de un párrafo es la etiqueta de la cláusula.
 *
 * Deducir de más sería peor que no deducir: si una línea no cumple las
 * reglas, se queda como párrafo normal. Un contrato con un renglón feo se
 * arregla; uno al que el sistema le comió una cláusula, no se nota.
 */

export type BloqueContrato =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'seccion'; texto: string }
  | { tipo: 'parrafo'; etiqueta: string | null; texto: string }
  | { tipo: 'lista'; items: string[] }
  | { tipo: 'separador' }
  | { tipo: 'firmas'; partes: string[] }

/** Ordinales de cláusula. Cerrado a propósito: una lista fija no se come
 *  un párrafo que empiece con una palabra en mayúsculas por casualidad. */
const ORDINALES = [
  'PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SEPTIMA',
  'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DECIMA', 'DÉCIMA', 'UNDECIMA', 'UNDÉCIMA',
  'DUODECIMA', 'DUODÉCIMA', 'DECIMOTERCERA', 'DECIMOCUARTA', 'DECIMOQUINTA',
]

const RE_ETIQUETA = new RegExp(
  `^((?:CL[AÁ]USULA\\s+)?(?:${ORDINALES.join('|')}))\\s*[.\\-–—:)]+\\s*`,
)

/** Una línea en mayúsculas, corta y sola: eso es un encabezado. */
function pareceEncabezado(linea: string): boolean {
  const t = linea.trim()
  if (t.length === 0 || t.length > 80) return false
  if (/[a-záéíóúñü]/.test(t)) return false
  // Tiene que traer letras: una fila de guiones o de números no es un título.
  return /[A-ZÁÉÍÓÚÑÜ]/.test(t)
}

function partirFirmas(linea: string): string[] {
  const dentro = linea.trim().replace(/^\[\[\s*FIRMAS\s*:?/i, '').replace(/\]\]$/, '')
  const partes = dentro.split('|').map((p) => p.trim()).filter(Boolean)
  return partes.length > 0 ? partes : ['', '']
}

export function contratoABloques(texto: string): BloqueContrato[] {
  const bloques: BloqueContrato[] = []
  const lineas = (texto ?? '').replace(/\r\n/g, '\n').split('\n')

  // Lo que se va juntando: un párrafo son varias líneas seguidas, y una
  // lista son varias viñetas seguidas. Se cierran al toparse con otra cosa.
  let parrafo: string[] = []
  let items: string[] = []

  const cerrarParrafo = () => {
    if (parrafo.length === 0) return
    const junto = parrafo.join(' ').replace(/\s+/g, ' ').trim()
    parrafo = []
    if (!junto) return
    const m = junto.match(RE_ETIQUETA)
    bloques.push(
      m
        ? { tipo: 'parrafo', etiqueta: m[1], texto: junto.slice(m[0].length).trim() }
        : { tipo: 'parrafo', etiqueta: null, texto: junto },
    )
  }
  const cerrarLista = () => {
    if (items.length === 0) return
    bloques.push({ tipo: 'lista', items })
    items = []
  }
  const cerrarTodo = () => { cerrarParrafo(); cerrarLista() }

  for (const cruda of lineas) {
    const l = cruda.trim()

    if (l === '') { cerrarTodo(); continue }

    if (/^\[\[\s*FIRMAS/i.test(l)) {
      cerrarTodo()
      bloques.push({ tipo: 'firmas', partes: partirFirmas(l) })
      continue
    }
    if (/^-{3,}$|^_{3,}$|^\*{3,}$/.test(l)) {
      cerrarTodo()
      bloques.push({ tipo: 'separador' })
      continue
    }
    if (l.startsWith('## ')) {
      cerrarTodo()
      bloques.push({ tipo: 'seccion', texto: l.slice(3).trim() })
      continue
    }
    if (l.startsWith('# ')) {
      cerrarTodo()
      bloques.push({ tipo: 'titulo', texto: l.slice(2).trim() })
      continue
    }
    if (/^[-•*]\s+/.test(l)) {
      cerrarParrafo()
      items.push(l.replace(/^[-•*]\s+/, ''))
      continue
    }
    // Encabezado deducido: solo si está solo, o sea si no viene pegado a
    // un párrafo que ya se estaba juntando.
    if (parrafo.length === 0 && pareceEncabezado(l)) {
      cerrarLista()
      bloques.push({ tipo: 'seccion', texto: l })
      continue
    }
    cerrarLista()
    parrafo.push(l)
  }
  cerrarTodo()
  return bloques
}
