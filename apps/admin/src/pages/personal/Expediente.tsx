import { useCallback, useEffect, useState } from 'react'
import {
  listarEmpleadosAdmin, expedienteDe, resumenExpediente, marcarDocumento,
  quitarDocumento, subirAExpediente, urlFirmadaExpediente, registrarAccesoExpediente,
  type EmpleadoAdmin, type RenglonExpediente, type ResumenExpediente,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '../../lib/sb'
import { Panel, Loading, ErrorMsg, OkMsg, Chip, cx } from '../../ui'

/**
 * El expediente laboral: qué papeles debe tener cada quien y cuáles ya
 * entregó. **No es asesoría legal** — la lista la ajusta gerencia con su
 * contador; esto es control administrativo.
 *
 * Los archivos viven en un bucket **privado**, a diferencia de los otros
 * tres del proyecto. Por eso no hay URL fija: cada vez que se abre uno se
 * pide una firmada que dura dos minutos, y **queda anotado quién la
 * pidió**. Con actas e INE de por medio, saber quién los consultó es
 * parte de cuidarlos.
 */

export default function Expediente() {
  const [empleados, setEmpleados] = useState<EmpleadoAdmin[]>([])
  const [resumen, setResumen] = useState<ResumenExpediente[]>([])
  const [quien, setQuien] = useState<string | null>(null)
  const [filas, setFilas] = useState<RenglonExpediente[] | null>(null)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargarResumen = useCallback(async () => {
    try { setResumen(await resumenExpediente(sb)) } catch (e) { setError(mensajeDeError(e)) }
  }, [])

  useEffect(() => {
    Promise.all([listarEmpleadosAdmin(sb), resumenExpediente(sb)])
      .then(([e, r]) => { setEmpleados(e.filter((x) => x.activo)); setResumen(r) })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  const abrir = useCallback(async (id: string) => {
    setQuien(id); setError(null)
    try { setFilas(await expedienteDe(sb, id)) } catch (e) { setError(mensajeDeError(e)) }
  }, [])

  async function subir(f: RenglonExpediente, archivo: File) {
    if (!quien) return
    setSubiendo(f.requisito_id); setError(null)
    try {
      const guardado = await subirAExpediente(sb, quien, f.requisito_id, archivo)
      await marcarDocumento(sb, quien, f.requisito_id, guardado, f.vence_en, f.nota)
      setFilas(await expedienteDe(sb, quien))
      await recargarResumen()
      setOk(`${f.nombre}: guardado.`)
      setTimeout(() => setOk(null), 5000)
    } catch (e) { setError(mensajeDeError(e)) } finally { setSubiendo(null) }
  }

  async function marcarSinArchivo(f: RenglonExpediente) {
    if (!quien) return
    try {
      await marcarDocumento(sb, quien, f.requisito_id, null, f.vence_en, 'Entregado en físico')
      setFilas(await expedienteDe(sb, quien))
      await recargarResumen()
    } catch (e) { setError(mensajeDeError(e)) }
  }

  async function ver(f: RenglonExpediente) {
    if (!f.archivo_ruta || !f.documento_id) return
    try {
      // Se anota ANTES de abrir: si el registro fallara, mejor no abrir el
      // archivo que abrirlo sin dejar rastro.
      await registrarAccesoExpediente(sb, f.documento_id)
      window.open(await urlFirmadaExpediente(sb, f.archivo_ruta), '_blank')
    } catch (e) { setError(mensajeDeError(e)) }
  }

  async function ponerVencimiento(f: RenglonExpediente) {
    if (!quien) return
    const v = window.prompt(`¿Cuándo vence el ${f.nombre}? (AAAA-MM-DD, vacío para quitar)`, f.vence_en ?? '')
    if (v === null) return
    try {
      await marcarDocumento(sb, quien, f.requisito_id, null, v.trim() || null, f.nota)
      setFilas(await expedienteDe(sb, quien))
      await recargarResumen()
    } catch (e) { setError(mensajeDeError(e)) }
  }

  if (cargando) return <Loading>Cargando expedientes…</Loading>

  return (
    <div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <Panel className="mb-4">
        <p className="text-sm text-sa-green-ink/75 leading-relaxed">
          Los archivos se guardan en un espacio <b>privado</b>: no tienen
          dirección pública y cada vez que se abre uno se pide un enlace que
          dura dos minutos. <b>Queda anotado quién abrió qué.</b> La lista de
          documentos es un punto de partida — ajústala con tu contador.
        </p>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {resumen.map((r) => (
          <button key={r.empleado_id} onClick={() => void abrir(r.empleado_id)} className="text-left">
            <Panel className={quien === r.empleado_id ? 'border-sa-green' : ''}>
              <p className="font-display text-2xl text-sa-green-ink leading-tight">{r.nombre}</p>
              <p className="font-mono text-sm text-sa-green-ink/70 mt-1">
                {r.entregados} de {r.obligatorios} obligatorios
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {r.faltantes > 0 && <Chip tone="no">faltan {r.faltantes}</Chip>}
                {r.vencidos > 0 && <Chip tone="no">{r.vencidos} vencido{r.vencidos === 1 ? '' : 's'}</Chip>}
                {r.faltantes === 0 && r.vencidos === 0 && <Chip tone="si">completo</Chip>}
              </div>
            </Panel>
          </button>
        ))}
      </div>

      {filas && quien && (
        <Panel title={`Expediente de ${empleados.find((e) => e.id === quien)?.nombre ?? ''}`}>
          <div className="space-y-2">
            {filas.map((f) => (
              <div
                key={f.requisito_id}
                className={`bg-white rounded-sa border px-4 py-3 ${
                  f.vencido ? 'border-sa-strawberry/40' : 'border-sa-green-ink/10'
                }`}
              >
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-sa-green-ink">{f.nombre}</span>
                  {f.obligatorio && <Chip tone="neutral">obligatorio</Chip>}
                  {f.documento_id && !f.vencido && <Chip tone="si">entregado</Chip>}
                  {f.vencido && <Chip tone="no">vencido</Chip>}
                  {!f.documento_id && <Chip tone="no">falta</Chip>}
                </div>
                {f.descripcion && (
                  <p className="text-[11px] text-sa-green-ink/50 mt-1">{f.descripcion}</p>
                )}
                {f.documento_id && (
                  <p className="text-[11px] text-sa-green-ink/55 mt-1">
                    {f.archivo_nombre ?? 'Sin archivo (en físico)'}
                    {f.entregado_en && ` · ${f.entregado_en}`}
                    {f.vence_en && ` · vence ${f.vence_en}`}
                    {f.recibido_por && ` · recibió ${f.recibido_por}`}
                  </p>
                )}

                <div className="flex gap-3 flex-wrap mt-2 items-center">
                  <label className="text-[11px] text-sa-green underline cursor-pointer">
                    {subiendo === f.requisito_id ? 'Subiendo…' : f.archivo_ruta ? 'Reemplazar archivo' : 'Subir archivo'}
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                      className="hidden"
                      disabled={subiendo !== null}
                      onChange={(ev) => {
                        const a = ev.target.files?.[0]
                        if (a) void subir(f, a)
                        ev.target.value = ''
                      }}
                    />
                  </label>
                  {f.archivo_ruta && (
                    <button onClick={() => void ver(f)} className="text-[11px] text-sa-green underline">
                      Ver
                    </button>
                  )}
                  {!f.documento_id && (
                    <button
                      onClick={() => void marcarSinArchivo(f)}
                      className="text-[11px] text-sa-green-ink/60 underline"
                    >
                      Marcar entregado en físico
                    </button>
                  )}
                  {f.caduca && (
                    <button
                      onClick={() => void ponerVencimiento(f)}
                      className="text-[11px] text-sa-green-ink/60 underline"
                    >
                      {f.vence_en ? 'Cambiar vencimiento' : 'Poner vencimiento'}
                    </button>
                  )}
                  {f.documento_id && (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`¿Quitar el registro de ${f.nombre}?`)) return
                        try {
                          await quitarDocumento(sb, f.documento_id as string)
                          setFilas(await expedienteDe(sb, quien))
                          await recargarResumen()
                        } catch (e) { setError(mensajeDeError(e)) }
                      }}
                      className="text-[11px] text-sa-strawberry underline ml-auto"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className={`${cx.muted} text-xs mt-4`}>
            Quitar un registro no borra el archivo del almacenamiento: se deja
            por si se quitó por error.
          </p>
        </Panel>
      )}
    </div>
  )
}
