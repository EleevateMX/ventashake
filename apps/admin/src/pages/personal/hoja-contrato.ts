import { contratoABloques } from '@shake/utils'

/**
 * El contrato, maquetado como hoja.
 *
 * Devuelve un **documento HTML completo**, y ese mismo documento es el que
 * se ve en la vista previa (dentro de un iframe) y el que se manda a
 * imprimir. Un solo juego de bytes a propósito: con dos renderizados —uno
 * para la pantalla y otro para el papel— lo que se revisa deja de ser lo
 * que se firma, y eso en un contrato no es un detalle estético.
 *
 * El iframe además **aísla** el contenido: la plantilla la escribe
 * gerencia pegando texto de su abogado, y ese texto no tiene por qué
 * poder tocar la pantalla de Admin.
 */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

/**
 * Tipografía de la marca, no de sistema. Un contrato en Times se ve como
 * una plantilla bajada de internet; en la letra de la casa se ve como un
 * documento de la empresa, que es lo que es. Los tamaños respetan la
 * regla del proyecto: nada de display abajo de 18 px.
 */
const CSS = `
@page { size: letter; margin: 2.4cm 2.2cm 2cm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 11.5pt;
  line-height: 1.65;
  color: #14241D;
  background: #FFFFFF;
  padding: 2.4cm 2.2cm;
  -webkit-font-smoothing: antialiased;
}
.doc { max-width: 17cm; margin: 0 auto; }
h1 {
  font-size: 15pt; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; text-align: center;
  margin: 0 0 .2cm; line-height: 1.3;
}
.regla { width: 2.4cm; height: 2px; background: #2C4A3E; margin: .35cm auto 1cm; }
h2 {
  font-size: 10pt; font-weight: 700; letter-spacing: .14em;
  text-transform: uppercase; color: #2C4A3E;
  margin: .95cm 0 .3cm; line-height: 1.4;
  page-break-after: avoid; break-after: avoid;
}
p { margin: 0 0 .42cm; text-align: justify; hyphens: auto; }
p .etiqueta {
  font-weight: 700; letter-spacing: .04em; color: #1A2E26;
}
ul { margin: 0 0 .42cm; padding-left: 1.1cm; }
li { margin-bottom: .15cm; text-align: justify; }
hr { border: 0; border-top: 1px solid rgba(20,36,29,.18); margin: .8cm 0; }
/* Las firmas no se parten entre paginas: media firma en la hoja de atras
   es de las cosas que hacen que un documento se tenga que reimprimir. */
.firmas {
  display: flex; gap: 1.6cm; margin-top: 1.8cm;
  page-break-inside: avoid; break-inside: avoid;
}
.firma { flex: 1; text-align: center; }
.firma .linea { border-top: 1px solid #14241D; margin-bottom: .22cm; }
.firma .quien { font-size: 10pt; font-weight: 700; }
.firma .pie {
  font-family: 'DM Mono', ui-monospace, monospace;
  font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase;
  color: rgba(20,36,29,.5); margin-top: .1cm;
}
@media screen {
  body { padding: 2.4cm 2.2cm 3cm; }
}
`

const FUENTES =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&' +
  'family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">'

export function hojaContratoHtml(texto: string): string {
  const cuerpo = contratoABloques(texto)
    .map((b) => {
      switch (b.tipo) {
        case 'titulo':
          return `<h1>${esc(b.texto)}</h1><div class="regla"></div>`
        case 'seccion':
          return `<h2>${esc(b.texto)}</h2>`
        case 'lista':
          return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
        case 'separador':
          return '<hr>'
        case 'firmas':
          return `<div class="firmas">${b.partes
            .map(
              (q) =>
                `<div class="firma"><div class="linea"></div>` +
                `<div class="quien">${esc(q)}</div>` +
                `<div class="pie">Firma</div></div>`,
            )
            .join('')}</div>`
        case 'parrafo':
          return b.etiqueta
            ? `<p><span class="etiqueta">${esc(b.etiqueta)}.</span> ${esc(b.texto)}</p>`
            : `<p>${esc(b.texto)}</p>`
      }
    })
    .join('\n')

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Contrato</title>${FUENTES}<style>${CSS}</style></head>
<body><div class="doc">${cuerpo}</div></body></html>`
}
