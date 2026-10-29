import { useEffect, useRef, useState } from 'react'
import { identificarCliente, type ClienteConLealtad } from '@shake/supabase'
import { esCodigoCliente, mancuernasPorCompra, mensajeDeError, normalizarCodigoEscaneado } from '@shake/utils'
import { sb } from '@/lib/sb'
import { ModalCliente } from '@/components/ModalCliente'

/**
 * «¿Suma mancuernas?» antes de cobrar (29/10/26, pedido de gerencia).
 *
 * Hasta hoy la única forma de ligar al cliente era un botón en el carrito,
 * y casi nadie lo tocaba. Aquí la pregunta aparece sola en la pantalla de
 * cobro, como UNA franja delgada encima de los botones de pago: no tapa
 * nada ni hay que contestarla para cobrar.
 *
 * Mientras la franja está a la vista, el kiosko escucha al lector de QR:
 * el lector es un teclado que escribe `SHK-…` muy rápido y termina en
 * Enter, así que el cliente escanea y queda identificado sin que el cajero
 * toque nada. Si el lector escribió dentro de otro campo (el nombre del
 * pedido), `onCodigoEscrito` le avisa a la pantalla para quitarlo de ahí.
 *
 * «No» la esconde solo para esta venta.
 */

/** Más lento que esto entre tecla y tecla es una persona, no el lector. */
const MS_ENTRE_TECLAS = 60

export function PreguntaRewards({
  total, cliente, onCliente, onCodigoEscrito,
}: {
  /** Lo que se va a cobrar, para decir cuántas mancuernas suma. */
  total: number
  cliente: { nombre: string; mancuernas?: number | null } | null
  onCliente: (c: ClienteConLealtad | null) => void
  /** Lo que el lector tecleó, por si cayó dentro de un campo de texto. */
  onCodigoEscrito?: (texto: string) => void
}) {
  const [cerrada, setCerrada] = useState(false)
  const [modal, setModal] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const buffer = useRef({ texto: '', ultima: 0 })
  const suma = mancuernasPorCompra(total)
  const escuchando = !cliente && !cerrada && !modal

  useEffect(() => {
    if (!escuchando) return
    async function buscar(crudo: string) {
      setBuscando(true); setAviso(null)
      try {
        const c = await identificarCliente(sb, crudo)
        if (c) onCliente(c)
        else setAviso('Ese código no está registrado.')
      } catch (e) {
        setAviso(mensajeDeError(e))
      } finally {
        setBuscando(false)
      }
    }
    function tecla(e: KeyboardEvent) {
      const ahora = performance.now()
      const b = buffer.current
      if (ahora - b.ultima > MS_ENTRE_TECLAS) b.texto = ''
      b.ultima = ahora
      if (e.key === 'Enter') {
        const crudo = b.texto
        b.texto = ''
        if (crudo.length >= 6 && esCodigoCliente(normalizarCodigoEscaneado(crudo))) {
          e.preventDefault()
          e.stopPropagation()
          onCodigoEscrito?.(crudo)
          void buscar(crudo)
        }
        return
      }
      if (e.key.length === 1) b.texto += e.key
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [escuchando, onCliente, onCodigoEscrito])

  if (cliente) {
    return (
      <div className="flex items-center gap-3 rounded-sa border border-sa-green/25 bg-sa-mint/15 px-4 py-2.5">
        <span className="text-lg">🏋️</span>
        <p className="flex-1 min-w-0 text-sm text-sa-green-ink truncate">
          <b>{cliente.nombre.split(' ')[0]}</b> suma <b>{suma}</b> mancuerna{suma === 1 ? '' : 's'}
          <span className="text-sa-green-ink/50"> · tiene {cliente.mancuernas ?? 0}</span>
        </p>
        <button onClick={() => onCliente(null)}
          className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 underline underline-offset-4 shrink-0">
          Quitar
        </button>
      </div>
    )
  }

  if (cerrada) return null

  return (
    <>
      <div className="flex items-center gap-2 rounded-sa border border-dashed border-sa-green-ink/25 px-4 py-2.5">
        <span className="text-lg">🏋️</span>
        <p className="flex-1 min-w-0 text-sm text-sa-green-ink leading-tight">
          {buscando ? 'Buscando…' : <>¿Suma mancuernas? <span className="text-sa-green-ink/55">Escanea su QR</span></>}
          {aviso && <span className="block text-xs text-sa-strawberry">{aviso}</span>}
        </p>
        <button onClick={() => setModal(true)}
          className="px-3 py-1.5 rounded-full border border-sa-green-ink/20 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink shrink-0">
          Teléfono
        </button>
        <button onClick={() => setCerrada(true)}
          className="px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 shrink-0">
          No
        </button>
      </div>
      {modal && (
        <ModalCliente
          onCerrar={() => setModal(false)}
          onElegir={(c) => { onCliente(c); setModal(false) }}
        />
      )}
    </>
  )
}
