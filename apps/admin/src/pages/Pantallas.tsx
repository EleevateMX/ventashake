import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import {
  pantallasTvAdmin, guardarPantallaTv, reengancharPantallaTv, guardarImagenTv, subirImagenTv,
  nuevaLlavePantallasTv,
  type PantallasTvAdmin, type PantallaTv, type ImagenTv, type ContenidoTv,
} from '@shake/supabase'
import { mensajeDeError, hoyEnMerida } from '@shake/utils'
import { PageHeader, Loading, ErrorMsg, OkMsg, Panel, Field, Chip, cx } from '../ui'

/**
 * Las TVs de la tienda (18/10/26). Gerencia ve qué transmite cada una y le
 * cambia el contenido con un clic, sin el control.
 *
 * Quien pone la imagen en la TV es el EMPUJADOR, un programa de la PC de la
 * tienda que habla DLNA con cada TV (las Hisense con VIDAA no dejan hacer
 * más por red). Esta pantalla no habla con las TVs: asigna, y lee lo que el
 * empujador reporta. Por eso «qué transmite» lleva su sello de hace cuánto:
 * un reporte de hace una hora no dice lo que hay ahorita.
 *
 * «Pedidos» es distinto: es el navegador de la TV abierto a mano en
 * pantalla.shakeaholic.mx. Esa página late por su cuenta y aquí se cuenta
 * cuántas hay abiertas.
 */

const REFRESCO_MS = 10_000
/** Un reporte más viejo que esto ya no dice qué hay en la TV. */
const REPORTE_VIGENTE_SEG = 180

const CONTENIDOS: { id: ContenidoTv; label: string; detalle: string }[] = [
  { id: 'promos', label: 'Promos', detalle: 'Las imágenes de promociones, una tras otra' },
  { id: 'menu', label: 'Menú', detalle: 'Las imágenes del menú' },
  { id: 'pedidos', label: 'Pedidos listos', detalle: 'El navegador de la TV en pantalla.shakeaholic.mx (se abre a mano)' },
  { id: 'nada', label: 'Nada', detalle: 'El empujador no la toca' },
]
const NOMBRE_CONTENIDO: Record<ContenidoTv, string> = { promos: 'Promos', menu: 'Menú', pedidos: 'Pedidos listos', nada: 'Nada' }

function haceTxt(seg: number | null | undefined): string {
  if (seg == null) return 'nunca'
  if (seg < 60) return `hace ${seg} s`
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`
  return `hace ${Math.round(seg / 86400)} d`
}

/** Lo que hay que decir en grande en la tarjeta de cada TV. */
function transmite(t: PantallaTv, d: PantallasTvAdmin): { titulo: string; detalle: string; tono: string } {
  if (!t.activa) return { titulo: 'Apagada en Admin', detalle: 'El empujador no la toca', tono: 'bg-sa-cream-warm text-sa-green-ink/60' }
  if (t.contenido === 'pedidos') {
    const abiertas = d.pedidos.filter((p) => p.hace_seg < REPORTE_VIGENTE_SEG).length
    return abiertas > 0
      ? { titulo: 'Pedidos listos', detalle: `${abiertas} ${abiertas === 1 ? 'pantalla abierta' : 'pantallas abiertas'} en pantalla.shakeaholic.mx`, tono: 'bg-sa-mint/25 text-sa-green-ink' }
      : { titulo: 'Pedidos listos · no está abierta', detalle: 'Ninguna TV tiene pantalla.shakeaholic.mx abierto. Hay que abrirlo con el control.', tono: 'bg-sa-banana/40 text-sa-coffee' }
  }
  if (t.contenido === 'nada') return { titulo: 'Nada asignado', detalle: 'Muestra lo que alguien le haya puesto a mano', tono: 'bg-sa-cream-warm text-sa-green-ink/60' }
  if (!t.ip) return { titulo: 'Falta la IP', detalle: 'Sin IP el empujador no la encuentra', tono: 'bg-sa-banana/40 text-sa-coffee' }
  const r = t.reporte
  if (!r || t.hace_seg == null || t.hace_seg > REPORTE_VIGENTE_SEG) {
    return {
      titulo: 'Sin reporte del empujador',
      detalle: t.reportado_en ? `Último reporte ${haceTxt(t.hace_seg)}${r?.mostrando ? `: ${r.mostrando}` : ''}` : 'Todavía no ha reportado nada',
      tono: 'bg-sa-cream-warm text-sa-green-ink/70',
    }
  }
  switch (r.estado) {
    case 'mostrando':
      return { titulo: r.mostrando || NOMBRE_CONTENIDO[t.contenido], detalle: `${NOMBRE_CONTENIDO[t.contenido]} · ${haceTxt(t.hace_seg)}${r.transporte ? ` · ${r.transporte}` : ''}`, tono: 'bg-sa-mint/25 text-sa-green-ink' }
    case 'otra_entrada':
      return { titulo: 'Le cambiaron de entrada', detalle: `El empujador la va a regresar sola · ${haceTxt(t.hace_seg)}`, tono: 'bg-sa-banana/40 text-sa-coffee' }
    case 'sin_respuesta':
      return { titulo: 'No contesta', detalle: `¿Apagada o sin red? · ${haceTxt(t.hace_seg)}`, tono: 'bg-sa-strawberry/15 text-sa-strawberry' }
    default:
      return { titulo: 'Error', detalle: `${r.error || r.estado || 'sin detalle'} · ${haceTxt(t.hace_seg)}`, tono: 'bg-sa-strawberry/15 text-sa-strawberry' }
  }
}

function vigente(i: ImagenTv, hoy: string): boolean {
  return i.activa && (!i.desde || i.desde <= hoy) && (!i.hasta || i.hasta >= hoy)
}

export default function Pantallas() {
  const [d, setD] = useState<PantallasTvAdmin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [editando, setEditando] = useState<Partial<PantallaTv> | null>(null)
  const [llave, setLlave] = useState<string | null>(null)
  const [grupo, setGrupo] = useState<'promos' | 'menu'>('promos')
  const hoy = hoyEnMerida()

  const cargar = useCallback(async () => {
    try {
      setD(await pantallasTvAdmin(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }, [])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => { if (!document.hidden) void cargar() }, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  async function hacer(clave: string, fn: () => Promise<unknown>, mensaje?: string) {
    setOcupado(clave)
    setOk(null)
    try {
      await fn()
      if (mensaje) setOk(mensaje)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(null)
    }
  }

  const imagenes = useMemo(() => (d?.imagenes ?? []).filter((i) => i.grupo === grupo), [d, grupo])

  if (!d && !error) return <Loading>Cargando las pantallas…</Loading>

  const ag = d?.agente
  const agVivo = ag?.hace_seg != null && ag.hace_seg < 120

  return (
    <div>
      <PageHeader
        title="Pantallas"
        subtitle="Qué transmite cada TV de la tienda, y qué le toca. Se cambia aquí, sin el control."
        action={
          <button className={cx.btnPrimary} onClick={() => setEditando({ nombre: '', contenido: 'promos', segundos: 12 })}>
            + Agregar TV
          </button>
        }
      />

      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      {/* ── El empujador ─────────────────────────────────────────── */}
      <Panel className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${agVivo ? 'bg-sa-mint animate-pulse' : 'bg-sa-strawberry'}`} />
            <div>
              <p className="font-medium text-sa-green-ink">
                Empujador de la PC {agVivo ? '· en línea' : ag?.ultimo_latido ? '· sin señal' : '· no instalado'}
              </p>
              <p className="font-mono text-xs text-sa-green-ink/55 mt-0.5">
                {ag?.ultimo_latido ? `latió ${haceTxt(ag.hace_seg)}` : 'nunca ha latido'}
                {ag?.version ? ` · v${ag.version}` : ''}
                {ag?.agente_id ? ` · ${ag.agente_id}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={cx.btnSec}
              disabled={ocupado === 'todas'}
              onClick={() => void hacer('todas', () => reengancharPantallaTv(sb, null), 'Listo: el empujador vuelve a poner su contenido en todas.')}
            >
              Volver a poner todas
            </button>
            <button
              className={cx.btnSec}
              disabled={ocupado === 'llave'}
              onClick={() => {
                if (ag?.tiene_llave && !window.confirm('Ya hay una llave. Si generas otra, el empujador que use la anterior deja de funcionar hasta que le pongas la nueva. ¿Seguir?')) return
                void hacer('llave', async () => setLlave(await nuevaLlavePantallasTv(sb)))
              }}
            >
              {ag?.tiene_llave ? 'Generar llave nueva' : 'Generar llave del empujador'}
            </button>
          </div>
        </div>
        {llave && (
          <div className="mt-4 rounded-sa border border-sa-banana bg-sa-banana/20 p-4">
            <p className="text-sm text-sa-green-ink font-medium">Esta es la llave del empujador. Cópiala ahora: no se vuelve a ver.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="font-mono text-xs break-all bg-white px-3 py-2 rounded-sa border border-sa-green-ink/10 flex-1 min-w-0">{llave}</code>
              <button className={cx.btnSec} onClick={() => void navigator.clipboard?.writeText(llave).then(() => setOk('Llave copiada.'))}>Copiar</button>
              <button className={cx.btnSec} onClick={() => setLlave(null)}>Ya la guardé</button>
            </div>
            <p className="text-xs text-sa-green-ink/60 mt-2">Va en el archivo de configuración del empujador, en la PC de la tienda. No la mandes por chat.</p>
          </div>
        )}
        {ag?.llave_creada_en && !llave && (
          <p className="text-xs text-sa-green-ink/50 mt-3">
            Llave generada {new Date(ag.llave_creada_en).toLocaleDateString('es-MX', { timeZone: 'America/Merida', day: 'numeric', month: 'short' })}
            {ag.llave_creada_por ? ` por ${ag.llave_creada_por}` : ''}.
          </p>
        )}
      </Panel>

      {/* ── Las TVs ──────────────────────────────────────────────── */}
      {d && d.pantallas.length === 0 && (
        <Panel className="mb-6">
          <p className={cx.muted}>Todavía no hay TVs dadas de alta. «+ Agregar TV» con su nombre y su IP.</p>
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-8">
        {d?.pantallas.map((t) => {
          const tx = transmite(t, d)
          return (
            <div key={t.id} className={`${cx.panel} !p-5 flex flex-col gap-4 ${t.activa ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-medium text-sa-green-ink truncate">{t.nombre}</p>
                  <p className="font-mono text-xs text-sa-green-ink/50 mt-0.5 truncate">
                    {[t.ubicacion, t.ip ?? 'sin IP'].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button className="text-xs text-sa-green-ink/60 underline shrink-0" onClick={() => setEditando(t)}>Editar</button>
              </div>

              <div className={`rounded-sa px-4 py-3 ${tx.tono}`}>
                <p className="font-mono text-[10px] uppercase tracking-wide opacity-70">Transmite</p>
                <p className="font-medium mt-0.5 break-words">{tx.titulo}</p>
                <p className="text-xs mt-1 opacity-80">{tx.detalle}</p>
              </div>

              <div>
                <p className={`${cx.label} mb-1.5`}>Le toca</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {CONTENIDOS.map((c) => (
                    <button
                      key={c.id}
                      title={c.detalle}
                      disabled={ocupado === t.id}
                      onClick={() => {
                        if (c.id === t.contenido) return
                        void hacer(t.id, () => guardarPantallaTv(sb, { id: t.id, contenido: c.id }), `${t.nombre}: ahora le toca ${c.label}.`)
                      }}
                      className={`px-3 py-2 rounded-sa text-sm font-medium border transition-colors ${
                        c.id === t.contenido
                          ? 'bg-sa-green text-sa-cream border-sa-green'
                          : 'bg-white text-sa-green-ink border-sa-green-ink/15 hover:border-sa-green'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {t.activa && (t.contenido === 'promos' || t.contenido === 'menu') && (
                <button
                  className={`${cx.btnSec} !py-2`}
                  disabled={ocupado === `re-${t.id}`}
                  onClick={() => void hacer(`re-${t.id}`, () => reengancharPantallaTv(sb, t.id), `${t.nombre}: el empujador le vuelve a poner su contenido.`)}
                >
                  Volver a poner su contenido
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Pedidos listos ───────────────────────────────────────── */}
      <Panel title="Pedidos listos (navegador de la TV)" className="mb-8">
        <p className="text-sm text-sa-green-ink/70 leading-relaxed">
          Esta no la empuja nadie: en la TV, con el control, se abre el navegador en
          <code className="font-mono text-xs mx-1">pantalla.shakeaholic.mx</code>.
          Se actualiza sola y sin parpadeo. Si apagan la TV, hay que volver a abrirlo.
        </p>
        <div className="mt-3 space-y-2">
          {d?.pedidos.length === 0 && <p className={`${cx.muted} text-sm`}>Ninguna abierta en las últimas 12 horas.</p>}
          {d?.pedidos.map((p) => (
            <div key={p.pantalla} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-mono text-xs text-sa-green-ink/70">
                {p.pantalla}
                {p.estado?.ancho ? ` · ${p.estado.ancho}×${p.estado.alto}` : ''}
                {p.estado?.ua && /vidaa|hisense/i.test(p.estado.ua) ? ' · TV Hisense' : ''}
              </span>
              <Chip tone={p.hace_seg < REPORTE_VIGENTE_SEG ? 'si' : 'no'}>
                {p.hace_seg < REPORTE_VIGENTE_SEG ? 'abierta' : `cerrada · ${haceTxt(p.hace_seg)}`}
              </Chip>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Imágenes ─────────────────────────────────────────────── */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-1.5">
            {(['promos', 'menu'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGrupo(g)}
                className={`px-4 py-2 rounded-full text-sm font-medium ${grupo === g ? 'bg-sa-green text-sa-cream' : 'bg-sa-cream-soft text-sa-green-ink'}`}
              >
                Imágenes de {g === 'promos' ? 'promos' : 'menú'}
              </button>
            ))}
          </div>
          <label className={`${cx.btnPrimary} cursor-pointer ${ocupado === 'subir' ? 'opacity-50 pointer-events-none' : ''}`}>
            {ocupado === 'subir' ? 'Subiendo…' : '+ Subir imagen'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                void hacer('subir', async () => {
                  const { url, ruta } = await subirImagenTv(sb, f)
                  await guardarImagenTv(sb, { grupo, nombre: f.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Imagen', url, ruta })
                }, 'Imagen agregada. El empujador la toma en su siguiente vuelta.')
              }}
            />
          </label>
        </div>
        <p className="text-xs text-sa-green-ink/55 mb-4">
          Horizontales, 1920×1080, en PNG o JPG. Con fechas, solo sale en esos días (Halloween, Navidad).
          Sin segundos, usa los de cada TV.
        </p>

        {imagenes.length === 0 && <p className={`${cx.muted} text-sm`}>No hay imágenes todavía.</p>}
        <div className="space-y-3">
          {imagenes.map((i, idx) => (
            <FilaImagen
              key={i.id}
              i={i}
              vigenteHoy={vigente(i, hoy)}
              primera={idx === 0}
              ultima={idx === imagenes.length - 1}
              ocupado={ocupado === i.id}
              onGuardar={(cambio, msg) => void hacer(i.id, () => guardarImagenTv(sb, { id: i.id, ...cambio }), msg)}
              onMover={(dir) => {
                if (!imagenes[idx + dir]) return
                // Se renumera la lista entera: con dos imágenes del mismo orden,
                // intercambiar solo esas dos no movería nada.
                const nueva = [...imagenes]
                ;[nueva[idx], nueva[idx + dir]] = [nueva[idx + dir], nueva[idx]]
                void hacer(i.id, async () => {
                  for (const [n, img] of nueva.entries()) {
                    if (img.orden !== n + 1) await guardarImagenTv(sb, { id: img.id, orden: n + 1 })
                  }
                })
              }}
            />
          ))}
        </div>
      </Panel>

      {editando && (
        <EditarTv
          t={editando}
          onCerrar={() => setEditando(null)}
          onGuardar={async (p) => {
            await guardarPantallaTv(sb, p)
            setEditando(null)
            setOk(p.id ? 'Pantalla guardada.' : 'TV agregada.')
            await cargar()
          }}
        />
      )}
    </div>
  )
}

function FilaImagen({ i, vigenteHoy, primera, ultima, ocupado, onGuardar, onMover }: {
  i: ImagenTv
  vigenteHoy: boolean
  primera: boolean
  ultima: boolean
  ocupado: boolean
  onGuardar: (cambio: Partial<ImagenTv>, msg?: string) => void
  onMover: (dir: -1 | 1) => void
}) {
  const [nombre, setNombre] = useState(i.nombre)
  const [segundos, setSegundos] = useState(i.segundos?.toString() ?? '')
  const [desde, setDesde] = useState(i.desde ?? '')
  const [hasta, setHasta] = useState(i.hasta ?? '')
  const cambio = nombre !== i.nombre || segundos !== (i.segundos?.toString() ?? '') || desde !== (i.desde ?? '') || hasta !== (i.hasta ?? '')

  return (
    <div className={`flex flex-col sm:flex-row gap-4 rounded-sa border border-sa-green-ink/10 p-3 ${i.activa ? '' : 'opacity-60'}`}>
      <a href={i.url} target="_blank" rel="noreferrer" className="shrink-0">
        <img src={i.url} alt={i.nombre} className="w-full sm:w-44 aspect-video object-cover rounded-sa bg-sa-cream-soft" loading="lazy" />
      </a>
      <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-2">
        <Field label="Nombre">
          <input className={cx.input} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Segundos (vacío = los de la TV)">
          <input className={cx.input} inputMode="numeric" value={segundos} onChange={(e) => setSegundos(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Desde">
          <input type="date" className={cx.input} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <input type="date" className={cx.input} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
      </div>
      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
        <Chip tone={vigenteHoy ? 'si' : 'no'}>{vigenteHoy ? 'Sale hoy' : i.activa ? 'Fuera de fechas' : 'Apagada'}</Chip>
        <div className="flex gap-1">
          <button className="px-2 py-1 text-sm rounded border border-sa-green-ink/15 disabled:opacity-30" disabled={primera || ocupado} onClick={() => onMover(-1)} title="Antes">↑</button>
          <button className="px-2 py-1 text-sm rounded border border-sa-green-ink/15 disabled:opacity-30" disabled={ultima || ocupado} onClick={() => onMover(1)} title="Después">↓</button>
        </div>
        <div className="flex gap-2">
          {cambio && (
            <button
              className={`${cx.btnPrimary} !px-3 !py-1.5`}
              disabled={ocupado || !nombre.trim() || (segundos !== '' && (Number(segundos) < 3 || Number(segundos) > 600))}
              onClick={() => onGuardar({ nombre: nombre.trim(), segundos: segundos === '' ? null : Number(segundos), desde: desde || null, hasta: hasta || null }, 'Imagen guardada.')}
            >
              Guardar
            </button>
          )}
          <button className={`${cx.btnSec} !px-3 !py-1.5`} disabled={ocupado} onClick={() => onGuardar({ activa: !i.activa })}>
            {i.activa ? 'Apagar' : 'Prender'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditarTv({ t, onCerrar, onGuardar }: {
  t: Partial<PantallaTv>
  onCerrar: () => void
  onGuardar: (p: Partial<PantallaTv>) => Promise<void>
}) {
  const [nombre, setNombre] = useState(t.nombre ?? '')
  const [ubicacion, setUbicacion] = useState(t.ubicacion ?? '')
  const [ip, setIp] = useState(t.ip ?? '')
  const [segundos, setSegundos] = useState(String(t.segundos ?? 12))
  const [activa, setActiva] = useState(t.activa ?? true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const ipOk = ip.trim() === '' || /^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim())
  const segOk = Number(segundos) >= 3 && Number(segundos) <= 600

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-sa p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className={cx.h3}>{t.id ? 'Editar TV' : 'Agregar TV'}</h3>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <Field label="Nombre">
          <input className={cx.input} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="TV de la caja" autoFocus />
        </Field>
        <Field label="Dónde está">
          <input className={cx.input} value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} maxLength={80} placeholder="Arriba de la barra" />
        </Field>
        <Field label="IP en la red de la tienda">
          <input className={cx.input} value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.60" inputMode="decimal" />
        </Field>
        {!ipOk && <p className="text-xs text-sa-strawberry">La IP se escribe como 192.168.1.60</p>}
        <Field label="Segundos por imagen">
          <input className={cx.input} value={segundos} onChange={(e) => setSegundos(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
        </Field>
        {t.id && (
          <label className="flex items-center gap-2 text-sm text-sa-green-ink">
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
            Activa (si la apagas, el empujador deja de tocarla)
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className={cx.btnSec} onClick={onCerrar}>Cancelar</button>
          <button
            className={cx.btnPrimary}
            disabled={guardando || !nombre.trim() || !ipOk || !segOk}
            onClick={async () => {
              setGuardando(true)
              setError(null)
              try {
                await onGuardar({
                  ...(t.id ? { id: t.id, activa } : { contenido: t.contenido ?? 'promos' }),
                  nombre: nombre.trim(), ubicacion: ubicacion.trim() || null, ip: ip.trim() || null, segundos: Number(segundos),
                })
              } catch (e) {
                setError(mensajeDeError(e))
                setGuardando(false)
              }
            }}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
