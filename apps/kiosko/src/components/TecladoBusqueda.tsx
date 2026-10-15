/**
 * Teclado táctil para los buscadores de «Caja y turno» (15/10/26).
 *
 * La pantalla de la barra es táctil y no tiene teclado: Perla mandó video
 * tocando el buscador de «Abrir un bote para la barra» sin poder escribir.
 * Mismo criterio que `TecladoNombre` (no depende del teclado de Windows,
 * escribe directo al estado), pero para buscar: minúsculas, con números
 * («960», «2 kg») y sin acentos — la búsqueda los ignora.
 */

const FILAS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

const TECLA =
  'flex-1 basis-0 max-w-11 py-3 rounded-lg bg-white border-2 border-sa-green-ink/10 ' +
  'font-body text-lg text-sa-green-ink active:scale-95 active:bg-sa-cream transition-all'

interface Props {
  valor: string
  onCambio: (nuevo: string) => void
  onListo: () => void
  maxLargo?: number
}

export function TecladoBusqueda({ valor, onCambio, onListo, maxLargo = 30 }: Props) {
  const teclear = (t: string) => {
    if (valor.length < maxLargo) onCambio(valor + t)
  }
  const espacio = () => {
    if (valor.length > 0 && !valor.endsWith(' ') && valor.length < maxLargo) onCambio(valor + ' ')
  }

  return (
    <div className="w-full mt-2 select-none touch-manipulation" aria-label="Teclado en pantalla">
      {FILAS.map((fila) => (
        <div key={fila[0]} className="flex justify-center gap-1 mb-1">
          {fila.map((t) => (
            <button key={t} type="button" onClick={() => teclear(t)} className={TECLA}>
              {t}
            </button>
          ))}
          {fila[0] === 'z' && (
            <button
              type="button"
              onClick={() => onCambio(valor.slice(0, -1))}
              disabled={valor.length === 0}
              aria-label="Borrar letra"
              className={`${TECLA} max-w-16 bg-sa-cream-warm disabled:opacity-30`}
            >
              ⌫
            </button>
          )}
        </div>
      ))}
      <div className="flex justify-center gap-1">
        <button
          type="button"
          onClick={() => onCambio('')}
          disabled={valor.length === 0}
          className="px-3 py-3 rounded-lg border-2 border-sa-green-ink/10 font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/60 disabled:opacity-30"
        >
          Borrar todo
        </button>
        <button
          type="button"
          onClick={espacio}
          className="flex-1 max-w-48 py-3 rounded-lg bg-white border-2 border-sa-green-ink/10 font-mono text-[10px] uppercase tracking-[0.25em] text-sa-green-ink/60 active:scale-95"
        >
          Espacio
        </button>
        <button
          type="button"
          onClick={onListo}
          className="px-4 py-3 rounded-lg bg-sa-green text-sa-cream font-mono text-[10px] uppercase tracking-wider"
        >
          Listo
        </button>
      </div>
    </div>
  )
}

/** Para comparar sin acentos ni mayúsculas: el teclado no trae acentos. */
export function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
