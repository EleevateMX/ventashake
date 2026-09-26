import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  permisosPersonal, guardarPermiso, PERMISOS,
  type PermisoDePersona, type Permiso,
} from '@shake/supabase'
import { mensajeDeError } from '@shake/utils'
import { sb } from '../../lib/sb'
import { Panel, Loading, ErrorMsg, OkMsg, Chip, cx } from '../../ui'

/**
 * Qué puede hacer cada quien en la caja.
 *
 * Cada colaborador entra con su propio usuario y trabaja normal; lo
 * sensible —el corte, sobre todo— lo hace solo quien tenga el permiso. Si
 * alguien sin permiso intenta el corte, la caja pide el PIN de quien sí
 * pueda y deja anotado quién autorizó.
 *
 * **La regla vive en el servidor**, no aquí: abrir caja la exige la base
 * (RLS) y el corte `fn_cerrar_corte`. Esta pantalla solo la escribe.
 *
 * Solo aparecen las acciones que EXISTEN en la caja. Un permiso que no
 * controla nada es una casilla que miente: ver la nota de abajo.
 */

interface Persona {
  id: string
  nombre: string
  rol: string
  esGerencia: boolean
  celdas: Record<Permiso, PermisoDePersona>
}

export default function Permisos() {
  const [filas, setFilas] = useState<PermisoDePersona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try { setFilas(await permisosPersonal(sb)) } catch (e) { setError(mensajeDeError(e)); setFilas([]) }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const personas = useMemo<Persona[]>(() => {
    const m = new Map<string, Persona>()
    for (const f of filas ?? []) {
      const p = m.get(f.empleado_id) ?? {
        id: f.empleado_id, nombre: f.nombre, rol: f.rol, esGerencia: f.es_gerencia,
        celdas: {} as Record<Permiso, PermisoDePersona>,
      }
      p.celdas[f.permiso] = f
      m.set(f.empleado_id, p)
    }
    return [...m.values()]
  }, [filas])

  async function cambiar(p: Persona, permiso: Permiso, valor: boolean | null) {
    const clave = `${p.id}:${permiso}`
    setGuardando(clave); setError(null)
    try {
      await guardarPermiso(sb, p.id, permiso, valor)
      const etiqueta = PERMISOS.find((x) => x.id === permiso)?.etiqueta ?? permiso
      setOk(
        valor === null
          ? `${p.nombre}: «${etiqueta}» vuelve a lo que trae su rol.`
          : `${p.nombre}: ${valor ? 'ya puede' : 'ya no puede'} «${etiqueta.toLowerCase()}».`,
      )
      setTimeout(() => setOk(null), 5000)
      await cargar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGuardando(null)
    }
  }

  if (filas === null) return <Loading>Cargando permisos…</Loading>

  return (
    <div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {ok && <OkMsg>{ok}</OkMsg>}

      <Panel className="mb-4">
        <p className="text-sm text-sa-green-ink/75 leading-relaxed">
          Cada quien entra con su PIN y trabaja normal. Lo que no tenga palomeado
          no lo puede hacer: si intenta el <b>corte</b>, la caja le pide el PIN de
          quien sí pueda y deja anotado quién lo autorizó (se ve en Cortes de
          caja). <b>Gerencia puede todo siempre</b> y no se le quita desde aquí.
        </p>
      </Panel>

      <div className={cx.tableWrap}>
        <table className={cx.table}>
          <thead className={cx.thead}>
            <tr>
              <th className={cx.th}>Quién</th>
              {PERMISOS.map((p) => (
                <th key={p.id} className={`${cx.th} text-center`} title={p.ayuda}>
                  {p.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={cx.tbody}>
            {personas.map((p) => (
              <tr key={p.id} className={cx.tr}>
                <td className={cx.td}>
                  <span className="font-medium">{p.nombre}</span>{' '}
                  <Chip tone={p.esGerencia ? 'si' : 'neutral'}>{p.rol}</Chip>
                </td>
                {PERMISOS.map((k) => {
                  const c = p.celdas[k.id]
                  if (!c) return <td key={k.id} className={cx.td} />
                  const ocupado = guardando === `${p.id}:${k.id}`
                  return (
                    <td key={k.id} className={`${cx.td} text-center`}>
                      {p.esGerencia ? (
                        <span className="text-sa-green font-semibold" title="Gerencia puede todo siempre">✓</span>
                      ) : (
                        <Fragment>
                          <input
                            type="checkbox"
                            checked={c.permitido}
                            disabled={ocupado}
                            onChange={(e) => void cambiar(p, k.id, e.target.checked)}
                            className="w-5 h-5 accent-sa-green align-middle"
                            aria-label={`${p.nombre}: ${k.etiqueta}`}
                          />
                          {/* Decidido a mano vs. lo que trae el rol: sin esta
                              marca no hay forma de saber por qué alguien
                              puede algo que su rol no trae. */}
                          {c.a_mano && (
                            <button
                              onClick={() => void cambiar(p, k.id, null)}
                              disabled={ocupado}
                              title={`Decidido a mano. Su rol (${p.rol}) ${c.por_rol ? 'sí' : 'no'} lo trae. Toca para volver a lo del rol.`}
                              className="ml-1.5 align-middle font-mono text-[10px] text-sa-green-ink/45 underline"
                            >
                              a mano ↺
                            </button>
                          )}
                        </Fragment>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={`${cx.muted} text-xs mt-4 leading-relaxed max-w-3xl`}>
        Lo que trae cada rol si nadie decide otra cosa: <b>cajero</b> cobra y abre
        caja; el corte y los descuentos manuales los autoriza gerencia. Hay acciones
        que <b>no existen en la caja</b> y por eso no tienen casilla: devoluciones,
        cambiar precios (eso es Costeos) y modificar una orden ya cobrada — nadie
        puede hacerlas desde el kiosko ni el POS. Cancelar una venta vive en Admin →
        Ventas, que ya es solo de gerencia.
      </p>
    </div>
  )
}
