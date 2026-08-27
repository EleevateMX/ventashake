-- "Preparado" salia solo en la pantalla y en la etiqueta.
--
-- Un scoop suelto no va a pantalla a proposito: lo sirve el cajero, y por
-- eso las categorias Scoops-* tienen va_a_pantalla = false. Pero cuando el
-- cliente lo pide PREPARADO, el extra "Preparado" es un renglon hijo cuya
-- categoria (Extras Bebidas) si va a pantalla. Resultado: llegaba el hijo
-- sin el padre, y la barra veia una comanda que decia "Preparado" y nada
-- mas. Sin saber de que.
--
-- El arreglo: si un renglon HIJO va a pantalla, su padre se va con el.
-- La unidad que se prepara es el producto, no su extra -- un extra sin su
-- producto no es una instruccion, es un acertijo.
--
-- ---------------------------------------------------------------------
-- NO USAR TABLA TEMPORAL AQUI. La primera version de este arreglo hacia
-- `create temp table _a_pantalla` + `delete from _a_pantalla;` para
-- reusarla entre los tres inserts. El `delete` sin WHERE lo bloquea el
-- guard de supautils que Supabase aplica a los roles de la API:
--
--     DELETE requires a WHERE clause
--
-- Como esto corre en un TRIGGER sobre `ordenes`, el error no aparecio al
-- probarlo con la conexion de administrador -- aparecio en la caja, al
-- cobrar, y dejo a la tienda 50 minutos sin poder cerrar una venta
-- (27/08/26, 09:52-10:45). Las ordenes se creaban y ninguna se pagaba.
--
-- El conjunto se calcula con CTEs, repetido en los dos inserts. Se ve
-- redundante y es a proposito: no depende de nada de sesion.
-- ---------------------------------------------------------------------
create or replace function fn_crear_pedidos_cocina()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and not NEW.es_demo then

    -- Los renglones que van a pantalla: los que su categoria manda, MAS
    -- los padres de esos (para que un extra nunca viaje huerfano).
    with propios as (
      select oi.id as item_id,
             coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas'))) as cocina_id
      from orden_items oi
      left join productos p on p.id = oi.producto_id
      left join categorias c on c.id = p.categoria_id
      where oi.orden_id = NEW.id
        and coalesce(c.va_a_pantalla, true)
    ),
    con_padres as (
      select item_id, cocina_id from propios
      union
      -- El padre va a la MISMA cocina que su hijo: si el extra lo prepara
      -- la barra, el scoop tambien.
      select padre.id, hijo.cocina_id
      from propios hijo
      join orden_items h on h.id = hijo.item_id and h.padre_item_id is not null
      join orden_items padre on padre.id = h.padre_item_id
    )
    insert into pedidos_cocina (orden_id, cocina_id)
    select distinct NEW.id, cocina_id from con_padres
    on conflict (orden_id, cocina_id) do nothing;

    with propios as (
      select oi.id as item_id,
             coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas'))) as cocina_id
      from orden_items oi
      left join productos p on p.id = oi.producto_id
      left join categorias c on c.id = p.categoria_id
      where oi.orden_id = NEW.id
        and coalesce(c.va_a_pantalla, true)
    ),
    con_padres as (
      select item_id, cocina_id from propios
      union
      select padre.id, hijo.cocina_id
      from propios hijo
      join orden_items h on h.id = hijo.item_id and h.padre_item_id is not null
      join orden_items padre on padre.id = h.padre_item_id
    )
    insert into cocina_items (pedido_id, orden_item_id, producto_id, cantidad, personalizacion)
    select pc.id, oi.id, oi.producto_id, oi.cantidad, oi.personalizacion
    from con_padres ap
    join orden_items oi on oi.id = ap.item_id
    join pedidos_cocina pc on pc.orden_id = NEW.id and pc.cocina_id = ap.cocina_id
    on conflict (orden_item_id) do nothing;
  end if;
  return NEW;
end;
$function$;
