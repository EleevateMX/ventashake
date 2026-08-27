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
create or replace function fn_crear_pedidos_cocina()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.pagado = true and OLD.pagado is distinct from true and not NEW.es_demo then

    -- Que renglones van a pantalla: los que su categoria manda, MAS los
    -- padres de esos (para que un extra nunca viaje huerfano).
    create temp table if not exists _a_pantalla (
      item_id uuid primary key, cocina_id uuid
    ) on commit drop;
    delete from _a_pantalla;

    insert into _a_pantalla (item_id, cocina_id)
    select oi.id,
           coalesce(c.cocina_id, (select id from cocinas where slug = coalesce(oi.cocina_slug, 'bebidas')))
    from orden_items oi
    left join productos p on p.id = oi.producto_id
    left join categorias c on c.id = p.categoria_id
    where oi.orden_id = NEW.id
      and coalesce(c.va_a_pantalla, true)
    on conflict (item_id) do nothing;

    -- Los padres de lo anterior. Van a la MISMA cocina que su hijo: si el
    -- extra lo prepara la barra, el scoop tambien.
    insert into _a_pantalla (item_id, cocina_id)
    select padre.id, hijo.cocina_id
    from _a_pantalla hijo
    join orden_items h on h.id = hijo.item_id and h.padre_item_id is not null
    join orden_items padre on padre.id = h.padre_item_id
    on conflict (item_id) do nothing;

    insert into pedidos_cocina (orden_id, cocina_id)
    select distinct NEW.id, ap.cocina_id from _a_pantalla ap
    on conflict (orden_id, cocina_id) do nothing;

    insert into cocina_items (pedido_id, orden_item_id, producto_id, cantidad, personalizacion)
    select pc.id, oi.id, oi.producto_id, oi.cantidad, oi.personalizacion
    from _a_pantalla ap
    join orden_items oi on oi.id = ap.item_id
    join pedidos_cocina pc on pc.orden_id = NEW.id and pc.cocina_id = ap.cocina_id
    on conflict (orden_item_id) do nothing;
  end if;
  return NEW;
end;
$function$;
