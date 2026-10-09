/**
 * El comprobante de un corte de caja, como HTML (09/10/26).
 *
 * Un solo documento para dos destinos: Admin lo enseña y lo imprime (o se
 * guarda como PDF), y el correo a gerencia lo manda tal cual. Por eso va
 * con estilos EN LÍNEA y tablas: es lo único que todos los clientes de
 * correo pintan igual. Dos maquetados —uno de pantalla y otro de correo—
 * terminarían diciendo cosas distintas del mismo corte.
 *
 * ⚠ Este archivo se copia tal cual a `supabase/functions/_shared/` para la
 * Edge Function del correo (Deno no lee el monorepo). Por eso no importa
 * nada: ni `mxn` ni tipos de otro paquete. Una prueba compara las dos
 * copias; si cambias este, corre `node scripts/copiar-comprobante.mjs`.
 *
 * Las firmas son los PINes: quien entrega firma al cerrar y quien recibe al
 * abrir, con la hora del servidor. Al imprimirlo quedan además las líneas
 * para firmar a mano, por si gerencia quiere el papel.
 */

/** Lo que trae `fn_corte_comprobante` (los números ya como número). */
export interface DatosComprobanteCorte {
  folio: number | null
  caja: string | null
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
  desglose_fondo: unknown
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
}

const BILLETES_C = [1000, 500, 200, 100, 50, 20]
const MONEDAS_C = [20, 10, 5, 2, 1]

export function folioDeCorte(folio: number | null | undefined): string {
  return folio == null ? 'COR-—' : `COR-${String(folio).padStart(5, '0')}`
}

function pesos(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  const s = Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '−' : ''}$${s}`
}

function conSigno(n: number): string {
  return n > 0 ? `+${pesos(n)}` : pesos(n)
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Fecha y hora de MÉRIDA, no la del navegador ni la del servidor. */
function cuando(iso: string | null | undefined, conFecha = true): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Merida' })
  if (!conFecha) return hora
  const dia = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Merida' })
  return `${dia} ${hora}`
}

function piezasDelFondo(raw: unknown): { etiqueta: string; n: number; total: number }[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as { billetes?: Record<string, unknown>; monedas?: Record<string, unknown> }
  const filas: { etiqueta: string; n: number; total: number }[] = []
  for (const den of BILLETES_C) {
    const n = Number(o.billetes?.[String(den)] ?? 0)
    if (n > 0) filas.push({ etiqueta: `$${den.toLocaleString('es-MX')}`, n, total: n * den })
  }
  for (const den of MONEDAS_C) {
    const n = Number(o.monedas?.[String(den)] ?? 0)
    if (n > 0) filas.push({ etiqueta: `$${den} moneda`, n, total: n * den })
  }
  return filas
}

const TINTA = '#14241D'
const VERDE = '#2C4A3E'
const ROJO = '#C23A47'
const GRIS = '#5B6B63'
const LINEA = '#D9D7C0'
const MONO = "'DM Mono', ui-monospace, Menlo, Consolas, monospace"
const SANS = "'DM Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"

function renglon(etiqueta: string, valor: string, opciones: { fuerte?: boolean; color?: string; grande?: boolean } = {}): string {
  const peso = opciones.fuerte ? 'font-weight:700;' : ''
  const tam = opciones.grande ? 'font-size:15px;white-space:nowrap;' : 'font-size:13px;'
  const color = `color:${opciones.color ?? TINTA};`
  return `<tr>
  <td style="padding:3px 0;font-family:${SANS};${tam}${peso}${color}">${esc(etiqueta)}</td>
  <td style="padding:3px 0;font-family:${MONO};${tam}${peso}${color}text-align:right;white-space:nowrap">${valor}</td>
</tr>`
}

function separador(): string {
  return `<tr><td colspan="2" style="padding:6px 0"><div style="border-top:1px dashed ${LINEA}"></div></td></tr>`
}

/** El cuerpo del comprobante (sin `<html>`): sirve para el correo y para la hoja. */
export function comprobanteCorteCuerpo(c: DatosComprobanteCorte): string {
  const dif = Number(c.diferencia ?? 0)
  const fondo = piezasDelFondo(c.desglose_fondo)
  const tieneFondo = c.fondo_dejado != null

  const filas: string[] = []
  filas.push(renglon('Caja', esc(c.caja ?? '—')))
  filas.push(renglon('Turno', `${cuando(c.abierto_en)} – ${c.cerrado_en ? cuando(c.cerrado_en, false) : 'abierto'}`))
  filas.push(renglon('Entrega', esc(c.entrega ?? '—'), { fuerte: true }))
  filas.push(renglon('Recibe', c.recibe ? esc(c.recibe) : 'pendiente', { fuerte: true, color: c.recibe ? TINTA : GRIS }))
  if (c.autorizo && c.autorizo !== c.entrega) filas.push(renglon('Autorizó el corte', esc(c.autorizo)))
  filas.push(separador())
  filas.push(renglon('Órdenes del turno', String(c.num_ordenes ?? 0)))
  filas.push(renglon('Fondo inicial', pesos(c.fondo_inicial)))
  filas.push(renglon('Ventas en efectivo', pesos(c.ventas_efectivo)))
  filas.push(renglon('Efectivo esperado', pesos(c.efectivo_esperado), { fuerte: true }))
  filas.push(renglon('Efectivo contado', c.efectivo_contado == null ? '—' : pesos(c.efectivo_contado), { fuerte: true }))
  filas.push(renglon('Diferencia', c.efectivo_contado == null ? '—' : conSigno(dif), {
    fuerte: true, color: dif === 0 ? VERDE : ROJO,
  }))
  if (tieneFondo) {
    filas.push(separador())
    filas.push(renglon('EFECTIVO RETIRADO', pesos(c.retiro), { fuerte: true, grande: true }))
    filas.push(renglon('FONDO QUE SE DEJA', pesos(c.fondo_dejado), { fuerte: true, grande: true }))
    if (c.reposicion) {
      filas.push(renglon(
        `Reposición${c.reposicion_autorizo ? ` (autorizó ${c.reposicion_autorizo})` : ''}`,
        `+${pesos(c.reposicion)}`, { color: ROJO },
      ))
      filas.push(renglon('Fondo para el siguiente turno', pesos(Number(c.fondo_dejado) + Number(c.reposicion)), { fuerte: true }))
    }
  }

  const desglose = fondo.length === 0 ? '' : `
<p style="margin:14px 0 4px;font-family:${SANS};font-size:13px;font-weight:700;color:${TINTA}">Desglose del fondo que se queda</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  <tr>
    <td style="font-family:${SANS};font-size:11px;color:${GRIS};padding:2px 0">Denominación</td>
    <td style="font-family:${SANS};font-size:11px;color:${GRIS};padding:2px 0;text-align:center">Cantidad</td>
    <td style="font-family:${SANS};font-size:11px;color:${GRIS};padding:2px 0;text-align:right">Total</td>
  </tr>
  ${fondo.map((f) => `<tr>
    <td style="font-family:${MONO};font-size:13px;color:${TINTA};padding:2px 0">${esc(f.etiqueta)}</td>
    <td style="font-family:${MONO};font-size:13px;color:${TINTA};padding:2px 0;text-align:center">${f.n}</td>
    <td style="font-family:${MONO};font-size:13px;color:${TINTA};padding:2px 0;text-align:right">${pesos(f.total)}</td>
  </tr>`).join('')}
  <tr>
    <td colspan="2" style="font-family:${SANS};font-size:13px;font-weight:700;color:${TINTA};padding:4px 0;border-top:1px solid ${LINEA}">Total fondo</td>
    <td style="font-family:${MONO};font-size:13px;font-weight:700;color:${TINTA};padding:4px 0;border-top:1px solid ${LINEA};text-align:right">${pesos(c.fondo_dejado)}</td>
  </tr>
</table>`

  const recepcion = !c.recibe ? `
<p style="margin:14px 0 0;font-family:${SANS};font-size:12px;color:${GRIS}">
  Quien recibe lo confirma con su PIN al abrir el siguiente turno.
</p>` : `
<p style="margin:14px 0 4px;font-family:${SANS};font-size:13px;font-weight:700;color:${TINTA}">Recepción del siguiente turno</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  ${renglon('Recibió', `${esc(c.recibe)} · ${cuando(c.recibido_en, false)}`)}
  ${renglon('Contó al recibir', pesos(c.recibido_contado))}
  ${c.recibido_diferencia == null ? '' : renglon('Diferencia al recibir', conSigno(Number(c.recibido_diferencia)), {
    fuerte: true, color: Number(c.recibido_diferencia) === 0 ? VERDE : ROJO,
  })}
</table>
${c.recibido_notas ? `<p style="margin:4px 0 0;font-family:${SANS};font-size:12px;color:${ROJO}">${esc(c.recibido_notas)}</p>` : ''}`

  const notas = c.notas
    ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:12px;color:${GRIS}">Nota del corte: ${esc(c.notas)}</p>`
    : ''

  const firmas = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px">
  <tr>
    <td style="width:50%;padding:22px 8px 0 0;vertical-align:bottom">
      <div style="border-top:1px solid ${TINTA}"></div>
      <p style="margin:4px 0 0;font-family:${SANS};font-size:11px;color:${GRIS};text-align:center">Entrega · ${esc(c.entrega ?? '')}</p>
      <p style="margin:2px 0 0;font-family:${MONO};font-size:10px;color:${GRIS};text-align:center">PIN ${c.cerrado_en ? cuando(c.cerrado_en, false) : '—'}</p>
    </td>
    <td style="width:50%;padding:22px 0 0 8px;vertical-align:bottom">
      <div style="border-top:1px solid ${TINTA}"></div>
      <p style="margin:4px 0 0;font-family:${SANS};font-size:11px;color:${GRIS};text-align:center">Recibe · ${esc(c.recibe ?? '')}</p>
      <p style="margin:2px 0 0;font-family:${MONO};font-size:10px;color:${GRIS};text-align:center">${c.recibido_en ? `PIN ${cuando(c.recibido_en, false)}` : 'pendiente'}</p>
    </td>
  </tr>
</table>`

  return `<div style="max-width:400px;margin:0 auto;background:#ffffff;padding:22px 22px 18px;border:1px solid ${LINEA};border-radius:10px">
  <p style="margin:0;font-family:${SANS};font-size:22px;font-weight:800;letter-spacing:1px;text-align:center;color:${VERDE}">SHAKEAHOLIC</p>
  <p style="margin:2px 0 0;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:1px;text-align:center;color:${TINTA}">COMPROBANTE DE CORTE DE CAJA</p>
  <p style="margin:4px 0 14px;font-family:${MONO};font-size:12px;text-align:center;color:${GRIS}">${cuando(c.cerrado_en ?? c.abierto_en)} · Folio ${folioDeCorte(c.folio)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${filas.join('\n')}
  </table>
  ${desglose}
  ${recepcion}
  ${notas}
  ${firmas}
</div>`
}

/** El comprobante como página completa, lista para imprimir o mandar. */
export function comprobanteCorteHtml(c: DatosComprobanteCorte): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Corte ${folioDeCorte(c.folio)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;700;800&display=swap">
<style>@page { margin: 12mm } body { margin:0; padding:16px; background:#F3F2E6 } @media print { body { background:#fff; padding:0 } }</style>
</head><body>
${comprobanteCorteCuerpo(c)}
</body></html>`
}
