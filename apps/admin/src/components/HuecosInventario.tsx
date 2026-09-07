import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { huecosDeInventario } from '@shake/supabase'
import type { HuecosDeInventario, ProductoSinReceta } from '@shake/supabase'
import { mensajeDeError, mxn } from '@shake/utils'
import { Loading, ErrorMsg, Panel, cx } from '../ui'

/**
 * Lo que se vende y no descuenta inventario.
 *
 * El motor de descuento nunca estuvo roto —se cobra, se escribe el
 * movimiento, baja el stock—; lo que hacía era **callarse** cuando no
 * tenía nada que bajar. Treinta días así, y nadie lo notó hasta que en la
 * tienda contaron cajas a mano.
 *
 * Esta pantalla existe para que esa falla deje de ser invisible. No
 * arregla nada sola a propósito: cada renglón se cierra en Costeos, y
 * cada causa se arregla distinto. Por eso se dice la causa, no solo el
 * número.
 */

/** Qué hacer con este renglón. La causa manda, no el nombre. */
function causaDe(p: ProductoSinReceta): { etiqueta: string; que: string; grave: boolean } {
  if (p.hay_gemelo_con_receta)
    return {
      etiqueta: 'Se vende el gemelo',
      que: 'Hay otro producto con este mismo nombre que sí está costeado. No hay que inventarle una receta: hay que dejar de vender este y vender aquél, o darles la misma clave en Costeos.',
      grave: true,
    }
  if (p.es_combo_armado)
    return {
      etiqueta: 'Combo con partes',
      que: 'Tiene partes definidas pero ninguna trae receta. Se costean las partes en Costeos.',
      grave: false,
    }
  if (p.categoria.toLowerCase().includes('combo'))
    return {
      etiqueta: 'Combo sin partes',
      que: 'No tiene de qué está hecho. Hay que decirle en Costeos qué lleva dentro.',
      grave: true,
    }
  if (p.es_extra && Number(p.precio) === 0)
    return {
      etiqueta: 'Extra incluido',
      que: 'Es una opción que va incluida (el sabor de proteína, por ejemplo). Si el shake ya descuenta su proteína, está bien que este no descuente nada; si no, hay que costearlo.',
      grave: false,
    }
  return {
    etiqueta: 'Sin costear',
    que: 'Se cobra y no baja nada del almacén. Hay que darle receta en Costeos.',
    grave: true,
  }
}

export function HuecosInventario() {
  const [h, setH] = useState<HuecosDeInventario | null>(null)
  const [dias, setDias] = useState(30)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCargando(true)
    huecosDeInventario(sb, dias)
      .then((r) => { setH(r); setError(null) })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [dias])

  if (cargando) return <Loading>Buscando huecos…</Loading>
  if (error) return <ErrorMsg>{error}</ErrorMsg>
  if (!h) return null

  const total = Number(h.resumen.piezas_totales) || 0
  const perdidas = Number(h.resumen.piezas_sin_descontar) || 0
  const pct = total > 0 ? (perdidas / total) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className={`${cx.muted} text-sm max-w-2xl`}>
          Esto no es una lista de errores del sistema: es la lista de lo que
          el sistema <strong>no tenía cómo descontar</strong>. Mientras un
          renglón siga aquí, esas piezas salen de la tienda sin bajar del
          inventario.
        </p>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={d === dias ? cx.btnPrimary : cx.btnSec}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {/* Lo primero es el tamaño del hueco. Sin esto, 42 renglones pueden
          ser una esquina o pueden ser la mitad de la tienda. */}
      <Panel>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-display text-4xl text-sa-green-ink">
            {pct.toFixed(1)}%
          </span>
          <span className="text-sa-green-ink">
            de lo vendido no descontó nada
          </span>
          <span className={`${cx.muted} font-mono text-xs`}>
            {perdidas.toLocaleString('es-MX')} de {total.toLocaleString('es-MX')} piezas
            · últimos {h.dias} días
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-sa-green-ink/10 overflow-hidden">
          <div
            className="h-full bg-sa-strawberry"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </Panel>

      {h.sin_receta.length === 0 ? (
        <Panel>
          <p className={cx.muted}>
            Todo lo que se vendió tenía de qué descontar. No hay nada que cerrar.
          </p>
        </Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Producto</th>
                <th className={cx.th}>Dónde está</th>
                <th className={cx.thNum}>Piezas</th>
                <th className={cx.th}>Qué pasa · qué hacer</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {h.sin_receta.map((p) => {
                const c = causaDe(p)
                return (
                  <tr key={p.id} className={cx.tr}>
                    <td className={`${cx.td} font-medium`}>
                      {p.nombre}
                      <span className={`${cx.muted} block font-mono text-[10px]`}>
                        {Number(p.precio) > 0 ? mxn(Number(p.precio)) : 'incluido'}
                        {p.es_extra ? ' · extra' : ''}
                      </span>
                    </td>
                    <td className={cx.td}>{p.categoria}</td>
                    <td className={cx.tdNum}>{p.piezas}</td>
                    <td className={cx.td}>
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wider ${
                          c.grave ? 'text-sa-strawberry font-semibold' : cx.muted
                        }`}
                      >
                        {c.etiqueta}
                      </span>
                      <span className="block text-xs leading-snug mt-0.5 max-w-md">
                        {c.que}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {h.combos_vacios.length > 0 && (
        <Panel title="Combos que no dicen qué llevan dentro">
          <p className={`${cx.muted} text-sm mb-3`}>
            Se venden y no descuentan nada porque no tienen partes definidas.
            En cuanto se les diga en Costeos de qué están hechos, empiezan a
            descontar solos.
          </p>
          {h.combos_vacios.map((c) => (
            <div key={c.nombre} className="flex items-baseline justify-between gap-3 py-1">
              <span className="text-sm">{c.nombre}</span>
              <span className="font-mono text-xs tabular-nums">{c.piezas} vendidos</span>
            </div>
          ))}
        </Panel>
      )}

      {/* El catálogo de insumos. No es un error que se pueda cerrar desde
          aquí: es una limpieza, y borrar a ciegas un insumo con stock es
          perder inventario real. Se dice el tamaño y se deja la decisión. */}
      <Panel title="El catálogo de insumos está inflado">
        <div className="grid gap-4 sm:grid-cols-4">
          {([
            ['Insumos en total', h.catalogo.insumos],
            ['Que ningún producto usa', h.catalogo.sin_producto_que_los_use],
            ['Sin un solo movimiento', h.catalogo.sin_un_solo_movimiento],
            ['Con stock y sin uso', h.catalogo.con_stock_pero_sin_uso],
          ] as const).map(([nombre, v]) => (
            <div key={nombre}>
              <p className="font-display text-3xl text-sa-green-ink">{v}</p>
              <p className={`${cx.muted} font-mono text-[10px] uppercase tracking-wider`}>
                {nombre}
              </p>
            </div>
          ))}
        </div>
        <p className={`${cx.muted} text-sm mt-4 max-w-2xl leading-snug`}>
          Costeos guarda mientras se escribe, así que cada nombre a medias
          quedó como un insumo aparte: «Canada Dry Gi», «Canada Dry Ginger»,
          «Canada Dry Ginger A»… Cada uno con su propio stock, repartiendo
          el inventario real entre fantasmas. <strong>No se borran desde
          aquí</strong>: uno con stock es inventario de verdad mal
          etiquetado, y borrarlo lo desaparece.
        </p>
      </Panel>

      {h.traspasos.restan === 0 && h.traspasos.suman > 0 && (
        <Panel title="Los traspasos solo suman">
          <p className="text-sm leading-snug max-w-2xl">
            Hay <strong>{h.traspasos.suman}</strong> traspasos que suman y{' '}
            <strong>{h.traspasos.restan}</strong> que restan, y todos caen en{' '}
            {h.traspasos.almacenes.join(', ') || '—'}. Un traspaso que no
            descuenta el origen no es un traspaso: es una entrada, y bodega
            se queda diciendo que todavía tiene lo que ya mandó.
          </p>
        </Panel>
      )}

      {h.sin_renglon_de_stock.length > 0 && (
        <Panel title="Se movieron sin tener dónde bajar">
          <p className={`${cx.muted} text-sm mb-3 max-w-2xl leading-snug`}>
            Estos insumos tuvieron movimientos contra un renglón de stock
            que no existía, así que el movimiento se escribió y el stock no
            se movió. <strong>Ya está arreglado</strong>: el renglón ahora
            nace solo en la siguiente venta, así que esta lista se vacía
            sola conforme se vendan.
          </p>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {h.sin_renglon_de_stock.slice(0, 20).map((s) => (
              <div key={`${s.insumo}${s.almacen}`} className="flex items-baseline justify-between gap-3 py-0.5">
                <span className="text-xs">{s.insumo}</span>
                <span className={`${cx.muted} font-mono text-[10px]`}>
                  {s.almacen} · {s.movido}
                </span>
              </div>
            ))}
          </div>
          {h.sin_renglon_de_stock.length > 20 && (
            <p className={`${cx.muted} font-mono text-[10px] mt-2`}>
              y {h.sin_renglon_de_stock.length - 20} más
            </p>
          )}
        </Panel>
      )}
    </div>
  )
}
