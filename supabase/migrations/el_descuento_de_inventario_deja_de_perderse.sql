-- El descuento de inventario dejaba caer parte de lo que tocaba, y nunca
-- se quejaba. Dos agujeros, los dos callados:
--
-- 1. `update inventario_stock ... where s.insumo_id = ...` solo toca
--    renglones QUE YA EXISTEN. Si el insumo nunca se dio de alta en ese
--    almacen, el movimiento se escribia igual y el stock no se movia: el
--    historial decia una cosa y la pantalla otra. **264 insumos del
--    Kiosko estaban asi** -- con ventas registradas y sin renglon que
--    bajar. Ahora es un upsert: si no hay renglon, nace con el descuento
--    ya aplicado. Puede quedar en negativo, y esta bien -- un negativo se
--    ve y se corrige; un cero que nunca baja no se ve nunca.
--
-- 2. Los combos no se abrian. `join recetas on producto_id` contra un
--    combo no encuentra nada, porque la receta la tienen sus partes. Hoy
--    `combo_items` esta vacia, asi que esto no cambia ni un numero
--    todavia; el dia que alguien la llene, los 46 Chapata-Americano del
--    mes pasado si van a descontar. Se abre UN nivel a proposito: un
--    combo dentro de otro no existe, y la recursion abierta en un trigger
--    del cobro es justo lo que no se puede permitir aqui.
--
-- Lo que NO arregla esto, porque es catalogo y no codigo: 42 productos
-- que se venden sin receta (480 de 4490 piezas del mes). Esos no tienen
-- nada que descontar. Para que dejen de ser invisibles esta
-- `fn_inventario_huecos` y su pantalla en Admin.
--
-- Sin tablas temporales y sin `delete` pelado: esto corre dentro de un
-- trigger sobre `ordenes`, o sea desde la caja, y ese patron ya dejo la
-- tienda 50 minutos sin cobrar el 27/08. Y sin tocar `ordenes` desde su
-- propio trigger, que ademas se llamaria a si mismo.
--
-- Comprobado cobrando de verdad (y revirtiendo): 3 aguas Kirkland
-- 12 -> 9 con su renglon, y una Barra Think! sin renglon nacio en -2.
create or replace function public.fn_descontar_inventario_por_orden()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true
     and NEW.almacen_id is not null and not NEW.es_demo then

    -- Lo que hay que bajar, ya sumado por insumo: lo del producto directo
    -- mas lo de las partes, si el producto es un combo.
    with piezas as (
      select oi.producto_id, sum(oi.cantidad) as n
      from orden_items oi where oi.orden_id = NEW.id
      group by oi.producto_id
    ),
    necesario as (
      select r.insumo_id, sum(r.cantidad * pz.n) as total
      from piezas pz join recetas r on r.producto_id = pz.producto_id
      group by r.insumo_id
      union all
      select r.insumo_id, sum(r.cantidad * ci.cantidad * pz.n) as total
      from piezas pz
      join combo_items ci on ci.combo_id = pz.producto_id
      join recetas r on r.producto_id = ci.producto_id
      group by r.insumo_id
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
    -- descuento), asi que sumarlo ES restarlo: se escribe sumando para
    -- que la operacion sea la misma en el alta y en la actualizacion.
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
