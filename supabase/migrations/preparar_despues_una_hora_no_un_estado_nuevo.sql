-- "Preparar despues": el cliente paga ahora y recoge mas tarde.
--
-- La decision de diseno: **no es un estado nuevo, es una HORA.** Los
-- estados que ya hay -pendiente, en_preparacion, listo, entregado- son
-- exactamente los mismos que pide el flujo; lo unico que falta es "a que
-- hora hay que prepararlo". Meter un quinto estado obligaria a tocar
-- todas las transiciones, los barredores y las dos pantallas de estacion
-- para describir algo que es un dato de una sola columna.
--
-- Y por eso la comanda **sale de inmediato**, sin hacer nada especial:
-- ya nace `pendiente` como cualquier otra. Lo que cambia es como se
-- pinta. Esconderla hasta que se acerque la hora era justo lo que habia
-- que evitar — una comanda que aparece sola a las 8:25 es una comanda que
-- nadie vio venir, y en un cambio de turno se pierde.
--
-- **No se toca `fn_crear_orden`.** Esa funcion es el camino del dinero y
-- ya tuvimos tres versiones viejas conviviendo que no cobraban
-- sobreprecios; cambiarle la firma para colgarle un dato de logistica es
-- barato hoy y caro el dia que falle. La hora se pone despues, con su
-- propia funcion.

alter table ordenes add column if not exists preparar_a timestamptz;

comment on column ordenes.preparar_a is
  'A que hora pidio el cliente recogerlo. Null = se prepara de inmediato, como siempre.';

-- Solo las programadas, que son pocas: el indice no tiene por que cargar
-- con las miles que no lo estan.
create index if not exists ix_ordenes_preparar_a
  on ordenes (preparar_a) where preparar_a is not null;

create or replace function public.fn_orden_programar(
  p_orden_id uuid,
  p_preparar_a timestamptz
) returns timestamptz
language plpgsql security definer set search_path to 'public'
as $function$
declare v_o record;
begin
  select o.id, o.created_at, o.estado into v_o from ordenes o where o.id = p_orden_id;
  if v_o.id is null then
    raise exception 'Esa orden no existe.';
  end if;

  -- Solo se programa lo recien capturado. Sin esto, la funcion -que esta
  -- abierta a `anon`, porque el kiosko en modo cajero corre como `anon`-
  -- dejaria reprogramar cualquier venta de cualquier dia.
  if v_o.created_at < now() - interval '4 hours' then
    raise exception 'Esa venta ya es vieja para programarla.';
  end if;

  if p_preparar_a is not null then
    -- Topes de cordura. Una hora en el pasado no es "preparar despues", y
    -- una a tres dias es un error de dedo que deja una comanda colgada en
    -- la pantalla de barra hasta que alguien la note.
    if p_preparar_a < now() - interval '5 minutes' then
      raise exception 'Esa hora ya paso.';
    end if;
    if p_preparar_a > now() + interval '24 hours' then
      raise exception 'No se puede programar a mas de 24 horas.';
    end if;
  end if;

  update ordenes set preparar_a = p_preparar_a where id = p_orden_id;
  return p_preparar_a;
end;
$function$;

-- Abierta a `anon` como las demas del kiosko: esa pantalla cobra como
-- `anon` (seccion 2.2). Lo que se puede hacer mal desde aqui es retrasar
-- la preparacion de un pedido, no mover dinero.
grant execute on function public.fn_orden_programar(uuid, timestamptz) to anon, authenticated;
