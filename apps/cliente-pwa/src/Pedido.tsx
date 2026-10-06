import milo from '@shake/brand/milo.png'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProductoVenta } from '@shake/supabase'
import { mxn } from '@shake/utils'
import { useEstado, nombreVisible, type ExtraProducto } from './Estado'
import { amable } from './lib/rpc'
import { crearPedido, enlaceDePago, abrirPago, esperarPago, type LineaPedido, type PedidoCreado } from './lib/pedidos'
import { Hoja, Boton, Sheet, claseInput, tacto } from './ui'

type Fase = 'armando' | 'creando' | 'pagando' | 'listo'

/** La hoja «Lo quiero»: cantidad, con qué va, nota, y pedir y pagar. */
export function PedidoSheet({ producto, extras, alCerrar }: { producto: ProductoVenta; extras: ExtraProducto[]; alCerrar: () => void }) {
  const { pedidosConfig, cargarMisPedidos, sincronizar } = useEstado()
  const [cantidad, setCantidad] = useState(1)
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [sueltos, setSueltos] = useState<Set<string>>(new Set())
  const [nota, setNota] = useState('')
  const [fase, setFase] = useState<Fase>('armando')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [creado, setCreado] = useState<PedidoCreado | null>(null)
  const [pagoURL, setPagoURL] = useState<string | null>(null)
  const espera = useRef<ReturnType<typeof esperarPago> | null>(null)

  const grupos = useMemo(() => {
    const con = extras.filter((e) => (e.grupo ?? '') !== '')
    return [...new Set(con.map((e) => e.grupo!))].sort().map((g) => [g, con.filter((e) => e.grupo === g)] as const)
  }, [extras])
  const extrasSueltos = useMemo(() => extras.filter((e) => (e.grupo ?? '') === ''), [extras])

  useEffect(() => {
    setElegidos((prev) => {
      const n = { ...prev }
      for (const [g, lista] of grupos) if (!n[g]) n[g] = (lista.find((e) => e.por_defecto) ?? lista[0])?.extra_id
      return n
    })
  }, [grupos])
  useEffect(() => () => espera.current?.cancelar(), [])

  /** Solo para orientar: el total lo pone el servidor. */
  const estimado = useMemo(() => {
    const porGrupo = grupos.reduce((s, [g, lista]) => s + (lista.find((e) => e.extra_id === elegidos[g])?.precio ?? 0), 0)
    const porSueltos = extrasSueltos.filter((e) => sueltos.has(e.extra_id)).reduce((s, e) => s + (e.precio ?? 0), 0)
    return (producto.precio + porGrupo + porSueltos) * cantidad
  }, [grupos, elegidos, extrasSueltos, sueltos, producto.precio, cantidad])

  function lineas(): LineaPedido[] {
    const l: LineaPedido[] = [{ producto_id: producto.id, cantidad, personalizacion: nota || null, linea: 'L1', padre_linea: null }]
    let n = 1
    for (const [g] of grupos) { const id = elegidos[g]; if (id) { n++; l.push({ producto_id: id, cantidad, personalizacion: null, linea: `L${n}`, padre_linea: 'L1' }) } }
    for (const id of sueltos) { n++; l.push({ producto_id: id, cantidad, personalizacion: null, linea: `L${n}`, padre_linea: 'L1' }) }
    return l
  }

  async function pedir() {
    setMensaje(null)
    setFase('creando')
    try {
      const c = await crearPedido(lineas(), nota || null)
      setCreado(c)
      const r = await enlaceDePago(c.id)
      if (r.pagado) { await terminar(); return }
      if (!r.url) throw new Error('No se pudo abrir el pago.')
      setPagoURL(r.url)
      setFase('pagando')
      abrirPago(r.url)
      espera.current = esperarPago(c.id)
      const e = await espera.current.promesa
      if (e === 'pagado') await terminar()
      else if (e === 'fallido') setMensaje('El pago no se completó. Puedes volver a abrirlo.')
      else setMensaje('Todavía no vemos el pago. Si ya pagaste, espera un momento; si no, vuelve a abrir el pago.')
    } catch (e) {
      setMensaje(amable(e))
      setFase('armando')
    }
  }

  async function terminar() {
    setFase('listo')
    tacto.exito()
    await cargarMisPedidos()
    await sincronizar()
  }

  return (
    <Sheet abierta alCerrar={alCerrar} alta>
      <div className="space-y-4 pt-2">
        <h2 className="font-display text-[28px] text-sa-cream leading-tight">Lo quiero</h2>
        <p className="font-semibold text-[17px] text-sa-cream">{nombreVisible(producto.nombre)}</p>

        {fase === 'listo' ? (
          <div className="flex flex-col items-center text-center gap-2.5 py-5">
            <img src={milo} alt="" className="w-[110px]" />
            <p className="font-display text-[26px] text-sa-cream">¡Pedido #{creado?.folio} pagado!</p>
            {creado?.preparar_a && <p className="text-[15px] text-sa-cream/80">Lo preparamos para las {creado.preparar_a}. Te avisamos cuando esté listo.</p>}
          </div>
        ) : fase === 'armando' ? (
          <>
            <Hoja titulo="Cuántos">
              <div className="flex items-center gap-5 text-sa-green">
                <button onClick={() => setCantidad((n) => Math.max(1, n - 1))} className="w-10 h-10 rounded-full bg-sa-green text-sa-cream text-2xl leading-none" aria-label="Menos">−</button>
                <span className="font-display text-3xl text-sa-green-ink min-w-[40px] text-center">{cantidad}</span>
                <button onClick={() => setCantidad((n) => Math.min(10, n + 1))} className="w-10 h-10 rounded-full bg-sa-green text-sa-cream text-2xl leading-none" aria-label="Más">+</button>
              </div>
            </Hoja>
            {(grupos.length > 0 || extrasSueltos.length > 0) && (
              <Hoja titulo="Con qué va">
                {grupos.map(([grupo, lista]) => (
                  <div key={grupo}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sa-green-ink/50 mb-1.5">{grupo}</p>
                    <div className="flex gap-2 overflow-x-auto sa-fila -mx-1 px-1 pb-0.5">
                      {lista.map((e) => {
                        const activa = elegidos[grupo] === e.extra_id
                        return (
                          <button key={e.extra_id} onClick={() => setElegidos((p) => ({ ...p, [grupo]: e.extra_id }))}
                            className={`shrink-0 rounded-full px-3 py-2 text-[13px] font-semibold whitespace-nowrap ${activa ? 'bg-sa-green text-sa-cream' : 'bg-sa-cream-warm text-sa-green-ink'}`}>
                            {e.nombre}{(e.precio ?? 0) > 0 ? ` +${mxn(e.precio)}` : ''}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {extrasSueltos.map((e) => {
                  const on = sueltos.has(e.extra_id)
                  return (
                    <label key={e.extra_id} className="flex items-center justify-between gap-3 py-0.5">
                      <span className="text-sm">{e.nombre}</span>
                      <span className="flex items-center gap-2.5">
                        <span className="font-mono text-xs text-sa-green">{(e.precio ?? 0) > 0 ? `+${mxn(e.precio)}` : 'incluido'}</span>
                        <input type="checkbox" checked={on} onChange={() => setSueltos((s) => { const n = new Set(s); if (on) n.delete(e.extra_id); else n.add(e.extra_id); return n })} className="w-5 h-5 accent-sa-green" />
                      </span>
                    </label>
                  )
                })}
              </Hoja>
            )}
            <Hoja titulo="Algo que debamos saber">
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Sin hielo, poco plátano…" className={claseInput} maxLength={120} />
            </Hoja>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-sa-cream/70">Aproximado</span>
                <span className="font-mono text-xl font-medium text-sa-banana">{mxn(estimado)}</span>
              </div>
              <p className="text-xs text-sa-cream/50 mt-1">El total exacto lo confirma la barra antes de cobrar. Pagas con tarjeta en la app y pasas por tu pedido en {pedidosConfig?.minutos_preparacion ?? 20} minutos.</p>
            </div>
            <Boton onClick={() => void pedir()}>Pedir y pagar</Boton>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="w-7 h-7 rounded-full border-2 border-sa-banana border-t-transparent animate-spin" />
            <p className="text-sm text-sa-cream/70">{fase === 'creando' ? 'Armando tu pedido…' : 'Esperando el pago…'}</p>
            {fase === 'pagando' && pagoURL && (
              <button onClick={() => abrirPago(pagoURL)} className="text-sm font-semibold text-sa-banana">Volver a abrir el pago</button>
            )}
          </div>
        )}

        {mensaje && <p className="text-sm font-medium text-sa-strawberry text-center">{mensaje}</p>}
        <Boton tono="tinta" onClick={alCerrar}>{fase === 'listo' ? 'Listo' : 'Cancelar'}</Boton>
      </div>
    </Sheet>
  )
}
