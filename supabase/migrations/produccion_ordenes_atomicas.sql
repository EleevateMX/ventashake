-- =====================================================================
-- Producción — órdenes y cobros atómicos e idempotentes.
-- Corrige hallazgos C1, C2, A1, A2 de docs/auditoria-produccion.md.
--
-- Qué cambia:
--   1. fn_crear_orden(): inserta orden + items en UNA sola transacción de
--      Postgres (ya no son 2 llamadas HTTP sueltas desde el cliente) y
--      RECALCULA precio_unitario/subtotal/total desde productos.precio en
--      el servidor — el cliente ya no puede mandar un total ni un precio
--      manipulado.
--   2. fn_cobrar_orden(): aprueba un pago de forma idempotente. Bloquea la
--      fila de la orden (FOR UPDATE) para serializar cobros concurrentes,
--      valida que el monto coincida con el total real de la orden, y
--      nunca crea un segundo pago 'aprobado' para la misma orden (ni con
--      reintento por red, ni con doble clic, ni con clave de idempotencia
--      repetida) — devuelve el pago ya existente en vez de duplicar.
--   3. Índices únicos como respaldo (defensa en profundidad) por si la
--      lógica de arriba fallara: un solo pago 'aprobado' por orden, y una
--      idempotency_key no se reutiliza.
--
-- Compatibilidad: las firmas de crearOrden()/cobrarOrden() en
-- packages/supabase NO cambian; solo su implementación interna pasa a
-- llamar estas RPCs. Las 8 apps no requieren cambios.
--
-- Aditivo, reversible: agrega funciones/columnas/índices, no borra nada.
-- =====================================================================

-- ------------------------- columnas nuevas ----------------------------
alter table pagos add column if not exists idempotency_key uuid;

create unique index if not exists uq_pagos_idempotency_key
  on pagos (idempotency_key) where idempotency_key is not null;

-- Respaldo: un solo pago aprobado por orden, a nivel de constraint (no solo
-- de lógica en la función). Si algo más intentara aprobar un segundo pago
-- para la misma orden, la base lo rechaza aunque la función tuviera un bug.
create unique index if not exists uq_pagos_un_aprobado_por_orden
  on pagos (orden_id) where estado = 'aprobado';

-- ------------------------- fn_crear_orden ------------------------------
-- p_items: jsonb [{ "producto_id": uuid, "cantidad": int, "personalizacion": text|null }]
-- El precio de cada línea y el subtotal se calculan aquí desde productos.precio;
-- el cliente ya no puede mandar precio_unitario.
create or replace function public.fn_crear_orden(
  p_sucursal_id uuid,
  p_almacen_id uuid,
  p_canal canal_orden,
  p_items jsonb,
  p_corte_id uuid default null,
  p_empleado_id uuid default null,
  p_cliente_id uuid default null,
  p_descuento numeric default 0
) returns ordenes
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_orden ordenes;
  v_subtotal numeric := 0;
  v_total numeric;
  v_item jsonb;
  v_precio numeric;
  v_cantidad integer;
  v_producto_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden no tiene productos';
  end if;

  -- Primera pasada: valida TODO y calcula el subtotal real antes de
  -- insertar nada (todo-o-nada; si algo no cuadra, no se crea la orden).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := nullif(v_item->>'producto_id','')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::integer, 0);
    if v_producto_id is null or v_cantidad <= 0 then
      raise exception 'Línea de orden inválida: %', v_item;
    end if;
    select precio into v_precio from productos where id = v_producto_id and activo = true;
    if not found then
      raise exception 'Producto % no existe o no está activo', v_producto_id;
    end if;
    v_subtotal := v_subtotal + v_precio * v_cantidad;
  end loop;

  v_total := greatest(0, v_subtotal - greatest(0, coalesce(p_descuento, 0)));

  insert into ordenes (
    sucursal_id, almacen_id, canal, corte_id, empleado_id, cliente_id, descuento, total
  ) values (
    p_sucursal_id, p_almacen_id, p_canal, p_corte_id, p_empleado_id, p_cliente_id,
    greatest(0, coalesce(p_descuento, 0)), v_total
  ) returning * into v_orden;

  insert into orden_items (orden_id, producto_id, cantidad, precio_unitario, personalizacion)
  select
    v_orden.id,
    (item->>'producto_id')::uuid,
    (item->>'cantidad')::integer,
    (select precio from productos where id = (item->>'producto_id')::uuid),
    nullif(item->>'personalizacion', '')
  from jsonb_array_elements(p_items) item;

  return v_orden;
end;
$function$;

-- ------------------------- fn_cobrar_orden ------------------------------
create or replace function public.fn_cobrar_orden(
  p_orden_id uuid,
  p_metodo metodo_pago,
  p_monto numeric,
  p_referencia text default null,
  p_autorizado_por uuid default null,
  p_idempotency_key uuid default null
) returns pagos
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_orden ordenes;
  v_pago pagos;
  v_tolerancia constant numeric := 0.01;
begin
  -- Bloquea la fila de la orden: si dos cobros llegan al mismo tiempo para
  -- la misma orden, el segundo espera a que el primero termine y luego ve
  -- el resultado ya resuelto (no corre en paralelo con datos obsoletos).
  select * into v_orden from ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden % no existe', p_orden_id;
  end if;

  -- Reintento con la misma clave de idempotencia: devuelve el pago ya
  -- creado en el intento anterior, no crea uno nuevo.
  if p_idempotency_key is not null then
    select * into v_pago from pagos
      where orden_id = p_orden_id and idempotency_key = p_idempotency_key;
    if found then
      return v_pago;
    end if;
  end if;

  -- La orden ya tiene un pago aprobado (doble clic, reintento sin
  -- idempotency_key, o dos pestañas): se devuelve el existente, nunca se
  -- duplica.
  select * into v_pago from pagos where orden_id = p_orden_id and estado = 'aprobado' limit 1;
  if found then
    return v_pago;
  end if;

  -- El monto que llega debe coincidir con el total real de la orden
  -- (calculado por fn_crear_orden desde el catálogo). Cierra el hueco de
  -- "aprobar con monto manipulado" (hallazgo C1).
  if abs(p_monto - v_orden.total) > v_tolerancia then
    raise exception 'El monto % no coincide con el total de la orden (%)', p_monto, v_orden.total;
  end if;

  begin
    insert into pagos (orden_id, metodo, monto, estado, referencia, autorizado_por, idempotency_key)
    values (p_orden_id, p_metodo, p_monto, 'aprobado', p_referencia, p_autorizado_por, p_idempotency_key)
    returning * into v_pago;
  exception when unique_violation then
    -- Carrera resuelta por el índice único de respaldo: alguien más ganó
    -- la aprobación en el mismo instante; se devuelve ese pago.
    select * into v_pago from pagos where orden_id = p_orden_id and estado = 'aprobado' limit 1;
  end;

  return v_pago;
end;
$function$;

-- ------------------------- permisos -------------------------------------
-- Postura del proyecto (login PIN propio, sin Supabase Auth todavía): las
-- RPCs se otorgan a anon/authenticated igual que el resto de RPCs
-- operativas (fn_login_cajero, fn_crear_empleado, etc.), pero AHORA el
-- monto/total se valida server-side dentro de la función, no se confía en
-- lo que mande el cliente.
grant execute on function public.fn_crear_orden(uuid, uuid, canal_orden, jsonb, uuid, uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.fn_cobrar_orden(uuid, metodo_pago, numeric, text, uuid, uuid) to anon, authenticated;
