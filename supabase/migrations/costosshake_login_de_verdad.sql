-- ============================================================================
-- El login de costosshake deja de ser decorativo
-- ============================================================================
-- Cuatro problemas, no uno:
--
-- 1. `app_users_insert -> true`: cualquiera con la llave publicable se daba
--    de alta y entraba. Es justo lo que reporto la sucursal.
-- 2. `app_users_select -> true`: cualquiera se descargaba usuario y hash de
--    todos. Son SHA-256 sin sal (64 caracteres), que una tabla arcoiris
--    revienta al instante.
-- 3. La comparacion se hacia en el NAVEGADOR: bajaba el hash y lo comparaba
--    ahi. Un login que se valida del lado del que quiere entrar no es un
--    login.
-- 4. Y el peor: `apps/costos/index.html` siembra la cuenta `admin` con
--    sha256("shakeaholic"). Esa linea esta en un repositorio PUBLICO, o sea
--    que la contrasena del administrador de costeos es de dominio publico.
--
-- Lo que se hace aqui:
--   · Las cuentas nuevas nacen SIN autorizar. Registrarse ya no da acceso;
--     alguien con puesto de jefe tiene que habilitarlas.
--   · Los hashes dejan de ser legibles. El login pasa a una funcion que
--     compara del lado del servidor y solo responde si o no.
--   · Se aceptan los SHA-256 viejos para no dejar a nadie fuera, y al primer
--     acceso correcto la contrasena se re-guarda con bcrypt.

alter table public.app_users add column if not exists autorizado boolean not null default false;
alter table public.app_users add column if not exists autorizado_en timestamptz;

comment on column public.app_users.autorizado is
  'Registrarse no da acceso: alguien con puesto de jefe tiene que poner esto en true.';

-- Las cuentas que ya existian se revisan a mano (ver el mensaje final del
-- despliegue). No se autorizan todas a ciegas: una de ellas es la cuenta
-- sembrada cuya contrasena esta publicada en el repositorio.

-- ── Se cierra la puerta de atras ───────────────────────────────────────────
drop policy if exists app_users_select on public.app_users;
drop policy if exists app_users_insert on public.app_users;
revoke all on table public.app_users from anon, authenticated;
-- Sin politicas: a partir de aqui solo se entra por las funciones de abajo.

-- ── Entrar ─────────────────────────────────────────────────────────────────
/**
 * Valida usuario y contrasena DEL LADO DEL SERVIDOR.
 *
 * Nunca devuelve el hash. Responde tres cosas y nada mas: si la contrasena
 * es correcta, si la cuenta esta autorizada, y un mensaje para la pantalla.
 *
 * Distingue "no existe" de "no autorizada" a proposito: una cuenta recien
 * creada tiene que poder enterarse de que esta esperando permiso, o la
 * persona vuelve a registrarse pensando que se equivoco. Para el que anda
 * probando usuarios eso no regala nada: ya sabe que el usuario existe porque
 * el registro se lo habria dicho.
 */
create or replace function public.fn_costos_login(p_usuario text, p_contrasena text)
returns table (ok boolean, autorizado boolean, mensaje text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_autorizado boolean;
  v_correcta boolean := false;
begin
  select u.hash, u.autorizado into v_hash, v_autorizado
  from app_users u where lower(u.username) = lower(trim(p_usuario)) limit 1;

  if v_hash is null then
    return query select false, false, 'Usuario o contraseña incorrectos'::text;
    return;
  end if;

  if v_hash like '$2%' then
    v_correcta := (v_hash = crypt(p_contrasena, v_hash));           -- bcrypt
  else
    v_correcta := (v_hash = encode(digest(p_contrasena, 'sha256'), 'hex'));  -- el viejo
    -- Al primer acceso correcto se moderniza sola, sin pedirle nada a nadie.
    if v_correcta then
      update app_users set hash = crypt(p_contrasena, gen_salt('bf'))
      where lower(username) = lower(trim(p_usuario));
    end if;
  end if;

  if not v_correcta then
    return query select false, false, 'Usuario o contraseña incorrectos'::text;
  elsif not v_autorizado then
    return query select false, false,
      'Tu cuenta existe pero todavía no está habilitada. Pídele a gerencia que la autorice.'::text;
  else
    return query select true, true, ''::text;
  end if;
end;
$$;

-- ── Registrarse (que ya no es entrar) ──────────────────────────────────────
create or replace function public.fn_costos_registrar(p_usuario text, p_contrasena text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_usuario text := trim(p_usuario);
begin
  if length(coalesce(v_usuario,'')) < 3 then
    raise exception 'El usuario debe tener al menos 3 caracteres.';
  end if;
  if length(coalesce(p_contrasena,'')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres.';
  end if;
  if exists (select 1 from app_users where lower(username) = lower(v_usuario)) then
    raise exception 'Ese usuario ya existe.';
  end if;

  insert into app_users (username, hash, autorizado)
  values (v_usuario, crypt(p_contrasena, gen_salt('bf')), false);

  return 'Cuenta creada. Queda pendiente de que gerencia la habilite.';
end;
$$;

-- ── Habilitar cuentas: solo gerencia ───────────────────────────────────────
create or replace function public.fn_costos_usuarios()
returns table (username text, autorizado boolean, creado timestamptz, autorizado_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede ver las cuentas de costeos.';
  end if;
  return query
    select u.username, u.autorizado, u.created_at, u.autorizado_en
    from app_users u order by u.autorizado, u.username;
end;
$$;

create or replace function public.fn_costos_autorizar(p_usuario text, p_autorizado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede habilitar cuentas de costeos.';
  end if;
  update app_users
  set autorizado = coalesce(p_autorizado, false),
      autorizado_en = case when coalesce(p_autorizado,false) then now() else null end
  where lower(username) = lower(trim(p_usuario));
  if not found then
    raise exception 'No existe la cuenta "%".', p_usuario;
  end if;
end;
$$;

revoke all on function public.fn_costos_login(text, text) from public;
revoke all on function public.fn_costos_registrar(text, text) from public;
revoke all on function public.fn_costos_usuarios() from public;
revoke all on function public.fn_costos_autorizar(text, boolean) from public;
-- Login y registro los llama el navegador sin sesion: es la puerta.
grant execute on function public.fn_costos_login(text, text) to anon, authenticated, service_role;
grant execute on function public.fn_costos_registrar(text, text) to anon, authenticated, service_role;
-- Habilitar cuentas exige sesion de jefe; la funcion lo vuelve a comprobar.
grant execute on function public.fn_costos_usuarios() to authenticated, service_role;
grant execute on function public.fn_costos_autorizar(text, boolean) to authenticated, service_role;
