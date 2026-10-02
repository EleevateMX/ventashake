-- =============================================================================
-- Avisos push de la app de Rewards (02/10/26).
--
-- Tres piezas, y ninguna manda nada desde la base:
--
--   push_dispositivos  el token de APNs de cada teléfono, ligado a la cuenta
--                      (y al cliente o empleado). Lo registra la app con su
--                      sesión; se desactiva solo cuando Apple dice que ya no
--                      existe.
--   push_cola          lo que hay que mandar: una fila por cliente y aviso.
--                      La llena un trigger (mancuernas acreditadas) o una
--                      campaña de Admin. La VACÍA la Edge Function push-cola,
--                      que es la única que habla con Apple: la llave de APNs
--                      vive en los secrets de Edge, nunca en SQL.
--   push_envios        el historial de campañas (quién, qué, a cuántos).
--
-- El trigger sobre mancuernas_movimientos solo INSERTA en la cola, dentro de
-- un bloque que se traga cualquier error: un aviso que no se encola nunca
-- puede tumbar un cobro.
-- =============================================================================

create table if not exists push_dispositivos (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  cliente_id uuid references clientes(id),
  empleado_id uuid references empleados(id),
  token text not null unique,
  plataforma text not null default 'ios',
  entorno text not null default 'production' check (entorno in ('sandbox', 'production')),
  app_version text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  visto_en timestamptz not null default now(),
  ultimo_error text
);
create index if not exists push_dispositivos_usuario_idx on push_dispositivos (auth_user_id) where activo;
create index if not exists push_dispositivos_cliente_idx on push_dispositivos (cliente_id) where activo;
alter table push_dispositivos enable row level security;
revoke all on push_dispositivos from anon, authenticated, public;

create table if not exists push_cola (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  auth_user_id uuid,
  titulo text not null,
  cuerpo text not null,
  datos jsonb not null default '{}'::jsonb,
  envio_id uuid,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  entregados int,
  error text
);
create index if not exists push_cola_pendientes_idx on push_cola (creado_en) where enviado_en is null;
alter table push_cola enable row level security;
revoke all on push_cola from anon, authenticated, public;

create table if not exists push_envios (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cuerpo text not null,
  destino text not null,
  cliente_id uuid references clientes(id),
  destinatarios int not null default 0,
  entregados int not null default 0,
  empleado_id uuid references empleados(id),
  creado_en timestamptz not null default now()
);
alter table push_envios enable row level security;
revoke all on push_envios from anon, authenticated, public;

-- La app registra su token con la sesión del cliente (o del empleado en
-- modo personal). Un token es de un solo teléfono: si cambia de cuenta, se
-- reasigna.
create or replace function public.fn_push_registrar(p_token text, p_entorno text default 'production', p_version text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_cliente uuid; v_empleado uuid;
begin
  if v_uid is null then raise exception 'Entra a tu cuenta.'; end if;
  if coalesce(btrim(p_token), '') = '' then raise exception 'Token vacío.'; end if;
  select id into v_cliente from clientes where auth_user_id = v_uid and activo limit 1;
  select id into v_empleado from empleados where auth_user_id = v_uid and activo limit 1;
  insert into push_dispositivos (auth_user_id, cliente_id, empleado_id, token, entorno, app_version, activo, visto_en, ultimo_error)
  values (v_uid, v_cliente, v_empleado, btrim(p_token), coalesce(p_entorno, 'production'), p_version, true, now(), null)
  on conflict (token) do update
    set auth_user_id = excluded.auth_user_id,
        cliente_id = excluded.cliente_id,
        empleado_id = excluded.empleado_id,
        entorno = excluded.entorno,
        app_version = excluded.app_version,
        activo = true,
        visto_en = now(),
        ultimo_error = null;
end;
$$;
revoke execute on function public.fn_push_registrar(text, text, text) from anon, public;
grant execute on function public.fn_push_registrar(text, text, text) to authenticated;

create or replace function public.fn_push_quitar(p_token text)
returns void
language sql security definer set search_path to 'public'
as $$
  update push_dispositivos set activo = false
   where token = btrim(p_token) and auth_user_id = auth.uid();
$$;
revoke execute on function public.fn_push_quitar(text) from anon, public;
grant execute on function public.fn_push_quitar(text) to authenticated;

-- Mancuernas acreditadas por una compra → un aviso en la cola. Solo si ese
-- cliente tiene algún teléfono registrado; si no, no hay nada que encolar.
create or replace function public.fn_push_encolar_mancuernas()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid; v_total int;
begin
  begin
    if new.tipo = 'ganadas' and new.puntos > 0 and new.cliente_id is not null then
      select auth_user_id, mancuernas into v_uid, v_total from clientes where id = new.cliente_id;
      if v_uid is not null and exists (select 1 from push_dispositivos d where d.auth_user_id = v_uid and d.activo) then
        insert into push_cola (cliente_id, auth_user_id, titulo, cuerpo, datos)
        values (
          new.cliente_id, v_uid,
          '+' || new.puntos || ' mancuernas',
          'Ya están en tu tarjeta. Llevas ' || coalesce(v_total, 0) || '.',
          jsonb_build_object('tipo', 'mancuernas', 'puntos', new.puntos, 'orden_id', new.orden_id)
        );
      end if;
    end if;
  exception when others then
    -- Jamás tumbar el cobro por un aviso.
    null;
  end;
  return new;
end;
$$;
drop trigger if exists trg_push_mancuernas on mancuernas_movimientos;
create trigger trg_push_mancuernas
  after insert on mancuernas_movimientos
  for each row execute function public.fn_push_encolar_mancuernas();

-- Admin: historial de campañas y cuántos teléfonos hay.
create or replace function public.fn_push_envios(p_n int default 30)
returns table(id uuid, titulo text, cuerpo text, destino text, cliente text, destinatarios int, entregados int, por text, creado_en timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select e.id, e.titulo, e.cuerpo, e.destino, c.nombre, e.destinatarios, e.entregados, em.nombre, e.creado_en
    from push_envios e
    left join clientes c on c.id = e.cliente_id
    left join empleados em on em.id = e.empleado_id
   where fn_es_jefe()
   order by e.creado_en desc
   limit greatest(1, least(coalesce(p_n, 30), 200));
$$;
revoke execute on function public.fn_push_envios(int) from anon, public;
grant execute on function public.fn_push_envios(int) to authenticated;

create or replace function public.fn_push_resumen()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select case when fn_es_jefe() then jsonb_build_object(
    'telefonos', (select count(*) from push_dispositivos where activo),
    'clientes', (select count(distinct cliente_id) from push_dispositivos where activo and cliente_id is not null),
    'pendientes', (select count(*) from push_cola where enviado_en is null)
  ) else null end;
$$;
revoke execute on function public.fn_push_resumen() from anon, public;
grant execute on function public.fn_push_resumen() to authenticated;

-- Cada minuto, si hay algo pendiente, se le avisa a la Edge Function para
-- que vacíe la cola. La llave publicable es pública por diseño (vive en el
-- frontend); la Edge Function no expone nada ni acepta contenido: solo manda
-- lo que ya está en la cola.
select cron.unschedule(jobid) from cron.job where jobname = 'push-cola';
select cron.schedule(
  'push-cola',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://api.shakeaholic.mx/functions/v1/push-cola',
      headers := '{"Content-Type":"application/json","apikey":"sb_publishable_cMUhN7qNUY_AY-E4U1dCnw_fR_C9sOb","Authorization":"Bearer sb_publishable_cMUhN7qNUY_AY-E4U1dCnw_fR_C9sOb"}'::jsonb,
      body := '{}'::jsonb
    )
    where exists (select 1 from push_cola where enviado_en is null);
  $cron$
);
