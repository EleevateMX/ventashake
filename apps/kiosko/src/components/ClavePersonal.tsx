import { useState } from 'react'
import { identificarPersonal, type IdentidadPersonal } from '@shake/supabase'
import { mensajeDeError, mxn } from '@shake/utils'
import { sb } from '@/lib/sb'

/**
 * Precio de personal: la clave de quien trabaja aquí.
 *
 * **La pantalla no calcula ni un peso.** Aquí solo se teclea la clave y se
 * enseña lo que el servidor contestó. Al cobrar,
 * `fn_crear_orden_personal` vuelve a validar todo —la clave, el turno
 * abierto y los límites del día— y calcula el descuento desde el
 * catálogo. Es la misma regla de siempre: el cliente nunca manda precios,
 * y aquí el cajero tampoco.
 *
 * Lo que sí hace la pantalla es **enseñar lo que le queda ANTES de
 * capturar**. Enterarse del límite al momento de cobrar es enterarse
 * tarde, con la fila esperando: se vería como un rechazo del sistema
 * cuando en realidad es una regla del negocio que se podía haber dicho a
 * tiempo.
 *
 * **La clave o el código de la app.** El mismo campo acepta dos cosas: la
 * clave tecleada en el pad (solo dígitos) o el código `SHKP-XXXXXXXX` que
 * la app del personal enseña como QR y el lector teclea como si fuera un
 * teclado, con Enter al final. El servidor distingue cuál es; aquí no se
 * decide nada. El campo se enfoca al abrir, igual que en ModalCliente: si
 * el foco no está ahí, lo que escanea el lector se pierde.
 */

export function ClavePersonal({
  valor,
  onCambio,
}: {
  valor: IdentidadPersonal | null
  onCambio: (id: IdentidadPersonal | null, clave: string | null) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const esCodigo = /^SHKP-/i.test(clave.trim())
  const lista = esCodigo ? clave.trim().length >= 9 : clave.trim().length >= 4

  async function identificar() {
    if (!lista) return
    setEnviando(true); setError(null)
    try {
      const id = await identificarPersonal(sb, clave.trim())
      onCambio(id, clave.trim())
      setAbierto(false); setClave('')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally { setEnviando(false) }
  }

  function tecla(d: string) {
    setClave((c) => (c + d).slice(0, 8)); setError(null)
  }

  // Aplicado: cabe en media fila. Lo que de verdad hay que ver al cobrar
  // es el nombre y cuánto le queda; el desglose por grupo ya se vio al
  // teclear la clave y repetirlo aquí solo empuja el teclado de efectivo
  // fuera de la pantalla.
  if (valor) {
    const restante = Math.max(valor.tope - valor.usado_importe, 0)
    return (
      <div className="flex-1 min-w-[45%]">
        <div className="px-3 py-2.5 rounded-sa border-2 border-sa-mint bg-sa-mint/15 flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="font-body text-sm text-sa-green-ink leading-tight block truncate">
              {valor.nombre}
            </span>
            <span
              className={`font-mono text-[10px] block leading-none mt-0.5 ${
                valor.motivo ? 'text-sa-strawberry' : 'text-sa-green-ink/60'
              }`}
            >
              {valor.motivo ?? `Le quedan ${mxn(restante)}`}
            </span>
          </span>
          <button
            onClick={() => { onCambio(null, null); setError(null) }}
            className="font-mono text-[10px] uppercase tracking-wide text-sa-strawberry underline flex-shrink-0"
          >
            Quitar
          </button>
        </div>
      </div>
    )
  }

  function cerrar() {
    setAbierto(false); setClave(''); setError(null)
  }

  // El botón se queda siempre en su media fila. La clave se teclea en una
  // ventana ENCIMA de la pantalla, no dentro: abierta en la página, el pad
  // empujaba el total y los botones de cobro hacia abajo y la pantalla
  // brincaba (lo reportó la tienda: «que no se mueva nada»).
  return (
    <div className="flex-1 min-w-[45%]">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full px-3 py-2.5 rounded-sa border border-sa-green-ink/15 bg-white text-sa-green-ink hover:border-sa-mint active:scale-95 transition-all text-left"
      >
        <span className="font-body text-sm leading-tight">👤 Es para personal</span>
      </button>
      {abierto && (
        <div
          className="fixed inset-0 z-50 bg-sa-green-deep/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !enviando) cerrar() }}
        >
        <div className="w-full max-w-sm p-5 rounded-sa-lg bg-sa-cream-paper shadow-2xl">
          <p className="font-display text-2xl text-sa-green-ink text-center mb-3">Precio de personal</p>
          {error && (
            <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-3 py-2 mb-3">
              <p className="text-sm text-sa-strawberry leading-snug">{error}</p>
            </div>
          )}
          {/* Tapada, como un PIN: la clave es personal y la pantalla la ve la fila.
              `inputMode="none"` para que Windows no abra su teclado encima del
              nuestro; un teclado físico sigue funcionando. */}
          <input
            value={clave}
            onChange={(e) => {
              // Dígitos sueltos = clave del pad. Con letras = el código del
              // lector: se deja tal cual (mayúsculas, sin espacios).
              const v = e.target.value
              setClave(/[A-Za-z]/.test(v) ? v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 13) : v.replace(/\D/g, '').slice(0, 8))
              setError(null)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void identificar() }}
            type="password"
            inputMode="none"
            autoComplete="off"
            autoFocus
            placeholder="Su clave o escanea su código"
            className="w-full px-4 py-3 rounded-sa border-2 border-sa-green-ink/10 bg-white font-mono text-2xl text-center tracking-widest"
          />
          {/* El kiosko no tiene teclado: sin este pad la clave no se podía
              escribir. Solo existe con «Es para personal» abierto, para no
              estorbar en los cobros de siempre. */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => tecla(d)}
                disabled={enviando}
                className="h-16 rounded-sa bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setClave((c) => c.slice(0, -1)); setError(null) }}
              disabled={enviando || clave.length === 0}
              className="h-16 rounded-sa border border-sa-green-ink/20 text-sa-green-ink font-mono text-xs uppercase tracking-wide disabled:opacity-40"
            >
              ⌫ Borrar
            </button>
            <button
              type="button"
              onClick={() => tecla('0')}
              disabled={enviando}
              className="h-16 rounded-sa bg-sa-green-deep text-sa-cream active:scale-95 transition-all font-display text-2xl disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => void identificar()}
              disabled={enviando || !lista}
              className="h-16 rounded-sa bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40"
            >
              {enviando ? 'Viendo…' : 'Aplicar'}
            </button>
          </div>
          <button
            type="button"
            onClick={cerrar}
            disabled={enviando}
            className="w-full mt-2 py-2 font-mono text-xs uppercase tracking-wide text-sa-green-ink/60"
          >
            Cancelar
          </button>
        </div>
        </div>
      )}
    </div>
  )
}
