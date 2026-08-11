-- ============================================================================
-- Ligar cada extra al producto al que pertenece
-- ============================================================================
-- Hoy `orden_items` es una lista plana. Cuando alguien pide un shake con
-- proteína y galletas, salen tres líneas sueltas y nada dice cuál extra es de
-- cuál shake. Con un solo shake en el pedido se adivina; con dos —uno con
-- galletas y otro sin— ya no, y ahí es donde se equivoca el vaso.
--
-- Eso se nota en tres lugares:
--   · La etiqueta de comanda imprime cada extra en su propia etiqueta, en vez
--     de agruparlo bajo el SPEC del shake.
--   · Las pantallas de producción listan los extras aparte del producto.
--   · Quitar un shake del carrito dejaba sus extras cobrándose solos.
--
-- Se agrega el vínculo padre→hijo. Aditiva y no destructiva: la columna es
-- nullable, todo lo que ya existe sigue siendo válido (extras sin padre = como
-- hasta ahora), y ninguna app está obligada a mandarlo.
-- ============================================================================

alter table orden_items
  add column if not exists padre_item_id uuid references orden_items(id) on delete cascade;

comment on column orden_items.padre_item_id is
  'Si esta línea es un extra (proteína, galletas, adicionales), apunta a la línea del producto al que acompaña. NULL = producto por derecho propio.';

-- Se consulta siempre "dame los hijos de X", nunca al revés.
create index if not exists orden_items_padre_idx
  on orden_items (padre_item_id) where padre_item_id is not null;

-- ---------------------------------------------------------------------------
-- fn_crear_orden — recibe el parentesco sin exponer ids de la base
-- ---------------------------------------------------------------------------
-- El cliente no conoce el `id` de una línea que todavía no existe, así que
-- manda una etiqueta suya (`linea`) y a quién acompaña (`padre_linea`). El
-- servidor genera los uuid reales y resuelve las referencias entre ellos.
--
-- Los ids se generan ANTES de insertar, a propósito: correlacionar el
-- RETURNING de un INSERT con las filas de entrada depende de un orden que
-- Postgres no garantiza, y aquí una correlación equivocada significa pegarle
-- las galletas al shake de otra persona.
--
-- Las dos sobrecargas se reescriben con el mismo cuerpo; se diferencian solo
-- en `es_demo`, como ya estaban.
-- ---------------------------------------------------------------------------

create or replace function fn_crear_orden(
  p_sucursal_id uuid,
  p_almacen_id  uuid,
  p_canal       canal_orden,
  p_items       jsonb,
  p_corte_id    uuid    default null,
  p_empleado_id uuid    default null,
  p_cliente_id  uuid    default null,
  p_descuento   numeric default 0,
  p_es_demo     boolean default false
) returns ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden ordenes;
  v_subtotal numeric := 0;
  v_total numeric;
  v_item jsonb;
  v_precio numeric;
  v_cantidad integer;
  v_producto_id uuid;
  v_expira_minutos integer;
  v_expira_en timestamptz;
  v_repetida text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden no tiene productos';
  end if;

  -- Dos líneas con la misma etiqueta harían que un extra se pegara a las dos
  -- (producto cartesiano en el join de abajo) y la orden saldría con líneas
  -- de más. Se corta aquí, no después de cobrar.
  select linea into v_repetida
  from (
    select nullif(item->>'linea','') as linea
    from jsonb_array_elements(p_items) item
  ) t
  where linea is not null
  group by linea having count(*) > 1
  limit 1;
  if v_repetida is not null then
    raise exception 'La orden trae dos líneas con la misma etiqueta "%".', v_repetida;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := nullif(v_item->>'producto_id','')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::integer, 0);
    if v_producto_id is null or v_cantidad <= 0 then
      raise exception 'Línea de orden inválida: %', v_item;
    end if;
    if nullif(v_item->>'linea','') is not null
       and nullif(v_item->>'linea','') = nullif(v_item->>'padre_linea','') then
      raise exception 'Una línea no puede acompañarse a sí misma: %', v_item->>'linea';
    end if;
    select precio into v_precio from productos where id = v_producto_id and activo = true;
    if not found then
      raise exception 'Producto % no existe o no está activo', v_producto_id;
    end if;
    v_subtotal := v_subtotal + v_precio * v_cantidad;
  end loop;

  v_total := greatest(0, v_subtotal - greatest(0, coalesce(p_descuento, 0)));

  if p_canal = 'kiosko' then
    select expira_minutos into v_expira_minutos from configuracion_kiosko where sucursal_id = p_sucursal_id;
    v_expira_en := now() + make_interval(mins => coalesce(v_expira_minutos, 15));
  end if;

  insert into ordenes (
    sucursal_id, almacen_id, canal, corte_id, empleado_id, cliente_id, descuento, total,
    estado_pago_orden, expira_en, es_demo
  ) values (
    p_sucursal_id, p_almacen_id, p_canal, p_corte_id, p_empleado_id, p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total,
    'pending_payment', v_expira_en, coalesce(p_es_demo, false)
  ) returning * into v_orden;

  with entrada as (
    select
      gen_random_uuid()                  as nuevo_id,
      nullif(item->>'linea', '')         as linea,
      nullif(item->>'padre_linea', '')   as padre_linea,
      item
    from jsonb_array_elements(p_items) item
  )
  insert into orden_items (
    id, orden_id, producto_id, cantidad, precio_unitario, personalizacion, padre_item_id
  )
  select
    e.nuevo_id,
    v_orden.id,
    (e.item->>'producto_id')::uuid,
    (e.item->>'cantidad')::integer,
    (select precio from productos where id = (e.item->>'producto_id')::uuid),
    nullif(e.item->>'personalizacion', ''),
    padre.nuevo_id   -- NULL si no mandó padre, o si apunta a una línea que no existe
  from entrada e
  left join entrada padre
    on e.padre_linea is not null and padre.linea = e.padre_linea;

  return v_orden;
end;
$$;

-- La sobrecarga sin `p_es_demo` delega, para que no haya dos cuerpos que
-- mantener en paralelo (que es como se desincronizan).
create or replace function fn_crear_orden(
  p_sucursal_id uuid,
  p_almacen_id  uuid,
  p_canal       canal_orden,
  p_items       jsonb,
  p_corte_id    uuid    default null,
  p_empleado_id uuid    default null,
  p_cliente_id  uuid    default null,
  p_descuento   numeric default 0
) returns ordenes
language plpgsql
security definer
set search_path = public
as $$
begin
  return fn_crear_orden(
    p_sucursal_id, p_almacen_id, p_canal, p_items,
    p_corte_id, p_empleado_id, p_cliente_id, p_descuento, false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- El payload de la comanda: los extras van DENTRO de su producto
-- ---------------------------------------------------------------------------
-- Un producto entra en la lista salvo que su padre esté en el mismo pedido —
-- en ese caso se dobla como `extras` de ese padre. Un extra cuyo padre se fue
-- a otra estación sigue saliendo por su cuenta: es preferible una etiqueta de
-- más a que la información desaparezca.
--
-- La cantidad se conserva en el texto ("2x Galletas") en vez de repetir el
-- extra: la etiqueta tiene 21 caracteres por línea y perder el número sería
-- peor que gastar tres de ellos.
-- ---------------------------------------------------------------------------

create or replace function fn_items_comanda(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'cantidad',        ci.cantidad,
      'nombre',          pr.nombre,
      'personalizacion', ci.personalizacion,
      'extras', coalesce((
        select jsonb_agg(
          case when h.cantidad > 1 then h.cantidad || 'x ' || ph.nombre else ph.nombre end
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
$$;

revoke execute on function fn_items_comanda(uuid) from public, anon, authenticated;

create or replace function fn_encolar_comanda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_printer_id uuid;
begin
  select p.id into v_printer_id from impresoras p where p.cocina_id = NEW.cocina_id and p.activa limit 1;

  select jsonb_build_object(
    'folio', o.folio,
    'canal', o.canal,
    'estacion', c.nombre,
    'creado_en', NEW.created_at,
    'cajero', e.nombre,
    'cliente', cl.nombre,
    'items', fn_items_comanda(NEW.id)
  )
  into v_payload
  from ordenes o
  left join cocinas c on c.id = NEW.cocina_id
  left join empleados e on e.id = o.empleado_id
  left join clientes cl on cl.id = o.cliente_id
  where o.id = NEW.orden_id;

  insert into trabajos_impresion (orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload, idempotency_key)
  values (NEW.orden_id, NEW.id, NEW.cocina_id, v_printer_id, 'comanda', v_payload, NEW.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return NEW;
end;
$$;

create or replace function fn_encolar_comanda_para_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_printer_id uuid;
  v_pedido pedidos_cocina;
begin
  select * into v_pedido from pedidos_cocina where id = p_pedido_id;
  if not found then
    return;
  end if;

  select p.id into v_printer_id from impresoras p where p.cocina_id = v_pedido.cocina_id and p.activa limit 1;

  select jsonb_build_object(
    'folio', o.folio,
    'canal', o.canal,
    'estacion', c.nombre,
    'creado_en', v_pedido.created_at,
    'cajero', e.nombre,
    'cliente', cl.nombre,
    'items', fn_items_comanda(v_pedido.id)
  )
  into v_payload
  from ordenes o
  left join cocinas c on c.id = v_pedido.cocina_id
  left join empleados e on e.id = o.empleado_id
  left join clientes cl on cl.id = o.cliente_id
  where o.id = v_pedido.orden_id;

  insert into trabajos_impresion (orden_id, pedido_id, estacion_id, printer_id, tipo_documento, payload, idempotency_key)
  values (v_pedido.orden_id, v_pedido.id, v_pedido.cocina_id, v_printer_id, 'comanda', v_payload, v_pedido.id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
end;
$$;
