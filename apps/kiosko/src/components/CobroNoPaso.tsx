import { mxn } from '@shake/utils'

/**
 * La pantalla de "no se cobró", a tamaño de que nadie la pueda no ver.
 *
 * Antes esto era un renglón de texto rojo de 14 px al fondo de una página
 * que hay que bajar para leer. Con fila esperando, eso no lo ve nadie: la
 * bebida sale, el cliente se va, y el faltante aparece en el corte de la
 * noche sin que nadie sepa de dónde salió.
 *
 * **Hay dos situaciones y no son la misma**, aunque hoy se vieran igual:
 *
 * - `rechazado` — la terminal dijo que no. Se sabe con certeza que **no se
 *   cobró**. Se vuelve a intentar y ya.
 * - `incierto` — la terminal no contestó en dos minutos. **No se sabe.**
 *   Puede que sí haya cobrado. Volver a cobrar aquí es cobrarle dos veces
 *   al cliente, y eso es mucho peor que hacerlo esperar diez segundos.
 *
 * Por eso el segundo caso es ámbar y no rojo, dice explícitamente qué
 * revisar, y su botón principal es *esperar*, no *reintentar*. Un aviso
 * que empuja a la acción equivocada es peor que no avisar.
 */
export function CobroNoPaso({
  tipo, monto, detalle, onReintentar, onOtroMetodo, onCerrar,
}: {
  tipo: 'rechazado' | 'incierto'
  monto: number
  /** Lo que dijo la terminal, si dijo algo útil. */
  detalle?: string | null
  /**
   * Reintentar el mismo cobro en la terminal. Va en `null` cuando NO se
   * puede de un toque: en un cobro mixto, al fallar se soltó el efectivo
   * apuntado, así que reintentar le mandaría el total entero a la tarjeta
   * en vez de su parte. Ahí hay que volver a partirlo a mano.
   */
  onReintentar: (() => void) | null
  onOtroMetodo: () => void
  onCerrar: () => void
}) {
  const rechazado = tipo === 'rechazado'

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center px-8 text-center ${
        rechazado ? 'bg-sa-strawberry' : 'bg-sa-coffee'
      }`}
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-xl w-full">
        <p className="font-mono text-sm uppercase tracking-[0.35em] text-white/70">
          {rechazado ? 'La tarjeta no pasó' : 'La terminal no contestó'}
        </p>

        <p className="font-display text-white leading-[0.95] mt-4 text-[clamp(3rem,11vw,7rem)]">
          {rechazado ? 'NO SE COBRÓ' : '¿SE COBRÓ?'}
        </p>

        <p className="font-display text-white/90 text-4xl mt-3">{mxn(monto)}</p>

        <div className="bg-black/25 rounded-sa-lg px-6 py-5 mt-8 text-left">
          {rechazado ? (
            <p className="font-body text-white text-xl leading-snug">
              El cobro <strong>no se hizo</strong>. No entregues el pedido.
              Vuelve a intentarlo o cóbralo por otro método.
            </p>
          ) : (
            <>
              <p className="font-body text-white text-xl leading-snug">
                <strong>No sabemos si el banco cobró.</strong> Antes de volver
                a cobrar, mira la pantalla de la terminal.
              </p>
              <p className="font-body text-white/85 text-lg leading-snug mt-3">
                Si la terminal dice aprobado, <strong>no cobres otra vez</strong>:
                la venta se confirma sola en unos segundos y el pedido sale.
                Si dice cancelado o no dice nada, ya puedes reintentar.
              </p>
            </>
          )}
          {detalle && (
            <p className="font-mono text-xs text-white/60 mt-4 leading-relaxed">{detalle}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 mt-8">
          {rechazado && onReintentar ? (
            <>
              <button
                onClick={onReintentar}
                className="w-full bg-white text-sa-green-ink py-5 rounded-sa-lg font-display text-2xl"
              >
                Volver a intentar en la terminal
              </button>
              <button
                onClick={onOtroMetodo}
                className="w-full border-2 border-white/50 text-white py-4 rounded-sa-lg font-display text-xl"
              >
                Cobrar por otro método
              </button>
            </>
          ) : rechazado ? (
            <button
              onClick={onOtroMetodo}
              className="w-full bg-white text-sa-green-ink py-5 rounded-sa-lg font-display text-2xl"
            >
              Volver a cobrar este pedido
            </button>
          ) : (
            <>
              {/* El principal es esperar, a proposito: si la terminal si
                  cobro, la venta se confirma sola y reintentar seria
                  cobrarle dos veces al cliente. */}
              <button
                onClick={onCerrar}
                className="w-full bg-white text-sa-green-ink py-5 rounded-sa-lg font-display text-2xl"
              >
                Ya revisé la terminal
              </button>
              <button
                onClick={onOtroMetodo}
                className="w-full border-2 border-white/50 text-white py-4 rounded-sa-lg font-display text-xl"
              >
                La terminal no cobró · cobrar de otra forma
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
