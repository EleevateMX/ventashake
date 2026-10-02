-- =============================================================================
-- Aliados: las marcas con las que colaboramos, en la app de Rewards (02/10/26).
--
-- Un catálogo chico: logo, qué son, cómo contactarlos y la promo que tienen
-- con Shakeaholic («10% en ProDetail enseñando tu tarjeta»). Se administra
-- desde Admin → Aliados; la app solo lo pinta (fn_aliados, pública: es
-- publicidad, no hay nada que proteger). Los logos van a un bucket PÚBLICO,
-- como las fotos de los productos.
-- =============================================================================

create table if not exists aliados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  logo_url text,
  promo_titulo text,
  promo_texto text,
  web text,
  whatsapp text,
  instagram text,
  telefono text,
  direccion text,
  orden int not null default 100,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table aliados enable row level security;
revoke all on aliados from anon, authenticated, public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aliados', 'aliados', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists aliados_leer on storage.objects;
drop policy if exists aliados_subir on storage.objects;
drop policy if exists aliados_cambiar on storage.objects;
drop policy if exists aliados_borrar on storage.objects;
create policy aliados_leer on storage.objects for select
  using (bucket_id = 'aliados');
create policy aliados_subir on storage.objects for insert
  with check (bucket_id = 'aliados' and fn_es_jefe());
create policy aliados_cambiar on storage.objects for update
  using (bucket_id = 'aliados' and fn_es_jefe());
create policy aliados_borrar on storage.objects for delete
  using (bucket_id = 'aliados' and fn_es_jefe());

-- Lo que ve el cliente: solo los activos, en orden.
create or replace function public.fn_aliados()
returns table(id uuid, nombre text, descripcion text, logo_url text, promo_titulo text, promo_texto text,
              web text, whatsapp text, instagram text, telefono text, direccion text, orden int)
language sql stable security definer set search_path to 'public'
as $$
  select id, nombre, descripcion, logo_url, promo_titulo, promo_texto,
         web, whatsapp, instagram, telefono, direccion, orden
    from aliados
   where activo
   order by orden, nombre;
$$;
grant execute on function public.fn_aliados() to anon, authenticated;

-- Admin: todos, incluidos los apagados.
create or replace function public.fn_aliados_admin()
returns setof aliados
language sql stable security definer set search_path to 'public'
as $$
  select * from aliados where fn_es_jefe() order by orden, nombre;
$$;
revoke execute on function public.fn_aliados_admin() from anon, public;
grant execute on function public.fn_aliados_admin() to authenticated;

-- Alta o cambio en una sola llamada. Sin id = nuevo.
create or replace function public.fn_aliado_guardar(p jsonb)
returns aliados
language plpgsql security definer set search_path to 'public'
as $$
declare v aliados;
begin
  if not fn_es_jefe() then raise exception 'Solo gerencia puede editar los aliados.'; end if;
  if coalesce(btrim(p->>'nombre'), '') = '' then raise exception 'El aliado necesita nombre.'; end if;
  if (p->>'id') is null then
    insert into aliados (nombre, descripcion, logo_url, promo_titulo, promo_texto, web, whatsapp, instagram, telefono, direccion, orden, activo)
    values (btrim(p->>'nombre'), nullif(btrim(p->>'descripcion'), ''), nullif(btrim(p->>'logo_url'), ''),
            nullif(btrim(p->>'promo_titulo'), ''), nullif(btrim(p->>'promo_texto'), ''),
            nullif(btrim(p->>'web'), ''), nullif(btrim(p->>'whatsapp'), ''), nullif(btrim(p->>'instagram'), ''),
            nullif(btrim(p->>'telefono'), ''), nullif(btrim(p->>'direccion'), ''),
            coalesce((p->>'orden')::int, 100), coalesce((p->>'activo')::boolean, true))
    returning * into v;
  else
    update aliados set
      nombre = btrim(p->>'nombre'),
      descripcion = nullif(btrim(p->>'descripcion'), ''),
      logo_url = nullif(btrim(p->>'logo_url'), ''),
      promo_titulo = nullif(btrim(p->>'promo_titulo'), ''),
      promo_texto = nullif(btrim(p->>'promo_texto'), ''),
      web = nullif(btrim(p->>'web'), ''),
      whatsapp = nullif(btrim(p->>'whatsapp'), ''),
      instagram = nullif(btrim(p->>'instagram'), ''),
      telefono = nullif(btrim(p->>'telefono'), ''),
      direccion = nullif(btrim(p->>'direccion'), ''),
      orden = coalesce((p->>'orden')::int, orden),
      activo = coalesce((p->>'activo')::boolean, activo),
      actualizado_en = now()
    where id = (p->>'id')::uuid
    returning * into v;
    if v.id is null then raise exception 'Ese aliado ya no existe.'; end if;
  end if;
  return v;
end;
$$;
revoke execute on function public.fn_aliado_guardar(jsonb) from anon, public;
grant execute on function public.fn_aliado_guardar(jsonb) to authenticated;

create or replace function public.fn_aliado_borrar(p_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not fn_es_jefe() then raise exception 'Solo gerencia puede editar los aliados.'; end if;
  delete from aliados where id = p_id;
end;
$$;
revoke execute on function public.fn_aliado_borrar(uuid) from anon, public;
grant execute on function public.fn_aliado_borrar(uuid) to authenticated;
