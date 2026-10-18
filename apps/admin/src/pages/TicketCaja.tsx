import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { sb } from '../lib/sb'
import {
  configTicket, guardarConfigTicket, logosTicket, guardarLogoTicket, activarLogoTicket, borrarLogoTicket,
  type ConfigTicket, type LogoTicket,
} from '@shake/supabase'
import { mensajeDeError, anchoLogo, rgbaAUnBit, puntoNegro, bytesABase64, base64ABytes } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, Field, cx } from '../ui'

/**
 * El ticket de la impresora de caja (18/10/26): los datos del negocio, los
 * mensajes del pie, el WiFi, Rewards y el Milo de arriba.
 *
 * Lo imprime el agente de caja (`agente-caja/`), que lee esta configuración
 * cada minuto: lo que se guarda aquí sale en el siguiente ticket sin tocar la
 * PC. La vista previa es aproximada (la misma idea de renglones de 48
 * letras que usa el agente); la prueba de verdad es imprimir uno.
 */

const COLUMNAS = 48

type Borrador = Partial<ConfigTicket>

export default function TicketCaja() {
  const [cfg, setCfg] = useState<ConfigTicket | null>(null)
  const [borrador, setBorrador] = useState<Borrador>({})
  const [logos, setLogos] = useState<LogoTicket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    try {
      const [c, l] = await Promise.all([configTicket(sb), logosTicket(sb)])
      setCfg(c)
      setLogos(l)
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  const vista: ConfigTicket | null = cfg ? { ...cfg, ...borrador } : null
  const cambios = Object.keys(borrador).filter((k) => (borrador as Record<string, unknown>)[k] !== (cfg as unknown as Record<string, unknown> | null)?.[k])
  const logoActivo = logos?.find((l) => l.id === vista?.logo_id) ?? null

  function poner<K extends keyof ConfigTicket>(k: K, v: ConfigTicket[K]) {
    setOk(null)
    setBorrador((b) => ({ ...b, [k]: v }))
  }

  async function guardar() {
    if (!cfg) return
    setGuardando(true)
    setError(null)
    try {
      const solo: Record<string, unknown> = {}
      for (const k of cambios) solo[k] = (borrador as Record<string, unknown>)[k] ?? ''
      setCfg(await guardarConfigTicket(sb, solo as Partial<ConfigTicket>))
      setBorrador({})
      setOk('Guardado. Sale así en el siguiente ticket (el agente lo lee en menos de un minuto).')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(false)
    }
  }

  if (!cfg && !error) return <Loading>Cargando el ticket…</Loading>

  return (
    <div>
      <PageHeader
        title="Ticket de caja"
        subtitle="Lo que imprime la impresora de tickets: datos del negocio, mensajes y el Milo de arriba."
        action={
          <button className={cx.btnPrimary} disabled={guardando || cambios.length === 0} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : cambios.length ? `Guardar ${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'}` : 'Sin cambios'}
          </button>
        }
      />
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {vista && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
          <div className="space-y-6 min-w-0">
            <Panel title="El Milo de arriba">
              <SeccionLogo
                logos={logos ?? []}
                activoId={vista.logo_id}
                logoPrendido={vista.logo_activo}
                onPrender={async (v) => {
                  try { setCfg(await guardarConfigTicket(sb, { logo_activo: v })); setOk(v ? 'El logo vuelve a salir.' : 'El ticket sale sin logo.') } catch (e) { setError(mensajeDeError(e)) }
                }}
                onCambio={async (msg) => { await cargar(); setOk(msg) }}
                onError={(m) => setError(m)}
              />
            </Panel>

            <Panel title="Datos del negocio">
              <div className="grid gap-4 sm:grid-cols-2">
                <Texto label="Nombre (va arriba, centrado)" v={vista.nombre_negocio} on={(v) => poner('nombre_negocio', v)} max={40} />
                <Texto label="Sucursal" v={vista.linea_sucursal} on={(v) => poner('linea_sucursal', v)} max={48} />
                <Texto label="Dirección" v={vista.direccion} on={(v) => poner('direccion', v)} max={120} ancho />
                <Texto label="Teléfono" v={vista.telefono} on={(v) => poner('telefono', v)} max={30} />
                <Texto label="RFC (vacío = no sale)" v={vista.rfc} on={(v) => poner('rfc', v)} max={13} />
              </div>
            </Panel>

            <Panel title="Pie del ticket">
              <div className="grid gap-4 sm:grid-cols-2">
                <Texto label="Mensaje" v={vista.mensaje_pie} on={(v) => poner('mensaje_pie', v)} max={48} />
                <Texto label="Redes" v={vista.redes} on={(v) => poner('redes', v)} max={48} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
                <Casilla v={vista.mostrar_cajero} on={(v) => poner('mostrar_cajero', v)}>Quién cobró</Casilla>
                <Casilla v={vista.mostrar_iva} on={(v) => poner('mostrar_iva', v)}>Desglose de IVA</Casilla>
                <Casilla v={vista.mostrar_mancuernas} on={(v) => poner('mostrar_mancuernas', v)}>Mancuernas ganadas</Casilla>
              </div>
            </Panel>

            <Panel title="Rewards (QR para bajar la app)">
              <Casilla v={vista.rewards_activo} on={(v) => poner('rewards_activo', v)}>Imprimir la sección de Rewards</Casilla>
              {vista.rewards_activo && (
                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <Texto label="Título" v={vista.rewards_titulo} on={(v) => poner('rewards_titulo', v)} max={48} />
                  <Texto label="Mensaje" v={vista.rewards_mensaje} on={(v) => poner('rewards_mensaje', v)} max={96} />
                  <Texto label="Enlace iPhone (App Store)" v={vista.rewards_url_ios} on={(v) => poner('rewards_url_ios', v)} max={200} ancho />
                  <Texto label="Enlace Android / web" v={vista.rewards_url_android} on={(v) => poner('rewards_url_android', v)} max={200} ancho />
                </div>
              )}
            </Panel>

            <Panel title="WiFi para clientes (QR para conectarse)">
              <Casilla v={vista.wifi_activo} on={(v) => poner('wifi_activo', v)}>Imprimir el QR del WiFi</Casilla>
              {vista.wifi_activo && (
                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <Texto label="Título" v={vista.wifi_titulo} on={(v) => poner('wifi_titulo', v)} max={48} />
                  <Texto label="Mensaje" v={vista.wifi_mensaje} on={(v) => poner('wifi_mensaje', v)} max={96} />
                  <Texto label="Nombre de la red" v={vista.wifi_ssid} on={(v) => poner('wifi_ssid', v)} max={32} />
                  <Field label="Seguridad">
                    <select className={cx.input} value={vista.wifi_seguridad} onChange={(e) => poner('wifi_seguridad', e.target.value)}>
                      <option value="WPA">Con contraseña (WPA)</option>
                      <option value="nopass">Sin contraseña</option>
                      <option value="WEP">WEP (vieja)</option>
                    </select>
                  </Field>
                  {vista.wifi_seguridad !== 'nopass' && (
                    <Texto label="Contraseña (va dentro del QR)" v={vista.wifi_password} on={(v) => poner('wifi_password', v)} max={63} />
                  )}
                  <Casilla v={vista.wifi_oculta} on={(v) => poner('wifi_oculta', v)}>La red está oculta</Casilla>
                </div>
              )}
            </Panel>

            <Panel title="Cuándo imprime solo">
              <p className="text-sm text-sa-green-ink/65 mb-3">
                Apagado, el ticket solo sale cuando alguien toca «Imprimir ticket» en el kiosko.
              </p>
              <div className="flex flex-col gap-2">
                <Casilla v={vista.imprimir_ticket_auto} on={(v) => poner('imprimir_ticket_auto', v)}>Imprimir ticket en cada cobro</Casilla>
                <Casilla v={vista.imprimir_corte_auto} on={(v) => poner('imprimir_corte_auto', v)}>Imprimir el corte al cerrar caja</Casilla>
              </div>
              <div className="mt-4" />
              <Field label="Copias de cada ticket">
                <select className={`${cx.input} !w-24`} value={vista.copias} onChange={(e) => poner('copias', Number(e.target.value))}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            </Panel>
          </div>

          <div className="lg:sticky lg:top-4">
            <p className={`${cx.label} mb-2`}>Así se ve (aproximado)</p>
            <VistaTicket cfg={vista} logo={vista.logo_activo ? logoActivo : null} />
            {cambios.length > 0 && (
              <p className="text-xs text-sa-coffee mt-2">Hay cambios sin guardar: la vista ya los enseña.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Texto({ label, v, on, max, ancho }: { label: string; v: string | null; on: (v: string) => void; max: number; ancho?: boolean }) {
  return (
    <div className={ancho ? 'sm:col-span-2' : ''}>
      <Field label={label}>
        <input className={cx.input} value={v ?? ''} maxLength={max} onChange={(e) => on(e.target.value)} />
      </Field>
    </div>
  )
}

function Casilla({ v, on, children }: { v: boolean; on: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-sa-green-ink cursor-pointer">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} className="w-4 h-4" />
      {children}
    </label>
  )
}

// ── El logo ──────────────────────────────────────────────────────────────

/** Pinta un raster de 1 bit en un canvas, como saldría en papel. */
function LienzoRaster({ datos, ancho, alto, className }: { datos: Uint8Array; ancho: number; alto: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = ancho
    c.height = alto
    const ctx = c.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(ancho, alto)
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const v = puntoNegro(datos, ancho, x, y) ? 20 : 255
        const i = (y * ancho + x) * 4
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [datos, ancho, alto])
  return <canvas ref={ref} className={className} style={{ imageRendering: 'pixelated' }} />
}

function SeccionLogo({ logos, activoId, logoPrendido, onPrender, onCambio, onError }: {
  logos: LogoTicket[]
  activoId: string | null
  logoPrendido: boolean
  onPrender: (v: boolean) => Promise<void>
  onCambio: (msg: string) => Promise<void>
  onError: (m: string) => void
}) {
  const [nuevo, setNuevo] = useState<{ img: HTMLImageElement; original: string; nombre: string } | null>(null)
  const [ancho, setAncho] = useState(256)
  const [umbral, setUmbral] = useState(170)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // La imagen nueva convertida a 1 bit con el ancho y el umbral elegidos.
  const raster = useMemo(() => {
    if (!nuevo) return null
    const w = anchoLogo(ancho)
    const h = Math.max(1, Math.round((nuevo.img.naturalHeight / nuevo.img.naturalWidth) * w))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(nuevo.img, 0, 0, w, h)
    const datos = rgbaAUnBit(ctx.getImageData(0, 0, w, h).data, w, h, umbral)
    return { datos, ancho: w, alto: h }
  }, [nuevo, ancho, umbral])

  function elegirArchivo(f: File) {
    const lector = new FileReader()
    lector.onload = () => {
      const url = String(lector.result)
      const img = new Image()
      img.onload = () => {
        // Se guarda una copia chica del original para volver a ajustarla,
        // no la foto de 4 MB que venga del teléfono.
        const lado = Math.min(800, img.naturalWidth)
        const c = document.createElement('canvas')
        c.width = lado
        c.height = Math.round((img.naturalHeight / img.naturalWidth) * lado)
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
        const original = c.toDataURL('image/png')
        const chica = new Image()
        chica.onload = () => {
          setNuevo({ img: chica, original, nombre: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Milo' })
          setAncho(Math.min(256, anchoLogo(chica.naturalWidth)))
          setUmbral(170)
        }
        chica.src = original
      }
      img.onerror = () => onError('No se pudo abrir esa imagen. Usa PNG o JPG.')
      img.src = url
    }
    lector.readAsDataURL(f)
  }

  async function guardarNuevo() {
    if (!nuevo || !raster) return
    setOcupado('nuevo')
    try {
      await guardarLogoTicket(sb, {
        nombre: nuevo.nombre.trim() || 'Milo', bitmap: bytesABase64(raster.datos),
        ancho: raster.ancho, alto: raster.alto, original: nuevo.original, umbral, activar: true,
      })
      setNuevo(null)
      await onCambio('Logo guardado y puesto en el ticket.')
    } catch (e) {
      onError(mensajeDeError(e))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-sa-green-ink">
          <input type="checkbox" className="w-4 h-4" checked={logoPrendido} onChange={(e) => void onPrender(e.target.checked)} />
          Imprimir el logo arriba del ticket
        </label>
        <label className={`${cx.btnSec} cursor-pointer`}>
          + Subir otro Milo
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) elegirArchivo(f) }} />
        </label>
      </div>

      {nuevo && raster && (
        <div className="rounded-sa border border-sa-banana bg-sa-banana/10 p-4 space-y-4">
          <p className="text-sm text-sa-green-ink font-medium">Así sale en papel (blanco y negro, sin grises):</p>
          <div className="bg-white rounded-sa p-3 flex justify-center border border-sa-green-ink/10 overflow-x-auto">
            <LienzoRaster datos={raster.datos} ancho={raster.ancho} alto={raster.alto} className="max-w-full h-auto" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nombre">
              <input className={cx.input} value={nuevo.nombre} maxLength={60} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            </Field>
            <Field label={`Ancho: ${raster.ancho} puntos (${Math.round((raster.ancho / 576) * 72)} mm)`}>
              <input type="range" min={96} max={576} step={8} value={ancho} onChange={(e) => setAncho(Number(e.target.value))} />
            </Field>
            <Field label={`Qué tan oscuro: ${umbral}`}>
              <input type="range" min={60} max={240} step={5} value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} />
            </Field>
          </div>
          <p className="text-xs text-sa-green-ink/60">
            Si sale muy negro, baja «qué tan oscuro»; si se pierden las líneas, súbelo. Lo transparente sale en blanco.
            Más alto = más papel: un Milo de {raster.alto} puntos ocupa unos {Math.round(raster.alto / 8)} mm.
          </p>
          <div className="flex gap-2">
            <button className={cx.btnPrimary} disabled={ocupado === 'nuevo'} onClick={() => void guardarNuevo()}>
              {ocupado === 'nuevo' ? 'Guardando…' : 'Guardar y ponerlo en el ticket'}
            </button>
            <button className={cx.btnSec} onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {logos.length === 0 && !nuevo && <p className={`${cx.muted} text-sm`}>No hay logos. Sube un PNG del Milo (mejor con fondo transparente).</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {logos.map((l) => {
          const activo = l.id === activoId
          return (
            <div key={l.id} className={`rounded-sa border p-3 flex flex-col gap-2 ${activo ? 'border-sa-green ring-2 ring-sa-green/30' : 'border-sa-green-ink/10'}`}>
              <div className="bg-white h-32 flex items-center justify-center overflow-hidden">
                <LienzoRaster datos={base64ABytes(l.bitmap)} ancho={l.ancho} alto={l.alto} className="max-h-32 max-w-full w-auto" />
              </div>
              <p className="text-sm font-medium text-sa-green-ink truncate">{l.nombre}</p>
              <p className="font-mono text-[11px] text-sa-green-ink/50">{l.ancho}×{l.alto} puntos</p>
              <div className="flex gap-2 mt-auto">
                {activo ? (
                  <span className="text-xs font-semibold text-sa-green px-2 py-1.5">✓ En el ticket</span>
                ) : (
                  <button className={`${cx.btnSec} !px-3 !py-1.5 text-xs`} disabled={!!ocupado}
                    onClick={async () => {
                      setOcupado(l.id)
                      try { await activarLogoTicket(sb, l.id); await onCambio(`Ahora sale «${l.nombre}».`) } catch (e) { onError(mensajeDeError(e)) } finally { setOcupado(null) }
                    }}>
                    Usar este
                  </button>
                )}
                <button className="text-xs text-sa-strawberry underline ml-auto" disabled={!!ocupado}
                  onClick={async () => {
                    if (!window.confirm(`¿Borrar «${l.nombre}»?${activo ? ' Es el que sale ahora: el ticket quedará sin logo.' : ''}`)) return
                    setOcupado(l.id)
                    try { await borrarLogoTicket(sb, l.id); await onCambio('Logo borrado.') } catch (e) { onError(mensajeDeError(e)) } finally { setOcupado(null) }
                  }}>
                  Borrar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Vista previa ─────────────────────────────────────────────────────────

function centrar(s: string): string {
  if (s.length >= COLUMNAS) return s.slice(0, COLUMNAS)
  return ' '.repeat(Math.floor((COLUMNAS - s.length) / 2)) + s
}
function parear(a: string, b: string): string {
  const hueco = COLUMNAS - a.length - b.length
  return hueco >= 1 ? a + ' '.repeat(hueco) + b : a.slice(0, COLUMNAS - b.length - 1) + ' ' + b
}
function envolver(t: string): string[] {
  const out: string[] = []
  let l = ''
  for (const p of t.split(/\s+/)) {
    if (!l) l = p
    else if ((l + ' ' + p).length <= COLUMNAS) l += ' ' + p
    else { out.push(l); l = p }
  }
  if (l) out.push(l)
  return out
}

/** Mismo orden que `armarTicket` del agente, con una venta de ejemplo. */
function VistaTicket({ cfg, logo }: { cfg: ConfigTicket; logo: LogoTicket | null }) {
  const L: (string | { qr: string })[] = []
  L.push(centrar(cfg.nombre_negocio || ''))
  if (cfg.linea_sucursal) L.push(centrar(cfg.linea_sucursal))
  if (cfg.direccion) for (const l of envolver(cfg.direccion)) L.push(centrar(l))
  if (cfg.telefono) L.push(centrar(`Tel. ${cfg.telefono}`))
  if (cfg.rfc) L.push(centrar(`RFC: ${cfg.rfc}`))
  L.push('')
  L.push(parear('Folio: 9840', cfg.mostrar_cajero ? 'Caja: Andrés' : ''))
  L.push('18/10/2026, 07:15 p.m.')
  L.push('='.repeat(COLUMNAS))
  L.push(parear('CANT DESCRIPCION', 'IMPORTE'))
  L.push('-'.repeat(COLUMNAS))
  L.push(parear('1    El Clásico', '$69.00'))
  L.push(parear('   + Proteína ISO 100 - Churro', '$0.00'))
  L.push(parear('1    Cookie - Macadamia', '$35.00'))
  L.push('-'.repeat(COLUMNAS))
  if (cfg.mostrar_iva) {
    L.push(parear('Subtotal', '$89.66'))
    L.push(parear('IVA (16%)', '$14.34'))
  }
  L.push(parear('T O T A L', '$104.00'))
  L.push('')
  L.push(parear('EFECTIVO', '$104.00'))
  if (cfg.mostrar_mancuernas) { L.push(''); L.push('-'.repeat(COLUMNAS)); L.push(centrar('GANASTE 7 MANCUERNAS')) }
  if (cfg.wifi_activo && cfg.wifi_ssid) {
    L.push(''); L.push('-'.repeat(COLUMNAS))
    if (cfg.wifi_titulo) L.push(centrar(cfg.wifi_titulo))
    if (cfg.wifi_mensaje) for (const l of envolver(cfg.wifi_mensaje)) L.push(centrar(l))
    L.push({ qr: 'WiFi' })
    L.push(centrar(`Red: ${cfg.wifi_ssid}`))
  }
  if (cfg.rewards_activo) {
    L.push(''); L.push('-'.repeat(COLUMNAS))
    if (cfg.rewards_titulo) L.push(centrar(cfg.rewards_titulo))
    if (cfg.rewards_mensaje) for (const l of envolver(cfg.rewards_mensaje)) L.push(centrar(l))
    const ios = cfg.rewards_url_ios?.trim()
    const and = cfg.rewards_url_android?.trim()
    if (ios && and && ios === and) L.push({ qr: 'Rewards' })
    else {
      if (ios) { L.push(centrar('iPhone / iOS')); L.push({ qr: 'Rewards iOS' }) }
      if (and) { L.push(centrar('Android (PWA)')); L.push({ qr: 'Rewards Android' }) }
    }
  }
  L.push('')
  if (cfg.mensaje_pie) L.push(centrar(cfg.mensaje_pie))
  if (cfg.redes) L.push(centrar(cfg.redes))

  return (
    <div className="bg-white shadow-sa-sm border border-sa-green-ink/10 mx-auto px-3 py-5 overflow-hidden" style={{ width: 340 }}>
      {logo && (
        <div className="flex justify-center mb-2">
          <LienzoRaster datos={base64ABytes(logo.bitmap)} ancho={logo.ancho} alto={logo.alto}
            className="h-auto" />
        </div>
      )}
      <pre className="font-mono text-black leading-[1.35] whitespace-pre w-fit mx-auto" style={{ fontSize: 6.6 }}>
        {L.map((x, i) =>
          typeof x === 'string' ? (
            <span key={i}>{x + '\n'}</span>
          ) : (
            <span key={i} className="flex justify-center my-1">
              <span className="inline-flex items-center justify-center w-16 h-16 border-2 border-black text-[7px] font-sans font-semibold">QR {x.qr}</span>
            </span>
          ),
        )}
      </pre>
    </div>
  )
}
