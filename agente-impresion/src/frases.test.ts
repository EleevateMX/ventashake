import { afterEach, describe, expect, it } from 'vitest'
import { FRASES, frasePara, generarTSPL, vistaPrevia, type EtiquetaComanda } from './tspl.js'
import { etiquetasDeTrabajo } from './etiquetas.js'
import { fijarFrasesParaPrueba, frasesVigentes } from './frases.js'
import { MILO } from './milo.js'
import type { TrabajoImpresion } from './types.js'

const base: EtiquetaComanda = {
  destino: 'BEBIDAS', ticket: '8248', item: 1, deTotal: 1,
  nombre: 'REGINA', producto: '#1 Chocokiller', fecha: '09/10 14:30',
}

function trabajo(payload: TrabajoImpresion['payload']): TrabajoImpresion {
  return {
    id: 't1', orden_id: null, pedido_id: null, estacion_id: null, printer_id: null,
    tipo_documento: 'comanda', payload, estado: 'printing', intentos: 0, max_intentos: 1,
    numero_copia: 1, created_at: '2026-10-09T20:30:00Z',
  }
}

afterEach(() => fijarFrasesParaPrueba(null))

describe('frases de temporada (agente 1.5.0)', () => {
  it('sin nada bajado, usa las de siempre', () => {
    fijarFrasesParaPrueba(null)
    expect(frasesVigentes().map((f) => f.texto)).toEqual([...FRASES])
  })

  it('la lista de la base manda, con el mismo hash: misma comanda, misma frase', () => {
    const lista = ['Boo! Feliz Halloween', 'Dulce o shake', 'Calabaza power']
    expect(frasePara('8248', 1, lista)).toBe(frasePara('8248', 1, lista))
    expect(lista).toContain(frasePara('8248', 1, lista))
  })

  it('las etiquetas de un pedido salen con la frase de la temporada y su Milo', () => {
    fijarFrasesParaPrueba([{ texto: 'Boo! Feliz Halloween', milo: true }], 'Halloween')
    const [e] = etiquetasDeTrabajo(trabajo({
      folio: 8248, estacion: 'BEBIDAS', creado_en: '2026-10-09T20:30:00Z',
      items: [{ nombre: '#1 Chocokiller', cantidad: 1 }],
    }))
    expect(e.frase).toBe('Boo! Feliz Halloween')
    expect(e.milo).toBe(true)
  })

  it('la prueba de Admin imprime la frase que se quiere probar, con Milo si se pidió', () => {
    const [e] = etiquetasDeTrabajo(trabajo({ prueba: true, impresora: 'Barra', frase_prueba: 'Dulce o shake', milo: true }))
    expect(e.frase).toBe('Dulce o shake')
    expect(e.milo).toBe(true)
    const [vieja] = etiquetasDeTrabajo(trabajo({ prueba: true, impresora: 'Barra' }))
    expect(vieja.frase).toBe('Hecho para ti')
    expect(vieja.milo).toBe(false)
  })
})

describe('Milo en la etiqueta', () => {
  it('el dibujo trae exactamente los bytes que declara', () => {
    expect(Buffer.from(MILO.datos, 'base64').length).toBe(MILO.anchoBytes * MILO.alto)
    expect(MILO.largoX).toBe(MILO.anchoBytes * 8)
  })

  it('sin Milo no hay BITMAP: las etiquetas de siempre no cambian', () => {
    expect(generarTSPL(base)).not.toContain('BITMAP')
  })

  it('con Milo va un BITMAP después de la frase, dentro de la etiqueta', () => {
    const tspl = generarTSPL({ ...base, milo: true })
    const linea = tspl.split('\r\n').find((l) => l.startsWith('BITMAP '))
    expect(linea).toBeTruthy()
    const [x, y, w, h] = linea!.slice(7).split(',').map(Number)
    expect(w).toBe(MILO.anchoBytes)
    expect(h).toBe(MILO.alto)
    expect(x).toBeGreaterThanOrEqual(8)
    expect(y + h).toBeLessThanOrEqual(200) // 25 mm a lo ancho
    // Va DEBAJO de la frase: su punto más alto queda por debajo del último texto.
    const textos = tspl.split('\r\n').filter((l) => l.startsWith('TEXT ')).map((l) => Number(l.slice(5).split(',')[0]))
    expect(x + MILO.largoX).toBeLessThan(Math.min(...textos))
    // Los bytes viajan crudos: el largo del comando es el del encabezado más el dibujo.
    const datos = linea!.slice(linea!.indexOf(',0,') + 3)
    expect(datos.length).toBe(MILO.anchoBytes * MILO.alto)
  })

  it('si la comanda llena la etiqueta, Milo se omite y la comanda sale completa', () => {
    const larga = { ...base, milo: true, notas: Array.from({ length: 30 }, (_, i) => `NOTA ${i}`).join(' ') }
    const tspl = generarTSPL(larga)
    expect(tspl).not.toContain('BITMAP')
  })

  it('la vista previa avisa que va Milo', () => {
    expect(vistaPrevia({ ...base, milo: true })).toContain('(Milo)')
  })
})
