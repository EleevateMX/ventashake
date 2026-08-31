-- Cobrar una orden en dos (o hasta cuatro) partes: "$100 en efectivo y el
-- resto con tarjeta". Peticion de la sucursal del 29/08/26.
--
-- El bloqueo real no era la UI: era `uq_pagos_un_aprobado_por_orden`, un
-- indice unico sobre (orden_id) where estado='aprobado'. Es el candado que
-- hace imposible cobrar dos veces la misma orden, y no se puede simplemente
-- quitar: sin el, un doble tap o un reintento de red cobra dos veces.
--
-- Se cambia por uno que conserva la garantia: (orden_id, parte). Un segundo
-- cobro entero volveria a intentar parte=1 y choca igual que antes; lo unico
-- que ahora cabe es una parte 2, 3 o 4 que solo fn_cobrar_orden_dividido
-- sabe insertar, y solo despues de verificar que las partes suman el total.
--
-- Nada mas hay que tocar para que las cuentas cuadren: `vw_corte_resumen` y
-- `fn_panel_en_vivo` ya suman `pagos` por metodo, no `ordenes.metodo_pago`.
-- Un cobro dividido cae solo en su renglon de efectivo y en su renglon de
-- tarjeta, y el corte cierra igual que siempre.

-- 1. En que parte del cobro va este pago. `default 1` deja a todo lo
--    existente —y a fn_cobrar_orden, que no se toca— exactamente igual.
alter table pagos
  add column if not exists parte smallint not null default 1;

alter table pagos drop constraint if exists pagos_parte_valida;
alter table pagos add constraint pagos_parte_valida check (parte between 1 and 4);

comment on column pagos.parte is
  'Cual de las partes del cobro es. 1 = cobro entero (lo normal). Ver fn_cobrar_orden_dividido.';

-- 2. El candado nuevo ANTES de quitar el viejo. Mientras conviven manda el
--    estricto, asi que no hay un instante en que la orden quede sin proteger.
create unique index if not exists uq_pagos_un_aprobado_por_orden_y_parte
  on pagos (orden_id, parte) where estado = 'aprobado';

drop index if exists uq_pagos_un_aprobado_por_orden;

-- 3. El cobro en partes.
create or replace function fn_cobrar_orden_dividido(
  p_orden_id uuid,
  p_partes jsonb,
  p_autorizado_por uuid default null,
  p_idempotency_key uuid default null
) returns setof pagos
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_orden ordenes;
  v_parte jsonb;
  v_n int;
  v_suma numeric := 0;
  v_monto numeric;
  v_metodo metodo_pago;
  v_i int := 0;
  v_primer_pago uuid;
  v_id uuid;
  v_clave uuid;
  v_tolerancia constant numeric := 0.01;
begin
  select * into v_orden from ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden % no existe', p_orden_id;
  end if;

  v_n := jsonb_array_length(coalesce(p_partes, '[]'::jsonb));
  if v_n < 2 or v_n > 4 then
    raise exception 'Un pago dividido lleva entre 2 y 4 partes (llegaron %)', v_n;
  end if;

  -- Reintento del mismo cobro (timeout de red, doble tap): se devuelve lo
  -- que ya se creo en vez de cobrar otra vez. Las claves de cada parte se
  -- derivan de la del intento, asi que basta con buscar la primera.
  if p_idempotency_key is not null then
    v_clave := md5(p_idempotency_key::text || ':1')::uuid;
    if exists (select 1 from pagos where orden_id = p_orden_id and idempotency_key = v_clave) then
      return query select * from pagos where orden_id = p_orden_id and estado = 'aprobado' order by parte;
      return;
    end if;
  end if;

  -- Ya cobrada: se devuelve lo cobrado. Igual que fn_cobrar_orden, para que
  -- las dos puertas se comporten igual ante un reintento.
  if exists (select 1 from pagos where orden_id = p_orden_id and estado = 'aprobado') then
    return query select * from pagos where orden_id = p_orden_id and estado = 'aprobado' order by parte;
    return;
  end if;

  if v_orden.estado_pago_orden not in
     ('pending_payment', 'awaiting_counter_payment', 'payment_processing', 'payment_unknown') then
    raise exception 'La orden % no esta en un estado que permita cobro (estado=%)',
      p_orden_id, v_orden.estado_pago_orden;
  end if;

  -- Las partes suman el total, y ninguna es de cero. Se valida TODO antes de
  -- insertar nada: una orden a medio cobrar es peor que una sin cobrar.
  for v_parte in select * from jsonb_array_elements(p_partes) loop
    v_monto := (v_parte->>'monto')::numeric;
    if v_monto is null or v_monto < 0.01 then
      raise exception 'Cada parte tiene que traer un monto mayor a cero (llego %)', v_parte->>'monto';
    end if;
    begin
      v_metodo := (v_parte->>'metodo')::metodo_pago;
    exception when others then
      raise exception 'Metodo de pago desconocido: %', v_parte->>'metodo';
    end;
    if v_metodo = 'mixto' then
      raise exception '"mixto" no es una forma de pagar: es lo que queda escrito cuando se paga en partes';
    end if;
    v_suma := v_suma + v_monto;
  end loop;

  if abs(v_suma - v_orden.total) > v_tolerancia then
    raise exception 'Las partes suman % y el total de la orden es %', v_suma, v_orden.total;
  end if;

  for v_parte in select * from jsonb_array_elements(p_partes) loop
    v_i := v_i + 1;
    v_metodo := (v_parte->>'metodo')::metodo_pago;
    insert into pagos (
      orden_id, metodo, monto, estado, estado_transaccion, proveedor,
      referencia, autorizado_por, idempotency_key, parte
    ) values (
      p_orden_id, v_metodo, (v_parte->>'monto')::numeric, 'aprobado', 'authorized',
      case when v_metodo = 'clip' then 'clip_manual' else 'manual' end,
      nullif(trim(coalesce(v_parte->>'referencia', '')), ''),
      p_autorizado_por,
      case when p_idempotency_key is null then null
           else md5(p_idempotency_key::text || ':' || v_i::text)::uuid end,
      v_i
    ) returning id into v_id;
    if v_i = 1 then
      v_primer_pago := v_id;
    end if;
  end loop;

  -- Una sola confirmacion: es la que descuenta inventario y manda a cocina.
  perform fn_confirmar_venta(p_orden_id, v_primer_pago);

  -- fn_confirmar_venta deja el metodo del primer pago, que mentiria en el
  -- recibo y en el historial. El cobro entero fue mixto.
  update ordenes set metodo_pago = 'mixto', updated_at = now() where id = p_orden_id;

  return query select * from pagos where orden_id = p_orden_id and estado = 'aprobado' order by parte;
end;
$$;

grant execute on function fn_cobrar_orden_dividido(uuid, jsonb, uuid, uuid) to authenticated;
