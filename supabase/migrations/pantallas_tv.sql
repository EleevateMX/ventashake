-- Las TVs de la tienda en Admin (18/10/26).
--
-- Gerencia quiere saber, desde Admin, qué transmite cada TV y cambiarlo sin
-- tocar el control. Las TVs son Hisense con VIDAA: no se pueden encender ni
-- abrir su navegador por red, pero sí reciben imágenes por DLNA. Así que:
--
--   · `pantallas_tv`          — cada TV: nombre, IP y qué le toca
--                               (promos, menú, pedidos o nada).
--   · `pantallas_tv_imagenes` — las imágenes de «promos» y de «menú»,
--                               con fechas opcionales (Halloween) y orden.
--   · `pantallas_tv_agente`   — la llave y el latido del EMPUJADOR: el
--                               programa de la PC de la tienda que manda las
--                               imágenes a cada TV por DLNA (lo construye
--                               otra sesión, en la PC; solo él alcanza las
--                               TVs en la red local).
--
-- El empujador habla con dos funciones, abiertas a `anon` porque en la PC no
-- hay sesión de personal, y validadas con su llave (se guarda solo el hash):
--
--   fn_pantallas_tv_agente(p_token, p_version, p_agente)
--     → { ahora, pantallas: [{ id, nombre, ip, contenido, segundos,
--                              reenganchar_desde, diapositivas: [{ id, nombre, url, segundos }] }] }
--   fn_pantallas_tv_reportar(p_token, p_reportes)
--     p_reportes = [{ id, estado, mostrando, transporte, error }]
--     estado: 'mostrando' | 'sin_respuesta' | 'otra_entrada' | 'error'
--
-- «pedidos» no lo empuja nadie: es el navegador de la TV abierto a mano en
-- pantalla.shakeaholic.mx. Esa página late por su cuenta (pantalla_espejo,
-- 'folios:xxxx') y Admin enseña cuántas están abiertas.
--
-- Todo lo de gerencia lleva candado interno `fn_es_jefe()`.

set lock_timeout = '3s';

create table if not exists public.pantallas_tv (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null check (length(trim(nombre)) between 1 and 60),
  ubicacion         text check (ubicacion is null or length(ubicacion) <= 80),
  ip                text check (ip is null or ip ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'),
  contenido         text not null default 'nada' check (contenido in ('promos', 'menu', 'pedidos', 'nada')),
  segundos          int  not null default 12 check (segundos between 3 and 600),
  activa            boolean not null default true,
  orden             int  not null default 0,
  reenganchar_desde timestamptz,
  reporte           jsonb,
  reportado_en      timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create unique index if not exists pantallas_tv_ip_unica on public.pantallas_tv (ip) where activa and ip is not null;
alter table public.pantallas_tv enable row level security;

create table if not exists public.pantallas_tv_imagenes (
  id        uuid primary key default gen_random_uuid(),
  grupo     text not null check (grupo in ('promos', 'menu')),
  nombre    text not null check (length(trim(nombre)) between 1 and 80),
  url       text not null check (url ~ '^https://'),
  ruta      text,
  segundos  int check (segundos is null or segundos between 3 and 600),
  activa    boolean not null default true,
  orden     int not null default 0,
  desde     date,
  hasta     date,
  creado_en timestamptz not null default now()
);
alter table public.pantallas_tv_imagenes enable row level security;

create table if not exists public.pantallas_tv_agente (
  id               int primary key default 1 check (id = 1),
  token_hash       text,
  llave_creada_en  timestamptz,
  llave_creada_por text,
  ultimo_latido    timestamptz,
  version          text,
  agente_id        text
);
alter table public.pantallas_tv_agente enable row level security;
insert into public.pantallas_tv_agente (id) values (1) on conflict (id) do nothing;

-- Bucket público para las imágenes: la TV las baja por URL, sin sesión.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pantallas', 'pantallas', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
create policy pantallas_tv_leer on storage.objects for select
  using (bucket_id = 'pantallas');
create policy pantallas_tv_subir on storage.objects for insert
  with check (bucket_id = 'pantallas' and fn_es_jefe());
create policy pantallas_tv_cambiar on storage.objects for update
  using (bucket_id = 'pantallas' and fn_es_jefe());

-- ── Gerencia ─────────────────────────────────────────────────────────────
create or replace function public.fn_pantallas_tv_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver las pantallas.';
  end if;
  return jsonb_build_object(
    'ahora', now(),
    'pantallas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre, 'ubicacion', t.ubicacion, 'ip', t.ip,
        'contenido', t.contenido, 'segundos', t.segundos, 'activa', t.activa, 'orden', t.orden,
        'reenganchar_desde', t.reenganchar_desde,
        'reporte', t.reporte, 'reportado_en', t.reportado_en,
        'hace_seg', case when t.reportado_en is null then null
                         else extract(epoch from now() - t.reportado_en)::int end)
        order by t.activa desc, t.orden, t.nombre), '[]'::jsonb) from pantallas_tv t),
    'imagenes', (select coalesce(jsonb_agg(to_jsonb(i) order by i.grupo, i.orden, i.creado_en), '[]'::jsonb)
                   from pantallas_tv_imagenes i),
    'agente', (select jsonb_build_object(
        'tiene_llave', a.token_hash is not null,
        'llave_creada_en', a.llave_creada_en, 'llave_creada_por', a.llave_creada_por,
        'ultimo_latido', a.ultimo_latido, 'version', a.version, 'agente_id', a.agente_id,
        'hace_seg', case when a.ultimo_latido is null then null
                         else extract(epoch from now() - a.ultimo_latido)::int end)
        from pantallas_tv_agente a where a.id = 1),
    'pedidos', (select coalesce(jsonb_agg(jsonb_build_object(
        'pantalla', p.pantalla, 'estado', p.estado,
        'hace_seg', extract(epoch from now() - p.actualizado_en)::int)
        order by p.actualizado_en desc), '[]'::jsonb)
        from pantalla_espejo p
       where p.pantalla like 'folios:%' and p.actualizado_en > now() - interval '12 hours')
  );
end;
$$;

create or replace function public.fn_pantalla_tv_guardar(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las pantallas.';
  end if;
  if (p->>'id') ~ '^[0-9a-f-]{36}$' then
    update pantallas_tv set
      nombre    = coalesce(nullif(trim(p->>'nombre'), ''), nombre),
      ubicacion = case when p ? 'ubicacion' then nullif(trim(coalesce(p->>'ubicacion', '')), '') else ubicacion end,
      ip        = case when p ? 'ip' then nullif(trim(coalesce(p->>'ip', '')), '') else ip end,
      contenido = coalesce(p->>'contenido', contenido),
      segundos  = coalesce((p->>'segundos')::int, segundos),
      activa    = coalesce((p->>'activa')::boolean, activa),
      orden     = coalesce((p->>'orden')::int, orden),
      actualizado_en = now()
    where id = (p->>'id')::uuid
    returning id into v_id;
    if v_id is null then raise exception 'Esa pantalla no existe.'; end if;
  else
    insert into pantallas_tv (nombre, ubicacion, ip, contenido, segundos, orden)
    values (trim(p->>'nombre'),
            nullif(trim(coalesce(p->>'ubicacion', '')), ''),
            nullif(trim(coalesce(p->>'ip', '')), ''),
            coalesce(p->>'contenido', 'nada'),
            coalesce((p->>'segundos')::int, 12),
            coalesce((p->>'orden')::int, (select coalesce(max(orden), 0) + 1 from pantallas_tv)))
    returning id into v_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya hay otra pantalla activa con esa IP.';
end;
$$;

-- «Volver a poner su contenido»: el empujador ve la marca y reengancha la TV
-- (por si alguien le cambió de entrada con el control). Sin id = todas.
create or replace function public.fn_pantalla_tv_reenganchar(p_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las pantallas.';
  end if;
  update pantallas_tv set reenganchar_desde = now()
   where activa and (p_id is null or id = p_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.fn_pantalla_tv_imagen_guardar(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las imágenes de las pantallas.';
  end if;
  if (p->>'id') ~ '^[0-9a-f-]{36}$' then
    update pantallas_tv_imagenes set
      nombre   = coalesce(nullif(trim(p->>'nombre'), ''), nombre),
      segundos = case when p ? 'segundos' then nullif(p->>'segundos', '')::int else segundos end,
      activa   = coalesce((p->>'activa')::boolean, activa),
      orden    = coalesce((p->>'orden')::int, orden),
      desde    = case when p ? 'desde' then nullif(p->>'desde', '')::date else desde end,
      hasta    = case when p ? 'hasta' then nullif(p->>'hasta', '')::date else hasta end,
      grupo    = coalesce(p->>'grupo', grupo)
    where id = (p->>'id')::uuid
    returning id into v_id;
    if v_id is null then raise exception 'Esa imagen no existe.'; end if;
  else
    insert into pantallas_tv_imagenes (grupo, nombre, url, ruta, segundos, orden, desde, hasta)
    values (coalesce(p->>'grupo', 'promos'), trim(p->>'nombre'), p->>'url', p->>'ruta',
            nullif(p->>'segundos', '')::int,
            coalesce((p->>'orden')::int,
                     (select coalesce(max(orden), 0) + 1 from pantallas_tv_imagenes where grupo = coalesce(p->>'grupo', 'promos'))),
            nullif(p->>'desde', '')::date, nullif(p->>'hasta', '')::date)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- La llave del empujador. Se enseña UNA vez (solo se guarda el hash);
-- generar otra deja sin servir la anterior.
create or replace function public.fn_pantallas_tv_llave()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v text; v_quien text;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede generar la llave de las pantallas.';
  end if;
  v := 'tv_' || encode(extensions.gen_random_bytes(24), 'hex');
  select e.nombre into v_quien from empleados e where e.auth_user_id = auth.uid() limit 1;
  update pantallas_tv_agente
     set token_hash = encode(extensions.digest(v, 'sha256'), 'hex'),
         llave_creada_en = now(), llave_creada_por = v_quien
   where id = 1;
  return v;
end;
$$;

-- ── El empujador (PC de la tienda) ───────────────────────────────────────
create or replace function public.fn_pantallas_tv_agente(p_token text, p_version text default null, p_agente text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_hoy date := (now() at time zone 'America/Merida')::date;
begin
  if coalesce(p_token, '') = '' or not exists (
       select 1 from pantallas_tv_agente
        where id = 1 and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'Llave de pantallas inválida.' using hint = 'llave_invalida';
  end if;
  update pantallas_tv_agente
     set ultimo_latido = now(),
         version   = coalesce(nullif(left(trim(p_version), 20), ''), version),
         agente_id = coalesce(nullif(left(trim(p_agente), 60), ''), agente_id)
   where id = 1;
  return jsonb_build_object(
    'ahora', now(),
    'pantallas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre, 'ip', t.ip, 'contenido', t.contenido,
        'segundos', t.segundos, 'reenganchar_desde', t.reenganchar_desde,
        'diapositivas', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', i.id, 'nombre', i.nombre, 'url', i.url,
                            'segundos', coalesce(i.segundos, t.segundos))
                            order by i.orden, i.creado_en), '[]'::jsonb)
                           from pantallas_tv_imagenes i
                          where i.grupo = t.contenido and i.activa
                            and (i.desde is null or i.desde <= v_hoy)
                            and (i.hasta is null or i.hasta >= v_hoy)))
        order by t.orden, t.nombre), '[]'::jsonb)
        from pantallas_tv t where t.activa and t.ip is not null)
  );
end;
$$;

create or replace function public.fn_pantallas_tv_reportar(p_token text, p_reportes jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare r jsonb; n int := 0; k int := 0;
begin
  if coalesce(p_token, '') = '' or not exists (
       select 1 from pantallas_tv_agente
        where id = 1 and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'Llave de pantallas inválida.' using hint = 'llave_invalida';
  end if;
  update pantallas_tv_agente set ultimo_latido = now() where id = 1;
  if jsonb_typeof(p_reportes) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_reportes) loop
    k := k + 1;
    exit when k > 50;
    continue when coalesce(r->>'id', '') !~ '^[0-9a-f-]{36}$' or length(r::text) > 2000;
    update pantallas_tv
       set reporte = r - 'id', reportado_en = now()
     where id = (r->>'id')::uuid;
    if found then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- ── Compatibilidad con el empujador que ya existe (agente-pantallas/) ────
-- Ese agente espera, por TV, una sola `url` (+ `tipo`, `activa`) y reporta
-- por `ip` con `{ mostrando, transporte, correcto, detalle }`. Se le da eso
-- también, sin quitar la lista de diapositivas: `url` es la diapositiva que
-- toca AHORA (rota cada `segundos` de la TV), así que con solo mandar su
-- llave ya funciona; la lista completa sigue ahí para rotar fino en la PC.
create or replace function public.fn_pantallas_tv_agente(p_token text, p_version text default null, p_agente text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_hoy date := (now() at time zone 'America/Merida')::date;
begin
  if coalesce(p_token, '') = '' or not exists (
       select 1 from pantallas_tv_agente
        where id = 1 and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'Llave de pantallas inválida.' using hint = 'llave_invalida';
  end if;
  update pantallas_tv_agente
     set ultimo_latido = now(),
         version   = coalesce(nullif(left(trim(p_version), 20), ''), version),
         agente_id = coalesce(nullif(left(trim(p_agente), 60), ''), agente_id)
   where id = 1;
  return jsonb_build_object(
    'ahora', now(),
    'pantallas', (select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'nombre', t.nombre, 'ip', t.ip, 'contenido', t.contenido,
          'segundos', t.segundos, 'reenganchar_desde', t.reenganchar_desde,
          'diapositivas', coalesce(x.lista, '[]'::jsonb),
          'activa', t.contenido in ('promos', 'menu') and jsonb_array_length(coalesce(x.lista, '[]'::jsonb)) > 0,
          'tipo', 'imagen',
          'url', x.lista -> (floor(extract(epoch from now()) / t.segundos)::bigint % greatest(jsonb_array_length(coalesce(x.lista, '[]'::jsonb)), 1))::int ->> 'url',
          'titulo', x.lista -> (floor(extract(epoch from now()) / t.segundos)::bigint % greatest(jsonb_array_length(coalesce(x.lista, '[]'::jsonb)), 1))::int ->> 'nombre')
        order by t.orden, t.nombre), '[]'::jsonb)
        from pantallas_tv t
        left join lateral (
          select jsonb_agg(jsonb_build_object(
                   'id', i.id, 'nombre', i.nombre, 'url', i.url,
                   'segundos', coalesce(i.segundos, t.segundos))
                 order by i.orden, i.creado_en) as lista
            from pantallas_tv_imagenes i
           where i.grupo = t.contenido and i.activa
             and (i.desde is null or i.desde <= v_hoy)
             and (i.hasta is null or i.hasta >= v_hoy)) x on true
       where t.activa and t.ip is not null)
  );
end;
$$;

create or replace function public.fn_pantallas_tv_reportar(p_token text, p_reportes jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare r jsonb; n int := 0; k int := 0; v_estado text;
begin
  if coalesce(p_token, '') = '' or not exists (
       select 1 from pantallas_tv_agente
        where id = 1 and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'Llave de pantallas inválida.' using hint = 'llave_invalida';
  end if;
  update pantallas_tv_agente set ultimo_latido = now() where id = 1;
  if jsonb_typeof(p_reportes) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_reportes) loop
    k := k + 1;
    exit when k > 50;
    continue when length(r::text) > 2000;
    -- La forma del agente existente: `correcto` + `detalle` en vez de `estado`.
    v_estado := coalesce(r->>'estado',
                  case when (r->>'correcto')::boolean then 'mostrando'
                       when r ? 'correcto' then 'error' end);
    update pantallas_tv
       set reporte = (r - 'id' - 'ip') || jsonb_strip_nulls(jsonb_build_object(
                       'estado', v_estado, 'error', coalesce(r->>'error', r->>'detalle'))),
           reportado_en = now()
     where activa
       and ((coalesce(r->>'id', '') ~ '^[0-9a-f-]{36}$' and id = (r->>'id')::uuid)
         or (coalesce(r->>'id', '') = '' and ip = r->>'ip'));
    if found then n := n + 1; end if;
  end loop;
  return n;
end;
$$;
