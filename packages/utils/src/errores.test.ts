import { describe, expect, it } from 'vitest'
import { mensajeDeError } from './errores'

describe('mensajeDeError', () => {
  it('saca el mensaje de un Error normal', () => {
    expect(mensajeDeError(new Error('se cayó la red'))).toBe('se cayó la red')
  })

  it('lee el objeto plano de Supabase — el caso que mostraba [object Object]', () => {
    const errorDeSupabase = {
      code: 'P0001',
      message: 'Todos los productos de un combo deben ser de la misma estación',
      details: null,
      hint: null,
    }
    expect(mensajeDeError(errorDeSupabase)).toBe(
      'Todos los productos de un combo deben ser de la misma estación',
    )
  })

  it('conserva el hint, que es la parte que dice cómo arreglarlo', () => {
    expect(mensajeDeError({ message: 'función inexistente', hint: 'revisa el nombre' }))
      .toBe('función inexistente — revisa el nombre')
  })

  it('nunca devuelve "[object Object]"', () => {
    expect(mensajeDeError({ code: 'X' })).not.toContain('[object Object]')
    expect(mensajeDeError({})).toBe('Ocurrió un error inesperado.')
  })

  it('deja pasar strings y otros primitivos', () => {
    expect(mensajeDeError('falló y ya')).toBe('falló y ya')
  })

  // El caso real: Perla quiso crear la categoría "Extras", que ya existía,
  // y la pantalla le contestó con el nombre del índice de Postgres.
  it('el duplicado dice QUE esta duplicado, no el nombre del indice', () => {
    const m = mensajeDeError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_categorias_nombre"',
      details: null, hint: null,
    })
    expect(m).toContain('Ya existe una categoría')
    expect(m).not.toContain('uq_categorias_nombre')
    expect(m).not.toContain('duplicate key')
  })

  it('escoge el nombre de tabla mas largo que encaje', () => {
    const m = mensajeDeError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "inventario_stock_almacen_id_insumo_id_key"',
    })
    expect(m).toContain('renglón de inventario')
  })

  it('un duplicado en una tabla que no esta en el diccionario sigue siendo legible', () => {
    const m = mensajeDeError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "tabla_rarisima_key"',
    })
    expect(m).toBe('Ya existe algo igual. Revisa la lista antes de crearlo otra vez.')
  })

  it('traduce los otros codigos que le llegan a una persona', () => {
    expect(mensajeDeError({ code: '23503', message: 'violates foreign key constraint' }))
      .toContain('algo más lo está usando')
    expect(mensajeDeError({ code: '42501', message: 'permission denied for table x' }))
      .toContain('no tiene permiso')
    expect(mensajeDeError({ code: '57014', message: 'canceling statement due to statement timeout' }))
      .toContain('Tardó demasiado')
  })

  // Los `raise exception` nuestros ya vienen en español y para quien toca:
  // traducirlos seria tapar el mensaje bueno con uno generico.
  it('NO toca los P0001, que son nuestros mensajes escritos a mano', () => {
    expect(mensajeDeError({
      code: 'P0001',
      message: 'Solo el personal puede cargar inventario',
    })).toBe('Solo el personal puede cargar inventario')
  })
})
