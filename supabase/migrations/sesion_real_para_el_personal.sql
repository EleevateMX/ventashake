-- ============================================================================
-- El personal deja de ser "anon": PIN que da una sesion de verdad
-- ============================================================================
-- Hoy el PIN es un candado de pantalla. `fn_login_cajero` valida y devuelve
-- al empleado, pero el navegador sigue hablando con la base como `anon`: para
-- Postgres, la cajera, el administrador y cualquier persona de internet con
-- la llave publicable son exactamente el mismo rol. Por eso habia 59
-- funciones de escritura abiertas al mundo.
--
-- Esto pone los cimientos para arreglarlo de verdad. El PIN pasa a canjearse
-- por una sesion de Supabase Auth (via la Edge Function `staff-login`), y a
-- partir de ahi la base SI puede distinguir quien llama:
--
--   fn_es_staff()  -> ¿quien llama es un empleado activo?
--   fn_rol_staff() -> ¿con que rol?
--
-- Todo aqui es ADITIVO: no revoca ni un permiso. Mientras las apps no pidan
-- sesion, siguen funcionando igual que hoy. El cierre viene despues, cuando
-- ya se compruebe que la sesion funciona en la tienda.

-- ── 1. Quien llama ─────────────────────────────────────────────────────────
/**
 * El empleado detras de la sesion actual, o null si no hay ninguna.
 *
 * SECURITY DEFINER porque tiene que poder leer `empleados` aunque la politica
 * de esa tabla no deje; STABLE porque dentro de una consulta la respuesta no
 * cambia y asi el planificador la llama una vez y no por fila.
 */
create or replace function public.fn_empleado_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id from empleados e
  where e.auth_user_id = auth.uid() and e.activo
  limit 1
$$;

/** Atajo legible para las politicas: ¿quien llama es personal activo? */
create or replace function public.fn_es_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_empleado_actual() is not null
$$;

/**
 * El rol de quien llama ('administrador', 'gerente', 'cajero', 'cocina') o
 * null. Se compara por `slug` y no por el nombre visible: el nombre se puede
 * editar desde Admin y no debe cambiar quien puede hacer que.
 */
create or replace function public.fn_rol_staff()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.slug from empleados e
  join roles r on r.id = e.rol_id
  where e.auth_user_id = auth.uid() and e.activo
  limit 1
$$;

/** ¿Manda? Administrador y gerente pueden tocar catalogo, precios y personal. */
create or replace function public.fn_es_jefe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(fn_rol_staff() in ('administrador', 'gerente'), false)
$$;

revoke all on function public.fn_empleado_actual() from public;
revoke all on function public.fn_es_staff() from public;
revoke all on function public.fn_rol_staff() from public;
revoke all on function public.fn_es_jefe() from public;
grant execute on function public.fn_empleado_actual() to anon, authenticated, service_role;
grant execute on function public.fn_es_staff() to anon, authenticated, service_role;
grant execute on function public.fn_rol_staff() to anon, authenticated, service_role;
grant execute on function public.fn_es_jefe() to anon, authenticated, service_role;


-- ── 2. Freno a la fuerza bruta ─────────────────────────────────────────────
-- Un PIN de 4 digitos son 10 mil combinaciones: sin freno, un script las
-- prueba todas en minutos y entra como gerente. Se registra cada intento y
-- la Edge Function se niega tras varios fallos seguidos desde el mismo lugar.
create table if not exists public.intentos_pin (
  id bigserial primary key,
  origen text not null,
  exito boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_intentos_pin_origen on public.intentos_pin (origen, created_at desc);

alter table public.intentos_pin enable row level security;
-- Sin politicas a proposito: solo la Edge Function (service_role) la escribe
-- y la lee. Nadie mas tiene por que ver los intentos de nadie.

/** Fallos seguidos desde un origen en los ultimos 15 minutos. */
create or replace function public.fn_pin_fallos_recientes(p_origen text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from intentos_pin
  where origen = p_origen
    and not exito
    and created_at > now() - interval '15 minutes'
$$;

/** Deja constancia del intento. La llama solo la Edge Function. */
create or replace function public.fn_pin_registrar_intento(p_origen text, p_exito boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into intentos_pin (origen, exito) values (p_origen, coalesce(p_exito, false));
$$;

revoke all on function public.fn_pin_fallos_recientes(text) from public;
revoke all on function public.fn_pin_registrar_intento(text, boolean) from public;
grant execute on function public.fn_pin_fallos_recientes(text) to service_role;
grant execute on function public.fn_pin_registrar_intento(text, boolean) to service_role;


-- ── 3. La Edge Function canjea el PIN ──────────────────────────────────────
/**
 * Valida el PIN y devuelve al empleado con el correo tecnico de su cuenta.
 *
 * El correo no es de nadie: es un identificador estable derivado del id del
 * empleado, para que Supabase Auth tenga con que crear la cuenta. Nunca se le
 * escribe a esa direccion.
 *
 * Solo service_role. Si esto quedara abierto, cualquiera podria probar PINs
 * sin pasar por el freno de la Edge Function.
 */
create or replace function public.fn_staff_por_pin(p_pin text)
returns table (empleado_id uuid, nombre text, rol text, sucursal_id uuid, correo text, auth_user_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select e.id, e.nombre, r.slug, e.sucursal_id,
         'emp-' || e.id::text || '@staff.shakeaholic.mx',
         e.auth_user_id
  from empleados e
  join roles r on r.id = e.rol_id
  where e.activo
    and e.pin_hash is not null
    and e.pin_hash = crypt(p_pin, e.pin_hash)
  order by e.created_at
  limit 1
$$;

/** Guarda el vinculo empleado <-> cuenta de Auth la primera vez. */
create or replace function public.fn_staff_vincular_auth(p_empleado_id uuid, p_auth_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update empleados set auth_user_id = p_auth_user_id where id = p_empleado_id;
$$;

revoke all on function public.fn_staff_por_pin(text) from public;
revoke all on function public.fn_staff_vincular_auth(uuid, uuid) from public;
grant execute on function public.fn_staff_por_pin(text) to service_role;
grant execute on function public.fn_staff_vincular_auth(uuid, uuid) to service_role;
