import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  comprobanteCorte, reenviarComprobante, correosCortes, guardarCorreosCortes,
} from '@shake/supabase'
import type { ComprobanteCorte as Datos, CorreosCortes } from '@shake/supabase'
import { comprobanteCorteHtml, folioDeCorte, mensajeDeError } from '@shake/utils'
import { Panel, cx } from '../ui'

/**
 * El comprobante de un corte, tal como llega por correo.
 *
 * La vista previa es un `<iframe srcDoc>` con EXACTAMENTE el HTML que se
 * imprime y que se manda: lo que se revisa es lo que se firma (misma regla
 * que los contratos). Imprimir abre ese mismo documento; desde el diálogo
 * del navegador también se guarda como PDF.
 */
export function ComprobanteCorte({ corteId }: { corteId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    comprobanteCorte(sb, corteId).then(setDatos).catch((e) => setError(mensajeDeError(e)))
  }, [corteId])

  function imprimir() {
    if (!datos) return
    const w = window.open('', '_blank')
    if (!w) { setError('El navegador bloqueó la ventana. Permite las ventanas emergentes.'); return }
    w.document.write(comprobanteCorteHtml(datos))
    w.document.close()
    // Se espera a las fuentes: sin eso la hoja sale con la letra de repuesto.
    w.onload = () => { w.focus(); w.print() }
  }

  async function reenviar() {
    setError(null)
    try {
      await reenviarComprobante(sb, corteId)
      setAviso('Listo: sale por correo en el siguiente minuto.')
      setTimeout(() => setAviso(null), 6000)
    } catch (e) { setError(mensajeDeError(e)) }
  }

  if (error && !datos) return <p className="text-sm text-red-600">{error}</p>
  if (!datos) return <p className={cx.muted}>Armando el comprobante…</p>

  return (
    <div className="flex flex-wrap gap-6 items-start py-2">
      <iframe
        title={`Comprobante ${folioDeCorte(datos.folio)}`}
        srcDoc={comprobanteCorteHtml(datos)}
        className="w-[440px] max-w-full h-[640px] rounded border border-black/10 bg-white"
      />
      <div className="flex flex-col gap-2 min-w-[200px]">
        <p className="font-mono text-sm">{folioDeCorte(datos.folio)}</p>
        <button className={cx.btnPrimary} onClick={imprimir}>Imprimir o guardar PDF</button>
        <button className={cx.btnSec} onClick={() => void reenviar()}>Mandar por correo otra vez</button>
        {!datos.recibe && (
          <p className={`${cx.muted} text-xs max-w-[240px]`}>
            Todavía nadie recibe esta caja: «Recibe» se llena cuando el siguiente
            turno abre con su PIN.
          </p>
        )}
        {aviso && <p className="text-sm text-green-700">{aviso}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}

const TIPO: Record<string, string> = {
  corte_cerrado: 'Cierre',
  entrega_con_diferencia: 'Entrega con diferencia',
  reenvio: 'Reenvío',
}

/**
 * A quién le llega el comprobante de cada corte. Se guarda en una tabla
 * que solo gerencia lee (no en `parametros`, que el kiosko lee sin sesión).
 */
export function CorreosDeCortes() {
  const [estado, setEstado] = useState<CorreosCortes | null>(null)
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = () =>
    correosCortes(sb)
      .then((r) => { setEstado(r); setTexto(r.correos.join(', ')) })
      .catch((e) => setError(mensajeDeError(e)))
  useEffect(() => { void cargar() }, [])

  async function guardar() {
    setError(null)
    try {
      await guardarCorreosCortes(sb, texto.split(/[\s,;]+/).filter(Boolean))
      setEditando(false)
      await cargar()
    } catch (e) { setError(mensajeDeError(e)) }
  }

  if (!estado) return error ? <Panel className="mb-4"><p className="text-sm text-red-600">{error}</p></Panel> : null
  const ultimo = estado.ultimos[0]
  return (
    <Panel className="mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <p className="font-medium text-sa-green-ink">Comprobantes por correo</p>
          <p className={`${cx.muted} text-xs mt-0.5`}>
            Cada corte que se cierra llega a estos correos, y otro aviso si quien recibe
            la caja no cuenta lo que se dejó. Hasta 5.
          </p>
        </div>
        {editando ? (
          <>
            <input
              value={texto} autoFocus
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void guardar() }}
              placeholder="gerencia@ejemplo.com, otro@ejemplo.com"
              className={`${cx.input} !py-2 w-80 max-w-full`}
            />
            <button className={cx.btnPrimary} onClick={() => void guardar()}>Guardar</button>
            <button className={cx.btnSec} onClick={() => { setEditando(false); setTexto(estado.correos.join(', ')) }}>Cancelar</button>
          </>
        ) : (
          <>
            <span className="font-mono text-sm text-sa-green-ink">
              {estado.correos.length ? estado.correos.join(', ') : 'nadie todavía'}
            </span>
            <button className={cx.btnSec} onClick={() => setEditando(true)}>Cambiar</button>
          </>
        )}
      </div>
      {ultimo && (
        <p className={`text-xs mt-2 ${ultimo.enviado_en ? cx.muted : 'text-amber-700'}`}>
          Último: {TIPO[ultimo.tipo] ?? ultimo.tipo} de {folioDeCorte(ultimo.folio)} —{' '}
          {ultimo.enviado_en
            ? `enviado ${new Date(ultimo.enviado_en).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : `sin enviar${ultimo.error ? `: ${ultimo.error}` : ' (sale en el siguiente minuto)'}`}
        </p>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </Panel>
  )
}
