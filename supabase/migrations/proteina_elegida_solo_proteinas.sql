-- La proteína elegida es SOLO el extra «Proteína …» (10/10/26).
--
-- La versión del 09/10 tomaba como «elegida» a cualquier extra cuya receta
-- fuera un insumo de tipo proteína, y en Costeos los SUPLEMENTOS también son
-- tipo proteína (creatina, probiótico…). Folio 8330: un Island Colada con
-- Daily Spore Probiotic no descontó su CBUM Piña Colada, porque el probiótico
-- «era» la proteína elegida. Ahora:
--   1. Elegida = hijo cuyo producto se llama «Proteína …» (el mismo criterio
--      de Admin → Inventario → Proteína y de la siembra).
--   2. Doble scoop con elegida → un scoop más de la elegida (igual que ayer).
--      Doble scoop SIN elegida → un scoop más de la proteína de la receta del
--      shake (antes no descontaba nada).
-- Los suplementos colgados del shake descuentan lo suyo, como siempre.

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
    -- La proteína que eligió el cliente: el extra «Proteína MARCA - sabor»
    -- colgado de un renglón. Un suplemento NO es la proteína elegida.
    elegida as (
      select h.padre_item_id, r.insumo_id, r.cantidad as por_pieza
        from items h
        join productos ph on ph.id = h.producto_id and ph.nombre ilike 'prote_na %'
        join recetas r on r.producto_id = h.producto_id and r.cantidad > 0
        join insumos i on i.id = r.insumo_id and i.tipo = 'proteina'
       where h.padre_item_id is not null
    ),
    necesario as (
      -- Cada renglón con su receta. Si el cliente eligió proteína, la de la
      -- receta del shake no se descuenta: se descuenta la elegida (que es su
      -- propio renglón, y entra aquí con su propia receta).
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
      -- Doble scoop con proteína elegida: un scoop más de la elegida.
      select e.insumo_id, e.por_pieza * d.cantidad
        from items d
        join productos pd on pd.id = d.producto_id
        join elegida e on e.padre_item_id = d.padre_item_id
       where d.padre_item_id is not null and pd.nombre ilike 'doble scoop%'
      union all
      -- Doble scoop SIN proteína elegida: un scoop más de la de la receta.
      select r.insumo_id, r.cantidad * d.cantidad
        from items d
        join productos pd on pd.id = d.producto_id
        join items padre on padre.id = d.padre_item_id
        join recetas r on r.producto_id = padre.producto_id and r.cantidad > 0
        join insumos i on i.id = r.insumo_id and i.tipo = 'proteina'
       where pd.nombre ilike 'doble scoop%'
         and not exists (select 1 from elegida e where e.padre_item_id = d.padre_item_id)
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
