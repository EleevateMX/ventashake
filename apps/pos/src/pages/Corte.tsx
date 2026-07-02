import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import { resumenCorte, cerrarCaja } from '@shake/supabase'
import type { CajaCorte, CorteResumen } from '@shake/types'
import { mxn } from '@shake/utils'

export default function Corte({ corte, onCerrado }: { corte: CajaCorte; onCerrado: () => void }) {
  const [resumen, setResumen] = useState<CorteResumen | null>(null)
  const [efectivoContado, setEfectivoContado] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)

  async function cargar() {
    try {
      setResumen(await resumenCorte(sb, corte.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function handleCerrar() {
    setCerrando(true)
    setError(null)
    try {
      await cerrarCaja(sb, corte.id, Number(efectivoContado) || 0)
      onCerrado()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCerrando(false)
    }
  }

  if (!resumen) return <div className="cargando">Cargando corte…</div>

  const contado = Number(efectivoContado) || 0
  const dif = contado - (resumen.efectivo_esperado ?? 0)

  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <h2>Corte de caja — {resumen.caja}</h2>
      {error && <div className="error-msg">{error}</div>}
      <table>
        <tbody>
          <tr><td>Órdenes cobradas</td><td className="num">{resumen.num_ordenes}</td></tr>
          <tr><td>Efectivo</td><td className="num">{mxn(resumen.total_efectivo)}</td></tr>
          <tr><td>Tarjeta</td><td className="num">{mxn(resumen.total_tarjeta)}</td></tr>
          <tr><td>Clip</td><td className="num">{mxn(resumen.total_clip)}</td></tr>
          <tr><td>Cortesía</td><td className="num">{mxn(resumen.total_cortesia)}</td></tr>
          <tr><td>Otro</td><td className="num">{mxn(resumen.total_otro)}</td></tr>
          <tr><td><b>Total cobrado</b></td><td className="num"><b>{mxn(resumen.total_pagado)}</b></td></tr>
          <tr><td>Fondo inicial</td><td className="num">{mxn(resumen.fondo_inicial)}</td></tr>
          <tr><td>Efectivo esperado en caja</td><td className="num">{mxn(resumen.efectivo_esperado)}</td></tr>
        </tbody>
      </table>

      <div className="campo" style={{ marginTop: 16 }}>
        <label>Efectivo contado en caja ($)</label>
        <input type="number" value={efectivoContado} onChange={(e) => setEfectivoContado(e.target.value)} />
      </div>
      {efectivoContado !== '' && (
        <p className={dif === 0 ? 'ok-msg' : 'error-msg'}>
          Diferencia: {mxn(dif)} {dif === 0 ? '(cuadra)' : dif > 0 ? '(sobrante)' : '(faltante)'}
        </p>
      )}
      <button className="primario" disabled={cerrando} onClick={() => void handleCerrar()}>
        {cerrando ? 'Cerrando…' : 'Cerrar caja'}
      </button>
    </div>
  )
}
