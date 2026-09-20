import { describe, it, expect } from 'vitest'
import { traerTodo } from './paginar'

/**
 * Una lista falsa de N renglones que se sirve en páginas de 1000, igual
 * que PostgREST: si le piden más, recorta y no dice nada.
 */
function servidorFalso(total: number) {
  const llamadas: Array<[number, number]> = []
  const filas = Array.from({ length: total }, (_, i) => ({ i }))
  const consulta = (desde: number, hasta: number) => {
    llamadas.push([desde, hasta])
    const tope = Math.min(hasta - desde + 1, 1000)
    return Promise.resolve({ data: filas.slice(desde, desde + tope), error: null })
  }
  return { consulta, llamadas }
}

describe('traerTodo', () => {
  it('trae los 1067 vínculos de extras, no los primeros 1000', async () => {
    // El número no es de adorno: es el que dejó a «Proteína OPTIMUM -
    // Vainilla» fuera del kiosko el 20/09, y con ella el kiosko cobraba
    // $10 de más por caer a la siguiente marca.
    const { consulta, llamadas } = servidorFalso(1067)
    const todo = await traerTodo(consulta)
    expect(todo).toHaveLength(1067)
    expect(llamadas).toEqual([[0, 999], [1000, 1999]])
  })

  it('con menos de una página, una sola consulta', async () => {
    const { consulta, llamadas } = servidorFalso(42)
    expect(await traerTodo(consulta)).toHaveLength(42)
    expect(llamadas).toHaveLength(1)
  })

  it('una lista vacía no cuesta una segunda consulta', async () => {
    const { consulta, llamadas } = servidorFalso(0)
    expect(await traerTodo(consulta)).toEqual([])
    expect(llamadas).toHaveLength(1)
  })

  it('exactamente 1000 sí pide la siguiente: no hay forma de saber que ahí acabó', async () => {
    const { consulta, llamadas } = servidorFalso(1000)
    expect(await traerTodo(consulta)).toHaveLength(1000)
    expect(llamadas).toHaveLength(2)
  })

  it('no se traga un error: lo avienta en vez de devolver la lista mocha', async () => {
    await expect(
      traerTodo(() => Promise.resolve({ data: null, error: new Error('se cayó la red') })),
    ).rejects.toThrow('se cayó la red')
  })

  it('un error en la SEGUNDA página tampoco pasa por lista completa', async () => {
    let n = 0
    await expect(
      traerTodo<{ i: number }>(() => {
        n += 1
        if (n === 1) {
          return Promise.resolve({
            data: Array.from({ length: 1000 }, (_, i) => ({ i })),
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: new Error('se cortó a la mitad') })
      }),
    ).rejects.toThrow('se cortó a la mitad')
  })
})
