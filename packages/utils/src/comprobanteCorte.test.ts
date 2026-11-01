import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { comprobanteCorteHtml, comprobanteCorteTicketHtml, folioDeCorte, type DatosComprobanteCorte } from './comprobanteCorte'

const base: DatosComprobanteCorte = {
  folio: 128, caja: 'Caja Harbor',
  abierto_en: '2026-09-28T12:30:00Z', cerrado_en: '2026-09-28T20:30:00Z',
  abrio: 'Regina', entrega: 'Regina', autorizo: 'Regina',
  num_ordenes: 37, fondo_inicial: 3000, fondo_esperado_apertura: 3000,
  ventas_efectivo: 2534, efectivo_esperado: 5534, efectivo_contado: 5534, diferencia: 0,
  retiro: 2534, fondo_dejado: 3000,
  desglose_fondo: { billetes: { 1000: 2, 500: 2 }, monedas: {} },
  reposicion: null, reposicion_autorizo: null, notas: null,
  total_tarjeta: 0, total_clip: 0, total_pagado: 2534,
  recibe: 'Andrés', recibido_en: '2026-09-28T20:35:00Z', recibido_contado: 3000,
  recibido_esperado: 3000, recibido_diferencia: 0, recibido_notas: null,
}

describe('comprobante del corte', () => {
  it('lleva todo lo que pidió gerencia', () => {
    const h = comprobanteCorteHtml(base)
    for (const t of [
      'COR-00128', 'Regina', 'Andrés', 'Órdenes del turno', '37',
      'Fondo inicial', 'Ventas en efectivo', '$2,534.00', 'Efectivo esperado', '$5,534.00',
      'Efectivo contado', 'Diferencia', 'EFECTIVO RETIRADO', 'FONDO QUE SE DEJA', '$3,000.00',
      'Desglose del fondo', '$1,000', '$500', 'Total fondo', 'Entrega', 'Recibe',
    ]) expect(h).toContain(t)
  })

  it('la hora es la de Mérida (UTC−6)', () => {
    // 20:30 UTC = 14:30 en Mérida: la entrega de Regina a Andrés.
    expect(comprobanteCorteHtml(base)).toMatch(/02:30\s?p\.\s?m\./)
  })

  it('sin quien reciba, lo dice en vez de dejar el hueco', () => {
    const h = comprobanteCorteHtml({ ...base, recibe: null, recibido_en: null, recibido_contado: null, recibido_diferencia: null })
    expect(h).toContain('pendiente')
    expect(h).toContain('Quien recibe lo confirma con su PIN')
  })

  it('la diferencia y la reposición se ven con su signo', () => {
    const h = comprobanteCorteHtml({ ...base, efectivo_contado: 5514, diferencia: -20, reposicion: 50, reposicion_autorizo: 'Perla' })
    expect(h).toContain('−$20.00')
    expect(h).toContain('+$50.00')
    expect(h).toContain('autorizó Perla')
  })

  it('un nombre o una nota no pueden meter HTML', () => {
    const h = comprobanteCorteHtml({ ...base, recibido_notas: '<script>alert(1)</script>' })
    expect(h).not.toContain('<script>alert')
    expect(h).toContain('&lt;script&gt;')
  })

  it('el ticket de 80 mm dice exactamente lo mismo que la hoja', () => {
    const t = comprobanteCorteTicketHtml(base)
    expect(t).toContain('size: 80mm auto')
    // Mismo cuerpo: lo que se firma en la barra es lo que llega por correo.
    const cuerpo = comprobanteCorteHtml(base).split('<body>')[1].split('</body>')[0].trim()
    expect(t).toContain(cuerpo)
    // Espera a la letra antes de abrir el diálogo.
    expect(t).toContain('document.fonts')
  })

  it('folio con ceros', () => {
    expect(folioDeCorte(7)).toBe('COR-00007')
    expect(folioDeCorte(null)).toBe('COR-—')
  })

  it('la copia de la Edge Function es idéntica (node scripts/copiar-comprobante.mjs)', () => {
    const raiz = join(__dirname, '..', '..', '..')
    const original = readFileSync(join(raiz, 'packages/utils/src/comprobanteCorte.ts'), 'utf8')
    const copia = readFileSync(join(raiz, 'supabase/functions/_shared/comprobanteCorte.ts'), 'utf8')
    expect(copia).toBe(original)
  })
})

describe('comprobante completo (01/11/26): todo el turno, no solo el efectivo', () => {
  // Los números reales del corte 189 (31/10/26).
  const conDetalle: DatosComprobanteCorte = {
    ...base,
    ventas_efectivo: 2793, efectivo_esperado: 5793, efectivo_contado: 5793, diferencia: 0,
    total_clip: 4965.99, total_pagado: 7758.99,
    detalle: {
      metodos: { efectivo: { n: 28, monto: 2793 }, clip: { n: 47, monto: 4965.99 } },
      tickets_cobrados: 74, total_cobrado: 7758.99,
      cancelaciones: { sin_cobrar: { n: 0, monto: 0 }, cobradas: { n: 1, monto: 89 } },
      cortesias: { tickets: 1, productos: 1, valor: 89 },
      descuentos: { n: 7, monto: 111, por_tipo: { personal: { n: 2, monto: 86 }, promocion: { n: 5, monto: 25 } } },
    },
  }

  it('desglosa las ventas por método, con la tarjeta aunque sea cero', () => {
    const h = comprobanteCorteHtml(conDetalle)
    for (const t of [
      'VENTAS POR MÉTODO DE PAGO', 'Efectivo (28)', '$2,793.00',
      'Tarjeta · Clip (47)', '$4,965.99', 'Tarjeta · banco (0)',
      'Total · 74 tickets', '$7,758.99',
    ]) expect(h).toContain(t)
  })

  it('cancelaciones, devoluciones, cortesías y descuentos, con cantidad e importe', () => {
    const h = comprobanteCorteHtml(conDetalle)
    for (const t of [
      'CANCELACIONES Y DEVOLUCIONES', 'Canceladas (0)', 'Devoluciones (1)', '$89.00',
      'CORTESÍAS', '1 tickets · 1 productos',
      'DESCUENTOS', 'Aplicados (7)', '$111.00', 'Precio de personal (2)', '$86.00', 'Promociones (5)', '$25.00',
      'RESUMEN DE CAJA', 'Efectivo esperado', '$5,793.00', 'Efectivo contado', 'Diferencia',
    ]) expect(h).toContain(t)
    // Un tipo de descuento que no hubo no ensucia el papel.
    expect(h).not.toContain('Cupones (')
  })

  it('la tira de 80 mm dice exactamente lo mismo', () => {
    const t = comprobanteCorteTicketHtml(conDetalle)
    expect(t).toContain('Tarjeta · Clip (47)')
    expect(t).toContain('Aplicados (7)')
  })

  it('un corte de antes, sin detalle, sale como siempre', () => {
    const h = comprobanteCorteHtml({ ...base, detalle: null })
    expect(h).toContain('Órdenes del turno')
    expect(h).not.toContain('VENTAS POR MÉTODO')
  })
})
