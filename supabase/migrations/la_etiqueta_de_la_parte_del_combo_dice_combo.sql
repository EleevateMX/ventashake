-- La parte de un combo que se prepara en otra estacion lleva "COMBO" en su
-- etiqueta: el cafe del combo que sale solo en la barra no debe leerse como
-- un pedido aparte. Va en personalizacion porque es lo que el agente ya
-- imprime: no hace falta actualizar la PC de la tienda.
create or replace function public.fn_items_comanda(p_pedido_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'cantidad',        ci.cantidad,
      'nombre',          pr.nombre,
      'categoria',       cat.nombre_singular,
      'personalizacion', nullif(concat_ws(' · ',
                           case when ci.combo_nombre is not null then 'COMBO' end,
                           nullif(ci.personalizacion, '')), ''),
      'extras', coalesce((
        select jsonb_agg(
          jsonb_build_object('nombre', ph.nombre, 'cantidad', h.cantidad)
          order by ph.nombre
        )
        from cocina_items h
        join orden_items oh on oh.id = h.orden_item_id
        left join productos ph on ph.id = h.producto_id
        where h.pedido_id = ci.pedido_id
          and oh.padre_item_id = ci.orden_item_id
      ), '[]'::jsonb)
    ) as x
    from cocina_items ci
    join orden_items oi on oi.id = ci.orden_item_id
    left join productos pr on pr.id = ci.producto_id
    left join categorias cat on cat.id = pr.categoria_id
    where ci.pedido_id = p_pedido_id
      and (
        oi.padre_item_id is null
        or not exists (
          select 1 from cocina_items padre
          where padre.pedido_id = ci.pedido_id
            and padre.orden_item_id = oi.padre_item_id
        )
      )
  ) t;
$function$;
