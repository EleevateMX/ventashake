import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  avisosEnviados, buscarClientes, enviarAviso, resumenPush,
  type AvisoEnviado, type ResumenPush,
} from '@shake/supabase'
import type { Cliente } from '@shake/types'
import { mensajeDeError } from '@shake/utils'
import { PageHeader, Panel, ErrorMsg, OkMsg, Field, cx } from '../ui'

/**
 * Avisos push a la app de Rewards.
 *
 * Pocos y con valor: una novedad del menú, una promo del fin de semana, un
 * aviso de cierre. Lo automático («+12 mancuernas», al salir de la barra)
 * no se manda desde aquí: lo encola la base sola al acreditar.
 *
 * Una app que avisa de más se desinstala. Por eso el título cabe en 60
 * caracteres, el texto en 180, y el historial queda a la vista: antes de
 * mandar, se ve qué se mandó ayer.
 */
export default function Avisos() {
  const [resumen, setResumen] = useState<ResumenPush | null>(null)
  const [historial, setHistorial] = useState<AvisoEnviado[] | null>(null)
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [destino, setDestino] = useState<'todos' | 'cliente'>('todos')
  const [busca, setBusca] = useState('')
  const [candidatos, setCandidatos] = useState<Cliente[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function cargar() {
    try {
      const [r, h] = await Promise.all([resumenPush(sb), avisosEnviados(sb)])
      setResumen(r); setHistorial(h); setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  useEffect(() => {
    if (destino !== 'cliente' || busca.trim().length < 2) { setCandidatos([]); return }
    let vivo = true
    buscarClientes(sb, busca).then((c) => { if (vivo) setCandidatos(c.slice(0, 8)) }).catch(() => {})
    return () => { vivo = false }
  }, [busca, destino])

  async function mandar() {
    const quien = destino === 'todos'
      ? `a los ${resumen?.clientes ?? 0} clientes con la app`
      : `a ${cliente?.nombre ?? '…'}`
    if (!confirm(`¿Mandar «${titulo}» ${quien}?`)) return
    setEnviando(true); setError(null); setOk(null)
    try {
      const r = await enviarAviso(sb, { titulo, cuerpo, destino, cliente_id: cliente?.id ?? null })
      setOk(`Mandado a ${r.destinatarios} cuenta${r.destinatarios === 1 ? '' : 's'}; ${r.entregados} teléfono${r.entregados === 1 ? '' : 's'} lo recibieron.`)
      setTitulo(''); setCuerpo(''); setCliente(null); setBusca('')
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const listo = titulo.trim().length > 0 && cuerpo.trim().length > 0 && (destino === 'todos' || !!cliente)

  return (
    <div>
      <PageHeader
        title="Avisos"
        subtitle={
          resumen
            ? `${resumen.clientes} clientes con la app en ${resumen.telefonos} teléfonos${resumen.pendientes ? ` · ${resumen.pendientes} por salir` : ''}`
            : 'Notificaciones a la app de Rewards'
        }
      />
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Panel title="Nuevo aviso">
          <div className="space-y-4">
            <Field label={`Título · ${titulo.length}/60`}>
              <input className={cx.input} maxLength={60} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nuevo: Dubai Pistachio" />
            </Field>
            <Field label={`Texto · ${cuerpo.length}/180`}>
              <textarea className={cx.input} rows={3} maxLength={180} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} placeholder="Ya está en la barra. Enseña tu QR y suma mancuernas." />
            </Field>
            <Field label="Para">
              <div className="flex gap-2">
                {(['todos', 'cliente'] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDestino(d)}
                    className={d === destino ? cx.btnPrimary : cx.btnSec}>
                    {d === 'todos' ? 'Todos los que tienen la app' : 'Un cliente'}
                  </button>
                ))}
              </div>
            </Field>
            {destino === 'cliente' && (
              <Field label="Cliente">
                {cliente ? (
                  <div className="flex items-center justify-between gap-2">
                    <span>{cliente.nombre} <span className={cx.muted}>{cliente.telefono ?? cliente.codigo ?? ''}</span></span>
                    <button type="button" className={cx.btnSec} onClick={() => setCliente(null)}>Cambiar</button>
                  </div>
                ) : (
                  <>
                    <input className={cx.input} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre o teléfono" />
                    {candidatos.length > 0 && (
                      <ul className="mt-2 divide-y divide-sa-green-ink/5 border border-sa-green-ink/10 rounded-sa overflow-hidden">
                        {candidatos.map((c) => (
                          <li key={c.id}>
                            <button type="button" className="w-full text-left px-3 py-2 hover:bg-sa-cream-soft text-sm"
                              onClick={() => { setCliente(c); setCandidatos([]) }}>
                              {c.nombre} <span className={cx.muted}>{c.telefono ?? ''}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Field>
            )}
            <button type="button" className={cx.btnPrimary} disabled={!listo || enviando} onClick={() => void mandar()}>
              {enviando ? 'Mandando…' : 'Mandar aviso'}
            </button>
            <p className={`text-xs ${cx.muted}`}>
              Solo llega a quien tiene la app y aceptó avisos. Lo de «+mancuernas» al comprar sale solo.
            </p>
          </div>
        </Panel>

        <Panel title="Mandados">
          {historial === null ? (
            <p className={cx.muted}>Cargando…</p>
          ) : historial.length === 0 ? (
            <p className={cx.muted}>Todavía no se ha mandado ninguno.</p>
          ) : (
            <div className={cx.tableWrap}>
              <table className={cx.table}>
                <thead className={cx.thead}>
                  <tr><th className={cx.th}>Cuándo</th><th className={cx.th}>Aviso</th><th className={cx.th}>Para</th><th className={cx.thNum}>Llegó a</th><th className={cx.th}>Por</th></tr>
                </thead>
                <tbody className={cx.tbody}>
                  {historial.map((a) => (
                    <tr key={a.id} className={cx.tr}>
                      <td className={cx.td}>{new Date(a.creado_en).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className={cx.td}><strong>{a.titulo}</strong><br /><span className={cx.muted}>{a.cuerpo}</span></td>
                      <td className={cx.td}>{a.destino === 'todos' ? 'Todos' : a.cliente ?? 'Un cliente'}</td>
                      <td className={cx.tdNum}>{a.entregados}/{a.destinatarios}</td>
                      <td className={cx.td}>{a.por ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
