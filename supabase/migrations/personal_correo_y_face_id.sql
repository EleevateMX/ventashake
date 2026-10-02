-- =============================================================================
-- El personal se reconoce por su correo de Google/Apple (02/10/26).
--
-- Gerencia registra en Admin → Personal el correo con el que cada quien
-- entra a la app. Si un cliente entra con ese correo, la app le enseña la
-- pestaña Personal sola. Lo que NO cambia: la sesión de personal se sigue
-- abriendo con el PIN (y después con Face ID, guardada en el llavero del
-- iPhone bajo biometría). Reconocer no es abrir: la cuenta de Google es
-- del cliente; la de personal es otra y vive aparte (CLAUDE.md 2.7).
-- =============================================================================

alter table empleados add column if not exists correo text;
create unique index if not exists empleados_correo_unico on empleados (lower(correo)) where correo is not null;

-- Cambia el tipo de retorno: hay que tirarla y volverla a crear (y volver
-- a dar los permisos, que se pierden con el drop).
drop function if exists public.fn_admin_empleados();
create function public.fn_admin_empleados()
returns table(id uuid, nombre text, rol text, rol_id uuid, sucursal_id uuid, activo boolean, tiene_pin boolean, correo text)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede ver el personal';
  end if;
  return query
    select e.id, e.nombre, r.nombre, e.rol_id, e.sucursal_id, e.activo, (e.pin_hash is not null), e.correo
    from empleados e join roles r on r.id = e.rol_id
    order by e.activo desc, e.nombre;
end $function$;
revoke execute on function public.fn_admin_empleados() from anon, public;
grant execute on function public.fn_admin_empleados() to authenticated;

create or replace function public.fn_empleado_correo_guardar(p_id uuid, p_correo text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
begin
  if not fn_es_jefe() then raise exception 'Solo gerencia puede editar el personal.'; end if;
  if v is not null and v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ese correo no se ve bien.';
  end if;
  if v like '%@staff.shakeaholic.mx' then
    raise exception 'Ese es el correo técnico del PIN, no el de la persona.';
  end if;
  update empleados set correo = v where id = p_id;
  if not found then raise exception 'Ese empleado no existe.'; end if;
exception when unique_violation then
  raise exception 'Ese correo ya es de otra persona del equipo.';
end;
$$;
revoke execute on function public.fn_empleado_correo_guardar(uuid, text) from anon, public;
grant execute on function public.fn_empleado_correo_guardar(uuid, text) to authenticated;

-- La app pregunta con la sesión del cliente: ¿este correo es de alguien
-- del equipo? Solo dice sí/no, nombre y rol; no abre nada.
create or replace function public.fn_soy_personal()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_build_object('es_personal', true, 'nombre', e.nombre, 'rol', r.nombre)
       from empleados e join roles r on r.id = e.rol_id
      where e.activo and e.correo is not null
        and lower(e.correo) = lower(coalesce(auth.jwt() ->> 'email', ''))
      limit 1),
    jsonb_build_object('es_personal', false)
  );
$$;
revoke execute on function public.fn_soy_personal() from anon, public;
grant execute on function public.fn_soy_personal() to authenticated;
