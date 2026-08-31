-- Cobro mixto contra la terminal: "$25 en efectivo y $100 en la Clip".
--
-- LA TARJETA VA PRIMERO, y es toda la idea. Si el efectivo se cobrara
-- antes y la tarjeta fallara, quedaria dinero en el cajon y una venta a
-- medias: alguien tendria que devolver, anotar, y explicarselo al de
-- atras. Cobrando primero la terminal, mientras Clip no autorice NO hay
-- nada comprometido — cancelar es gratis y no deja rastro.
--
-- Como funciona:
--   1. `fn_cobrar_mixto_iniciar` valida que las partes sumen el total
--      (mismo candado que el cobro dividido) y deja el efectivo apuntado
--      como pago PENDIENTE, sin aprobar. Un pago pendiente no cuenta en el
--      corte, no marca la orden pagada y no manda nada a cocina.
--   2. El kiosko manda la parte de tarjeta a la terminal.
--   3. Cuando Clip autoriza, el trigger de abajo aprueba el efectivo en la
--      MISMA transaccion. Los dos, o ninguno.
--   4. Si no autoriza: `fn_cobrar_mixto_cancelar` borra lo pendiente. Un
--      boton, y como si no hubiera pasado.
--
-- El efectivo se guarda como parte 2 y no como parte 1 a proposito: Clip
-- inserta su pago con la parte por omision (1), y asi no hay que tocar esa
-- parte de la Edge Function. Menos piezas movidas, menos que se rompa.

create or replace function fn_cobrar_mixto_iniciar(
  p_orden_id uuid,
  p_efectivo numeric,
  p_tarjeta numeric
) returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_orden ordenes;
  v_tolerancia constant numeric := 0.01;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede cobrar';
  end if;

  select * into v_orden from ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden % no existe', p_orden_id;
  end if;

  if exists (select 1 from pagos where orden_id = p_orden_id and estado = 'aprobado') then
    raise exception 'Esa orden ya esta cobrada';
  end if;

  if coalesce(p_efectivo, 0) < 0.01 or coalesce(p_tarjeta, 0) < 0.01 then
    raise exception 'Las dos partes tienen que ser mayores a cero';
  end if;
  if abs((p_efectivo + p_tarjeta) - v_orden.total) > v_tolerancia then
    raise exception 'Las partes suman % y el total es %', p_efectivo + p_tarjeta, v_orden.total;
  end if;

  -- Se limpia cualquier intento anterior que quedara colgado: reintentar
  -- despues de una terminal que no respondio tiene que ser posible sin que
  -- se acumulen efectivos fantasma.
  delete from pagos
   where orden_id = p_orden_id and estado = 'pendiente' and proveedor = 'mixto_efectivo';

  insert into pagos (
    orden_id, metodo, monto, estado, estado_transaccion, proveedor, parte
  ) values (
    p_orden_id, 'efectivo', p_efectivo, 'pendiente', 'created', 'mixto_efectivo', 2
  );

  return p_tarjeta;
end $$;

-- Cuando la tarjeta pasa, el efectivo pasa con ella. En la misma
-- transaccion: los dos o ninguno.
create or replace function fn_mixto_aprobar_efectivo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_suma numeric; v_total numeric;
begin
  if NEW.estado <> 'aprobado' then return NEW; end if;
  if NEW.proveedor = 'mixto_efectivo' then return NEW; end if;
  if not exists (
    select 1 from pagos
     where orden_id = NEW.orden_id and estado = 'pendiente' and proveedor = 'mixto_efectivo'
  ) then
    return NEW;
  end if;

  update pagos
     set estado = 'aprobado', estado_transaccion = 'authorized'
   where orden_id = NEW.orden_id and estado = 'pendiente' and proveedor = 'mixto_efectivo';

  select coalesce(sum(monto), 0) into v_suma
    from pagos where orden_id = NEW.orden_id and estado = 'aprobado';
  select total into v_total from ordenes where id = NEW.orden_id;

  -- Si por lo que sea no cuadra, se revienta: una orden cobrada de menos
  -- descuadra el corte y nadie se entera hasta la noche.
  if abs(v_suma - v_total) > 0.01 then
    raise exception 'El cobro mixto de la orden % suma % y el total es %',
      NEW.orden_id, v_suma, v_total;
  end if;

  update ordenes set metodo_pago = 'mixto', updated_at = now() where id = NEW.orden_id;
  return NEW;
end $$;

drop trigger if exists trg_mixto_aprobar_efectivo on pagos;
create trigger trg_mixto_aprobar_efectivo
  after insert or update of estado on pagos
  for each row execute function fn_mixto_aprobar_efectivo();

-- Cancelar: mientras nada este aprobado, no paso nada.
create or replace function fn_cobrar_mixto_cancelar(p_orden_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede cancelar un cobro';
  end if;
  if exists (select 1 from pagos where orden_id = p_orden_id and estado = 'aprobado') then
    raise exception 'Esa orden ya tiene un cobro aprobado: no se cancela desde aqui';
  end if;
  delete from pagos
   where orden_id = p_orden_id and estado = 'pendiente' and proveedor = 'mixto_efectivo';
end $$;

grant execute on function fn_cobrar_mixto_iniciar(uuid, numeric, numeric) to authenticated;
grant execute on function fn_cobrar_mixto_cancelar(uuid) to authenticated;
