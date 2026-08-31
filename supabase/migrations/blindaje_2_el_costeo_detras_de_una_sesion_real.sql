-- BLINDAJE 2/3: los costos dejan de estar a la vista de cualquiera.
--
-- `app_data` es UNA fila con TODO el costeo: costos por insumo, margenes,
-- precios de compra, proveedores. Es lo que el repo tiene prohibido guardar
-- en git... y estaba concedida a `anon` para SELECT y UPDATE. Cualquiera
-- con la llave publica podia leerse los margenes enteros, o pisarlos.
--
-- El login de Costeos no ayudaba: valida usuario y contrasena en el
-- servidor (bien), pero despues NO deja sesion — guarda `{user}` en el
-- navegador y sigue hablando con la base como `anon`. Un login que no deja
-- sesion es un letrero, no una puerta: se rodea llamando a la tabla
-- directo.
--
-- Aqui se le da sesion de verdad: un token con caducidad, guardado en la
-- base, que hay que presentar para leer o guardar.

create table if not exists costos_sesiones (
  token uuid primary key default gen_random_uuid(),
  usuario text not null,
  creada_en timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  expira_en timestamptz not null default now() + interval '12 hours'
);
alter table costos_sesiones enable row level security;
-- Sin politicas: nadie toca esta tabla directo. Solo las funciones de abajo,
-- que son SECURITY DEFINER.

comment on table costos_sesiones is
  'Sesiones de Costeos. Su login no usa Supabase Auth, asi que la sesion se lleva aqui.';

-- Quien es el dueno de este token, o null si no vale. De paso lo renueva:
-- 12 horas de inactividad y caduca.
create or replace function fn_costos_sesion(p_token uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_usuario text;
begin
  if p_token is null then return null; end if;
  update costos_sesiones
     set ultimo_uso = now(), expira_en = now() + interval '12 hours'
   where token = p_token and expira_en > now()
  returning usuario into v_usuario;
  -- La limpieza va aqui y no en un cron: es una fila por sesion, y asi no
  -- hay un trabajo mas que vigilar.
  delete from costos_sesiones where expira_en < now() - interval '1 day';
  return v_usuario;
end $$;

-- El login pasa a devolver token. Cambia el RETURNS TABLE, asi que hay que
-- tirar la firma anterior: `create or replace` no puede con eso.
drop function if exists fn_costos_login(text, text);

create function fn_costos_login(p_usuario text, p_contrasena text)
returns table(ok boolean, autorizado boolean, mensaje text, token uuid)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_hash text; v_autorizado boolean; v_correcta boolean := false; v_token uuid;
begin
  select u.hash, u.autorizado into v_hash, v_autorizado
  from app_users u where lower(u.username) = lower(trim(p_usuario)) limit 1;

  if v_hash is null then
    return query select false, false, 'Usuario o contraseña incorrectos'::text, null::uuid;
    return;
  end if;

  if v_hash like '$2%' then
    v_correcta := (v_hash = crypt(p_contrasena, v_hash));
  else
    v_correcta := (v_hash = encode(digest(p_contrasena, 'sha256'), 'hex'));
    if v_correcta then
      update app_users set hash = crypt(p_contrasena, gen_salt('bf'))
      where lower(username) = lower(trim(p_usuario));
    end if;
  end if;

  if not v_correcta then
    return query select false, false, 'Usuario o contraseña incorrectos'::text, null::uuid;
  elsif not v_autorizado then
    return query select false, false,
      'Tu cuenta existe pero todavía no está habilitada. Pídele a gerencia que la autorice.'::text,
      null::uuid;
  else
    insert into costos_sesiones (usuario) values (lower(trim(p_usuario)))
    returning costos_sesiones.token into v_token;
    return query select true, true, ''::text, v_token;
  end if;
end $$;

create or replace function fn_costos_salir(p_token uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from costos_sesiones where token = p_token;
$$;

-- Leer y guardar el costeo, con el token por delante. La fila se llama
-- 'shakeaholic': ponerle otro id dejaria la lectura en blanco y el guardado
-- sin efecto, en silencio, que es lo peor que puede pasar aqui.
create or replace function fn_costos_leer(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_usuario text;
begin
  v_usuario := fn_costos_sesion(p_token);
  if v_usuario is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  return (select data from app_data where id = 'shakeaholic');
end $$;

create or replace function fn_costos_guardar(p_token uuid, p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_usuario text; v_cuando timestamptz;
begin
  v_usuario := fn_costos_sesion(p_token);
  if v_usuario is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Eso no es un documento de costeo.';
  end if;
  update app_data
     set data = p_data, updated_at = now(), updated_by = v_usuario
   where id = 'shakeaholic'
  returning updated_at into v_cuando;
  if v_cuando is null then
    raise exception 'No se encontro el documento de costeo.';
  end if;
  return v_cuando;
end $$;

grant execute on function fn_costos_sesion(uuid) to anon, authenticated;
grant execute on function fn_costos_salir(uuid) to anon, authenticated;
grant execute on function fn_costos_leer(uuid) to anon, authenticated;
grant execute on function fn_costos_guardar(uuid, jsonb) to anon, authenticated;
