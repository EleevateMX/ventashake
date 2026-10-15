/**
 * Costeos dentro de Admin (15/10/26, pedido de gerencia).
 *
 * Es la misma app de siempre (`costos.shakeaholic.mx`, un solo HTML con su
 * propio login), mostrada aquí en un marco: no es una copia. Copiarla a
 * React serían dos Costeos que se separan solos — la lección de kiosko y
 * POS —, y Costeos es la fuente de la verdad del catálogo.
 *
 * Costeos solo deja que Admin lo muestre adentro (`frame-ancestors` en
 * `apps/costos/_headers`). Para trabajo largo, la pestaña aparte da toda la
 * pantalla; la sesión es la misma en las dos.
 */
const URL_COSTEOS = 'https://costos.shakeaholic.mx'

export default function Costeos() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="font-display text-3xl text-sa-green-ink leading-none">Costeos</h1>
          <p className="text-sm text-sa-green-ink/60 mt-1">
            Costos, recetas e inventario. Entra con tu usuario de Costeos.
          </p>
        </div>
        <a
          href={URL_COSTEOS}
          target="_blank"
          rel="noopener"
          className="px-4 py-2.5 rounded-sa-lg bg-sa-green text-sa-cream text-sm font-semibold hover:brightness-110"
        >
          Abrir en pestaña aparte ↗
        </a>
      </div>
      <iframe
        src={URL_COSTEOS}
        title="Costeos"
        className="flex-1 w-full min-h-[480px] rounded-sa-lg border border-sa-green-ink/10 bg-white"
      />
    </div>
  )
}
