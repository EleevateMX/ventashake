-- Dinámica y frases de la etiqueta, por estación (26/10/26).
--
-- Lo que reportó Perla con «Trick or Shake»:
--   1. El boleto salía también en la etiqueta de COCINA. El trigger
--      devolvía el boleto ya asignado a la orden ANTES de mirar la estación:
--      en una orden con bebida y alimento, la comanda de cocina repetía el
--      de barra (15 comandas del 24 al 26/10).
--   2. «A ellos no les salió nada»: el boleto iba solo en la PRIMERA
--      etiqueta de la comanda. 16 de 99 pedidos traían 2 o 3 bebidas, y las
--      demás salían con la frase de siempre.
--   3. Las de siempre no se podían apagar como grupo.
--   4. Una frase no se podía mandar solo a barra o solo a cocina; el
--      selector de impresora del editor era solo para «Probar».
--
-- Lo que cambia:
--   - El boleto se asigna solo si la comanda es de la estación de la
--     dinámica, y se busca el ya asignado DESPUÉS de esa revisión.
--   - `dinamicas_etiqueta.boleto_por`: 'compra' (uno por pedido, como
--     nació) o 'bebida' (uno por etiqueta). El modo 'bebida' solo se aplica
--     si el agente de esa impresora es 1.7.0 o más: uno viejo imprime solo
--     el primero, y un boleto con premio que no se imprime es un premio que
--     nadie reclama.
--   - El payload lleva `dinamica.boletos` (uno por etiqueta, en orden) y,
--     arriba, los campos del primero, que es lo que lee el agente 1.6.0.
--   - `frases_config.siempre_activa`: las de siempre se prenden y apagan
--     como grupo.
--   - `frases_etiqueta.estacion`: null = barra y cocina; 'Bebidas' o
--     'Alimentos' = solo ahí.
--   - `fn_imprimir_frases` agrega `por_estacion` (lo lee el agente 1.7.0).
--     `frases` sigue igual para los agentes viejos.
--
-- La lógica del boleto vive DENTRO del trigger (create or replace conserva
-- sus permisos: solo postgres y service_role). Una función nueva nacería
-- ejecutable por anon y dejaría quemar boletos desde fuera.

alter table dinamicas_etiqueta
  add column if not exists boleto_por text not null default 'compra';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dinamicas_etiqueta_boleto_por_check') then
    alter table dinamicas_etiqueta add constraint dinamicas_etiqueta_boleto_por_check
      check (boleto_por in ('compra', 'bebida'));
  end if;
end $$;

alter table frases_etiqueta add column if not exists estacion text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'frases_etiqueta_estacion_check') then
    alter table frases_etiqueta add constraint frases_etiqueta_estacion_check
      check (estacion is null or estacion in ('Bebidas', 'Alimentos'));
  end if;
end $$;

-- Varios boletos por orden: la llave única era (dinamica_id, orden_id).
-- Ahora es (dinamica_id, orden_id, etiqueta). Aplicado aparte
-- (dinamica_boleto_por_etiqueta_1 y _2) porque quitar la llave vieja pide
-- aprobación en el conector.
alter table dinamica_boletos add column if not exists etiqueta smallint not null default 1;
create unique index if not exists dinamica_boletos_orden_etiqueta_uq on dinamica_boletos (dinamica_id, orden_id, etiqueta);
alter table dinamica_boletos drop constraint if exists dinamica_boletos_dinamica_id_orden_id_key;

create table if not exists frases_config (
  id boolean primary key default true check (id),
  siempre_activa boolean not null default true,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);
alter table frases_config enable row level security;
insert into frases_config (id) values (true) on conflict (id) do nothing;

-- ── El boleto ────────────────────────────────────────────────────────────
create or replace function public.trg_trabajo_dinamica()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d record;
  v_hoy date := (now() at time zone 'America/Merida')::date;
  v_n int; v_ya int; v_ver text; v_varios boolean;
  v_bid uuid; v_ronda uuid; v_bol jsonb;
begin
  if NEW.tipo_documento = 'comanda' and NEW.orden_id is not null and NEW.copia_de is null
     and not coalesce(NEW.payload ? 'dinamica', false)
     and coalesce(NEW.payload->>'prueba', 'false') <> 'true' then
    begin
      if not exists (select 1 from ordenes where id = NEW.orden_id and es_demo) then
        select * into d from dinamicas_etiqueta
         where activa and (desde is null or desde <= v_hoy) and (hasta is null or hasta >= v_hoy)
         order by creado_en desc limit 1;

        -- Solo la estación de la dinámica. Antes esto se revisaba DESPUÉS de
        -- buscar el boleto ya asignado, y cocina repetía el de barra.
        if d.id is not null and lower(coalesce(NEW.payload->>'estacion', '')) = lower(d.estacion) then
          -- Cuántas etiquetas va a imprimir el agente: una por pieza.
          select coalesce(sum(greatest(1, coalesce((i->>'cantidad')::int, 1))), 0)::int into v_n
            from jsonb_array_elements(case when jsonb_typeof(NEW.payload->'items') = 'array'
                                           then NEW.payload->'items' else '[]'::jsonb end) i;

          select agente_version into v_ver from impresoras where id = NEW.printer_id;
          v_varios := coalesce(v_ver ~ '^[0-9]+\.[0-9]+\.[0-9]+', false)
                  and string_to_array(substring(v_ver from '^[0-9]+\.[0-9]+\.[0-9]+'), '.')::int[] >= array[1, 7, 0];

          if d.boleto_por = 'bebida' and v_varios then
            v_n := least(greatest(v_n, 1), 20);
          else
            v_n := 1;
          end if;

          select count(*) into v_ya from dinamica_boletos where dinamica_id = d.id and orden_id = NEW.orden_id;
          while v_ya < v_n loop
            v_bid := null;
            select bo.id, bo.ronda_id into v_bid, v_ronda
              from dinamica_boletos bo join dinamica_rondas ro on ro.id = bo.ronda_id
             where bo.dinamica_id = d.id and bo.orden_id is null and ro.cerrada_en is null
             order by ro.numero, bo.posicion
             limit 1
             for update of bo skip locked;
            exit when v_bid is null;
            update dinamica_boletos set orden_id = NEW.orden_id, etiqueta = v_ya + 1, asignado_en = clock_timestamp() where id = v_bid;
            if not exists (select 1 from dinamica_boletos where ronda_id = v_ronda and orden_id is null) then
              update dinamica_rondas set cerrada_en = now() where id = v_ronda;
            end if;
            v_ya := v_ya + 1;
          end loop;

          select jsonb_agg(jsonb_build_object('folio', bo.folio, 'texto', r.texto, 'milo', r.milo,
                                              'resultado', r.nombre, 'premio', r.es_premio)
                           order by bo.etiqueta, bo.asignado_en, bo.posicion)
            into v_bol
            from dinamica_boletos bo join dinamica_resultados r on r.id = bo.resultado_id
           where bo.dinamica_id = d.id and bo.orden_id = NEW.orden_id;

          if v_bol is not null and jsonb_array_length(v_bol) > 0 then
            NEW.payload := coalesce(NEW.payload, '{}'::jsonb) || jsonb_build_object('dinamica',
              (v_bol->0) || jsonb_build_object('campana', d.nombre, 'boletos', v_bol));
          end if;
        end if;
      end if;
    exception when others then
      raise warning 'Dinámica de etiqueta: %', sqlerrm;
    end;
  end if;
  return NEW;
end;
$function$;

-- La función vieja ya no la llama nadie, pero queda coherente: primero la
-- estación, luego el boleto ya asignado.
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
  if lower(coalesce(p_estacion, '')) <> lower(d.estacion) then return null; end if;

  select bo.folio, r.texto, r.milo, r.nombre, r.es_premio into b
    from dinamica_boletos bo join dinamica_resultados r on r.id = bo.resultado_id
   where bo.dinamica_id = d.id and bo.orden_id = p_orden
   order by bo.asignado_en, bo.posicion limit 1;
  if found then
    return jsonb_build_object('campana', d.nombre, 'folio', b.folio, 'texto', b.texto,
                              'milo', b.milo, 'resultado', b.nombre, 'premio', b.es_premio);
  end if;

  select bo.id, bo.ronda_id into v_bid, v_ronda
    from dinamica_boletos bo join dinamica_rondas ro on ro.id = bo.ronda_id
   where bo.dinamica_id = d.id and bo.orden_id is null and ro.cerrada_en is null
   order by ro.numero, bo.posicion
   limit 1
   for update of bo skip locked;
  if v_bid is null then return null; end if;

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

-- ── Gerencia: la dinámica guarda «un boleto por» ─────────────────────────
create or replace function public.fn_dinamica_guardar(p jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid := nullif(p->>'id', '')::uuid; r jsonb; v_rid uuid; v_ids uuid[] := '{}';
  v_por text := coalesce(nullif(p->>'boleto_por', ''), 'compra');
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia.'; end if;
  if v_por not in ('compra', 'bebida') then raise exception 'Un boleto por compra o por bebida.'; end if;
  if v_id is null then
    insert into dinamicas_etiqueta (nombre, desde, hasta, rondas_max, tamano_ronda, estacion, principal_desde, principal_hasta, boleto_por)
    values (trim(p->>'nombre'), nullif(p->>'desde', '')::date, nullif(p->>'hasta', '')::date,
            coalesce(nullif(p->>'rondas_max', '')::int, 1), (p->>'tamano_ronda')::int,
            coalesce(nullif(trim(p->>'estacion'), ''), 'Bebidas'),
            nullif(p->>'principal_desde', '')::int, nullif(p->>'principal_hasta', '')::int, v_por)
    returning id into v_id;
  else
    update dinamicas_etiqueta set
      nombre = trim(p->>'nombre'), desde = nullif(p->>'desde', '')::date, hasta = nullif(p->>'hasta', '')::date,
      rondas_max = greatest(coalesce(nullif(p->>'rondas_max', '')::int, 1),
                            (select coalesce(max(numero), 0) from dinamica_rondas where dinamica_id = v_id)),
      tamano_ronda = (p->>'tamano_ronda')::int,
      principal_desde = nullif(p->>'principal_desde', '')::int, principal_hasta = nullif(p->>'principal_hasta', '')::int,
      boleto_por = case when p ? 'boleto_por' then v_por else boleto_por end,
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
  update dinamica_resultados set cantidad = 0 where dinamica_id = v_id and not (id = any(v_ids));
  return v_id;
end;
$function$;

create or replace function public.fn_dinamicas_admin()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'nombre', d.nombre, 'activa', d.activa, 'desde', d.desde, 'hasta', d.hasta,
      'rondas_max', d.rondas_max, 'tamano_ronda', d.tamano_ronda, 'estacion', d.estacion,
      'boleto_por', d.boleto_por,
      'principal_desde', d.principal_desde, 'principal_hasta', d.principal_hasta,
      'problema', _dinamica_problema(d.id),
      'resultados', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'texto', r.texto, 'cantidad', r.cantidad,
          'es_premio', r.es_premio, 'es_principal', r.es_principal, 'milo', r.milo, 'orden', r.orden)
          order by r.orden, r.nombre) from dinamica_resultados r where r.dinamica_id = d.id), '[]'::jsonb),
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

-- ── Frases: lo que baja el agente ────────────────────────────────────────
create or replace function public.fn_imprimir_frases(p_token uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hoy text; v_temp temporadas_etiqueta; v_frases jsonb; v_siempre boolean;
  v_por jsonb := '{}'::jsonb; e text; v_lista jsonb;
begin
  if not exists (select 1 from impresoras where agente_token = p_token and activa) then
    raise exception 'Token de impresora inválido o impresora inactiva';
  end if;
  v_hoy := to_char(now() at time zone 'America/Merida', 'MM-DD');
  select coalesce((select siempre_activa from frases_config where id), true) into v_siempre;

  select t.* into v_temp
    from temporadas_etiqueta t
   where t.activa and fn_temporada_cubre(t.desde_mmdd, t.hasta_mmdd, v_hoy)
     and exists (select 1 from frases_etiqueta f where f.temporada_id = t.id and f.activa and not f.archivada)
   order by t.desde_mmdd, t.nombre
   limit 1;

  -- Para los agentes de antes de la 1.7.0: la lista de siempre, sin estación.
  select coalesce(jsonb_agg(jsonb_build_object('texto', f.texto, 'milo', f.con_milo or coalesce(v_temp.con_milo, false))
                            order by f.orden, f.creada_en), '[]'::jsonb)
    into v_frases
    from frases_etiqueta f
   where f.activa and not f.archivada
     and (case when v_temp.id is null then f.temporada_id is null and v_siempre else f.temporada_id = v_temp.id end);

  -- Desde la 1.7.0, una lista por estación. La temporada manda; si no trae
  -- frases para esa estación, salen las de siempre (si están prendidas).
  -- Una lista vacía es a propósito: no sale frase.
  foreach e in array array['Bebidas', 'Alimentos'] loop
    v_lista := null;
    if v_temp.id is not null then
      select jsonb_agg(jsonb_build_object('texto', f.texto, 'milo', f.con_milo or v_temp.con_milo)
                       order by f.orden, f.creada_en)
        into v_lista
        from frases_etiqueta f
       where f.activa and not f.archivada and f.temporada_id = v_temp.id
         and (f.estacion is null or f.estacion = e);
    end if;
    if v_lista is null and v_siempre then
      select jsonb_agg(jsonb_build_object('texto', f.texto, 'milo', f.con_milo)
                       order by f.orden, f.creada_en)
        into v_lista
        from frases_etiqueta f
       where f.activa and not f.archivada and f.temporada_id is null
         and (f.estacion is null or f.estacion = e);
    end if;
    v_por := v_por || jsonb_build_object(e, coalesce(v_lista, '[]'::jsonb));
  end loop;

  return jsonb_build_object('temporada', v_temp.nombre, 'frases', v_frases, 'hoy', v_hoy,
                            'siempre_activa', v_siempre, 'por_estacion', v_por);
end;
$function$;

-- ── Frases: gerencia ─────────────────────────────────────────────────────
create or replace function public.fn_frases_admin()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_hoy text := to_char(now() at time zone 'America/Merida', 'MM-DD');
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  return jsonb_build_object(
    'hoy', v_hoy,
    'siempre_activa', coalesce((select siempre_activa from frases_config where id), true),
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
               'activa', f.activa, 'con_milo', f.con_milo, 'orden', f.orden, 'estacion', f.estacion)
             order by f.orden, f.creada_en)
        from frases_etiqueta f where not f.archivada), '[]'::jsonb),
    'agentes', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'version', i.agente_version))
        from impresoras i where i.activa and i.cocina_id is not null), '[]'::jsonb),
    'dinamica', (
      select jsonb_build_object('nombre', d.nombre, 'estacion', d.estacion, 'boleto_por', d.boleto_por)
        from dinamicas_etiqueta d
       where d.activa
         and (d.desde is null or d.desde <= (now() at time zone 'America/Merida')::date)
         and (d.hasta is null or d.hasta >= (now() at time zone 'America/Merida')::date)
       order by d.creado_en desc limit 1)
  );
end;
$function$;

-- Dónde sale una frase: null = barra y cocina.
create or replace function public.fn_frase_estacion(p_id uuid, p_estacion text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las frases.';
  end if;
  if p_estacion is not null and p_estacion not in ('Bebidas', 'Alimentos') then
    raise exception 'La frase sale en barra, en cocina o en las dos.';
  end if;
  update frases_etiqueta set estacion = p_estacion where id = p_id;
  if not found then raise exception 'Esa frase no existe.'; end if;
end;
$function$;

-- Las de siempre, como grupo.
create or replace function public.fn_frases_siempre(p_activa boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar las frases.';
  end if;
  insert into frases_config (id, siempre_activa, actualizado_en, actualizado_por)
  values (true, coalesce(p_activa, true), now(), (select id from empleados where auth_user_id = auth.uid() limit 1))
  on conflict (id) do update set siempre_activa = excluded.siempre_activa,
    actualizado_en = excluded.actualizado_en, actualizado_por = excluded.actualizado_por;
end;
$function$;
