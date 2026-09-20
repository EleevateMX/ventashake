import { useCallback, useEffect, useState } from 'react'
import {
  revisionDelMenu, cambiosDelCatalogo, contarCambios, pedirRecargaPantallas,
  type PendienteDelMenu, type CambiosCatalogo,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '../lib/sb'
import { PageHeader, Panel, Loading, ErrorMsg, OkMsg, Chip, cx } from '../ui'

/**
 * Revisión del menú: qué está mal configurado y qué falta por mostrar.
 *
 * Nace de un día entero de reportes que sonaban a «se borró algo» y no lo
 * eran. Los tés y el Smoky Chipotle los tapaba un corte de la consulta
 * —eso ya está arreglado—, pero al buscarlos aparecieron huecos reales
 * que **desde Admin no se podían ver**:
 *
 *  · El combo del Latte dice «elige una» y solo tiene una opción, porque
 *    «Latte Caliente» quedó apagado al migrar del Chapata Pick viejo.
 *  · Ese mismo extra **no sale** en Admin → Extras, porque se quedó sin
 *    categoría y esa pantalla solo lista los de «Extras Bebidas». La
 *    pantalla escondía justo el renglón que explicaba el problema.
 *
 * Esta página no arregla nada sola, y es a propósito: apagar o prender
 * cosas del menú es una decisión del negocio. Lo que hace es **nombrar**
 * el problema y decir dónde se compone.
 */

const TITULOS: Record<string, string> = {
  grupo_de_una: 'Un «elige una» que no deja elegir',
  extra_apagado_ligado: 'Ofrece algo que está apagado',
  solo_si_huerfano: 'Acotado a un grupo que no existe',
  nombre_duplicado: 'Dos productos con el mismo nombre',
  extra_sin_categoria: 'Extra invisible en Admin',
  sin_receta: 'Se vende y no descuenta inventario',
}

export default function Revision() {
  const [pendientes, setPendientes] = useState<PendienteDelMenu[] | null>(null)
  const [cambios, setCambios] = useState<CambiosCatalogo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [recargando, setRecargando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [p, c] = await Promise.all([
        revisionDelMenu(sb),
        // Si el diff del catálogo falla, la revisión sigue sirviendo: son
        // dos preguntas distintas y una no debe tumbar a la otra.
        cambiosDelCatalogo(sb).catch(() => null),
      ])
      setPendientes(p)
      setCambios(c)
    } catch (e) {
      setError(mensajeDeError(e))
      setPendientes([])
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  /**
   * El kiosko no se recarga a media venta: la señal espera a que la
   * pantalla esté en el menú y sin carrito. Las ventas apartadas viven en
   * el navegador y sobreviven a la recarga.
   */
  async function actualizarKiosko() {
    setRecargando(true)
    setAviso(null)
    try {
      await pedirRecargaPantallas(sb, 'kiosko')
      setAviso(
        'Listo. El kiosko se pone al día en cuanto esté en el menú y sin carrito — ' +
        'no interrumpe una venta a medias, y no se pierde ninguna apartada.',
      )
      setTimeout(() => setAviso(null), 12_000)
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setRecargando(false)
    }
  }

  if (pendientes === null) return <Loading>Revisando el menú…</Loading>

  const rompen = pendientes.filter((p) => p.severidad === 'rompe')
  const revisar = pendientes.filter((p) => p.severidad !== 'rompe')
  const porPublicar = contarCambios(cambios)

  const lista = (items: PendienteDelMenu[]) => (
    <div className="space-y-2">
      {items.map((p, i) => (
        <div
          key={`${p.tipo}-${p.producto_id}-${i}`}
          className="bg-white rounded-sa border border-sa-green-ink/10 px-4 py-3"
        >
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="font-display text-lg text-sa-green-ink">{p.producto}</span>
            <Chip tone={p.severidad === 'rompe' ? 'no' : 'neutral'}>
              {TITULOS[p.tipo] ?? p.tipo}
            </Chip>
          </div>
          <p className="text-sm text-sa-green-ink/80 mt-1 leading-snug">{p.detalle}</p>
          <p className="font-mono text-[11px] text-sa-green-ink/50 mt-1.5 leading-relaxed">
            {p.sugerencia}
          </p>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Revisión del menú"
        subtitle="Lo que está mal configurado, con nombre y apellido — y dónde se compone."
        action={
          <button
            onClick={() => void actualizarKiosko()}
            disabled={recargando}
            className="px-5 py-3 rounded-sa-lg bg-sa-green text-sa-cream font-display text-lg disabled:opacity-50"
          >
            {recargando ? 'Mandando…' : 'Actualizar el kiosko'}
          </button>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {aviso && <OkMsg>{aviso}</OkMsg>}

      {porPublicar > 0 && (
        <Panel className="mb-4">
          <h3 className={`${cx.h3} mb-2`}>
            Hay {porPublicar} {porPublicar === 1 ? 'cambio' : 'cambios'} sin mostrar en el kiosko
          </h3>
          <p className="text-sm text-sa-green-ink/70 leading-relaxed">
            Se guardaron en Costeos y todavía no se publican. Ojo con lo que esto
            significa de verdad: las pantallas leen los productos <b>en vivo</b>, así
            que publicar sincroniza <i>cuándo</i> los ven, no congela lo que ven —
            un reinicio del kiosko también se trae lo no publicado. Se confirma
            desde Costeos → «Mostrar en el kiosko», que enseña el diff antes.
          </p>
        </Panel>
      )}

      {rompen.length === 0 && revisar.length === 0 ? (
        <Panel>
          <p className="text-sa-green-ink/70">
            Nada que señalar: ningún grupo se quedó sin opciones, ningún producto
            ofrece algo apagado y no hay nombres repetidos.
          </p>
        </Panel>
      ) : (
        <div className="space-y-6">
          {rompen.length > 0 && (
            <section>
              <h3 className={`${cx.h3} mb-1`}>Esto ya lo están sufriendo</h3>
              <p className="text-sm text-sa-green-ink/60 mb-3">
                El cajero o el cliente se topan con ello ahora mismo.
              </p>
              {lista(rompen)}
            </section>
          )}

          {revisar.length > 0 && (
            <section>
              <h3 className={`${cx.h3} mb-1`}>Para revisar</h3>
              <p className="text-sm text-sa-green-ink/60 mb-3">
                No rompe la venta, pero conviene mirarlo.
              </p>
              {lista(revisar)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
