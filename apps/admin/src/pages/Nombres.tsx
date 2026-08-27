import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { nombresRegistrados, type NombreRegistrado } from '@shake/supabase'
import { mxn, mensajeDeError } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'

/**
 * El registro de nombres de pedido.
 *
 * No hay una tabla de nombres y no hace falta: cada venta cobrada con
 * nombre lo deja escrito en `ordenes.nombre_cliente`, y de ahí salen tanto
 * los chips del kiosko como esta pantalla. Es decir, **el cajero no
 * captura clientes: los aprende escribiendo**.
 *
 * Esto NO es la lista de clientes de Rewards (esos tienen cuenta, correo y
 * mancuernas; viven en la pestaña Rewards). Aquí solo hay nombres sueltos
 * de mostrador — sirve para reconocer a los que repiten, no para
 * contactarlos.
 */

const VENTANAS = [
  { dias: 7, label: '7 días' },
  { dias: 30, label: '30 días' },
  { dias: 90, label: '90 días' },
  { dias: 3650, label: 'Todo' },
]

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

export default function Nombres() {
  const [dias, setDias] = useState(30)
  const [filas, setFilas] = useState<NombreRegistrado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let vivo = true
    setFilas(null)
    nombresRegistrados(sb, dias)
      .then((f) => { if (vivo) { setFilas(f); setError(null) } })
      .catch((e) => { if (vivo) setError(mensajeDeError(e)) })
    return () => { vivo = false }
  }, [dias])

  const vistas = useMemo(() => {
    if (!filas) return []
    const q = busca.trim().toLowerCase()
    if (!q) return filas
    // Sin acentos: "adri" también encuentra "Adrián".
    const sin = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return filas.filter((f) => sin(f.nombre).includes(sin(q)))
  }, [filas, busca])

  const repetidores = useMemo(() => (filas ?? []).filter((f) => f.veces > 1), [filas])

  return (
    <div>
      <PageHeader
        title="Nombres"
        subtitle="Los que se escriben al cobrar. De aquí salen los atajos del kiosko."
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="flex flex-wrap gap-2 mb-5">
        {VENTANAS.map((v) => (
          <button
            key={v.dias}
            onClick={() => setDias(v.dias)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              dias === v.dias
                ? 'bg-sa-green-ink text-sa-cream'
                : 'bg-white text-sa-green-ink/70 border border-sa-green-ink/15 hover:border-sa-green-ink/30'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {!filas && !error && <Loading>Juntando nombres…</Loading>}

      {filas && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Panel>
              <p className={cx.label}>Nombres distintos</p>
              <p className="font-display text-4xl text-sa-green-ink mt-1">{filas.length}</p>
            </Panel>
            <Panel>
              <p className={cx.label}>Han vuelto</p>
              <p className="font-display text-4xl text-sa-green-ink mt-1">{repetidores.length}</p>
              <p className="text-xs text-sa-green-ink/60 mt-1">
                con 2 pedidos o más en la ventana
              </p>
            </Panel>
            <Panel>
              <p className={cx.label}>Pedidos con nombre</p>
              <p className="font-display text-4xl text-sa-green-ink mt-1">
                {filas.reduce((s, f) => s + f.veces, 0)}
              </p>
            </Panel>
          </div>

          {filas.length === 0 ? (
            <Panel>
              <p className={cx.muted}>
                Nadie escribió nombre en esta ventana. El campo es opcional: sin
                nombre la etiqueta sale con el folio y nada se detiene.
              </p>
            </Panel>
          ) : (
            <>
              <input
                className={cx.input}
                placeholder="Buscar un nombre…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />

              <div className={cx.tableWrap}>
                <table className={cx.table}>
                  <thead>
                    <tr className={cx.thead}>
                      <th className={cx.th}>Nombre</th>
                      <th className={cx.th}>Pedidos</th>
                      <th className={cx.th}>Gastado</th>
                      <th className={cx.th}>Ticket</th>
                      <th className={cx.th}>Primera</th>
                      <th className={cx.th}>Última</th>
                    </tr>
                  </thead>
                  <tbody className={cx.tbody}>
                    {vistas.map((f) => (
                      <tr key={f.nombre} className={cx.tr}>
                        <td className={`${cx.td} font-medium`}>{f.nombre}</td>
                        <td className={`${cx.td} font-mono`}>{f.veces}</td>
                        <td className={`${cx.td} font-mono`}>{mxn(f.total)}</td>
                        <td className={`${cx.td} font-mono text-sa-green-ink/60`}>{mxn(f.ticket)}</td>
                        <td className={`${cx.td} text-xs text-sa-green-ink/60`}>{fecha(f.primera_vez)}</td>
                        <td className={`${cx.td} text-xs text-sa-green-ink/60`}>{fecha(f.ultima_vez)}</td>
                      </tr>
                    ))}
                    {vistas.length === 0 && (
                      <tr><td className={cx.td} colSpan={6}><span className={cx.muted}>Ningún nombre coincide.</span></td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-sa-green-ink/50">
                Solo cuenta lo cobrado: una orden que quedó colgada sin pagar no
                es un cliente, es un intento. Estos nombres no tienen cuenta ni
                correo — para eso está Rewards.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
