-- «Abrí un bote para la barra» (10/10/26, pedido por Perla).
--
-- En el kiosko conviven dos inventarios de la misma proteína: los botes
-- CERRADOS que se venden («BIRDMAN Falcon - Chai 960gr») y la proteína de
-- la barra que se sirve por scoop («BIRDMAN Falcon - Chai»). Cuando se acaba
-- el de la barra, se abre uno de venta. Eso es un movimiento entre dos
-- insumos y hasta hoy no había cómo registrarlo: el bote de venta seguía
-- contado y la barra quedaba en negativo.
--
-- Todo va en scoops (la unidad del insumo): abrir 1 bote de 30 scoops es
-- −30 en el de venta y +30 en el de barra, en el almacén Kiosko, con el
-- mismo `referencia_id` para que el kardex los muestre como pareja. Sin
-- `motivo`: esa columna es de las salidas (merma, caducado…) y su check lo
-- rechaza; la nota dice qué fue.
--
-- Cuál es «el de venta» y cuál «el de barra» lo dice Costeos, igual que en
-- su pestaña de Inventario: venta = precio de bote y sin precio de scoop
-- (o el legado «- R»); barra = precio de scoop. El destino se sugiere por
-- marca + sabor sin gramaje («Chai 960gr» → «Chai»); si no empata, la
-- pantalla deja elegir de la lista de la barra.

create or replace function public.fn_inventario_botes_abribles()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v_k uuid; v_res jsonb;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede ver el inventario';
  end if;
  select id into v_k from almacenes where nombre = 'Kiosko' limit 1;

  with fila as (
    select trim(x->>'marca') marca, trim(x->>'sabor') sabor,
           lower(trim(x->>'marca')||' - '||trim(x->>'sabor')) ins_nombre,
           lower(trim(x->>'marca')) marca_l,
           lower(trim(regexp_replace(regexp_replace(trim(x->>'sabor'), '\s*-\s*[BR]$', ''),
             '\s*\d+([.,]\d+)?\s*(gr|g|kg|lb|lbs|caps|capsulas|cápsulas|porciones|servicios|serv)\.?\s*$', '', 'i'))) base,
           coalesce(nullif(x->>'precioBote','')::numeric,0) pbote,
           coalesce(nullif(x->>'precioScoop','')::numeric,0) pscoop,
           trim(x->>'sabor') ilike '%- R' legado_r
      from app_data ad, jsonb_array_elements(ad.data->'proteins') x
     where ad.id = 'shakeaholic'
       and coalesce(trim(x->>'marca'),'') <> '' and coalesce(trim(x->>'sabor'),'') <> ''
  ),
  con_ins as (
    select f.*, i.id ins_id, i.nombre ins, nullif(i.contenido, 0) contenido,
           (select s.stock_actual from inventario_stock s where s.insumo_id = i.id and s.almacen_id = v_k) en_kiosko
      from fila f
      join lateral (select i.* from insumos i where lower(i.nombre) = f.ins_nombre and i.tipo = 'proteina'
                     order by i.activo desc, i.id limit 1) i on true
  ),
  barra as (select * from con_ins where pscoop > 0),
  venta as (select * from con_ins where pscoop = 0 and (pbote > 0 or legado_r) and contenido is not null)
  select jsonb_build_object(
    'venta', coalesce((select jsonb_agg(jsonb_build_object(
        'insumo_id', v.ins_id, 'nombre', v.ins, 'scoops_por_bote', v.contenido,
        'en_kiosko', coalesce(v.en_kiosko, 0),
        'destino_id', (select b.ins_id from barra b where b.marca_l = v.marca_l and b.base = v.base order by b.ins_id limit 1))
        order by coalesce(v.en_kiosko, 0) <= 0, v.ins) from venta v), '[]'::jsonb),
    'barra', coalesce((select jsonb_agg(jsonb_build_object(
        'insumo_id', b.ins_id, 'nombre', b.ins, 'en_kiosko', coalesce(b.en_kiosko, 0)) order by b.ins)
        from barra b), '[]'::jsonb))
    into v_res;
  return v_res;
end;
$function$;
revoke all on function public.fn_inventario_botes_abribles() from public, anon;
grant execute on function public.fn_inventario_botes_abribles() to authenticated;

create or replace function public.fn_inventario_abrir_bote(p_origen uuid, p_destino uuid, p_botes int default 1)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_k uuid; v_ref uuid := gen_random_uuid(); v_emp uuid; v_quien text;
  v_o record; v_d record; v_scoops numeric;
  v_antes_o numeric; v_antes_d numeric;
begin
  if not fn_es_staff() then
    raise exception 'Solo el personal puede mover inventario';
  end if;
  if coalesce(p_botes, 0) < 1 or p_botes > 20 then
    raise exception 'Abre entre 1 y 20 botes a la vez.';
  end if;
  if p_origen = p_destino then
    raise exception 'El bote y la proteína de la barra tienen que ser distintos.';
  end if;
  select id, nombre, contenido into v_o from insumos where id = p_origen and tipo = 'proteina';
  if v_o.id is null then raise exception 'Ese bote no es una proteína.'; end if;
  if coalesce(v_o.contenido, 0) <= 0 then
    raise exception 'A «%» le falta cuántos scoops trae el bote (Costeos → Proteínas → scoops).', v_o.nombre;
  end if;
  select id, nombre into v_d from insumos where id = p_destino and tipo = 'proteina';
  if v_d.id is null then raise exception 'La proteína de la barra no existe.'; end if;

  select id into v_k from almacenes where nombre = 'Kiosko' limit 1;
  select id, nombre into v_emp, v_quien from empleados where auth_user_id = auth.uid() limit 1;
  v_scoops := v_o.contenido * p_botes;

  select coalesce((select stock_actual from inventario_stock where almacen_id = v_k and insumo_id = v_o.id), 0) into v_antes_o;
  select coalesce((select stock_actual from inventario_stock where almacen_id = v_k and insumo_id = v_d.id), 0) into v_antes_d;

  insert into inventario_movimientos
    (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota, empleado_id, motivo, existencia_antes, existencia_despues)
  values
    (v_o.id, v_k, -v_scoops, 'traspaso', v_ref,
     'Bote abierto para la barra → ' || v_d.nombre || coalesce(' - ' || v_quien, ''),
     v_emp, null, v_antes_o, v_antes_o - v_scoops),
    (v_d.id, v_k, v_scoops, 'traspaso', v_ref,
     'Bote abierto para la barra ← ' || v_o.nombre || coalesce(' - ' || v_quien, ''),
     v_emp, null, v_antes_d, v_antes_d + v_scoops);

  insert into inventario_stock (almacen_id, insumo_id, stock_actual)
  values (v_k, v_o.id, -v_scoops), (v_k, v_d.id, v_scoops)
  on conflict (almacen_id, insumo_id)
  do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;

  return jsonb_build_object('referencia', v_ref, 'botes', p_botes, 'scoops', v_scoops,
    'origen', v_o.nombre, 'destino', v_d.nombre, 'quien', v_quien,
    'origen_queda', v_antes_o - v_scoops, 'destino_queda', v_antes_d + v_scoops,
    'scoops_por_bote', v_o.contenido);
end;
$function$;
revoke all on function public.fn_inventario_abrir_bote(uuid, uuid, int) from public, anon;
grant execute on function public.fn_inventario_abrir_bote(uuid, uuid, int) to authenticated;
