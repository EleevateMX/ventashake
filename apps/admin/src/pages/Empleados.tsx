import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/sb'
import { listarEmpleadosActivos, type Empleado } from '@shake/supabase'
import { PageHeader, Loading, ErrorMsg, Panel, cx } from '../ui'

// Colores por rol (solo presentación). Roles desconocidos caen en "neutral".
const ROL_COLOR: Record<string, string> = {
  admin: 'bg-sa-blueberry/15 text-sa-blueberry',
  cajero: 'bg-sa-mint/30 text-sa-green-ink',
  cocinero: 'bg-sa-mango/15 text-sa-mango',
  mesero: 'bg-sa-banana/30 text-sa-coffee',
  supervisor: 'bg-sa-green/15 text-sa-green-deep',
}
const ROL_DOT: Record<string, string> = {
  admin: 'bg-sa-blueberry',
  cajero: 'bg-sa-mint',
  cocinero: 'bg-sa-mango',
  mesero: 'bg-sa-banana',
  supervisor: 'bg-sa-green',
}
function colorRol(rol: string) {
  return ROL_COLOR[rol] ?? 'bg-sa-cream-warm text-sa-green-ink/70'
}
function dotRol(rol: string) {
  return ROL_DOT[rol] ?? 'bg-sa-green-ink/30'
}
function capitalizar(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export default function Empleados() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarEmpleadosActivos(sb)
      .then(setEmpleados)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false))
  }, [])

  const conteoRol = useMemo(() => {
    const m = new Map<string, number>()
    empleados.forEach((e) => m.set(e.rol, (m.get(e.rol) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [empleados])

  if (cargando) return <Loading>Cargando empleados…</Loading>

  return (
    <div>
      <PageHeader title="Empleados y Roles" subtitle="Cajeros y roles activos por sucursal" />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {/* Nota: sin backend de CRUD de empleados */}
      <div className="bg-sa-banana/20 border border-sa-banana/40 text-sa-coffee px-4 py-3 rounded-sa text-sm font-medium mb-6 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Alta/edición de empleados: pendiente (backend). Esta vista es de solo lectura.
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-sa border border-sa-green-ink/5 shadow-sa-sm p-5">
          <p className="text-xs font-mono text-sa-green-ink/60 uppercase tracking-wide">Empleados activos</p>
          <p className="text-4xl font-display text-sa-green-ink mt-1 leading-none">{empleados.length}</p>
        </div>
        <div className="bg-white rounded-sa border border-sa-green-ink/5 shadow-sa-sm p-5">
          <p className="text-xs font-mono text-sa-green-ink/60 uppercase tracking-wide mb-2">Roles</p>
          {conteoRol.length === 0 ? (
            <p className={`text-sm ${cx.muted}`}>—</p>
          ) : (
            <div className="space-y-1">
              {conteoRol.map(([rol, n]) => (
                <div key={rol} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotRol(rol)}`} />
                  <span className="text-xs text-sa-green-ink/70 flex-1">{capitalizar(rol)}</span>
                  <span className="text-xs font-mono font-semibold text-sa-green-ink">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabla */}
      {empleados.length === 0 ? (
        <Panel><p className={cx.muted}>No hay empleados activos.</p></Panel>
      ) : (
        <div className={cx.tableWrap}>
          <table className={cx.table}>
            <thead>
              <tr className={cx.thead}>
                <th className={cx.th}>Empleado</th>
                <th className={cx.th}>Rol</th>
              </tr>
            </thead>
            <tbody className={cx.tbody}>
              {empleados.map((e) => (
                <tr key={e.id} className={cx.tr}>
                  <td className={cx.td}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-sa-cream-warm flex items-center justify-center text-base font-semibold text-sa-green-ink/70 flex-shrink-0">
                        {e.nombre.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-sa-green-ink">{e.nombre}</span>
                    </div>
                  </td>
                  <td className={cx.td}>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorRol(e.rol)}`}>
                      {capitalizar(e.rol)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
