-- Cada bote y cada scoop descuenta el insumo de SU fila de Costeos (10/10/26).
--
-- Lo que Perla cuenta en Costeos → Inventario es el insumo de la fila
-- («BIRDMAN Falcon - Chai 960gr»), pero el bote vendido descontaba OTRO
-- («BIRDMAN FALCON - Chai - R»): `fn_sync_app_data` crea la receta de un
-- bote o de un scoop solo la primera vez («si no tiene receta») y nunca la
-- vuelve a apuntar. Cuando la fila se renombró —el sufijo - R / - B era el
-- legado, y la Clave ancla el producto— el producto se quedó descontando el
-- insumo del nombre viejo. Contado el 10/10: 67 botes y 54 scoops
-- descontaban un insumo que Costeos no ve. Por eso «no baja».
--
-- `fn_proteina_recetas_alinear` aplica la MISMA regla del sync a lo que ya
-- existe:
--   * bote  («MARCA - sabor»,       precioBote > 0 o «- R») → `scoops` del insumo de su fila;
--   * scoop («Scoop MARCA - sabor», precioScoop > 0 o «- B») → 1 del insumo de su fila;
--   * la proteína elegida («Proteína …») que descontaba el insumo viejo de
--     un scoop se mueve con él al insumo nuevo.
-- No borra: la línea vieja queda en cantidad 0 (misma regla que Admin →
-- Inventario → Proteína). Un producto que empata con dos filas que dicen
-- cosas distintas NO se toca: no hay forma de saber cuál manda.
-- Corre una vez aquí y después de cada guardado de Costeos (trigger que
-- dispara DESPUÉS del sync, por nombre), para que un renombre no vuelva a
-- partir el inventario.
-- Las recetas de los shakes no se tocan: esas las escribe Costeos por
-- nombre y se reescriben en cada guardado.

create or replace function public.fn_proteina_recetas_alinear()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_res jsonb;
begin
  with fila as (
    select lower(trim(x->>'marca')||' - '||trim(x->>'sabor')) ins_nombre,
           lower(trim(x->>'marca')||' - '||trim(regexp_replace(trim(x->>'sabor'), '\s*-\s*[BR]$', ''))) prod_bote,
           lower('Scoop '||trim(x->>'marca')||' - '||trim(regexp_replace(trim(x->>'sabor'), '\s*-\s*[BR]$', ''))) prod_scoop,
           (trim(x->>'sabor') ilike '%- R' or coalesce(nullif(x->>'precioBote','')::numeric,0) > 0) vende_bote,
           (trim(x->>'sabor') ilike '%- B' or coalesce(nullif(x->>'precioScoop','')::numeric,0) > 0) vende_scoop,
           coalesce(nullif(x->>'scoops','')::numeric, 1) scoops
      from app_data ad, jsonb_array_elements(ad.data->'proteins') x
     where ad.id = 'shakeaholic'
       and coalesce(trim(x->>'marca'),'') <> '' and coalesce(trim(x->>'sabor'),'') <> ''
  ),
  fila_ins as (
    select f.*, (select i.id from insumos i where lower(i.nombre) = f.ins_nombre and i.tipo = 'proteina'
                  order by i.activo desc, i.id limit 1) ins_id
      from fila f
  ),
  candidato as (
    select p.id producto_id, f.ins_id, f.scoops cantidad, 'bote' clase
      from fila_ins f join productos p on lower(p.nombre) = f.prod_bote and not p.es_extra and not p.es_combo
     where f.vende_bote and f.ins_id is not null
    union all
    select p.id, f.ins_id, 1, 'scoop'
      from fila_ins f join productos p on lower(p.nombre) = f.prod_scoop and not p.es_extra and not p.es_combo
     where f.vende_scoop and f.ins_id is not null
  ),
  -- Un producto, un destino: si dos filas lo reclaman con insumos
  -- distintos, no se toca.
  destino as (
    select producto_id, min(ins_id::text)::uuid ins_id, max(cantidad) cantidad, min(clase) clase
      from candidato group by producto_id
    having count(distinct ins_id) = 1
  ),
  -- Lo que hoy descuenta cada producto (líneas de proteína vivas).
  actual as (
    select r.producto_id, r.insumo_id, r.cantidad
      from recetas r join insumos i on i.id = r.insumo_id and i.tipo = 'proteina'
     where r.cantidad > 0 and r.producto_id in (select producto_id from destino)
  ),
  cambia as (
    select d.* from destino d
     where not exists (select 1 from actual a where a.producto_id = d.producto_id
                        and a.insumo_id = d.ins_id and a.cantidad = d.cantidad)
        or exists (select 1 from actual a where a.producto_id = d.producto_id and a.insumo_id <> d.ins_id)
  ),
  -- La proteína elegida sigue a su scoop: viejo → nuevo, solo si es único.
  movida as (
    select a.insumo_id viejo, min(c.ins_id::text)::uuid nuevo
      from cambia c join actual a on a.producto_id = c.producto_id and a.insumo_id <> c.ins_id
     where c.clase = 'scoop'
     group by a.insumo_id having count(distinct c.ins_id) = 1
  ),
  elegida as (
    select p.id producto_id, m.nuevo ins_id
      from productos p
      join recetas r on r.producto_id = p.id and r.cantidad > 0
      join movida m on m.viejo = r.insumo_id
     where p.es_extra and p.archivado_en is null and p.nombre ilike 'prote_na %'
  ),
  todo as (
    select producto_id, ins_id, cantidad from cambia
    union all
    select producto_id, ins_id, 1 from elegida
  ),
  apaga as (
    update recetas r set cantidad = 0
      from todo t, insumos i
     where r.producto_id = t.producto_id and i.id = r.insumo_id and i.tipo = 'proteina'
       and r.insumo_id <> t.ins_id and r.cantidad > 0
    returning r.producto_id
  ),
  pone as (
    insert into recetas (producto_id, insumo_id, cantidad, nota)
    select t.producto_id, t.ins_id, t.cantidad, 'Alineado al insumo de su fila de Costeos (10/10/26)'
      from todo t
    on conflict (producto_id, insumo_id) do update set cantidad = excluded.cantidad
    returning producto_id
  )
  select jsonb_build_object(
    'botes',    (select count(*) from cambia where clase = 'bote'),
    'scoops',   (select count(*) from cambia where clase = 'scoop'),
    'elegidas', (select count(*) from elegida),
    'lineas_apagadas', (select count(*) from apaga),
    'lineas_puestas',  (select count(*) from pone))
    into v_res;
  return v_res;
end;
$function$;
revoke all on function public.fn_proteina_recetas_alinear() from public, anon, authenticated;

-- Después de cada guardado de Costeos. Los triggers del mismo momento corren
-- por orden alfabético: «app_data_sync_proteinas» va después de
-- «app_data_sync». Si algo falla aquí, el guardado NO se cae: se avisa en el
-- log y Costeos sigue.
create or replace function public.trg_proteina_recetas_alinear()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    perform fn_proteina_recetas_alinear();
  exception when others then
    raise warning 'fn_proteina_recetas_alinear: %', sqlerrm;
  end;
  return null;
end;
$function$;
revoke all on function public.trg_proteina_recetas_alinear() from public, anon, authenticated;

create or replace trigger app_data_sync_proteinas
  after update of data on public.app_data
  for each row when (new.data is distinct from old.data)
  execute function trg_proteina_recetas_alinear();

select fn_proteina_recetas_alinear();
