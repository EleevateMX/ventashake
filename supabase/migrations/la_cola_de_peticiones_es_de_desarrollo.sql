-- Quien pide y quien resuelve no son la misma persona.
--
-- Los duenos entran a Admin a PEDIR y a ver en que quedo lo suyo. Decidir
-- que entra en la proxima sesion de trabajo, con que prioridad y cuando se
-- da por resuelto es de quien lo va a hacer — si no, la cola deja de ser
-- una agenda y pasa a ser una lista de deseos donde todo es urgente.
--
-- `fn_anotar_reporte` ya pedia soporte. Estas dos pedian `fn_es_jefe()`, o
-- sea que gerencia podia cerrar y priorizar. Ahora no.
create or replace function fn_priorizar_reporte(
  p_id uuid, p_prioridad integer default null, p_para_sesion boolean default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not fn_es_soporte() then
    raise exception 'Solo desarrollo prioriza la cola';
  end if;
  update reportes_soporte
     set prioridad = coalesce(p_prioridad, prioridad),
         para_sesion = coalesce(p_para_sesion, para_sesion),
         estado = case when estado = 'abierto' then 'atendido' else estado end
   where id = p_id;
end $$;

create or replace function fn_cerrar_reporte(p_id uuid, p_respuesta text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_emp uuid;
begin
  if not fn_es_soporte() then
    raise exception 'Solo desarrollo cierra un reporte';
  end if;
  select e.id into v_emp from empleados e where e.auth_user_id = auth.uid() limit 1;
  update reportes_soporte
     set estado = 'cerrado', respuesta = nullif(trim(p_respuesta), ''),
         atendido_por = v_emp, atendido_en = now()
   where id = p_id;
end $$;
