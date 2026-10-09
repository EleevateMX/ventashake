-- Frases del pie de la etiqueta, administrables y por temporada (09/10/26).
--
-- Hasta hoy eran 21 frases escritas dentro del agente de impresión
-- (agente-impresion/src/tspl.ts, FRASES): cambiar una exigía una versión
-- nueva del agente. Gerencia quiere ponerles nombre, agruparlas por
-- temporada (Halloween, Navidad…) y poder imprimir a Milo junto a la frase.
--
-- Cómo llegan al papel: el agente pide `fn_imprimir_frases` con su token
-- cada 10 minutos y las guarda en disco (sin internet sigue con las últimas;
-- sin nada, con las de su código). No se tocó el encolado de comandas: está
-- en el camino del cobro y una frase no vale ese riesgo.
--
-- Qué frase toca hoy: si una temporada ACTIVA cubre la fecha de Mérida y
-- tiene frases activas, salen solo las suyas; si no, las «de siempre»
-- (sin temporada). Una temporada puede cruzar el año (12-01 → 01-06).
--
-- El texto se imprime en dos renglones de 14 caracteres y en cp850: el
-- servidor rechaza lo que no cabe (`fn_frase_cabe`, la misma regla que
-- `partir` del agente y su prueba) y lo que no es ASCII. La pantalla quita
-- los acentos antes de guardar.

create or replace function public.fn_frase_cabe(p_texto text)
 returns boolean
 language plpgsql
 immutable
as $function$
declare v_palabra text; v_linea int := 0; v_lineas int := 1; v_largo int;
begin
  if p_texto is null or btrim(p_texto) = '' then return false; end if;
  if p_texto !~ '^[ -~]+$' then return false; end if;
  foreach v_palabra in array regexp_split_to_array(btrim(p_texto), '\s+') loop
    v_largo := length(v_palabra);
    if v_largo > 14 then return false; end if;
    if v_linea = 0 then
      v_linea := v_largo;
    elsif v_linea + 1 + v_largo <= 14 then
      v_linea := v_linea + 1 + v_largo;
    else
      v_lineas := v_lineas + 1;
      v_linea := v_largo;
    end if;
  end loop;
  return v_lineas <= 2;
end;
$function$;

create table if not exists public.temporadas_etiqueta (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(btrim(nombre)) between 1 and 40),
  desde_mmdd text not null check (desde_mmdd ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  hasta_mmdd text not null check (hasta_mmdd ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  activa boolean not null default false,
  con_milo boolean not null default false,
  creada_en timestamptz not null default now()
);

create table if not exists public.frases_etiqueta (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 40),
  texto text not null check (public.fn_frase_cabe(texto)),
  temporada_id uuid references public.temporadas_etiqueta(id) on delete set null,
  activa boolean not null default true,
  con_milo boolean not null default false,
  archivada boolean not null default false,
  orden int not null default 0,
  creada_en timestamptz not null default now()
);

alter table public.temporadas_etiqueta enable row level security;
alter table public.frases_etiqueta enable row level security;
revoke all on table public.temporadas_etiqueta from anon, authenticated, public;
revoke all on table public.frases_etiqueta from anon, authenticated, public;

-- Las 21 de siempre, tal cual estaban en el agente, ya con nombre.
insert into public.frases_etiqueta (nombre, texto, orden)
select n, t, o from (values
  ('Buen día', 'Buen dia!', 1),
  ('Shakeaholic', 'Eres un shakeaholic', 2),
  ('Que lo disfrutes', 'Que lo disfrutes!', 3),
  ('Hecho para ti', 'Hecho para ti', 4),
  ('Gracias', 'Gracias por venir', 5),
  ('Consentirse', 'Hoy toca consentirse', 6),
  ('Shake, train, repeat', 'Shake, train and repeat', 7),
  ('No pain', 'No pain, no gain', 8),
  ('Más fuerte', 'Mas fuerte que ayer', 9),
  ('Tu único rival', 'Tu unico rival: ayer', 10),
  ('Última rep', 'La ultima rep cuenta', 11),
  ('Sin excusas', 'Sin excusas hoy', 12),
  ('Campeón', 'A darle, campeon!', 13),
  ('Suda, sonríe', 'Suda, sonrie, repite', 14),
  ('Ganado', 'Ganado, no regalado', 15),
  ('Beast mode', 'Beast mode: ON', 16),
  ('Eat. Sleep. Shake.', 'Eat. Sleep. Shake.', 17),
  ('Rompe tu récord', 'Rompe tu record hoy', 18),
  ('Nacido para entrenar', 'Nacido para entrenar', 19),
  ('Disciplina', 'La disciplina gana', 20),
  ('Proteína y actitud', 'Proteina y actitud', 21)
) v(n, t, o)
where not exists (select 1 from public.frases_etiqueta);

-- Dos temporadas listas para llenar, APAGADAS: gerencia escribe sus frases
-- y las prende. Sin frases, una temporada prendida no cambia nada.
insert into public.temporadas_etiqueta (nombre, desde_mmdd, hasta_mmdd, activa, con_milo)
values ('Halloween', '10-20', '10-31', false, true),
       ('Navidad', '12-01', '01-06', false, true)
on conflict (nombre) do nothing;

-- ¿Hoy cae dentro de la temporada? Cruza el año si «desde» > «hasta».
create or replace function public.fn_temporada_cubre(p_desde text, p_hasta text, p_hoy text)
 returns boolean
 language sql
 immutable
as $function$
  select case when p_desde <= p_hasta then p_hoy between p_desde and p_hasta
              else p_hoy >= p_desde or p_hoy <= p_hasta end;
$function$;

-- Lo que el agente imprime hoy. Solo con el token de una impresora activa.
create or replace function public.fn_imprimir_frases(p_token uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v_hoy text; v_temp temporadas_etiqueta; v_frases jsonb;
begin
  if not exists (select 1 from impresoras where agente_token = p_token and activa) then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;
  v_hoy := to_char(now() at time zone 'America/Merida', 'MM-DD');

  select t.* into v_temp
    from temporadas_etiqueta t
   where t.activa and fn_temporada_cubre(t.desde_mmdd, t.hasta_mmdd, v_hoy)
     and exists (select 1 from frases_etiqueta f where f.temporada_id = t.id and f.activa and not f.archivada)
   order by t.desde_mmdd, t.nombre
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('texto', f.texto, 'milo', f.con_milo or coalesce(v_temp.con_milo, false))
                            order by f.orden, f.creada_en), '[]'::jsonb)
    into v_frases
    from frases_etiqueta f
   where f.activa and not f.archivada
     and (case when v_temp.id is null then f.temporada_id is null else f.temporada_id = v_temp.id end);

  return jsonb_build_object('temporada', v_temp.nombre, 'frases', v_frases, 'hoy', v_hoy);
end;
$function$;
revoke all on function public.fn_imprimir_frases(uuid) from public;
grant execute on function public.fn_imprimir_frases(uuid) to anon, authenticated;

-- Admin: todo lo que hay, para la pantalla.
create or replace function public.fn_frases_admin()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v_hoy text := to_char(now() at time zone 'America/Merida', 'MM-DD');
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  return jsonb_build_object(
    'hoy', v_hoy,
    'temporadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'nombre', t.nombre, 'desde', t.desde_mmdd, 'hasta', t.hasta_mmdd,
               'activa', t.activa, 'con_milo', t.con_milo,
               'cubre_hoy', fn_temporada_cubre(t.desde_mmdd, t.hasta_mmdd, v_hoy))
             order by t.desde_mmdd, t.nombre)
        from temporadas_etiqueta t), '[]'::jsonb),
    'frases', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'nombre', f.nombre, 'texto', f.texto, 'temporada_id', f.temporada_id,
               'activa', f.activa, 'con_milo', f.con_milo, 'orden', f.orden)
             order by f.orden, f.creada_en)
        from frases_etiqueta f where not f.archivada), '[]'::jsonb),
    -- Para avisar si la PC todavía no sabe leerlas.
    'agentes', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'version', i.agente_version))
        from impresoras i where i.activa), '[]'::jsonb)
  );
end;
$function$;
revoke all on function public.fn_frases_admin() from public, anon;
grant execute on function public.fn_frases_admin() to authenticated;

create or replace function public.fn_frase_guardar(
  p_id uuid, p_nombre text, p_texto text, p_temporada_id uuid,
  p_activa boolean default true, p_con_milo boolean default false, p_archivar boolean default false
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las frases.';
  end if;
  if not fn_frase_cabe(p_texto) then
    raise exception 'La frase no cabe en dos renglones de 14 letras (o trae acentos o símbolos que la impresora no tiene).';
  end if;
  if p_id is null then
    insert into frases_etiqueta (nombre, texto, temporada_id, activa, con_milo, orden)
    values (btrim(p_nombre), btrim(p_texto), p_temporada_id, coalesce(p_activa, true), coalesce(p_con_milo, false),
            coalesce((select max(orden) from frases_etiqueta), 0) + 1)
    returning id into v_id;
  else
    update frases_etiqueta
       set nombre = btrim(p_nombre), texto = btrim(p_texto), temporada_id = p_temporada_id,
           activa = coalesce(p_activa, activa), con_milo = coalesce(p_con_milo, con_milo),
           archivada = coalesce(p_archivar, false)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Esa frase no existe.'; end if;
  end if;
  return v_id;
end;
$function$;
revoke all on function public.fn_frase_guardar(uuid, text, text, uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.fn_frase_guardar(uuid, text, text, uuid, boolean, boolean, boolean) to authenticated;

create or replace function public.fn_temporada_guardar(
  p_id uuid, p_nombre text, p_desde text, p_hasta text, p_activa boolean, p_con_milo boolean
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las temporadas.';
  end if;
  if p_id is null then
    insert into temporadas_etiqueta (nombre, desde_mmdd, hasta_mmdd, activa, con_milo)
    values (btrim(p_nombre), p_desde, p_hasta, coalesce(p_activa, false), coalesce(p_con_milo, false))
    returning id into v_id;
  else
    update temporadas_etiqueta
       set nombre = btrim(p_nombre), desde_mmdd = p_desde, hasta_mmdd = p_hasta,
           activa = coalesce(p_activa, activa), con_milo = coalesce(p_con_milo, con_milo)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Esa temporada no existe.'; end if;
  end if;
  return v_id;
end;
$function$;
revoke all on function public.fn_temporada_guardar(uuid, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.fn_temporada_guardar(uuid, text, text, text, boolean, boolean) to authenticated;

-- «Probar · gasta 1»: una etiqueta de prueba con ESA frase (y Milo si se
-- pidió), para ver en papel cómo queda antes de prenderla. Agentes viejos
-- (< 1.5.0) imprimen la prueba de siempre: no fallan, solo no la ponen.
create or replace function public.fn_frase_probar(p_impresora_id uuid, p_texto text, p_milo boolean)
 returns trabajos_impresion
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_impresora impresoras; v_trabajo trabajos_impresion;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  if not fn_frase_cabe(p_texto) then
    raise exception 'La frase no cabe en dos renglones de 14 letras.';
  end if;
  select * into v_impresora from impresoras where id = p_impresora_id and activa;
  if not found then
    raise exception 'Esa impresora no existe o esta apagada';
  end if;
  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_impresora.id, 'comanda', jsonb_build_object(
    'prueba', true, 'impresora', v_impresora.nombre, 'hora', now(),
    'frase_prueba', btrim(p_texto), 'milo', coalesce(p_milo, false)
  ), gen_random_uuid())
  returning * into v_trabajo;
  return v_trabajo;
end;
$function$;
revoke all on function public.fn_frase_probar(uuid, text, boolean) from public, anon;
grant execute on function public.fn_frase_probar(uuid, text, boolean) to authenticated;
