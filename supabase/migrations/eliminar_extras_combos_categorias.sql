-- Limpiar el catalogo desde Admin (pedido de Perla, 30/09): eliminar extras
-- y combos que ya no se usan, renombrar y eliminar categorias, y crear un
-- extra sin colgarlo de ningun shake.
--
-- ELIMINAR NO SIEMPRE PUEDE SER BORRAR. Un extra o combo que ya se vendio
-- aparece en orden_items, y `orden_items.producto_id` es RESTRICT: borrarlo
-- romperia los tickets y los reportes de ventas. Por eso "eliminar" hace una
-- de dos cosas, y la pantalla dice cual:
--   - nunca se vendio  -> se BORRA de verdad (con sus vinculos y su receta);
--   - tiene historia   -> se ARCHIVA: `archivado_en` lo saca de todas las
--     listas de Admin, pierde sus vinculos y deja de existir para el menu,
--     pero los tickets viejos lo siguen nombrando.
-- Para quien usa la pantalla es lo mismo: desaparece.
--
-- Costeos no revive nada de esto: fn_sync_app_data filtra `not es_extra` y
-- `not es_combo` en todas sus sentencias.

alter table productos add column if not exists archivado_en timestamptz;
comment on column productos.archivado_en is
  'Eliminado desde Admin pero con historial de ventas: no se borra, se esconde. Null = vivo.';

-- -------------------------------------------------------------------------
-- Eliminar un extra o un combo apagado.
-- -------------------------------------------------------------------------
create or replace function public.fn_producto_eliminar(p_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v record; v_historia boolean;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede eliminar del catalogo.';
  end if;
  select id, nombre, activo, es_extra, es_combo into v from productos where id = p_id for update;
  if not found then
    raise exception 'Ya no existe: recarga la pagina.';
  end if;
  if not (v.es_extra or v.es_combo) then
    raise exception 'Aqui solo se eliminan extras y combos. Los productos del menu se dan de baja en Costeos.';
  end if;
  if v.activo then
    raise exception 'Apagalo primero: solo se elimina lo que ya esta apagado.';
  end if;
  if exists (select 1 from premios_sellos where producto_id = p_id) then
    raise exception '"%" es premio de Rewards. Quitalo de Admin -> Rewards antes de eliminarlo.', v.nombre;
  end if;

  v_historia := exists (select 1 from orden_items where producto_id = p_id)
             or exists (select 1 from cocina_items where producto_id = p_id)
             or exists (select 1 from personal_consumos where producto_id = p_id)
             or exists (select 1 from paquetes_saldo where producto_id = p_id)
             or exists (select 1 from combo_items where producto_id = p_id);

  if v_historia then
    update productos set archivado_en = now() where id = p_id;
    delete from producto_extras where extra_id = p_id or producto_id = p_id;
    return 'archivado';
  end if;

  delete from productos where id = p_id;
  return 'borrado';
end;
$function$;

revoke execute on function public.fn_producto_eliminar(uuid) from public, anon;
grant execute on function public.fn_producto_eliminar(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Renombrar una categoria EN LOS DOS LADOS. Costeos guarda la categoria de
-- cada producto por NOMBRE; renombrar solo la tabla dejaba el nombre viejo
-- alla, y el siguiente producto dado de alta con esa categoria nacia sin
-- ninguna. Misma tecnica que fn_producto_mover_categoria.
-- -------------------------------------------------------------------------
create or replace function public.fn_categoria_renombrar(p_id uuid, p_nombre text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_viejo text; v_nuevo text := nullif(trim(p_nombre), ''); v_llave text;
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal puede renombrar categorias.';
  end if;
  if v_nuevo is null then
    raise exception 'El nombre no puede ir vacio.';
  end if;
  select nombre into v_viejo from categorias where id = p_id;
  if v_viejo is null then
    raise exception 'Esa categoria ya no existe: recarga la pagina.';
  end if;
  if v_viejo = v_nuevo then
    return;
  end if;
  if exists (select 1 from categorias where lower(nombre) = lower(v_nuevo) and id <> p_id) then
    raise exception 'Ya hay una categoria que se llama "%".', v_nuevo;
  end if;

  update categorias set nombre = v_nuevo where id = p_id;

  foreach v_llave in array array['shakeRecipes','foodRecipes','bebidas','snacks'] loop
    update app_data ad
       set data = jsonb_set(ad.data, array[v_llave], (
         select jsonb_agg(
           case when x->>'categoria' = v_viejo
                then x || jsonb_build_object('categoria', v_nuevo)
                else x end)
           from jsonb_array_elements(ad.data->v_llave) x
       ))
     where jsonb_typeof(ad.data->v_llave) = 'array'
       and exists (
         select 1 from jsonb_array_elements(ad.data->v_llave) x
         where x->>'categoria' = v_viejo
       );
  end loop;
end;
$function$;

revoke execute on function public.fn_categoria_renombrar(uuid, text) from public, anon;
grant execute on function public.fn_categoria_renombrar(uuid, text) to authenticated;

-- -------------------------------------------------------------------------
-- Eliminar una categoria. Solo si no tiene NADA activo: con un producto
-- activo adentro, ese producto desapareceria del kiosko sin que nadie lo
-- decidiera. Lo apagado que quede adentro se queda sin categoria (el FK ya
-- es SET NULL); si vuelve a prenderse, Revision del menu lo senala.
-- -------------------------------------------------------------------------
create or replace function public.fn_categoria_eliminar(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_nombre text; v_activos int;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede eliminar categorias.';
  end if;
  select nombre into v_nombre from categorias where id = p_id;
  if v_nombre is null then
    raise exception 'Esa categoria ya no existe: recarga la pagina.';
  end if;
  select count(*) into v_activos from productos where categoria_id = p_id and activo;
  if v_activos > 0 then
    raise exception '"%" todavia tiene % producto(s) activo(s). Muevelos o apagalos primero.', v_nombre, v_activos;
  end if;
  delete from categorias where id = p_id;
end;
$function$;

revoke execute on function public.fn_categoria_eliminar(uuid) from public, anon;
grant execute on function public.fn_categoria_eliminar(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Las listas de Admin ya no ensenan lo archivado.
-- -------------------------------------------------------------------------
do $$
declare v_def text; v_ancla text;
begin
  -- Extras
  v_def := pg_get_functiondef('fn_extras_bebida_admin'::regproc);
  v_ancla := 'where p.es_extra';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'El ancla de fn_extras_bebida_admin no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla, 'where p.es_extra and p.archivado_en is null');

  -- Revision del menu: "extra sin categoria"
  v_def := pg_get_functiondef('fn_revision_menu'::regproc);
  v_ancla := 'e.es_extra and e.categoria_id is null';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'El ancla de fn_revision_menu no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla, 'e.es_extra and e.categoria_id is null and e.archivado_en is null');
end $$;

-- Combos: la vista gana la columna al final (create or replace solo deja
-- agregar al final) y se vuelve a declarar security_invoker, que el
-- create or replace borra.
create or replace view vw_combos as
 SELECT combo.id,
    combo.nombre,
    combo.precio,
    combo.activo,
    combo.categoria_id,
    cat.nombre AS categoria_nombre,
    COALESCE(jsonb_agg(jsonb_build_object('producto_id', comp.id, 'nombre', comp.nombre, 'cantidad', ci.cantidad, 'activo', comp.activo) ORDER BY comp.nombre) FILTER (WHERE (comp.id IS NOT NULL)), '[]'::jsonb) AS componentes,
    bool_and(comp.activo) AS todos_componentes_activos,
    vc.costo_total,
    vc.costo_insumos,
    vc.precio_sin_iva,
    vc.margen,
    vc.margen_pct,
    vc.food_cost_pct,
    vc.precio_sugerido,
    combo.archivado_en
   FROM ((((productos combo
     LEFT JOIN categorias cat ON ((cat.id = combo.categoria_id)))
     LEFT JOIN combo_items ci ON ((ci.combo_id = combo.id)))
     LEFT JOIN productos comp ON ((comp.id = ci.producto_id)))
     LEFT JOIN vw_costeo_producto vc ON ((vc.id = combo.id)))
  WHERE (combo.es_combo = true)
  GROUP BY combo.id, combo.nombre, combo.precio, combo.activo, combo.categoria_id, cat.nombre, vc.costo_total, vc.costo_insumos, vc.precio_sin_iva, vc.margen, vc.margen_pct, vc.food_cost_pct, vc.precio_sugerido, combo.archivado_en;
alter view vw_combos set (security_invoker = true);

-- -------------------------------------------------------------------------
-- Alta de extras: opcion "ninguno" (no colgarlo de ningun shake), candado
-- de personal, y un extra archivado que se vuelve a dar de alta con el
-- mismo nombre regresa a la vida en vez de duplicarse.
-- -------------------------------------------------------------------------
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('fn_extra_bebida_guardar(text, numeric, text)'::regprocedure);

  if position('if p_aplicar not in (''shakes'', ''clasico'') then' in v_def) = 0
     or position('set es_extra = true, activo = true,' in v_def) = 0
     or position('if p_aplicar = ''clasico'' then' in v_def) = 0 then
    raise exception 'fn_extra_bebida_guardar no tiene las anclas esperadas';
  end if;

  v_def := replace(v_def,
    'if p_aplicar not in (''shakes'', ''clasico'') then',
    'if not coalesce(fn_es_staff(), false) then
    raise exception ''Solo el personal puede dar de alta extras.'';
  end if;
  if p_aplicar not in (''shakes'', ''clasico'', ''ninguno'') then');
  v_def := replace(v_def,
    'set es_extra = true, activo = true,',
    'set es_extra = true, activo = true, archivado_en = null,');
  v_def := replace(v_def,
    'if p_aplicar = ''clasico'' then',
    'if p_aplicar = ''ninguno'' then
    null;  -- sin vinculos: se cuelga de alimentos desde "Donde se ofrece"
  elsif p_aplicar = ''clasico'' then');
  execute v_def;
end $$;

revoke execute on function public.fn_extra_bebida_guardar(text, numeric, text) from public, anon;
grant execute on function public.fn_extra_bebida_guardar(text, numeric, text) to authenticated;
