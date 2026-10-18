-- El corte impreso nunca frena el cierre del corte (18/10/26).
--
-- `trg_encolar_corte_caja` (de otra sesión) encola el comprobante para la
-- impresora de caja al cerrar el corte, si `imprimir_corte_auto` está
-- prendido. Corre DENTRO del UPDATE que cierra el corte y no tenía bloque de
-- excepción: cualquier falla al armar el comprobante habría dejado a la
-- cajera sin poder cerrar caja. Misma regla que los avisos a gerencia: lo
-- que vive en la cadena del corte se traga sus errores.

set lock_timeout = '3s';

create or replace function public.trg_encolar_corte_caja()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.cerrado_en is not null and old.cerrado_en is null
     and coalesce((select imprimir_corte_auto from configuracion_ticket where id = 'default'), false)
  then
    begin
      perform fn_encolar_corte_caja(new.id);
    exception when others then
      raise warning 'No se pudo encolar el corte impreso %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;
