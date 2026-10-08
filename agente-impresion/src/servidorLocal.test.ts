import { describe, expect, it } from 'vitest'
import { impresoraDeEstacion, normalizarEstacion } from './estaciones.js'
import { leerComandaLocal, origenPermitido } from './statusHttp.js'
import type { PrinterConfig } from './types.js'

const barra: PrinterConfig = { id: 'barra', token: 't1', interface: 'tcp://10.0.0.5:9100', lenguaje: 'tspl', anchoPapel: '80mm', copias: 1, corteAutomatico: false, buzzer: false }
const cocina: PrinterConfig = { ...barra, id: 'cocina', token: 't2', interface: 'tcp://10.0.0.6:9100' }

describe('impresoraDeEstacion', () => {
  it('usa lo aprendido, sin importar acentos ni mayúsculas', () => {
    expect(impresoraDeEstacion('BEBIDAS', [barra, cocina], { bebidas: 'barra', alimentos: 'cocina' })?.id).toBe('barra')
    expect(impresoraDeEstacion('Alimentos', [barra, cocina], { bebidas: 'barra', alimentos: 'cocina' })?.id).toBe('cocina')
  })
  it('la estación fijada en la config le gana a lo aprendido', () => {
    expect(impresoraDeEstacion('Bebidas', [{ ...cocina, estacion: 'Bebidas' }, barra], { bebidas: 'barra' })?.id).toBe('cocina')
  })
  it('con una sola impresora no hay nada que decidir', () => {
    expect(impresoraDeEstacion('Alimentos', [barra], {})?.id).toBe('barra')
  })
  it('con varias y sin saber, no adivina', () => {
    expect(impresoraDeEstacion('Alimentos', [barra, cocina], {})).toBeNull()
  })
  it('normaliza acentos', () => {
    expect(normalizarEstacion(' Ácido ')).toBe('acido')
  })
})

describe('origenPermitido', () => {
  it('solo el kiosko', () => {
    expect(origenPermitido('https://kiosko.shakeaholic.mx')).toBe(true)
    expect(origenPermitido('https://abc123.shake-kiosko.pages.dev')).toBe(true)
    expect(origenPermitido('https://admin.shakeaholic.mx')).toBe(false)
    expect(origenPermitido('https://evil.example')).toBe(false)
    expect(origenPermitido('https://x.shake-kiosko.pages.dev.evil.example')).toBe(false)
    expect(origenPermitido(undefined)).toBe(false)
  })
})

describe('leerComandaLocal', () => {
  const buena = { id: 'v1-bebidas', estacion: 'Bebidas', payload: { ticket: 'S-03', items: [{ cantidad: 1, nombre: '#1 Chocokiller' }] } }
  it('acepta una comanda completa', () => {
    expect(leerComandaLocal(buena)?.payload.ticket).toBe('S-03')
  })
  it('no deja colar calibraciones ni diagnósticos', () => {
    const r = leerComandaLocal({ ...buena, payload: { ...buena.payload, calibrar: true, diagnostico: true } })
    expect(r?.payload.calibrar).toBe(false)
    expect(r?.payload.diagnostico).toBe(false)
  })
  it('rechaza lo que no trae id, estación o productos', () => {
    expect(leerComandaLocal({ ...buena, id: '' })).toBeNull()
    expect(leerComandaLocal({ ...buena, estacion: ' ' })).toBeNull()
    expect(leerComandaLocal({ ...buena, payload: { items: [] } })).toBeNull()
    expect(leerComandaLocal(null)).toBeNull()
  })
})
