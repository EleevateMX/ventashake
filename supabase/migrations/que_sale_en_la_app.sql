-- Qué sale en la app del cliente (17/11/26, pedido de gerencia).
--
-- «Locatarios» (maruchan, palomitas) es venta interna: se cobra en el kiosko
-- pero no debe salir en el menú de la app. No había forma de esconder algo
-- solo de la app: lo único era un filtro por nombre escrito en el código.
--
--   * categorias.en_app y productos.en_app (por omisión true: el día del
--     despliegue no desaparece nada, salvo Locatarios, que se pidió).
--   * Solo afecta a la app (PWA, iOS) y a la carta pública. El kiosko y la
--     caja siguen vendiéndolo.
--   * fn_pedido_app_crear rechaza lo escondido: la pantalla no es candado.
--     Solo mira renglones principales (los extras viven en categorías de
--     extras y no se esconden desde aquí).
--   * Se cambia desde Admin → Menú con fn_en_app_poner (gerencia).

alter table public.categorias add column if not exists en_app boolean not null default true;
alter table public.productos add column if not exists en_app boolean not null default true;

update public.categorias set en_app = false where nombre ilike 'locatarios%' and en_app;

create or replace function public.fn_en_app_poner(p_categoria uuid, p_producto uuid, p_en_app boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar qué sale en la app';
  end if;
  if num_nonnulls(p_categoria, p_producto) <> 1 then
    raise exception 'Elige una categoría o un producto';
  end if;
  if p_categoria is not null then
    update categorias set en_app = coalesce(p_en_app, true) where id = p_categoria;
  else
    update productos set en_app = coalesce(p_en_app, true) where id = p_producto;
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- La lista para Admin: cada categoría activa con cuántos productos tiene y
-- cuáles están escondidos uno por uno.
create or replace function public.fn_en_app_admin()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then raise exception 'Solo gerencia'; end if;
  return jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'en_app', c.en_app,
               'productos', (select count(*) from productos p where p.categoria_id = c.id and p.activo and not p.es_extra and p.archivado_en is null))
             order by c.orden, c.nombre)
        from categorias c where c.activa), '[]'::jsonb),
    'productos_ocultos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'precio', p.precio, 'categoria', c.nombre) order by p.nombre)
        from productos p left join categorias c on c.id = p.categoria_id
       where not p.en_app and p.activo and p.archivado_en is null), '[]'::jsonb)
  );
end;
$function$;

-- El candado del servidor en el pedido por la app (parche anclado).
do $$
declare v text; a text;
begin
  select pg_get_functiondef('public.fn_pedido_app_crear(jsonb,text)'::regprocedure) into v;
  a := '  v_orden := fn_crear_orden(v_suc, v_alm, ''app'', p_items';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla fn_pedido_app_crear'; end if;
  v := replace(v, a, $p$  if exists (
    select 1 from jsonb_array_elements(p_items) i
      join productos p on p.id = (i->>'producto_id')::uuid
      left join categorias c on c.id = p.categoria_id
     where coalesce(i->>'padre_linea', '') = ''
       and (not p.en_app or c.en_app is false)) then
    raise exception 'Uno de los productos ya no está disponible en la app. Actualiza el menú.';
  end if;

$p$ || a);
  execute v;
end $$;
