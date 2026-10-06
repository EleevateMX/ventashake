import milo from '@shake/brand/milo.png'
import { useEffect, useState } from 'react'
import { mxn } from '@shake/utils'
import { useEstado, TITULO_PEDIDO } from './Estado'
import { usePersonal, type MiPersonal, type PanelEnVivo, type EnTurno, type EnCocina, type Impresora } from './Personal'
import { Hoja, Etiqueta, Boton, Sheet, PantallaBlanca, Cifra, tacto } from './ui'
import QR from './QR'

/** El teclado para entrar con PIN. Es el mismo PIN del kiosko. */
export function EntrarPersonal({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const personal = usePersonal()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function entrar() {
    setTrabajando(true)
    const e = await personal.entrar(pin)
    setTrabajando(false)
    setPin('')
    setError(e)
    if (!e) alCerrar()
  }

  return (
    <Sheet abierta={abierta} alCerrar={alCerrar}>
      <form onSubmit={(e) => { e.preventDefault(); void entrar() }} className="flex flex-col items-center gap-5 pt-6 pb-4 text-center">
        <h2 className="font-display text-[28px] text-sa-cream">Modo personal</h2>
        <p className="text-sm text-sa-cream/70 max-w-[300px]">Tu PIN de la caja. La sesión dura mientras la app esté abierta.</p>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          type="password" inputMode="numeric" autoComplete="one-time-code" placeholder="PIN"
          className="w-[220px] rounded-2xl bg-sa-cream-paper text-sa-green-ink font-mono text-[28px] font-medium text-center py-3.5 outline-none tracking-[0.3em]"
        />
        {error && <p className="text-sm font-medium text-sa-strawberry">{error}</p>}
        <div className="w-full px-4">
          <Boton type="submit" disabled={trabajando || pin.length < 4}>{trabajando ? 'Entrando…' : 'Entrar'}</Boton>
        </div>
      </form>
    </Sheet>
  )
}

/** La pestaña: abierta, el panel; cerrada, la puerta con PIN. */
export function PersonalTab() {
  const personal = usePersonal()
  return personal.activo ? <PersonalView /> : <PersonalBloqueado />
}

/** La puerta para quien ya sabemos que es del equipo (su correo está registrado). */
function PersonalBloqueado() {
  const { soyPersonal } = useEstado()
  const [pidiendoPin, setPidiendoPin] = useState(false)
  return (
    <div className="flex flex-col items-center text-center gap-4 pt-10">
      <img src={milo} alt="" className="w-[120px]" />
      <div>
        <h2 className="font-display text-[28px] text-sa-cream">Hola, {soyPersonal?.nombre ?? 'equipo'}</h2>
        {soyPersonal?.rol && <Etiqueta texto={soyPersonal.rol} className="mt-1" />}
        <p className="text-[15px] text-sa-cream/70 mt-2">Tu modo personal está cerrado. Ábrelo cuando lo necesites.</p>
      </div>
      <div className="w-full pt-6">
        <Boton onClick={() => setPidiendoPin(true)}>Entrar con mi PIN</Boton>
        <p className="text-xs text-sa-cream/50 mt-3">En la web la sesión no se guarda: se pide el PIN cada vez.</p>
      </div>
      <EntrarPersonal abierta={pidiendoPin} alCerrar={() => setPidiendoPin(false)} />
    </div>
  )
}

/**
 * La pestaña «Personal»: cómo va la tienda ahora. Gerencia ve además las
 * ventas y puede recargar las pantallas; el cajero ve caja, pedidos en
 * preparación e impresoras. Cobrar sigue siendo en la barra.
 */
export function PersonalView() {
  const personal = usePersonal()
  const [aviso, setAviso] = useState<string | null>(null)
  const [hace, setHace] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => void personal.refrescar(), 15000)
    return () => window.clearInterval(t)
  }, [personal.refrescar]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setInterval(() => setHace(personal.actualizado ? Math.max(0, Math.round((Date.now() - personal.actualizado) / 1000)) : 0), 1000)
    return () => window.clearInterval(t)
  }, [personal.actualizado])

  const corte = personal.panel?.corte ?? personal.turno?.corte
  return (
    <>
      <div className="pt-2 pb-3">
        <h1 className="font-display text-[34px] leading-none text-sa-cream">Personal</h1>
        <div className="flex items-center gap-2 mt-2">
          <span className="font-semibold text-sa-cream">{personal.nombre ?? '—'}</span>
          <Etiqueta texto={personal.esJefe ? 'Gerencia' : (personal.turno?.yo?.rol ?? 'Personal')} />
          <button onClick={() => { void personal.refrescar(); void personal.cargarMi() }} className="ml-auto font-mono text-[10px] uppercase tracking-wider text-sa-cream/50">Actualizar</button>
        </div>
        {personal.actualizado && <p className="font-mono text-[11px] text-sa-cream/50 mt-1">actualizado hace {hace} s</p>}
      </div>
      {personal.error && <p className="text-sm font-medium text-sa-strawberry mb-3">{personal.error}</p>}
      {personal.esJefe && personal.panel && <Ventas panel={personal.panel} />}
      <Beneficio />
      <PedidosAppPersonal />
      <Hoja titulo="Caja">
        {corte
          ? <>
              <p className="text-[15px] font-medium">Abierta desde las {corte.desde ?? '—'}{corte.abrio ? ` por ${corte.abrio}` : ''}</p>
              {personal.esJefe && corte.fondo != null && <p className="font-mono text-[13px] text-sa-green-ink/60">Fondo {mxn(corte.fondo)}</p>}
            </>
          : <p className="text-[15px] font-medium text-sa-strawberry">Cerrada. Se abre desde el kiosko → «Caja y turno».</p>}
      </Hoja>
      <EnPreparacion pedidos={personal.panel?.en_cocina ?? personal.turno?.en_cocina ?? []} />
      <Impresoras lista={personal.panel?.impresoras ?? personal.turno?.impresoras ?? []} atoradas={personal.panel?.impresion_atorada ?? personal.turno?.impresion_atorada ?? 0} />
      {personal.esJefe && (
        <>
          <Hoja titulo="Actualizar pantallas">
            <p className="text-[13px] text-sa-green-ink/65">Espera a que la pantalla esté libre: no corta una venta ni un corte a medias.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {[['kiosko', 'Kiosko'], ['barra', 'Barra'], ['cocina', 'Cocina'], ['pantalla', 'TV de folios']].map(([clave, nombre]) => (
                <button key={clave} onClick={() => void personal.recargar(clave).then(setAviso)} className="rounded-[14px] bg-sa-banana text-sa-green-ink font-semibold text-[15px] py-3 active:scale-95 transition-transform">{nombre}</button>
              ))}
            </div>
            {aviso && <p className="text-sm font-medium text-sa-green">{aviso}</p>}
          </Hoja>
          {(personal.panel?.pedidos_recientes?.length ?? 0) > 0 && (
            <Hoja titulo="Últimos cobros">
              {personal.panel!.pedidos_recientes!.map((p) => (
                <div key={p.folio}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-medium">#{p.folio}</span>
                    <span className="font-mono text-xs text-sa-green-ink/50">{p.hora ?? ''}</span>
                    <span className="flex-1" />
                    <span className="font-mono text-sm">{mxn(p.total)}</span>
                  </div>
                  {p.items && <p className="text-xs text-sa-green-ink/60 line-clamp-2">{p.items}</p>}
                </div>
              ))}
            </Hoja>
          )}
        </>
      )}
      <Boton tono="tinta" onClick={() => void personal.salir()} className="mt-1">Salir del modo personal</Boton>
    </>
  )
}

function Ventas({ panel }: { panel: PanelEnVivo }) {
  const metodos = Object.entries(panel.por_metodo ?? {}).sort((a, b) => b[1] - a[1])
  return (
    <Hoja titulo="Hoy">
      <div className="flex gap-5">
        <Cifra valor={mxn(panel.dia?.total)} pie="vendido" />
        <Cifra valor={String(panel.dia?.ordenes ?? 0)} pie="órdenes" />
        <Cifra valor={mxn(panel.dia?.ticket)} pie="ticket" />
      </div>
      {panel.turno && <p className="text-[13px] text-sa-green-ink/65">Este turno: {mxn(panel.turno.total)} en {panel.turno.ordenes ?? 0} órdenes</p>}
      {metodos.length > 0 && (
        <div className="border-t border-sa-green-ink/10 pt-2 space-y-1">
          {metodos.map(([m, v]) => (
            <div key={m} className="flex justify-between text-sm"><span className="capitalize">{m}</span><span className="font-mono">{mxn(v)}</span></div>
          ))}
        </div>
      )}
    </Hoja>
  )
}

function EnPreparacion({ pedidos }: { pedidos: EnCocina[] }) {
  return (
    <Hoja titulo="En preparación">
      {pedidos.length === 0 && <p className="text-sm text-sa-green-ink/60">Nada pendiente.</p>}
      {pedidos.map((p) => (
        <div key={`${p.folio}-${p.estacion}`} className="flex items-center gap-2">
          <span className="font-mono text-[15px] font-medium">#{p.folio}</span>
          <span className="text-sm truncate flex-1">{p.nombre ?? ''}</span>
          <span className="text-xs text-sa-green-ink/60">{p.estacion}</span>
          <span className={`font-mono text-[13px] font-medium ${p.minutos >= 10 ? 'text-sa-strawberry' : 'text-sa-green'}`}>{Math.round(p.minutos)} min</span>
        </div>
      ))}
    </Hoja>
  )
}

function Impresoras({ lista, atoradas }: { lista: Impresora[]; atoradas: number }) {
  return (
    <Hoja titulo="Impresoras">
      {lista.map((i) => (
        <div key={i.nombre} className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${i.en_linea ? 'bg-sa-mint' : 'bg-sa-strawberry'}`} />
          <span className="text-sm flex-1">{i.nombre}</span>
          <span className={`font-mono text-xs ${i.en_linea ? 'text-sa-green' : 'text-sa-strawberry'}`}>{i.en_linea ? 'en línea' : 'sin señal'}</span>
        </div>
      ))}
      {atoradas > 0 && <p className="text-[13px] font-medium text-sa-strawberry">{atoradas} comanda{atoradas === 1 ? '' : 's'} esperando más de 90 s: revisa la ventana del agente en la PC.</p>}
    </Hoja>
  )
}

/** «Mi beneficio»: lo que llevo hoy, lo que me queda, el código para la caja y los precios. Los números salen del servidor. */
function Beneficio() {
  const personal = usePersonal()
  const [mostrandoCodigo, setMostrandoCodigo] = useState(false)
  const [verPrecios, setVerPrecios] = useState(false)
  const mi = personal.mi

  return (
    <Hoja titulo="Mi beneficio">
      {mi ? (
        <>
          {!mi.beneficio ? (
            <p className="text-sm font-medium text-sa-green-ink/75">{mi.motivo ?? 'Tu beneficio todavía no está activo.'}</p>
          ) : (
            <>
              <div className="flex gap-2.5">
                {mi.grupos.map((g) => (
                  <div key={g.slug} className="flex-1 min-w-0">
                    <p className={`font-mono text-lg font-medium leading-none ${g.usado >= g.max ? 'text-sa-strawberry' : 'text-sa-green'}`}>{g.usado}/{g.max}</p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-sa-green-ink/50 truncate mt-0.5">{g.nombre}</p>
                  </div>
                ))}
              </div>
              <Tope mi={mi} />
              {mi.motivo && <p className="text-[13px] font-medium text-sa-strawberry">{mi.motivo}</p>}
              <Boton onClick={() => setMostrandoCodigo(true)}>Mostrar mi código en la caja</Boton>
              {mi.hoy.length > 0 && (
                <div className="border-t border-sa-green-ink/10 pt-2 space-y-1">
                  {mi.hoy.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 min-w-0 truncate">{c.cantidad} × {c.producto}</span>
                      <span className="font-mono text-xs text-sa-green-ink/50">{c.hora ?? ''}</span>
                      <span className="font-mono text-[13px]">{mxn(c.importe)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {mi.precios.length > 0 && (
            <div>
              <button onClick={() => setVerPrecios((v) => !v)} className="w-full flex items-center justify-between text-sa-green font-semibold text-[15px]">
                <span>Precios de personal</span><span className="font-mono">{verPrecios ? '−' : '+'}</span>
              </button>
              {verPrecios && <Precios mi={mi} />}
            </div>
          )}
        </>
      ) : personal.miError ? (
        <p className="text-sm font-medium text-sa-strawberry">{personal.miError}</p>
      ) : (
        <span className="block w-6 h-6 rounded-full border-2 border-sa-green border-t-transparent animate-spin" />
      )}
      {mostrandoCodigo && <CodigoParaCaja alCerrar={() => { setMostrandoCodigo(false); void personal.cargarMi() }} />}
    </Hoja>
  )
}

function Tope({ mi }: { mi: MiPersonal }) {
  const usado = mi.usado_importe ?? 0, tope = mi.tope ?? 0
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Hoy llevas {mxn(usado)} de {mxn(tope)}</span>
        <span className="font-mono text-xs text-sa-green-ink/60">quedan {mxn(Math.max(tope - usado, 0))}</span>
      </div>
      <div className="h-2.5 rounded-full bg-sa-cream-warm overflow-hidden mt-1.5">
        <div className={`h-full rounded-full ${usado >= tope ? 'bg-sa-strawberry' : 'bg-sa-green'}`} style={{ width: `${tope > 0 ? Math.min(usado / tope, 1) * 100 : 0}%` }} />
      </div>
    </div>
  )
}

function Precios({ mi }: { mi: MiPersonal }) {
  const porCat = new Map<string, MiPersonal['precios']>()
  for (const p of mi.precios) { const k = p.categoria ?? 'Otros'; if (!porCat.has(k)) porCat.set(k, []); porCat.get(k)!.push(p) }
  return (
    <div className="space-y-1 mt-2">
      {[...porCat.keys()].sort().map((cat) => (
        <div key={cat}>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sa-green-ink/50 pt-2 pb-1">{cat}</p>
          {porCat.get(cat)!.map((p) => (
            <div key={p.nombre} className="flex items-center gap-2 text-sm py-0.5">
              <span className="flex-1 min-w-0 truncate">{p.nombre}</span>
              <span className="font-mono text-xs line-through text-sa-green-ink/40">{mxn(p.precio)}</span>
              <span className="font-mono text-sm font-medium text-sa-green">{mxn(p.precio_personal)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** El QR para la caja, grande y sobre blanco. Se renueva solo al vencer. */
function CodigoParaCaja({ alCerrar }: { alCerrar: () => void }) {
  const personal = usePersonal()
  const [error, setError] = useState<string | null>(null)
  const [segundos, setSegundos] = useState(0)

  useEffect(() => {
    if (!personal.codigo || (personal.codigoVence ?? 0) < Date.now()) void personal.pedirCodigo().then(setError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = personal.codigoVence ? Math.floor((personal.codigoVence - Date.now()) / 1000) : 0
      setSegundos(s)
      if (personal.codigo && s <= 0) void personal.pedirCodigo().then(setError)
    }, 1000)
    return () => window.clearInterval(t)
  }, [personal.codigo, personal.codigoVence, personal.pedirCodigo]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PantallaBlanca alCerrar={alCerrar}>
      <p className="font-display text-[26px]">Escanéalo en caja</p>
      <p className="text-sm text-sa-green-ink/60 -mt-3">Es para personal → escanear</p>
      {personal.codigo ? (
        <>
          <QR value={personal.codigo} size={Math.min(300, Math.round(window.innerWidth * 0.72))} />
          <p className="font-mono text-xl font-medium">{personal.codigo}</p>
          <p className="font-mono text-[13px] text-sa-green-ink/60">{segundos > 0 ? `Vale ${segundos} s · un solo uso` : 'Renovando…'}</p>
        </>
      ) : error ? (
        <>
          <p className="text-[15px] font-medium text-sa-strawberry text-center px-6">{error}</p>
          <button onClick={() => void personal.pedirCodigo().then(setError)} className="rounded-sa-lg bg-sa-banana text-sa-green-ink font-display text-lg px-8 py-3">Intentar otra vez</button>
        </>
      ) : (
        <span className="w-7 h-7 rounded-full border-2 border-sa-green border-t-transparent animate-spin" />
      )}
    </PantallaBlanca>
  )
}

/** Lo de hoy para el personal: qué pedidos de la app hay y en qué van. */
function PedidosAppPersonal() {
  const personal = usePersonal()
  if (personal.pedidosApp.length === 0) return null
  return (
    <Hoja titulo="Pedidos por la app">
      {personal.pedidosApp.map((p) => (
        <div key={p.id} className="space-y-0.5 py-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold flex-1 min-w-0 truncate">#{p.folio} · {p.nombre ?? 'cliente'}</span>
            {p.preparar_a && <span className="font-mono text-xs text-sa-green-ink/50">{p.preparar_a}</span>}
          </div>
          {p.items && <p className="text-[13px] text-sa-green-ink/70">{p.items}</p>}
          {p.nota && <p className="text-[13px] text-sa-green-ink/70">«{p.nota}»</p>}
          <div className="flex items-center justify-between">
            <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${p.estado === 'listo' ? 'text-sa-green' : 'text-sa-green-ink/55'}`}>{TITULO_PEDIDO[p.estado] ?? p.estado}</span>
            {p.estado === 'listo' && <button onClick={() => { tacto.ligero(); void personal.entregar(p.id) }} className="text-[13px] font-semibold text-sa-green">Entregado</button>}
          </div>
        </div>
      ))}
    </Hoja>
  )
}

export type { EnTurno }
