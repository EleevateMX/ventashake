import { useCallback, useEffect, useState } from 'react'
import {
  listarEmpleadosAdmin, laboralDe, guardarLaboral,
  plantillasContrato, guardarPlantilla, generarContrato, contratosDe, textoDeContrato,
  type EmpleadoAdmin, type DatosLaborales, type PlantillaContrato, type ContratoGenerado,
} from '@shake/supabase'
import { mensajeDeError, llenarContrato } from '@shake/utils'
import { sb } from '../../lib/sb'
import { Panel, Loading, ErrorMsg, OkMsg, Chip, cx } from '../../ui'

/**
 * Datos laborales y contratos.
 *
 * **Esto no redacta el contrato.** El texto legal lo escribe o lo revisa
 * un abogado y vive en la plantilla; aquí solo se rellena y se hace que
 * concuerde en género. Un contrato mal redactado es peor que no tener
 * uno: en una junta, una cláusula inválida no protege y sí puede usarse
 * en contra. La plantilla que viene de fábrica está marcada como BORRADOR
 * justo para que nadie la firme sin que un abogado la lea.
 *
 * Lo generado **se congela**: si mañana cambia el salario o la plantilla,
 * el contrato que ya se imprimió y se firmó no cambia con ellos.
 */

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const VACIO = (id: string): DatosLaborales => ({
  empleado_id: id, genero: 'x', nombre_completo: null, puesto: null,
  salario_diario: null, fecha_ingreso: null, tipo_contrato: 'indeterminado',
  jornada: null, dias_descanso: [],
})

export default function Contratos() {
  const [empleados, setEmpleados] = useState<EmpleadoAdmin[]>([])
  const [quien, setQuien] = useState<string | null>(null)
  const [datos, setDatos] = useState<DatosLaborales | null>(null)
  const [plantillas, setPlantillas] = useState<PlantillaContrato[]>([])
  const [plantillaId, setPlantillaId] = useState<string | null>(null)
  const [previa, setPrevia] = useState<{ texto: string; faltantes: string[] } | null>(null)
  const [historial, setHistorial] = useState<ContratoGenerado[]>([])
  const [editandoPlantilla, setEditandoPlantilla] = useState(false)
  const [cuerpoPlantilla, setCuerpoPlantilla] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    Promise.all([listarEmpleadosAdmin(sb), plantillasContrato(sb)])
      .then(([e, p]) => {
        setEmpleados(e.filter((x) => x.activo))
        setPlantillas(p)
        setPlantillaId(p[0]?.id ?? null)
      })
      .catch((e) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false))
  }, [])

  const abrir = useCallback(async (id: string) => {
    setQuien(id); setPrevia(null); setError(null)
    try {
      const [l, h] = await Promise.all([laboralDe(sb, id), contratosDe(sb, id)])
      const emp = empleados.find((e) => e.id === id)
      setDatos(l ?? { ...VACIO(id), nombre_completo: emp?.nombre ?? null })
      setHistorial(h)
    } catch (e) { setError(mensajeDeError(e)) }
  }, [empleados])

  async function guardar() {
    if (!datos) return
    setError(null)
    try {
      await guardarLaboral(sb, datos)
      setOk('Datos guardados.')
      setTimeout(() => setOk(null), 5000)
    } catch (e) { setError(mensajeDeError(e)) }
  }

  /**
   * La vista previa se arma en la pantalla y **se revisa antes** de
   * guardar nada: un contrato con un `{{SALARIO_DIARIO}}` a la vista es
   * de los errores que se firman sin que nadie lo note, así que las
   * variables sin llenar se listan arriba y no se dejan pasar en silencio.
   */
  function generarPrevia() {
    const pl = plantillas.find((p) => p.id === plantillaId)
    if (!pl || !datos) return
    setPrevia(llenarContrato(pl.cuerpo, {
      genero: datos.genero,
      nombre: datos.nombre_completo ?? empleados.find((e) => e.id === datos.empleado_id)?.nombre ?? '',
      puesto: datos.puesto,
      salarioDiario: datos.salario_diario,
      fechaIngreso: datos.fecha_ingreso,
      tipoContrato: datos.tipo_contrato,
      jornada: datos.jornada,
      diasDescanso: datos.dias_descanso,
      empresa: 'Shakeaholic',
      lugar: 'Mérida, Yucatán',
    }))
  }

  async function guardarGenerado() {
    if (!previa || !datos || !plantillaId) return
    try {
      await generarContrato(sb, datos.empleado_id, plantillaId, previa.texto)
      setOk('Contrato guardado. El texto queda congelado tal como está.')
      setTimeout(() => setOk(null), 6000)
      setHistorial(await contratosDe(sb, datos.empleado_id))
    } catch (e) { setError(mensajeDeError(e)) }
  }

  async function imprimir(id: string) {
    try {
      const texto = await textoDeContrato(sb, id)
      const w = window.open('', '_blank')
      if (!w) { setError('El navegador bloqueó la ventana. Permite las ventanas emergentes.'); return }
      w.document.write(
        `<pre style="font-family:Georgia,serif;white-space:pre-wrap;padding:3rem;line-height:1.6">${
          texto.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
        }</pre>`,
      )
      w.document.close()
      w.print()
    } catch (e) { setError(mensajeDeError(e)) }
  }

  if (cargando) return <Loading>Cargando…</Loading>

  const pl = plantillas.find((p) => p.id === plantillaId)

  return (
    <div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <Panel className="mb-4">
        <p className="text-sm text-sa-green-ink/75 leading-relaxed">
          <b>El texto legal no lo pone el sistema.</b> La plantilla que viene
          de fábrica es un <b>borrador</b> para que lo revise y complete un
          abogado laboralista. Aquí se rellenan los datos y se hace que el
          documento concuerde en género — eso es todo, y es a propósito.
        </p>
      </Panel>

      <div className="flex gap-2 flex-wrap mb-5">
        {empleados.map((e) => (
          <button
            key={e.id}
            onClick={() => void abrir(e.id)}
            className={`px-4 py-2 rounded-full text-sm border ${
              quien === e.id
                ? 'bg-sa-green text-sa-cream border-sa-green'
                : 'bg-white border-sa-green-ink/15 text-sa-green-ink'
            }`}
          >
            {e.nombre}
          </button>
        ))}
      </div>

      {datos && (
        <>
          <Panel title="Datos para el contrato" className="mb-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-sa-green-ink/70">
                Nombre completo
                <input
                  value={datos.nombre_completo ?? ''}
                  onChange={(ev) => setDatos({ ...datos, nombre_completo: ev.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-sa-green-ink/15 rounded text-sm"
                />
              </label>
              <label className="text-sm text-sa-green-ink/70">
                Puesto
                <input
                  value={datos.puesto ?? ''}
                  onChange={(ev) => setDatos({ ...datos, puesto: ev.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-sa-green-ink/15 rounded text-sm"
                />
              </label>
              <label className="text-sm text-sa-green-ink/70">
                Salario diario
                <input
                  type="number" step="0.01" min="0"
                  value={datos.salario_diario ?? ''}
                  onChange={(ev) => setDatos({ ...datos, salario_diario: Number(ev.target.value) || null })}
                  className="w-full mt-1 px-3 py-2 border border-sa-green-ink/15 rounded text-sm font-mono"
                />
              </label>
              <label className="text-sm text-sa-green-ink/70">
                Fecha de ingreso
                <input
                  type="date" value={datos.fecha_ingreso ?? ''}
                  onChange={(ev) => setDatos({ ...datos, fecha_ingreso: ev.target.value || null })}
                  className="w-full mt-1 px-3 py-2 border border-sa-green-ink/15 rounded text-sm font-mono"
                />
              </label>
              <label className="text-sm text-sa-green-ink/70">
                Jornada
                <input
                  value={datos.jornada ?? ''} placeholder="De lunes a viernes, 8 horas"
                  onChange={(ev) => setDatos({ ...datos, jornada: ev.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-sa-green-ink/15 rounded text-sm"
                />
              </label>
              <label className="text-sm text-sa-green-ink/70">
                Tipo de contrato
                <input
                  value={datos.tipo_contrato ?? ''} placeholder="indeterminado"
                  onChange={(ev) => setDatos({ ...datos, tipo_contrato: ev.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-sa-green-ink/15 rounded text-sm"
                />
              </label>
            </div>

            <div className="mt-5">
              <p className="text-sm text-sa-green-ink/70 mb-2">
                Cómo se nombra en el documento
              </p>
              <div className="flex gap-2 flex-wrap">
                {([['m', 'El trabajador'], ['f', 'La trabajadora'], ['x', 'La persona trabajadora']] as const)
                  .map(([g, etiqueta]) => (
                    <button
                      key={g}
                      onClick={() => setDatos({ ...datos, genero: g })}
                      className={`px-4 py-2 rounded-full text-sm border ${
                        datos.genero === g
                          ? 'bg-sa-green text-sa-cream border-sa-green'
                          : 'bg-white border-sa-green-ink/15 text-sa-green-ink'
                      }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
              </div>
              <p className="text-[11px] text-sa-green-ink/50 mt-1.5 leading-snug">
                El neutro no usa diagonal: «trabajador/a» obliga a tachar una de
                las dos con pluma en algo que se va a firmar.
              </p>
            </div>

            <div className="mt-5">
              <p className="text-sm text-sa-green-ink/70 mb-2">
                Días de descanso <span className="text-sa-green-ink/45">(los asigna Shakeaholic)</span>
              </p>
              <div className="flex gap-2 flex-wrap">
                {DIAS.map((d, i) => {
                  const puesto = datos.dias_descanso.includes(i)
                  return (
                    <button
                      key={d}
                      onClick={() => setDatos({
                        ...datos,
                        dias_descanso: puesto
                          ? datos.dias_descanso.filter((x) => x !== i)
                          : [...datos.dias_descanso, i].sort((a, b) => a - b),
                      })}
                      className={`w-14 py-2 rounded-sa text-sm border ${
                        puesto
                          ? 'bg-sa-banana text-sa-coffee border-sa-banana'
                          : 'bg-white border-sa-green-ink/15 text-sa-green-ink/60'
                      }`}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => void guardar()}
              className="mt-6 px-6 py-3 rounded-sa-lg bg-sa-green text-sa-cream font-display text-lg"
            >
              Guardar datos
            </button>
          </Panel>

          <Panel title="Generar el contrato" className="mb-4">
            <div className="flex gap-3 flex-wrap items-center">
              <select
                value={plantillaId ?? ''}
                onChange={(e) => { setPlantillaId(e.target.value); setPrevia(null) }}
                className="px-3 py-2 border border-sa-green-ink/15 rounded text-sm"
              >
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <button
                onClick={generarPrevia}
                className="px-5 py-2.5 rounded-sa-lg bg-sa-green text-sa-cream font-display"
              >
                Ver cómo queda
              </button>
              <button
                onClick={() => { setCuerpoPlantilla(pl?.cuerpo ?? ''); setEditandoPlantilla(true) }}
                className="px-5 py-2.5 rounded-sa-lg bg-white border border-sa-green-ink/15 text-sa-green-ink"
              >
                Editar la plantilla
              </button>
            </div>

            {previa && (
              <div className="mt-5">
                {previa.faltantes.length > 0 && (
                  <div className="bg-sa-strawberry/10 border border-sa-strawberry/30 rounded-sa px-4 py-3 mb-3">
                    <p className="text-sm text-sa-strawberry leading-relaxed">
                      <b>Faltan datos</b> y se quedaron a la vista en el texto:{' '}
                      {previa.faltantes.join(', ')}. Se dejan visibles a propósito —
                      borrarlos dejaría una línea en blanco donde iba el dato.
                    </p>
                  </div>
                )}
                <pre className="bg-white border border-sa-green-ink/10 rounded-sa p-5 text-[13px] whitespace-pre-wrap font-body leading-relaxed max-h-[45vh] overflow-y-auto">
                  {previa.texto}
                </pre>
                <button
                  onClick={() => void guardarGenerado()}
                  disabled={previa.faltantes.length > 0}
                  className="mt-4 px-6 py-3 rounded-sa-lg bg-sa-green text-sa-cream font-display text-lg disabled:opacity-40"
                >
                  {previa.faltantes.length > 0 ? 'Llena los datos que faltan' : 'Guardar este contrato'}
                </button>
              </div>
            )}
          </Panel>

          <Panel title="Contratos guardados">
            {historial.length === 0 ? (
              <p className={cx.muted}>Todavía no se ha generado ninguno para esta persona.</p>
            ) : (
              <div className="space-y-2">
                {historial.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 flex-wrap bg-white rounded-sa border border-sa-green-ink/10 px-4 py-3"
                  >
                    <span className="font-mono text-sm text-sa-green-ink">
                      {new Date(c.generado_en).toLocaleString('es-MX', { timeZone: 'America/Merida' })}
                    </span>
                    <Chip tone="neutral">{c.plantilla ?? 'plantilla borrada'}</Chip>
                    {c.quien && <span className="text-[11px] text-sa-green-ink/45">{c.quien}</span>}
                    <button
                      onClick={() => void imprimir(c.id)}
                      className="ml-auto text-[11px] text-sa-green underline"
                    >
                      Ver e imprimir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {editandoPlantilla && (
        <div className="fixed inset-0 z-50 bg-sa-green-ink/60 flex items-center justify-center p-6">
          <div className="bg-sa-cream-paper rounded-sa-lg max-w-3xl w-full p-7 max-h-[88vh] overflow-y-auto">
            <p className="font-display text-3xl text-sa-green-ink leading-tight">La plantilla</p>
            <p className="text-sm text-sa-green-ink/60 mt-1 mb-4 leading-relaxed">
              Pega aquí el texto que te dé tu abogado. Donde vaya un dato, escribe
              la variable entre llaves. Disponibles:{' '}
              <code className="font-mono text-[11px]">
                {'{{NOMBRE}} {{EL_LA}} {{TRABAJADOR}} {{PUESTO}} {{SALARIO_DIARIO}} ' +
                 '{{FECHA_INGRESO}} {{TIPO_CONTRATO}} {{JORNADA}} {{DIAS_DESCANSO}} ' +
                 '{{EMPRESA}} {{LUGAR}} {{FECHA_HOY}}'}
              </code>
            </p>
            <textarea
              value={cuerpoPlantilla}
              onChange={(e) => setCuerpoPlantilla(e.target.value)}
              rows={20}
              className="w-full px-4 py-3 border border-sa-green-ink/15 rounded font-mono text-xs leading-relaxed"
            />
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditandoPlantilla(false)}
                className="px-6 py-3 rounded-sa font-mono text-xs uppercase tracking-wide text-sa-green-ink/60 border border-sa-green-ink/15 bg-white"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    await guardarPlantilla(sb, plantillaId, pl?.nombre ?? 'Contrato', cuerpoPlantilla)
                    setPlantillas(await plantillasContrato(sb))
                    setEditandoPlantilla(false)
                    setPrevia(null)
                    setOk('Plantilla guardada.')
                    setTimeout(() => setOk(null), 5000)
                  } catch (e) { setError(mensajeDeError(e)) }
                }}
                className="flex-1 bg-sa-green text-sa-cream py-3 rounded-sa-lg font-display text-lg"
              >
                Guardar plantilla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
