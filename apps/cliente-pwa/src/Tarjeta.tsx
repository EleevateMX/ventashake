import milo from '@shake/brand/milo.png'
import { useEffect, useState } from 'react'
import { canjearTarjeta, type ResumenLealtad } from '@shake/supabase'
import { mxn } from '@shake/utils'
import { sb } from './lib/sb'
import { amable } from './lib/rpc'
import { activarPush, permisoPush, pushDisponible } from './lib/push'
import { alCambiarInstalable, estaInstalada, instalar, sePuedeInstalar } from './lib/instalar'
import { enlaceDePago, abrirPago, esperarPago } from './lib/pedidos'
import { useEstado, TITULO_PEDIDO, pedidoVivo } from './Estado'
import { Metas } from './Metas'
import { AliadosFila } from './Aliados'
import { Hoja, Etiqueta, Boton, PantallaBlanca, Titulo, tacto } from './ui'
import { IconoCampana, IconoDescarga } from './Iconos'
import QR from './QR'

type Cliente = NonNullable<ResumenLealtad['cliente']>

/** La pestaña «Tarjeta»: el pase, el premio que sigue, cupones, metas, aliados. */
export function TarjetaTab() {
  const { resumen, sincronizar, cargarMisPedidos } = useEstado()
  const [qrGrande, setQrGrande] = useState<string | null>(null)
  const c = resumen?.cliente
  if (!c) return null

  const refrescar = () => { void sincronizar(); void cargarMisPedidos() }

  return (
    <>
      <Titulo texto="Tu tarjeta">
        <button onClick={refrescar} className="font-mono text-[10px] uppercase tracking-wider text-sa-cream/50 pb-1.5">Actualizar</button>
      </Titulo>
      <MisPedidos />
      <Pase cliente={c} alTocarQR={() => c.codigo && setQrGrande(c.codigo)} />
      <Instalar />
      <Avisos />
      {resumen?.progreso && resumen.progreso.meta > 0 && <Progreso p={resumen.progreso} />}
      {(resumen?.sorpresa ?? []).map((s) => (
        <Hoja key={s.tipo}>
          <Etiqueta texto={s.nombre} className="!text-sa-green" />
          <p className="text-base font-medium">{s.texto}</p>
        </Hoja>
      ))}
      <Cupones cupones={resumen?.cupones ?? []} alAmpliar={setQrGrande} />
      <Metas alGanar={refrescar} />
      <AliadosFila />
      <TarjetaRegalo alRecargar={refrescar} />
      <Recargas paquetes={resumen?.paquetes ?? []} />
      {qrGrande && (
        <PantallaBlanca alCerrar={() => setQrGrande(null)}>
          <p className="font-display text-2xl">Muéstralo en caja</p>
          <QR value={qrGrande} size={Math.min(300, Math.round(window.innerWidth * 0.72))} />
          <p className="font-mono text-xl tracking-[0.15em]">{qrGrande}</p>
        </PantallaBlanca>
      )}
    </>
  )
}

/** El pase con la anatomía de Apple Wallet: arriba la marca, al centro lo que vale, abajo el código. */
function Pase({ cliente, alTocarQR }: { cliente: Cliente; alTocarQR: () => void }) {
  return (
    <section className="rounded-[26px] p-5 mb-3 text-sa-cream bg-gradient-to-br from-sa-green to-sa-green-ink border border-sa-cream/15 shadow-sa">
      <div className="flex items-center justify-between">
        <p className="font-display text-[22px] text-sa-banana">Shakeaholic</p>
        <Etiqueta texto="Rewards" clara />
      </div>
      <div className="mt-4">
        <Etiqueta texto="Mancuernas" clara className="!text-sa-cream/60" />
        <p className="font-display text-[52px] leading-none mt-1">{Math.round(cliente.total_canjeable ?? cliente.mancuernas ?? 0)}</p>
        <p className="font-mono text-sm text-sa-banana mt-1">Valen {mxn(cliente.vale_pesos)}</p>
      </div>
      {cliente.saldo > 0 && (
        <div className="flex gap-5 mt-3">
          <Dato valor={String(Math.round(cliente.mancuernas))} pie="ganadas" />
          <Dato valor={String(Math.round(cliente.saldo))} pie="recargadas" />
        </div>
      )}
      <div className="border-t border-sa-cream/20 my-4" />
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[17px] truncate">{cliente.nombre}</p>
          {cliente.codigo && <p className="font-mono text-[13px] text-sa-cream/70">{cliente.codigo}</p>}
        </div>
        {cliente.codigo && (
          <button onClick={alTocarQR} className="bg-white rounded-[10px] p-1.5 shrink-0 leading-none active:scale-95 transition-transform" aria-label="Agrandar el QR para la caja">
            <QR value={cliente.codigo} size={70} />
          </button>
        )}
      </div>
    </section>
  )
}

function Dato({ valor, pie }: { valor: string; pie: string }) {
  return (
    <div>
      <p className="font-mono text-lg font-medium leading-none">{valor}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-sa-cream/55 mt-0.5">{pie}</p>
    </div>
  )
}

function Progreso({ p }: { p: { meta: number; faltan: number; pct: number } }) {
  return (
    <Hoja>
      <div className="flex items-center justify-between">
        <Etiqueta texto="Tu próximo premio" className="!text-sa-green" />
        <span className="font-mono text-xs text-sa-green-ink/60">faltan {Math.round(p.faltan)}</span>
      </div>
      <div className="h-3 rounded-full bg-sa-cream-warm overflow-hidden">
        <div className="h-full rounded-full bg-sa-green transition-all" style={{ width: `${Math.min(100, Math.max(0, p.pct))}%` }} />
      </div>
    </Hoja>
  )
}

function Cupones({ cupones, alAmpliar }: { cupones: NonNullable<ResumenLealtad['cupones']>; alAmpliar: (c: string) => void }) {
  if (cupones.length === 0) return null
  return (
    <Hoja titulo="Tus cupones">
      {cupones.map((cu) => (
        <button key={cu.codigo} onClick={() => alAmpliar(cu.codigo)} className="w-full flex items-center gap-3.5 text-left active:scale-[0.99] transition-transform">
          <span className="bg-white rounded-lg p-1 shrink-0 leading-none"><QR value={cu.codigo} size={56} /></span>
          <span className="min-w-0">
            <span className="block font-semibold text-base leading-tight">{cu.beneficio}</span>
            <span className={`block font-mono text-xs mt-0.5 ${cu.dias_restantes <= 7 ? 'text-sa-strawberry' : 'text-sa-green-ink/60'}`}>
              {cu.dias_restantes <= 0 ? 'Vence hoy' : `Vence en ${cu.dias_restantes} día${cu.dias_restantes === 1 ? '' : 's'}`}
            </span>
          </span>
        </button>
      ))}
    </Hoja>
  )
}

function Recargas({ paquetes }: { paquetes: NonNullable<ResumenLealtad['paquetes']> }) {
  if (paquetes.length === 0) return null
  return (
    <Hoja titulo="Recargas en caja">
      <p className="text-sm text-sa-green-ink/65">Pídelas en la barra. Lo que recargas no caduca.</p>
      {paquetes.map((p) => (
        <div key={p.nombre} className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium">{p.nombre}</p>
          <p className="font-mono text-sm text-sa-green">vale {mxn(p.vale)}</p>
        </div>
      ))}
    </Hoja>
  )
}

/** Canjear una tarjeta de regalo física: el plástico es el vehículo, no el monedero. */
function TarjetaRegalo({ alRecargar }: { alRecargar: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function canjear() {
    setTrabajando(true)
    setMensaje(null)
    try {
      const r = await canjearTarjeta(sb, codigo)
      setMensaje(`Se cargaron ${r.cargadas.toLocaleString('es-MX')} mancuernas a tu cuenta.`)
      setCodigo('')
      tacto.exito()
      alRecargar()
    } catch (e) {
      tacto.error()
      setMensaje(amable(e))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Hoja>
      <button onClick={() => setAbierta((v) => !v)} className="w-full flex items-center justify-between text-sa-green">
        <span className="font-semibold text-base">¿Tienes una tarjeta de regalo?</span>
        <span className="font-mono">{abierta ? '−' : '+'}</span>
      </button>
      {abierta && (
        <>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            placeholder="SHKG-XXXXXXXX"
            className="w-full rounded-xl bg-white border border-sa-green-ink/10 px-3 py-3 font-mono text-lg tracking-wider uppercase outline-none"
          />
          <Boton onClick={() => void canjear()} disabled={trabajando || codigo.trim().length < 6}>
            {trabajando ? 'Cargando…' : 'Cargar a mi cuenta'}
          </Boton>
          {mensaje && <p className="text-sm font-medium text-sa-green">{mensaje}</p>}
        </>
      )}
    </Hoja>
  )
}

/**
 * Instalar la app en el teléfono. En Android, Chrome lo ofrece con un
 * botón; en iPhone es «Compartir → Agregar a inicio». Ya instalada, no sale.
 */
function Instalar() {
  const [, repintar] = useState(0)
  useEffect(() => alCambiarInstalable(() => repintar((n) => n + 1)), [])
  const [abierto, setAbierto] = useState(false)
  if (estaInstalada()) return null
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <Hoja>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 rounded-full bg-sa-green text-sa-cream flex items-center justify-center"><IconoDescarga className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base leading-tight">Instala la app en tu celular</p>
          <p className="text-xs text-sa-green-ink/60 mt-0.5">Tu tarjeta a un toque, con su ícono y sin barra del navegador.</p>
        </div>
      </div>
      {sePuedeInstalar() ? (
        <Boton tono="verde" onClick={() => void instalar()}>Instalar</Boton>
      ) : (
        <>
          <button onClick={() => setAbierto((v) => !v)} className="text-sm font-semibold text-sa-green">{abierto ? 'Ocultar' : '¿Cómo se instala?'}</button>
          {abierto && (
            <p className="text-sm text-sa-green-ink/75 leading-snug">
              {esIOS
                ? <>En Safari toca <b>Compartir</b> (el cuadrito con la flecha) y elige <b>Agregar a inicio</b>.</>
                : <>En Chrome abre el menú <b>⋮</b> y elige <b>Instalar aplicación</b> o <b>Agregar a pantalla de inicio</b>.</>}
            </p>
          )}
        </>
      )}
    </Hoja>
  )
}

/** Pedir permiso de avisos desde un botón, no al abrir: con contexto, la gente dice que sí. */
function Avisos() {
  const [permiso, setPermiso] = useState(permisoPush())
  const [oculto, setOculto] = useState(() => { try { return localStorage.getItem('avisos.ahora_no') === '1' } catch { return false } })
  if (!pushDisponible() || permiso !== 'default' || oculto) return null
  // En iPhone los avisos web solo existen con la app instalada en inicio.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !estaInstalada()) return null

  async function activar() {
    const p = await activarPush(sb)
    setPermiso(p)
    if (p === 'granted') tacto.exito()
  }
  function ahoraNo() {
    try { localStorage.setItem('avisos.ahora_no', '1') } catch { /* sin almacenamiento */ }
    setOculto(true)
  }

  return (
    <Hoja>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 rounded-full bg-sa-banana text-sa-green-ink flex items-center justify-center"><IconoCampana className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base leading-tight">¿Te avisamos cuando lleguen tus mancuernas?</p>
          <p className="text-xs text-sa-green-ink/60 mt-0.5">También las promos del día y cuando tu pedido esté listo.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Boton tono="verde" onClick={() => void activar()} className="!py-3 !text-lg">Activar avisos</Boton>
        <button onClick={ahoraNo} className="shrink-0 px-4 rounded-sa-lg font-mono text-xs uppercase tracking-wide text-sa-green-ink/55">Ahora no</button>
      </div>
    </Hoja>
  )
}

/**
 * «Tu pedido» arriba de la tarjeta mientras haya uno vivo. Si quedó sin
 * pagar, desde aquí se retoma el pago del MISMO pedido: no se crea otro.
 */
export function MisPedidos() {
  const { misPedidos, cargarMisPedidos, sincronizar } = useEstado()
  const [pagando, setPagando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const vivos = misPedidos.filter(pedidoVivo)
  if (vivos.length === 0) return null

  async function pagar(id: string) {
    setAviso(null)
    setPagando(id)
    try {
      const r = await enlaceDePago(id)
      if (r.pagado) { await cargarMisPedidos(); setPagando(null); return }
      if (r.url) abrirPago(r.url)
      const e = await esperarPago(id).promesa
      if (e === 'pagado') { tacto.exito(); await cargarMisPedidos(); await sincronizar() }
      else setAviso('Todavía no vemos el pago. Si ya pagaste, dale un momento y toca Actualizar.')
    } catch (e) {
      setAviso(amable(e))
    } finally {
      setPagando(null)
    }
  }

  return (
    <>
      {vivos.map((p) => (
        <Hoja key={p.id}>
          <div className="flex items-center justify-between">
            <Etiqueta texto={`Tu pedido #${p.folio}`} className="!text-sa-green" />
            {p.preparar_a && <span className="font-mono text-xs text-sa-green-ink/60">para las {p.preparar_a}</span>}
          </div>
          <p className={`font-display text-[22px] leading-tight ${p.estado === 'listo' ? 'text-sa-green' : ''}`}>{TITULO_PEDIDO[p.estado] ?? p.estado}</p>
          {p.items && <p className="text-sm text-sa-green-ink/70">{p.items}</p>}
          {p.estado === 'por_pagar' && (
            <>
              <Boton onClick={() => void pagar(p.id)} disabled={pagando !== null}>
                {pagando === p.id ? 'Esperando el pago…' : `Pagar ahora · ${mxn(p.total)}`}
              </Boton>
              <p className="text-xs text-sa-green-ink/55">Sin pago en 20 minutos, caduca solo.</p>
              {aviso && <p className="text-sm font-medium text-sa-strawberry">{aviso}</p>}
            </>
          )}
        </Hoja>
      ))}
    </>
  )
}

/** Milo, para los huecos vacíos. */
export function MiloVacio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="text-center py-10">
      <img src={milo} alt="" className="h-24 mx-auto opacity-70" />
      <p className="font-display text-xl text-sa-cream mt-3">{titulo}</p>
      <p className="text-sm text-sa-cream/60 mt-1 max-w-[260px] mx-auto">{texto}</p>
    </div>
  )
}
