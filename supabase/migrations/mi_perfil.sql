-- =============================================================================
-- El cliente edita su perfil desde la app (06/10/26): nombre y cumpleaños.
-- La foto ya tenía fn_guardar_mi_foto y el teléfono fn_mi_telefono_guardar;
-- esto completa el juego. Solo toca la fila del propio cliente (auth.uid()).
-- El cumpleaños alimenta el cupón de cumpleaños que ya existe.
-- =============================================================================
create or replace function public.fn_mi_perfil()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'nombre', c.nombre, 'telefono', c.telefono, 'email', c.email,
    'fecha_nacimiento', c.fecha_nacimiento, 'foto', c.foto_url, 'foto_propia', c.foto_propia
  )
  from clientes c where c.auth_user_id = auth.uid() and c.activo limit 1;
$$;
revoke execute on function public.fn_mi_perfil() from anon, public;
grant execute on function public.fn_mi_perfil() to authenticated;

create or replace function public.fn_mi_perfil_guardar(p_nombre text default null, p_fecha_nacimiento date default null, p_borrar_cumple boolean default false)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  if auth.uid() is null then raise exception 'Entra a tu cuenta.'; end if;
  if v_nombre is not null and length(v_nombre) < 2 then raise exception 'Escribe tu nombre.'; end if;
  if p_fecha_nacimiento is not null and (p_fecha_nacimiento > current_date or p_fecha_nacimiento < current_date - interval '110 years') then
    raise exception 'Esa fecha no se ve bien.';
  end if;
  update clientes set
    nombre = coalesce(v_nombre, nombre),
    fecha_nacimiento = case when p_borrar_cumple then null else coalesce(p_fecha_nacimiento, fecha_nacimiento) end
  where auth_user_id = auth.uid() and activo;
  if not found then raise exception 'No encontramos tu tarjeta.'; end if;
  return fn_mi_perfil();
end;
$$;
revoke execute on function public.fn_mi_perfil_guardar(text, date, boolean) from anon, public;
grant execute on function public.fn_mi_perfil_guardar(text, date, boolean) to authenticated;
