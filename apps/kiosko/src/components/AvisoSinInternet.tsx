import React, { useEffect, useState } from 'react'
import { useConexion } from '@/lib/conexion'
import { agenteLocalVivo, useVentasSinInternet } from '@/store/sinInternet'

/**
 * El aviso de «sin internet», arriba al centro de TODAS las pantallas del
 * kiosko (08/10/26).
 *
 * La noche del 07/10 nadie supo por qué no cobraba: cada pantalla daba su
 * propio error y parecía que el sistema se había descompuesto. Ahora el
 * estado se dice una vez, en el mismo lugar, en grande: qué pasa, desde
 * cuándo, qué se puede hacer y cuántas ventas están guardadas esperando.
 *
 * Es una pastilla flotante y no una franja: las pantallas del kiosko miden
 * exactamente lo alto de la pantalla y una franja empujaría los botones de
 * cobro fuera de la vista.
 */
export function AvisoSinInternet() {
  const { enLinea, desde } = useConexion()
  const { pendientes, enviando } = useVentasSinInternet()
  const [agenteOk, setAgenteOk] = useState<boolean | null>(null)

  // El agente de impresión de esta PC. Se le pregunta también CON internet:
  // así Chrome pide el permiso de red local un día normal y no en plena
  // falla, y si algo no está bien se ve antes de necesitarlo.
  useEffect(() => {
    let vivo = true
    const revisar = () => void agenteLocalVivo().then((ok) => { if (vivo) setAgenteOk(ok) })
    revisar()
    const t = setInterval(revisar, enLinea ? 120_000 : 20_000)
    return () => { vivo = false; clearInterval(t) }
  }, [enLinea])

  const conError = pendientes.filter((v) => v.ultimoError)

  if (!enLinea) {
    const hora = desde
      ? new Date(desde).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Merida' })
      : null
    return (
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] pointer-events-none max-w-[92vw]">
        <div className="bg-sa-strawberry text-white rounded-full px-6 py-2.5 shadow-sa flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
          <p className="font-display text-lg leading-tight whitespace-nowrap">
            Sin internet{hora ? ` desde ${hora}` : ''}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wide opacity-90 whitespace-nowrap">
            Efectivo o terminal del banco
            {pendientes.length > 0 && ` · ${pendientes.length} guardada${pendientes.length === 1 ? '' : 's'}`}
            {agenteOk === false && ' · ⚠ la impresora no contesta'}
          </p>
        </div>
      </div>
    )
  }

  if (pendientes.length === 0) return null

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] pointer-events-none max-w-[92vw]">
      <div
        className={`rounded-full px-6 py-2.5 shadow-sa flex items-center gap-3 ${
          conError.length > 0 ? 'bg-sa-strawberry text-white' : 'bg-sa-banana text-sa-coffee'
        }`}
      >
        <p className="font-display text-lg leading-tight whitespace-nowrap">
          {enviando
            ? `Registrando ${pendientes.length} venta${pendientes.length === 1 ? '' : 's'} sin internet…`
            : `${pendientes.length} venta${pendientes.length === 1 ? '' : 's'} sin internet por registrar`}
        </p>
        {conError.length > 0 && (
          <p className="font-mono text-[11px] tracking-wide opacity-90 truncate max-w-[40vw]">
            {conError[0].folio_local}: {conError[0].ultimoError}
          </p>
        )}
      </div>
    </div>
  )
}
