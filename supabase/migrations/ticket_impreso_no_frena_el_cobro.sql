-- El ticket impreso nunca frena el cobro (18/10/26).
--
-- `trg_encolar_ticket_venta` corre en el UPDATE de `ordenes.pagado`, o sea
-- dentro del cobro, y no tenía bloque de excepción. Hoy está apagado
-- (`imprimir_ticket_auto = false`), pero el día que se prenda desde Admin →
-- Ticket de caja, cualquier falla al armar el ticket haría fallar el cobro
-- (CLAUDE.md §4: el 27/08 un trigger sobre `ordenes` dejó a la tienda 50
-- minutos sin cobrar). Lo que vive en la cadena del cobro se traga sus
-- errores.

set lock_timeout = '3s';

create or replace function public.trg_encolar_ticket_venta()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.pagado and not coalesce(old.pagado, false)
     and coalesce((select imprimir_ticket_auto from configuracion_ticket where id = 'default'), false)
  then
    begin
      perform fn_encolar_ticket_venta(new.id);
    exception when others then
      raise warning 'No se pudo encolar el ticket de la orden %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;
