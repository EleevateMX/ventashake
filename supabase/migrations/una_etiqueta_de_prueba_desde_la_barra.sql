-- Sacar UNA etiqueta de prueba, sin calibrar.
--
-- La duda que esto resuelve no se puede contestar desde la nube: "se
-- desperdician 3 etiquetas y sale impresa 1". Eso es exactamente lo que
-- hace Calibrar (GAPDETECT avanza dos o tres leyendo el sensor, FORMFEED
-- deja el papel en su sitio, y al final sale la de prueba) — pero es
-- tambien el sintoma de un sensor mal medido, donde la impresora escupe
-- blancos buscando un hueco en CADA comanda.
--
-- Con este boton se distingue en cinco segundos: imprime una etiqueta y
-- nada mas. Si sale una sola, lo normal esta bien y las tres se gastaron
-- solo al calibrar. Si tambien escupe blancos, es el sensor y hay que
-- calibrar.
--
-- Ya existia `fn_imprimir_prueba`, pero pide el TOKEN del agente: sirve
-- desde la PC, no desde la barra. Ese token no debe viajar al navegador,
-- asi que esta es su gemela con sesion de personal.

create or replace function fn_imprimir_prueba_staff(p_impresora_id uuid)
returns trabajos_impresion
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_impresora impresoras;
  v_trabajo trabajos_impresion;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede mandar una etiqueta de prueba';
  end if;

  select * into v_impresora from impresoras where id = p_impresora_id and activa;
  if not found then
    raise exception 'Esa impresora no existe o esta apagada';
  end if;

  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_impresora.id, 'comanda', jsonb_build_object(
    'prueba', true, 'impresora', v_impresora.nombre, 'hora', now()
  ), gen_random_uuid())
  returning * into v_trabajo;

  return v_trabajo;
end;
$$;

revoke all on function fn_imprimir_prueba_staff(uuid) from public, anon;
grant execute on function fn_imprimir_prueba_staff(uuid) to authenticated;
