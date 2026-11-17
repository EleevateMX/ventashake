import { describe, expect, it } from 'vitest'
import { esCodigoCliente, esCodigoPersonal, normalizarCodigoEscaneado, esCodigoCanje, digitosDeCanje } from './codigos'

describe('normalizarCodigoEscaneado', () => {
  it('deja igual un código bien escrito', () => {
    expect(normalizarCodigoEscaneado('SHK-AF8B0C')).toBe('SHK-AF8B0C')
    expect(normalizarCodigoEscaneado('SHKP-7Q2M9XKD')).toBe('SHKP-7Q2M9XKD')
  })

  it('el guion que el lector manda con otro teclado vuelve a ser guion', () => {
    // Lector en distribución de EU sobre Windows en español latinoamericano.
    for (const signo of ["'", '?', '_', '/', '¿', '´', ' ', '–']) {
      expect(normalizarCodigoEscaneado(`SHK${signo}AF8B0C`)).toBe('SHK-AF8B0C')
      expect(normalizarCodigoEscaneado(`SHKP${signo}7Q2M9XKD`)).toBe('SHKP-7Q2M9XKD')
    }
  })

  it('sin separador también, y en minúsculas (bloq mayús encendido)', () => {
    expect(normalizarCodigoEscaneado('SHKAF8B0C')).toBe('SHK-AF8B0C')
    expect(normalizarCodigoEscaneado('shkp7q2m9xkd')).toBe('SHKP-7Q2M9XKD')
    expect(normalizarCodigoEscaneado('  shk-af8b0c \n')).toBe('SHK-AF8B0C')
  })

  it('SHKP no se confunde con un cliente: los de cliente son hexadecimales', () => {
    expect(esCodigoPersonal("SHKP'7Q2M9XKD")).toBe(true)
    expect(esCodigoCliente("SHKP'7Q2M9XKD")).toBe(false)
    expect(esCodigoCliente("SHK'AF8B0C")).toBe(true)
    expect(esCodigoPersonal("SHK'AF8B0C")).toBe(false)
  })

  it('lo que no es código pasa sin tocar: teléfonos, claves y nombres', () => {
    expect(normalizarCodigoEscaneado('9991234567')).toBe('9991234567')
    expect(normalizarCodigoEscaneado('999-123-4567')).toBe('999-123-4567')
    expect(normalizarCodigoEscaneado('4821')).toBe('4821')
    expect(normalizarCodigoEscaneado('Shakira')).toBe('Shakira')
    expect(esCodigoCliente('9991234567')).toBe(false)
  })
})

describe('código de canje (SHKR)', () => {
  it('se reconoce con cualquier separador y no se confunde con el de cliente', () => {
    expect(normalizarCodigoEscaneado("SHKR'437913")).toBe('SHKR-437913')
    expect(esCodigoCanje('SHKR-437913')).toBe(true)
    expect(esCodigoCanje('SHK-A7K2M9')).toBe(false)
    expect(esCodigoCliente('SHKR-437913')).toBe(false)
  })
  it('saca los 6 dígitos del QR o de lo tecleado', () => {
    expect(digitosDeCanje('SHKR?437913')).toBe('437913')
    expect(digitosDeCanje('437 913')).toBe('437913')
    expect(digitosDeCanje('43791')).toBe(null)
    expect(digitosDeCanje('SHK-A7K2M9')).toBe(null)
  })
})
