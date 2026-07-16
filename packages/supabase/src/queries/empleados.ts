import type { ShakeClient } from '../client'

export interface Empleado {
  id: string
  nombre: string
  rol: string
  sucursal_id: string | null
}

/**
 * Valida el PIN del cajero contra `empleados.pin_hash` vía el RPC
 * `fn_login_cajero` (SECURITY DEFINER; los hashes nunca salen a la app).
 * Devuelve el empleado si el PIN es correcto y está activo, o null.
 */
export async function loginCajero(sb: ShakeClient, pin: string): Promise<Empleado | null> {
  // rpc no está en los tipos generados; se castea el nombre.
  const { data, error } = await (sb.rpc as (fn: string, args: Record<string, unknown>) => Promise<{ data: Empleado[] | null; error: unknown }>)(
    'fn_login_cajero',
    { p_pin: pin },
  )
  if (error) throw error
  return data && data.length > 0 ? data[0] : null
}

/** Empleados activos (nombre + rol, sin hashes) para el selector del login. */
export async function listarEmpleadosActivos(sb: ShakeClient, sucursalId?: string): Promise<Empleado[]> {
  const { data, error } = await (sb.rpc as (fn: string, args: Record<string, unknown>) => Promise<{ data: Empleado[] | null; error: unknown }>)(
    'fn_empleados_activos',
    { p_sucursal: sucursalId ?? null },
  )
  if (error) throw error
  return data ?? []
}
