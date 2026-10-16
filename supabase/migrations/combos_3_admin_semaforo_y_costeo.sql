-- Combos en un solo lugar: Admin → Combos (16/10/26).
--
-- Antes había tres pantallas y dos modelos: «Paquetes armados con extras»
-- (los 5 combos reales), «Combos existentes» y Costeos → Combos (el modelo
-- viejo de `combo_items`/`es_combo`, que nadie usaba: por eso lo creado ahí
-- no salía en el menú). Ahora todo lee lo mismo:
--
--   combo   = producto de la categoría Combos (precio, a la venta o no)
--   fijos   = combo_fijos (siempre incluye)
--   grupos  = producto_extras con grupo («elige una»), cada opción ligada a
--             su producto real por inventario_como
--
-- `fn_combos_admin` arma cada combo con su SEMÁFORO: lo que haría que el
-- inventario no baje (opción sin producto, producto sin receta, ingredientes
-- en 0), lo que confunde al cliente (grupo de una sola opción) y lo que
-- descontaría doble (receta propia del combo, algo fijo que también es
-- opción). Todo lo de escribir pide gerencia.
--
-- Sin `drop`/`revoke` a propósito: el conector los detiene esperando
-- confirmación. Las funciones de gerencia se cuidan con fn_es_jefe().

set lock_timeout = '3s';

-- Costeos (que entra como anon con su propio login) lee la vista de abajo:
-- las dos tablas no guardan nada sensible, solo qué descuenta como qué.
create policy inventario_como_lectura on public.inventario_como for select using (true);
create policy combo_fijos_lectura on public.combo_fijos for select using (true);

-- ── ¿Este producto, al venderse, baja inventario? ────────────────────────
-- Sí si tiene receta propia o la de su producto real; un combo descuenta
-- por sus partes (renglones hijos y fijos), no por sí mismo.
create or replace function public.fn_producto_descuenta(p_producto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from recetas r
            where r.producto_id = coalesce(
                    (select ic.como_producto_id from inventario_como ic where ic.producto_id = p_producto),
                    p_producto))
      or exists (
           select 1 from productos p join categorias c on c.id = p.categoria_id
            where p.id = p_producto and c.nombre = 'Combos')
$$;

-- «Lo que no descuenta» deja de marcar como huecos a los combos y a sus
-- opciones ligadas.
do $$
declare
  v_def text;
  a1 text := 'not exists (select 1 from recetas r where r.producto_id = p.id)';
  a2 text := 'not exists (select 1 from recetas r where r.producto_id = oi.producto_id)';
  a3 text := 'exists (select 1 from combo_items ci where ci.combo_id = p.id) as es_combo_armado';
begin
  select pg_get_functiondef('public.fn_inventario_huecos(integer)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1
     or (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1
     or (length(v_def) - length(replace(v_def, a3, ''))) / length(a3) <> 1 then
    raise exception 'anclas de fn_inventario_huecos';
  end if;
  v_def := replace(v_def, a1, 'not fn_producto_descuenta(p.id)');
  v_def := replace(v_def, a2, 'not fn_producto_descuenta(oi.producto_id)');
  v_def := replace(v_def, a3, 'exists (select 1 from combo_fijos cf where cf.combo_id = p.id) as es_combo_armado');
  execute v_def;
end $$;

-- ── Los combos con su semáforo (Admin → Combos) ──────────────────────────
create or replace function public.fn_combos_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb := '[]';
  c record;
  v_fijos jsonb;
  v_grupos jsonb;
  v_avisos text[];
  v_costo_min numeric;
  v_costo_max numeric;
  r record;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede ver la configuración de los combos.';
  end if;

  for c in
    select p.id, p.nombre, p.precio, p.activo, vc.precio_sin_iva,
           (select count(*) from recetas rr where rr.producto_id = p.id) as receta_propia,
           (select count(*) from producto_extras pe where pe.producto_id = p.id
              and (pe.grupo is null or pe.grupo = 'Doble')) as extras_sueltos
      from productos p
      join categorias ca on ca.id = p.categoria_id
      left join vw_costeo_producto vc on vc.id = p.id
     where ca.nombre = 'Combos' and p.archivado_en is null and not p.es_extra
     order by p.activo desc, p.nombre
  loop
    v_avisos := '{}';

    -- Lo fijo.
    select coalesce(jsonb_agg(jsonb_build_object(
             'producto_id', pr.id, 'nombre', pr.nombre, 'cantidad', cf.cantidad,
             'activo', pr.activo, 'costo', vc.costo_total,
             'recetas', (select count(*) from recetas rr where rr.producto_id = pr.id),
             'ceros', (select string_agg(i.nombre, ', ') from recetas rr join insumos i on i.id = rr.insumo_id
                        where rr.producto_id = pr.id and rr.cantidad = 0 and i.nombre not ilike 'hielo%'))
             order by pr.nombre), '[]'),
           coalesce(sum(coalesce(vc.costo_total, 0) * cf.cantidad), 0)
      into v_fijos, v_costo_min
      from combo_fijos cf
      join productos pr on pr.id = cf.producto_id
      left join vw_costeo_producto vc on vc.id = pr.id
     where cf.combo_id = c.id;
    v_costo_max := v_costo_min;

    -- Los grupos y sus opciones.
    with op as (
      select pe.grupo, e.id as extra_id, e.nombre, e.activo, pe.estacion, pe.por_defecto,
             ic.como_producto_id as como_id, cp.nombre as como_nombre, cp.activo as como_activo,
             coalesce(vc.costo_total, 0) as costo,
             (select count(*) from recetas rr where rr.producto_id = coalesce(ic.como_producto_id, e.id)) as recetas,
             (select string_agg(i.nombre, ', ') from recetas rr join insumos i on i.id = rr.insumo_id
               where rr.producto_id = coalesce(ic.como_producto_id, e.id) and rr.cantidad = 0
                 and i.nombre not ilike 'hielo%') as ceros
        from producto_extras pe
        join productos e on e.id = pe.extra_id and e.archivado_en is null
        left join inventario_como ic on ic.producto_id = e.id
        left join productos cp on cp.id = ic.como_producto_id
        left join vw_costeo_producto vc on vc.id = coalesce(ic.como_producto_id, e.id)
       where pe.producto_id = c.id and pe.grupo is not null and pe.grupo <> 'Doble'
    ),
    g as (
      select grupo,
             jsonb_agg(jsonb_build_object(
               'extra_id', extra_id, 'nombre', nombre, 'activo', activo, 'estacion', estacion,
               'por_defecto', por_defecto, 'como_id', como_id, 'como_nombre', como_nombre,
               'como_activo', como_activo, 'recetas', recetas, 'ceros', ceros, 'costo', costo)
               order by nombre) as opciones,
             min(costo) filter (where activo) as cmin, max(costo) filter (where activo) as cmax
        from op group by grupo
    )
    select coalesce(jsonb_agg(jsonb_build_object('grupo', grupo, 'opciones', opciones) order by grupo), '[]'),
           v_costo_min + coalesce(sum(cmin), 0), v_costo_max + coalesce(sum(cmax), 0)
      into v_grupos, v_costo_min, v_costo_max
      from g;

    -- El semáforo.
    if c.receta_propia > 0 then
      v_avisos := array_append(v_avisos, 'El combo tiene receta propia además de sus partes: descontaría doble. Quítasela en Costeos.'::text);
    end if;
    if jsonb_array_length(v_fijos) = 0 and jsonb_array_length(v_grupos) = 0 then
      v_avisos := array_append(v_avisos, 'No tiene componentes: al venderlo no baja nada del inventario.'::text);
    end if;
    for r in select * from jsonb_to_recordset(v_fijos) as x(nombre text, recetas int, ceros text, activo boolean) loop
      if r.recetas = 0 then
        v_avisos := array_append(v_avisos, format('«%s» (fijo) no tiene receta: no descuenta.', r.nombre)::text);
      elsif r.ceros is not null then
        v_avisos := array_append(v_avisos, format('«%s» tiene ingredientes en 0 en su receta (%s): corrígelo en Costeos.', r.nombre, r.ceros)::text);
      end if;
    end loop;
    for r in
      select gr->>'grupo' as grupo, o->>'nombre' as nombre, o->>'como_id' as como_id, o->>'como_nombre' as como_nombre,
             (o->>'recetas')::int as recetas, o->>'ceros' as ceros, (o->>'activo')::boolean as activo
        from jsonb_array_elements(v_grupos) gr, jsonb_array_elements(gr->'opciones') o
    loop
      if r.activo and r.como_id is null and r.recetas = 0 then
        v_avisos := array_append(v_avisos, format('«%s» (%s) no está ligada a un producto: al elegirla no baja nada.', r.nombre, r.grupo)::text);
      elsif r.activo and r.recetas = 0 then
        v_avisos := array_append(v_avisos, format('«%s» descuenta como «%s», que no tiene receta.', r.nombre, r.como_nombre)::text);
      elsif r.activo and r.ceros is not null then
        v_avisos := array_append(v_avisos, format('«%s» tiene ingredientes en 0 en su receta (%s): corrígelo en Costeos.',
                                       coalesce(r.como_nombre, r.nombre), r.ceros)::text);
      end if;
      if r.como_id is not null and exists (
           select 1 from jsonb_array_elements(v_fijos) f where f->>'producto_id' = r.como_id) then
        v_avisos := array_append(v_avisos, format('«%s» está como fijo y como opción: se descontaría dos veces.', r.como_nombre)::text);
      end if;
    end loop;
    for r in
      select gr->>'grupo' as grupo,
             (select count(*) from jsonb_array_elements(gr->'opciones') o where (o->>'activo')::boolean) as activas
        from jsonb_array_elements(v_grupos) gr
    loop
      if r.activas < 2 then
        v_avisos := array_append(v_avisos, format('El grupo «%s» tiene %s opción encendida: dice «elige una» y no deja elegir.', r.grupo, r.activas)::text);
      end if;
    end loop;

    v_res := v_res || jsonb_build_object(
      'id', c.id, 'nombre', c.nombre, 'precio', c.precio, 'activo', c.activo,
      'precio_sin_iva', c.precio_sin_iva, 'extras_sueltos', c.extras_sueltos,
      'fijos', v_fijos, 'grupos', v_grupos,
      'costo_min', round(v_costo_min, 2), 'costo_max', round(v_costo_max, 2),
      'avisos', to_jsonb(v_avisos));
  end loop;
  return v_res;
end;
$$;

-- ── Escribir: solo gerencia ──────────────────────────────────────────────
create or replace function public.fn_combo_es_combo(p_combo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from productos p join categorias c on c.id = p.categoria_id
                  where p.id = p_combo and c.nombre = 'Combos' and p.archivado_en is null and not p.es_extra)
$$;

create or replace function public.fn_combo_crear(p_nombre text, p_precio numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_cat uuid;
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia puede crear combos.'; end if;
  if length(trim(coalesce(p_nombre, ''))) < 3 then raise exception 'Escribe el nombre del combo.'; end if;
  if coalesce(p_precio, 0) <= 0 then raise exception 'El combo necesita precio.'; end if;
  if exists (select 1 from productos where lower(nombre) = lower(trim(p_nombre)) and archivado_en is null and not es_extra) then
    raise exception 'Ya hay un producto con ese nombre.';
  end if;
  select id into strict v_cat from categorias where nombre = 'Combos';
  -- Nace APAGADO: se prende cuando ya tiene sus partes (el semáforo lo dice).
  insert into productos (nombre, precio, activo, es_extra, categoria_id)
  values (trim(p_nombre), p_precio, false, false, v_cat)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.fn_combo_fijo_guardar(p_combo uuid, p_producto uuid, p_cantidad numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia puede cambiar los combos.'; end if;
  if not fn_combo_es_combo(p_combo) then raise exception 'Ese producto no es un combo.'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad tiene que ser mayor que 0.'; end if;
  if not exists (select 1 from productos where id = p_producto and not es_extra and archivado_en is null)
     or fn_combo_es_combo(p_producto) then
    raise exception 'Lo fijo tiene que ser un producto del menú (no un extra ni otro combo).';
  end if;
  insert into combo_fijos (combo_id, producto_id, cantidad) values (p_combo, p_producto, p_cantidad)
  on conflict (combo_id, producto_id) do update set cantidad = excluded.cantidad;
end;
$$;

-- Agrega una opción a un grupo: reusa el extra que ya descuenta como ese
-- producto o crea uno nuevo ($0, en «Extras Bebidas») ligado a él.
-- (Quitar una opción usa fn_quitar_extra, la de Admin → Extras.)
create or replace function public.fn_combo_opcion_agregar(p_combo uuid, p_grupo text, p_producto uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_extra uuid; v_nombre text; v_cat uuid; v_estacion text;
  v_grupo text := trim(coalesce(p_grupo, ''));
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia puede cambiar los combos.'; end if;
  if not fn_combo_es_combo(p_combo) then raise exception 'Ese producto no es un combo.'; end if;
  if length(v_grupo) < 2 then raise exception 'Escribe el nombre del grupo (por ejemplo «Muffin»).'; end if;
  if lower(v_grupo) = 'doble' then raise exception '«Doble» es para la doble proteína, no para un combo.'; end if;
  select nombre into v_nombre from productos
   where id = p_producto and not es_extra and archivado_en is null and not fn_combo_es_combo(id);
  if v_nombre is null then raise exception 'La opción tiene que ser un producto del menú.'; end if;

  select ic.producto_id into v_extra
    from inventario_como ic join productos e on e.id = ic.producto_id
   where ic.como_producto_id = p_producto and e.es_extra and e.archivado_en is null
   order by e.activo desc limit 1;
  if v_extra is null then
    select id into strict v_cat from categorias where nombre = 'Extras Bebidas';
    insert into productos (nombre, precio, activo, es_extra, categoria_id)
    values (v_nombre, 0, true, true, v_cat) returning id into v_extra;
    insert into inventario_como (producto_id, como_producto_id) values (v_extra, p_producto);
  end if;

  -- Se prepara donde se preparan sus hermanas del grupo, si ya hay.
  select pe.estacion into v_estacion from producto_extras pe
   where pe.producto_id = p_combo and pe.grupo = v_grupo and pe.estacion is not null limit 1;

  insert into producto_extras (producto_id, extra_id, grupo, estacion, por_defecto)
  values (p_combo, v_extra, v_grupo, v_estacion, false)
  on conflict (producto_id, extra_id) do update set grupo = excluded.grupo;
  return v_extra;
end;
$$;

-- Cambia el producto real al que está ligada una opción.
create or replace function public.fn_combo_opcion_ligar(p_extra uuid, p_producto uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia puede cambiar los combos.'; end if;
  if not exists (select 1 from productos where id = p_extra and es_extra) then
    raise exception 'Solo una opción (extra) se liga a un producto.';
  end if;
  if not exists (select 1 from productos where id = p_producto and not es_extra and archivado_en is null) then
    raise exception 'Se liga a un producto del menú.';
  end if;
  insert into inventario_como (producto_id, como_producto_id) values (p_extra, p_producto)
  on conflict (producto_id) do update set como_producto_id = excluded.como_producto_id, actualizado_en = now();
end;
$$;

-- ── Costeos → Combos lee esto (mismos permisos que vw_combos) ────────────
create or replace view public.vw_combos_armados with (security_invoker = true) as
with c as (
  select p.id, p.nombre, p.precio, p.activo
    from productos p join categorias ca on ca.id = p.categoria_id
   where ca.nombre = 'Combos' and p.archivado_en is null and not p.es_extra
),
f as (
  select cf.combo_id,
         jsonb_agg(jsonb_build_object('nombre', pr.nombre, 'cantidad', cf.cantidad,
                   'costo', round(coalesce(vc.costo_total, 0) * cf.cantidad, 2)) order by pr.nombre) as fijos,
         sum(coalesce(vc.costo_total, 0) * cf.cantidad) as costo
    from combo_fijos cf
    join productos pr on pr.id = cf.producto_id
    left join vw_costeo_producto vc on vc.id = pr.id
   group by cf.combo_id
),
o as (
  select pe.producto_id as combo_id, pe.grupo, e.nombre, coalesce(vc.costo_total, 0) as costo
    from producto_extras pe
    join productos e on e.id = pe.extra_id and e.activo and e.archivado_en is null
    left join inventario_como ic on ic.producto_id = e.id
    left join vw_costeo_producto vc on vc.id = coalesce(ic.como_producto_id, e.id)
   where pe.grupo is not null and pe.grupo <> 'Doble'
),
g as (
  select combo_id, grupo, min(costo) as cmin, max(costo) as cmax,
         jsonb_agg(jsonb_build_object('nombre', nombre, 'costo', round(costo, 2)) order by nombre) as opciones
    from o group by combo_id, grupo
),
gg as (
  select combo_id, jsonb_agg(jsonb_build_object('grupo', grupo, 'opciones', opciones) order by grupo) as grupos,
         sum(cmin) as cmin, sum(cmax) as cmax
    from g group by combo_id
)
select c.id, c.nombre, c.precio, c.activo, vcc.precio_sin_iva,
       coalesce(f.fijos, '[]') as fijos, coalesce(gg.grupos, '[]') as grupos,
       round(coalesce(f.costo, 0) + coalesce(gg.cmin, 0), 2) as costo_min,
       round(coalesce(f.costo, 0) + coalesce(gg.cmax, 0), 2) as costo_max
  from c
  left join f on f.combo_id = c.id
  left join gg on gg.combo_id = c.id
  left join vw_costeo_producto vcc on vcc.id = c.id;
