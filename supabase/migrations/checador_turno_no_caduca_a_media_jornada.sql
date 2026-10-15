-- El checador decía «No tienes turno abierto» al querer checar salida (15/10/26).
--
-- `asistencia_config.turno_max_horas` estaba en 5 desde el 08/10. La
-- etiqueta de Admin decía «Turno abierto caduca a las (horas)», que se lee
-- como hora del día. Con 5, cinco horas después de la última checada el
-- turno se daba por olvidado: la pantalla solo ofrecía «Entrada» y la
-- tocaban para salir. Del 09/10 al 15/10 quedaron 6 «entradas» que eran
-- salidas (se corrigen aparte, con su motivo; nada se edita).
--
-- Se regresa a 16 (el de fábrica) y el piso sube de 4 a 12: ninguna
-- jornada de la tienda cabe en menos, y un turno que caduca a media
-- jornada rompe la nómina y el descuento de personal (que también lo lee).
-- Parche anclado: la función no se reescribe.

update public.asistencia_config set turno_max_horas = 16, actualizado_en = now()
 where id = 'default' and turno_max_horas < 12;

do $$
declare
  v_def text;
  v_ancla text := 'p_turno_max_horas not between 4 and 24 then
    raise exception ''El turno maximo va entre 4 y 24 horas.'';';
  v_nuevo text := 'p_turno_max_horas not between 12 and 24 then
    raise exception ''Un turno sin salida se olvida entre 12 y 24 horas después de la entrada. Menos que eso cierra turnos a media jornada.'';';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.proname = 'fn_asistencia_config_guardar';
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'El ancla de fn_asistencia_config_guardar no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla, v_nuevo);
end $$;
