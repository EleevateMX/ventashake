-- La proteína que elige el cliente es la que se descuenta (09/10/26).
--
-- Hasta hoy un shake descontaba la proteína FIJA de su receta en Costeos
-- (solo 31 shakes la traían) y el extra «Proteína MARCA - sabor» que el
-- cliente elige casi nunca tenía receta. Resultado: o no se descontaba
-- nada, o —con las pocas que sí tenían receta (OPTIMUM, CBUM Vainilla,
-- ISOPURE)— se descontaban DOS scoops: el fijo y el elegido. El folio 8248
-- movió dos insumos de chocolate por un solo shake.
--
-- Reglas nuevas, en el trigger de siempre (`fn_descontar_inventario_por_orden`):
--   1. El extra de proteína elegido descuenta SU insumo (receta de 1 scoop
--      en el extra; Costeos no la pisa: su sync filtra `not es_extra`).
--   2. Si un renglón tiene proteína elegida, se SALTAN las líneas de
--      proteína (`insumos.tipo = 'proteina'`) de su propia receta. Sin
--      proteína elegida, todo queda como antes.
--   3. «Doble scoop» descuenta un scoop más de la proteína elegida del
--      mismo shake.
--
-- La siembra solo liga las proteínas con UN candidato inequívoco: el
-- producto «Scoop …» con el mismo sabor y la marca completa en su nombre,
-- cuyo insumo no tenga el nombre roto de Costeos («… - —»). Las demás se
-- ligan a mano en Admin → Inventario → «¿De qué bote sale cada proteína?».
--
-- ⚠ Esto vive en el camino del cobro: se probó cobrando de verdad
-- (fn_crear_orden → fn_cobrar_orden) dentro de una transacción deshecha,
-- y sin tablas temporales ni `delete` (ver CLAUDE.md §4).

-- 1. Siembra de recetas seguras para las proteínas que no tenían.
with ext as (
  select p.id, p.marca, btrim(split_part(p.nombre, ' - ', 2)) sabor
    from productos p
   where p.es_extra and p.archivado_en is null and p.nombre ilike 'prote_na %' and p.nombre like '% - %'
     and not exists (select 1 from recetas r where r.producto_id = p.id and r.cantidad > 0)
),
scoop as (
  select sp.nombre, r.insumo_id, i.nombre insumo
    from productos sp join categorias c on c.id = sp.categoria_id
    join recetas r on r.producto_id = sp.id join insumos i on i.id = r.insumo_id
   where c.nombre ilike 'scoops%' and sp.archivado_en is null and i.tipo = 'proteina' and i.activo
     and i.nombre not like '%—%'
),
cand as (
  select e.id, s.insumo_id
    from ext e join scoop s
      on lower(s.nombre) like '% - ' || lower(e.sabor)
     and regexp_replace(lower(s.nombre), '[^a-z0-9]', '', 'g')
         like '%' || regexp_replace(lower(coalesce(e.marca, '')), '[^a-z0-9]', '', 'g') || '%'
),
unico as (
  select id, min(insumo_id::text)::uuid insumo_id from cand group by id having count(distinct insumo_id) = 1
)
insert into recetas (producto_id, insumo_id, cantidad, nota)
select id, insumo_id, 1, 'Proteína elegida: descuenta el scoop de su bote (09/10/26)'
  from unico
on conflict (producto_id, insumo_id) do update set cantidad = 1;

-- 2. El trigger de siempre, con la proteína elegida.
create or replace function public.fn_descontar_inventario_por_orden()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true
     and NEW.almacen_id is not null and not NEW.es_demo then

    with items as (
      select oi.id, oi.producto_id, oi.cantidad, oi.padre_item_id
        from orden_items oi where oi.orden_id = NEW.id
    ),
    -- La proteína que eligió el cliente: un extra colgado de un renglón
    -- cuya receta es un insumo de proteína.
    elegida as (
      select h.padre_item_id, r.insumo_id, r.cantidad as por_pieza
        from items h
        join recetas r on r.producto_id = h.producto_id and r.cantidad > 0
        join insumos i on i.id = r.insumo_id and i.tipo = 'proteina'
       where h.padre_item_id is not null
    ),
    necesario as (
      -- Cada renglón con su receta. Si el cliente eligió proteína, la fija
      -- de la receta del shake no se descuenta: se descuenta la elegida
      -- (que es su propio renglón, y entra aquí con su propia receta).
      select r.insumo_id, r.cantidad * it.cantidad as total
        from items it
        join recetas r on r.producto_id = it.producto_id
        join insumos i on i.id = r.insumo_id
       where not (i.tipo = 'proteina'
                  and exists (select 1 from elegida e where e.padre_item_id = it.id))
      union all
      -- Las partes de un combo.
      select r.insumo_id, r.cantidad * ci.cantidad * it.cantidad
        from items it
        join combo_items ci on ci.combo_id = it.producto_id
        join recetas r on r.producto_id = ci.producto_id
      union all
      -- Doble scoop: un scoop más de la proteína elegida del mismo shake.
      select e.insumo_id, e.por_pieza * d.cantidad
        from items d
        join productos pd on pd.id = d.producto_id
        join elegida e on e.padre_item_id = d.padre_item_id
       where d.padre_item_id is not null and pd.nombre ilike 'doble scoop%'
    ),
    sumado as (
      select insumo_id, sum(total) as total from necesario
      group by insumo_id having sum(total) <> 0
    ),
    mov as (
      insert into inventario_movimientos
        (insumo_id, almacen_id, cantidad, tipo, referencia_id, nota)
      select s.insumo_id, NEW.almacen_id, -s.total, 'venta', NEW.id,
             'Venta folio ' || NEW.folio
      from sumado s
      returning insumo_id
    )
    -- El upsert. `excluded.stock_actual` ya viene en negativo (es el
    -- descuento), asi que sumarlo ES restarlo.
    insert into inventario_stock (almacen_id, insumo_id, stock_actual)
    select NEW.almacen_id, s.insumo_id, -s.total
    from sumado s
    on conflict (almacen_id, insumo_id)
    do update set stock_actual = inventario_stock.stock_actual + excluded.stock_actual;

    if NEW.metodo_pago is not null then
      insert into ventas (orden_id, total, metodo_pago)
      values (NEW.id, NEW.total, NEW.metodo_pago)
      on conflict (orden_id) do nothing;
    end if;
  end if;
  return NEW;
end;
$function$;

-- 3. Admin: qué proteína sale de qué bote, y lo que hay que corregir.
create or replace function public.fn_proteinas_elegidas_admin()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  return jsonb_build_object(
    'proteinas', coalesce((
      select jsonb_agg(x order by x.vendidas_30d desc, x.nombre) from (
        select p.id, p.nombre, p.activo,
               (select r.insumo_id from recetas r join insumos i on i.id = r.insumo_id
                 where r.producto_id = p.id and r.cantidad > 0 and i.tipo = 'proteina' limit 1) insumo_id,
               (select i.nombre from recetas r join insumos i on i.id = r.insumo_id
                 where r.producto_id = p.id and r.cantidad > 0 and i.tipo = 'proteina' limit 1) insumo,
               coalesce((select sum(oi.cantidad) from orden_items oi join ordenes o on o.id = oi.orden_id
                          where oi.producto_id = p.id and o.pagado and o.created_at > now() - interval '30 days'), 0) vendidas_30d
          from productos p
         where p.es_extra and p.archivado_en is null and p.nombre ilike 'prote_na %'
      ) x), '[]'::jsonb),
    'insumos', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'scoops_por_bote', i.contenido) order by i.nombre)
        from insumos i where i.activo and i.tipo = 'proteina'), '[]'::jsonb),
    -- Botes (Suplementos) cuya receta descuenta un insumo de OTRO sabor.
    'botes_otro_sabor', coalesce((
      select jsonb_agg(jsonb_build_object('producto', b.nombre, 'insumo', b.insumo) order by b.nombre) from (
        select p.nombre, i.nombre insumo,
               lower(btrim(regexp_replace(split_part(p.nombre, ' - ', 2), '\s*\d+(\.\d+)?\s*(gr|g|kg|lb|lbs)\s*$', '', 'i'))) sabor_p,
               lower(btrim(regexp_replace(split_part(i.nombre, ' - ', 2), '\s*\d+(\.\d+)?\s*(gr|g|kg|lb|lbs)\s*$', '', 'i'))) sabor_i
          from productos p
          join categorias c on c.id = p.categoria_id and c.nombre ilike 'suplementos%'
          join recetas r on r.producto_id = p.id and r.cantidad > 0
          join insumos i on i.id = r.insumo_id and i.tipo = 'proteina'
         where p.activo and p.archivado_en is null
      ) b
      where b.sabor_p <> '' and b.sabor_i <> ''
        and position(b.sabor_p in b.sabor_i) = 0 and position(b.sabor_i in b.sabor_p) = 0), '[]'::jsonb)
  );
end;
$function$;
revoke all on function public.fn_proteinas_elegidas_admin() from public, anon;
grant execute on function public.fn_proteinas_elegidas_admin() to authenticated;

-- Ligar (o cambiar) de qué bote sale una proteína elegida. Sin borrar:
-- la receta anterior queda en cantidad 0 (se puede volver a ligar).
create or replace function public.fn_proteina_elegida_guardar(p_extra_id uuid, p_insumo_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  if not exists (select 1 from productos where id = p_extra_id and es_extra and nombre ilike 'prote_na %') then
    raise exception 'Eso no es una proteína elegible.';
  end if;
  if p_insumo_id is not null and not exists (select 1 from insumos where id = p_insumo_id and tipo = 'proteina') then
    raise exception 'Ese insumo no es una proteína.';
  end if;
  update recetas r set cantidad = 0
    from insumos i
   where r.producto_id = p_extra_id and i.id = r.insumo_id and i.tipo = 'proteina'
     and r.insumo_id is distinct from p_insumo_id;
  if p_insumo_id is not null then
    insert into recetas (producto_id, insumo_id, cantidad, nota)
    values (p_extra_id, p_insumo_id, 1, 'Proteína elegida: ligada desde Admin')
    on conflict (producto_id, insumo_id) do update set cantidad = 1;
  end if;
end;
$function$;
revoke all on function public.fn_proteina_elegida_guardar(uuid, uuid) from public, anon;
grant execute on function public.fn_proteina_elegida_guardar(uuid, uuid) to authenticated;
