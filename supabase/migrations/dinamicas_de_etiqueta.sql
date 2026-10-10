-- Dinámicas con premios en la etiqueta: «Trick or Shake» (10/10/26).
--
-- Gerencia quería boletos en un caldero —3 rondas de 150: 139 TRICK, 10
-- LITTLE TREAT y 1 BIG TREAT (una taza)— y propuso usar la etiqueta del vaso
-- como boleto: donde va la frase del pie sale el resultado, con folio.
--
-- Cómo está armado, y por qué así:
--   * Cada ronda se GENERA completa al abrirse: las 150 posiciones con su
--     resultado, barajadas en la base. Así las cantidades son exactas por
--     construcción (no hay forma de que salgan dos tazas o ninguna) y el
--     premio mayor puede quedar dentro de un rango (p. ej. 100–150) sin que
--     el resto deje de ser al azar.
--   * Se asigna el SIGUIENTE boleto libre a cada compra con bebida, cuando se
--     crea su comanda de barra (trigger BEFORE INSERT en trabajos_impresion).
--     Nadie elige ni ve qué sigue: la tabla está cerrada y gerencia solo ve
--     conteos y lo ya asignado.
--   * Uno por orden (`unique (dinamica_id, orden_id)`): una reimpresión copia
--     el payload tal cual y repite el mismo resultado sin gastar otro boleto.
--   * Una orden de prueba (`es_demo`) no participa.
--   * Al acabarse los 150, la ronda se cierra sola; la siguiente se abre
--     desde Admin («Abrir ronda 2»), como pidió gerencia.
--   * ⚠ Esto corre DENTRO de la cadena del cobro (cocina_items → comanda).
--     Todo va en un bloque que se traga cualquier error: si la dinámica
--     falla, la comanda sale con su frase de siempre y el cobro no se entera.
--     Sin tablas temporales ni `delete` (CLAUDE.md §4).
--   * El agente (1.6.0) pone el texto en la primera etiqueta del pedido y el
--     folio junto a la fecha. Uno viejo ignora el campo: sale la frase normal.

create table if not exists public.dinamicas_etiqueta (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  activa boolean not null default false,
  desde date,
  hasta date,
  rondas_max int not null default 1 check (rondas_max between 1 and 50),
  tamano_ronda int not null check (tamano_ronda between 1 and 5000),
  -- Solo participa la comanda de esta estación: «compra con bebida».
  estacion text not null default 'Bebidas',
  -- Posiciones (1..tamaño) donde puede caer el premio mayor; null = cualquiera.
  principal_desde int,
  principal_hasta int,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.dinamica_resultados (
  id uuid primary key default gen_random_uuid(),
  dinamica_id uuid not null references public.dinamicas_etiqueta(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 40),
  -- Lo que se imprime: las mismas reglas que una frase (2 renglones de 14, sin acentos raros).
  texto text not null check (fn_frase_cabe(texto)),
  cantidad int not null check (cantidad >= 0),
  es_premio boolean not null default false,
  es_principal boolean not null default false,
  milo boolean not null default false,
  orden int not null default 0
);

create table if not exists public.dinamica_rondas (
  id uuid primary key default gen_random_uuid(),
  dinamica_id uuid not null references public.dinamicas_etiqueta(id) on delete cascade,
  numero int not null,
  abierta_en timestamptz not null default now(),
  cerrada_en timestamptz,
  unique (dinamica_id, numero)
);

create table if not exists public.dinamica_boletos (
  id uuid primary key default gen_random_uuid(),
  dinamica_id uuid not null references public.dinamicas_etiqueta(id) on delete cascade,
  ronda_id uuid not null references public.dinamica_rondas(id) on delete cascade,
  posicion int not null,
  resultado_id uuid not null references public.dinamica_resultados(id),
  folio text not null,
  orden_id uuid references public.ordenes(id),
  asignado_en timestamptz,
  entregado_en timestamptz,
  entregado_por uuid references public.empleados(id),
  unique (ronda_id, posicion),
  unique (dinamica_id, folio),
  unique (dinamica_id, orden_id)
);
create index if not exists dinamica_boletos_libres on public.dinamica_boletos (ronda_id, posicion) where orden_id is null;

alter table public.dinamicas_etiqueta enable row level security;
alter table public.dinamica_resultados enable row level security;
alter table public.dinamica_rondas enable row level security;
alter table public.dinamica_boletos enable row level security;
revoke all on public.dinamicas_etiqueta, public.dinamica_resultados, public.dinamica_rondas, public.dinamica_boletos
  from anon, authenticated;

-- Valida que la configuración cuadre. Devuelve el problema o null.
create or replace function public._dinamica_problema(p_id uuid)
 returns text
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare d record; v_suma int; v_princ int;
begin
  select * into d from dinamicas_etiqueta where id = p_id;
  if d.id is null then return 'No existe esa dinámica.'; end if;
  select coalesce(sum(cantidad), 0), coalesce(sum(cantidad) filter (where es_principal), 0)
    into v_suma, v_princ from dinamica_resultados where dinamica_id = p_id;
  if v_suma <> d.tamano_ronda then
    return format('Los resultados suman %s y la ronda es de %s: tienen que ser iguales.', v_suma, d.tamano_ronda);
  end if;
  if d.principal_desde is not null or d.principal_hasta is not null then
    if coalesce(d.principal_desde, 1) < 1 or coalesce(d.principal_hasta, d.tamano_ronda) > d.tamano_ronda
       or coalesce(d.principal_desde, 1) > coalesce(d.principal_hasta, d.tamano_ronda) then
      return format('El rango del premio mayor tiene que estar entre 1 y %s.', d.tamano_ronda);
    end if;
    if v_princ > coalesce(d.principal_hasta, d.tamano_ronda) - coalesce(d.principal_desde, 1) + 1 then
      return 'Hay más premios mayores que lugares en su rango.';
    end if;
  end if;
  if d.desde is not null and d.hasta is not null and d.hasta < d.desde then
    return 'La fecha de fin es antes que la de inicio.';
  end if;
  return null;
end;
$function$;
revoke all on function public._dinamica_problema(uuid) from public, anon, authenticated;

-- Genera la siguiente ronda completa y barajada. Devuelve su número, o null
-- si ya se usaron todas.
create or replace function public._dinamica_generar_ronda(p_id uuid)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare d record; v_n int; v_r uuid; v_problema text;
begin
  select * into d from dinamicas_etiqueta where id = p_id for update;
  v_problema := _dinamica_problema(p_id);
  if v_problema is not null then raise exception '%', v_problema; end if;
  if exists (select 1 from dinamica_rondas where dinamica_id = p_id and cerrada_en is null) then
    raise exception 'Todavía hay una ronda abierta.';
  end if;
  select coalesce(max(numero), 0) + 1 into v_n from dinamica_rondas where dinamica_id = p_id;
  if v_n > d.rondas_max then return null; end if;

  insert into dinamica_rondas (dinamica_id, numero) values (p_id, v_n) returning id into v_r;

  with expandido as (
    select r.id resultado_id, r.es_principal
      from dinamica_resultados r, generate_series(1, r.cantidad)
     where r.dinamica_id = p_id
  ),
  principales as (
    select resultado_id, row_number() over (order by random()) k from expandido where es_principal
  ),
  lugar_principal as (
    select p, row_number() over (order by random()) k
      from generate_series(coalesce(d.principal_desde, 1), coalesce(d.principal_hasta, d.tamano_ronda)) p
  ),
  con_principal as (
    select l.p posicion, pr.resultado_id from principales pr join lugar_principal l using (k)
  ),
  resto as (
    select resultado_id, row_number() over (order by random()) k from expandido where not es_principal
  ),
  lugar_resto as (
    select p, row_number() over (order by p) k
      from generate_series(1, d.tamano_ronda) p
     where p not in (select posicion from con_principal)
  )
  insert into dinamica_boletos (dinamica_id, ronda_id, posicion, resultado_id, folio)
  select p_id, v_r, t.posicion, t.resultado_id, 'R' || v_n || '-' || lpad(t.posicion::text, 3, '0')
    from (select posicion, resultado_id from con_principal
          union all
          select l.p, r.resultado_id from resto r join lugar_resto l using (k)) t;

  return v_n;
end;
$function$;
revoke all on function public._dinamica_generar_ronda(uuid) from public, anon, authenticated;

-- El boleto de una orden: el que ya tiene, o el siguiente libre.
create or replace function public.fn_dinamica_boleto_para_orden(p_orden uuid, p_estacion text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d record; b record; v_hoy date := (now() at time zone 'America/Merida')::date;
  v_bid uuid; v_ronda uuid;
begin
  select * into d from dinamicas_etiqueta
   where activa and (desde is null or desde <= v_hoy) and (hasta is null or hasta >= v_hoy)
   order by creado_en desc limit 1;
  if d.id is null then return null; end if;

  -- ¿Ya participó? Mismo resultado, sin gastar otro.
  select bo.folio, r.texto, r.milo, r.nombre, r.es_premio into b
    from dinamica_boletos bo join dinamica_resultados r on r.id = bo.resultado_id
   where bo.dinamica_id = d.id and bo.orden_id = p_orden;
  if found then
    return jsonb_build_object('campana', d.nombre, 'folio', b.folio, 'texto', b.texto,
                              'milo', b.milo, 'resultado', b.nombre, 'premio', b.es_premio);
  end if;

  if lower(coalesce(p_estacion, '')) <> lower(d.estacion) then return null; end if;

  select bo.id, bo.ronda_id into v_bid, v_ronda
    from dinamica_boletos bo join dinamica_rondas ro on ro.id = bo.ronda_id
   where bo.dinamica_id = d.id and bo.orden_id is null and ro.cerrada_en is null
   order by ro.numero, bo.posicion
   limit 1
   for update of bo skip locked;
  if v_bid is null then return null; end if;   -- ronda agotada: espera a que abran la siguiente

  update dinamica_boletos set orden_id = p_orden, asignado_en = now() where id = v_bid;
  if not exists (select 1 from dinamica_boletos where ronda_id = v_ronda and orden_id is null) then
    update dinamica_rondas set cerrada_en = now() where id = v_ronda;
  end if;

  select bo.folio, r.texto, r.milo, r.nombre, r.es_premio into b
    from dinamica_boletos bo join dinamica_resultados r on r.id = bo.resultado_id
   where bo.id = v_bid;
  return jsonb_build_object('campana', d.nombre, 'folio', b.folio, 'texto', b.texto,
                            'milo', b.milo, 'resultado', b.nombre, 'premio', b.es_premio);
end;
$function$;
revoke all on function public.fn_dinamica_boleto_para_orden(uuid, text) from public, anon, authenticated;

-- El enganche con la impresión. Nunca rompe la comanda.
create or replace function public.trg_trabajo_dinamica()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if NEW.tipo_documento = 'comanda' and NEW.orden_id is not null and NEW.copia_de is null
     and not coalesce(NEW.payload ? 'dinamica', false)
     and coalesce(NEW.payload->>'prueba', 'false') <> 'true' then
    begin
      if not exists (select 1 from ordenes where id = NEW.orden_id and es_demo) then
        v := fn_dinamica_boleto_para_orden(NEW.orden_id, NEW.payload->>'estacion');
        if v is not null then
          NEW.payload := coalesce(NEW.payload, '{}'::jsonb) || jsonb_build_object('dinamica', v);
        end if;
      end if;
    exception when others then
      raise warning 'Dinámica de etiqueta: %', sqlerrm;
    end;
  end if;
  return NEW;
end;
$function$;
revoke all on function public.trg_trabajo_dinamica() from public, anon, authenticated;

create or replace trigger trg_trabajo_dinamica
  before insert on public.trabajos_impresion
  for each row execute function trg_trabajo_dinamica();

-- ---------------------------------------------------------------------------
-- Admin (solo gerencia)
-- ---------------------------------------------------------------------------

create or replace function public.fn_dinamicas_admin()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'nombre', d.nombre, 'activa', d.activa, 'desde', d.desde, 'hasta', d.hasta,
      'rondas_max', d.rondas_max, 'tamano_ronda', d.tamano_ronda, 'estacion', d.estacion,
      'principal_desde', d.principal_desde, 'principal_hasta', d.principal_hasta,
      'problema', _dinamica_problema(d.id),
      'resultados', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'texto', r.texto, 'cantidad', r.cantidad,
          'es_premio', r.es_premio, 'es_principal', r.es_principal, 'milo', r.milo, 'orden', r.orden)
          order by r.orden, r.nombre) from dinamica_resultados r where r.dinamica_id = d.id), '[]'::jsonb),
      -- Por ronda: cuántos salieron de cada resultado. Nunca qué posición
      -- tiene qué: eso no lo ve nadie.
      'rondas', coalesce((select jsonb_agg(jsonb_build_object(
          'numero', ro.numero, 'abierta_en', ro.abierta_en, 'cerrada_en', ro.cerrada_en,
          'total', (select count(*) from dinamica_boletos b where b.ronda_id = ro.id),
          'asignados', (select count(*) from dinamica_boletos b where b.ronda_id = ro.id and b.orden_id is not null),
          'por_resultado', (select jsonb_agg(jsonb_build_object('nombre', r.nombre,
              'total', (select count(*) from dinamica_boletos b where b.ronda_id = ro.id and b.resultado_id = r.id),
              'salieron', (select count(*) from dinamica_boletos b where b.ronda_id = ro.id and b.resultado_id = r.id and b.orden_id is not null))
              order by r.orden, r.nombre)
              from dinamica_resultados r where r.dinamica_id = d.id))
          order by ro.numero) from dinamica_rondas ro where ro.dinamica_id = d.id), '[]'::jsonb),
      'premios', coalesce((select jsonb_agg(jsonb_build_object(
          'boleto_id', b.id, 'folio', b.folio, 'resultado', r.nombre, 'principal', r.es_principal,
          'orden_folio', o.folio, 'cliente', coalesce(o.nombre_cliente, ''),
          'asignado_en', b.asignado_en, 'entregado_en', b.entregado_en,
          'entregado_por', (select e.nombre from empleados e where e.id = b.entregado_por))
          order by b.asignado_en desc)
          from dinamica_boletos b join dinamica_resultados r on r.id = b.resultado_id
          left join ordenes o on o.id = b.orden_id
         where b.dinamica_id = d.id and b.orden_id is not null and r.es_premio), '[]'::jsonb)
    ) order by d.creado_en desc)
    from dinamicas_etiqueta d), '[]'::jsonb);
end;
$function$;
revoke all on function public.fn_dinamicas_admin() from public, anon;
grant execute on function public.fn_dinamicas_admin() to authenticated;

-- Crea o actualiza una dinámica con sus resultados. Los cambios de
-- cantidades aplican a las rondas que se abran después: la abierta ya está
-- barajada y no se toca.
create or replace function public.fn_dinamica_guardar(p jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid := nullif(p->>'id', '')::uuid; r jsonb; v_rid uuid; v_ids uuid[] := '{}';
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia.'; end if;
  if v_id is null then
    insert into dinamicas_etiqueta (nombre, desde, hasta, rondas_max, tamano_ronda, estacion, principal_desde, principal_hasta)
    values (trim(p->>'nombre'), nullif(p->>'desde', '')::date, nullif(p->>'hasta', '')::date,
            coalesce(nullif(p->>'rondas_max', '')::int, 1), (p->>'tamano_ronda')::int,
            coalesce(nullif(trim(p->>'estacion'), ''), 'Bebidas'),
            nullif(p->>'principal_desde', '')::int, nullif(p->>'principal_hasta', '')::int)
    returning id into v_id;
  else
    update dinamicas_etiqueta set
      nombre = trim(p->>'nombre'), desde = nullif(p->>'desde', '')::date, hasta = nullif(p->>'hasta', '')::date,
      rondas_max = greatest(coalesce(nullif(p->>'rondas_max', '')::int, 1),
                            (select coalesce(max(numero), 0) from dinamica_rondas where dinamica_id = v_id)),
      tamano_ronda = (p->>'tamano_ronda')::int,
      principal_desde = nullif(p->>'principal_desde', '')::int, principal_hasta = nullif(p->>'principal_hasta', '')::int,
      actualizado_en = now()
    where id = v_id;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p->'resultados', '[]'::jsonb)) loop
    v_rid := nullif(r->>'id', '')::uuid;
    if v_rid is null then
      insert into dinamica_resultados (dinamica_id, nombre, texto, cantidad, es_premio, es_principal, milo, orden)
      values (v_id, trim(r->>'nombre'), trim(r->>'texto'), (r->>'cantidad')::int,
              coalesce((r->>'es_premio')::boolean, false), coalesce((r->>'es_principal')::boolean, false),
              coalesce((r->>'milo')::boolean, false), coalesce((r->>'orden')::int, 0))
      returning id into v_rid;
    else
      update dinamica_resultados set nombre = trim(r->>'nombre'), texto = trim(r->>'texto'),
        cantidad = (r->>'cantidad')::int, es_premio = coalesce((r->>'es_premio')::boolean, false),
        es_principal = coalesce((r->>'es_principal')::boolean, false), milo = coalesce((r->>'milo')::boolean, false),
        orden = coalesce((r->>'orden')::int, 0)
      where id = v_rid and dinamica_id = v_id;
    end if;
    v_ids := v_ids || v_rid;
  end loop;
  -- Un resultado que ya no viene se queda en 0 (si ya salió en una ronda no
  -- se puede borrar: es historia).
  update dinamica_resultados set cantidad = 0 where dinamica_id = v_id and not (id = any(v_ids));
  return v_id;
end;
$function$;
revoke all on function public.fn_dinamica_guardar(jsonb) from public, anon;
grant execute on function public.fn_dinamica_guardar(jsonb) to authenticated;

-- Prender o apagar. Al prender sin ninguna ronda, se abre la primera.
create or replace function public.fn_dinamica_activar(p_id uuid, p_activa boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_problema text; v_ronda int;
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia.'; end if;
  if p_activa then
    v_problema := _dinamica_problema(p_id);
    if v_problema is not null then raise exception '%', v_problema; end if;
    -- Una sola dinámica prendida a la vez: dos barajas en la misma etiqueta no.
    update dinamicas_etiqueta set activa = false, actualizado_en = now() where activa and id <> p_id;
    if not exists (select 1 from dinamica_rondas where dinamica_id = p_id) then
      v_ronda := _dinamica_generar_ronda(p_id);
    end if;
  end if;
  update dinamicas_etiqueta set activa = p_activa, actualizado_en = now() where id = p_id;
  return jsonb_build_object('activa', p_activa, 'ronda_abierta', v_ronda);
end;
$function$;
revoke all on function public.fn_dinamica_activar(uuid, boolean) from public, anon;
grant execute on function public.fn_dinamica_activar(uuid, boolean) to authenticated;

-- «Abrir la siguiente ronda» (la anterior se cierra sola al agotarse).
create or replace function public.fn_dinamica_abrir_ronda(p_id uuid)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v int;
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia.'; end if;
  v := _dinamica_generar_ronda(p_id);
  if v is null then raise exception 'Ya se usaron todas las rondas de esta dinámica.'; end if;
  return v;
end;
$function$;
revoke all on function public.fn_dinamica_abrir_ronda(uuid) from public, anon;
grant execute on function public.fn_dinamica_abrir_ronda(uuid) to authenticated;

-- Marcar (o desmarcar) un premio como entregado.
create or replace function public.fn_dinamica_entregar(p_boleto uuid, p_entregado boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia.'; end if;
  update dinamica_boletos
     set entregado_en = case when p_entregado then now() end,
         entregado_por = case when p_entregado then (select id from empleados where auth_user_id = auth.uid() limit 1) end
   where id = p_boleto and orden_id is not null;
end;
$function$;
revoke all on function public.fn_dinamica_entregar(uuid, boolean) from public, anon;
grant execute on function public.fn_dinamica_entregar(uuid, boolean) to authenticated;
