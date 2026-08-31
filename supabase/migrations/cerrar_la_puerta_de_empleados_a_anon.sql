-- AGUJERO CRITICO (encontrado el 31/08).
--
-- `fn_crear_empleado`, `fn_actualizar_empleado` y `fn_admin_empleados` eran
-- SECURITY DEFINER, sin una sola comprobacion de permisos dentro, y
-- concedidas a `anon`. O sea: cualquiera con la llave publica —que es
-- publica por diseno y vive en el frontend— podia
--
--   1. listar todo el personal y sus roles,
--   2. crearse un empleado con rol 'gerente' y el PIN que quisiera,
--   3. entrar por staff-login con ese PIN y tener el sistema entero.
--
-- Sin dejar rastro de quien fue. Se cierra aqui.
--
-- Antes de revocar se busco quien las llama fuera del navegador (la leccion
-- del instalador que rompi en agosto): solo las usa Admin -> Empleados, a
-- traves de packages/supabase/src/queries/empleados.ts. Nada en scripts/ ni
-- en las Edge Functions.

create or replace function fn_admin_empleados()
returns table(id uuid, nombre text, rol text, rol_id uuid, sucursal_id uuid, activo boolean, tiene_pin boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede ver el personal';
  end if;
  return query
    select e.id, e.nombre, r.nombre, e.rol_id, e.sucursal_id, e.activo, (e.pin_hash is not null)
    from empleados e join roles r on r.id = e.rol_id
    order by e.activo desc, e.nombre;
end $$;

create or replace function fn_crear_empleado(
  p_nombre text, p_rol_id uuid, p_pin text default null, p_sucursal uuid default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare v_id uuid; v_slug text;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede dar de alta personal';
  end if;
  if coalesce(trim(p_nombre),'') = '' then raise exception 'El nombre es obligatorio'; end if;

  -- El rol de desarrollo no se reparte desde Admin: si gerencia pudiera
  -- darselo, la puerta aparte no seria una puerta aparte.
  select slug into v_slug from roles where id = p_rol_id;
  if v_slug = 'desarrollo' and not fn_es_soporte() then
    raise exception 'El rol de desarrollo no se asigna desde aqui';
  end if;

  insert into empleados (nombre, rol_id, sucursal_id, pin_hash, activo)
  values (trim(p_nombre), p_rol_id,
          coalesce(p_sucursal, (select id from sucursales order by created_at limit 1)),
          case when coalesce(p_pin,'') = '' then null else crypt(p_pin, gen_salt('bf')) end,
          true)
  returning id into v_id;
  return v_id;
end $$;

create or replace function fn_actualizar_empleado(
  p_id uuid, p_nombre text default null, p_rol_id uuid default null,
  p_activo boolean default null, p_pin text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare v_slug_actual text; v_slug_nuevo text;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede editar personal';
  end if;

  select r.slug into v_slug_actual
    from empleados e join roles r on r.id = e.rol_id where e.id = p_id;
  if not found then
    raise exception 'Ese empleado no existe';
  end if;

  -- Ni tocar una cuenta de desarrollo, ni ascender a nadie a ella. Sin
  -- esto, gerencia podria cambiarle el PIN a la cuenta de mantenimiento y
  -- entrar por ella.
  if v_slug_actual = 'desarrollo' and not fn_es_soporte() then
    raise exception 'Esa cuenta no se edita desde aqui';
  end if;
  select slug into v_slug_nuevo from roles where id = p_rol_id;
  if v_slug_nuevo = 'desarrollo' and not fn_es_soporte() then
    raise exception 'El rol de desarrollo no se asigna desde aqui';
  end if;

  update empleados set
    nombre = coalesce(nullif(trim(p_nombre),''), nombre),
    rol_id = coalesce(p_rol_id, rol_id),
    activo = coalesce(p_activo, activo),
    pin_hash = case when p_pin is null then pin_hash
                    when p_pin = '' then pin_hash
                    else crypt(p_pin, gen_salt('bf')) end
  where id = p_id;
end $$;

revoke all on function fn_admin_empleados() from public, anon;
revoke all on function fn_crear_empleado(text, uuid, text, uuid) from public, anon;
revoke all on function fn_actualizar_empleado(uuid, text, uuid, boolean, text) from public, anon;
grant execute on function fn_admin_empleados() to authenticated;
grant execute on function fn_crear_empleado(text, uuid, text, uuid) to authenticated;
grant execute on function fn_actualizar_empleado(uuid, text, uuid, boolean, text) to authenticated;

-- La cuenta de mantenimiento, SIN PIN. Lo pone su dueno desde el editor SQL
-- de Supabase: una credencial no se manda por chat ni se guarda en el repo.
insert into empleados (nombre, rol_id, sucursal_id, pin_hash, activo)
select 'Desarrollo', r.id, (select id from sucursales order by created_at limit 1), null, true
from roles r
where r.slug = 'desarrollo'
  and not exists (
    select 1 from empleados e join roles r2 on r2.id = e.rol_id where r2.slug = 'desarrollo'
  );
