/*
 * Calibrar la etiquetadora desde la caja, al cambiar el rollo.
 *
 * Hasta hoy la unica forma de tocar una impresora sin ir a la PC era
 * `fn_imprimir_prueba`, que pide el TOKEN del agente -- un secreto que solo
 * vive en printers.config.json. Desde el POS eso no sirve: quien cambia el
 * rollo esta en la barra y lo que tiene a mano es su sesion de empleado.
 *
 * Por eso esta va por id de impresora y pide sesion de personal (cualquiera,
 * no hace falta ser jefe: cambiar el rollo es trabajo de barra). El token
 * sigue sin salir a ningun lado.
 *
 * El trabajo entra a la misma cola de siempre, asi que lo reclama el agente
 * de esa impresora con su token y se registra igual que una comanda: si
 * falla, se ve en Admin como cualquier otro trabajo.
 */
create or replace function fn_imprimir_calibrar(p_impresora_id uuid)
returns trabajos_impresion
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_impresora impresoras;
  v_trabajo trabajos_impresion;
  v_minima int[] := array[1,2,0];
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede calibrar una impresora';
  end if;

  select * into v_impresora from impresoras where id = p_impresora_id and activa;
  if not found then
    raise exception 'Esa impresora no existe o esta apagada';
  end if;

  -- Un agente 1.1.0 no sabe que existe un trabajo de calibracion: lo tomaria
  -- como una comanda sin productos, no produciria ninguna etiqueta y fallaria
  -- cinco veces antes de rendirse. Desde la barra eso se ve como "le pique y
  -- no paso nada", que es la peor respuesta posible. Mejor decirlo antes.
  -- La version viaja en cada latido (fn_imprimir_latido).
  if coalesce(string_to_array(regexp_replace(coalesce(v_impresora.agente_version, '0'),
                                             '[^0-9.]', '', 'g'), '.')::int[],
              array[0]) < v_minima then
    raise exception
      'La PC de la tienda todavia trae el agente % y no sabe calibrar. Se actualiza sola manana al abrir; despues de eso este boton funciona.',
      coalesce(v_impresora.agente_version, 'viejo');
  end if;

  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_impresora.id, 'comanda', jsonb_build_object(
    'calibrar', true, 'impresora', v_impresora.nombre, 'hora', now()
  ), gen_random_uuid())
  returning * into v_trabajo;

  return v_trabajo;
end;
$function$;

revoke all on function fn_imprimir_calibrar(uuid) from public, anon;
grant execute on function fn_imprimir_calibrar(uuid) to authenticated;

-- De paso: `fn_admin_impresoras` no tenia ningun candado y estaba abierta a
-- `anon`. Devuelve la IP y el puerto de cada etiquetadora de la tienda, o
-- sea el mapa de la red interna, legible con la llave publica. La usan
-- Admin y ahora el POS, los dos con sesion de personal.
revoke all on function fn_admin_impresoras() from public, anon;
grant execute on function fn_admin_impresoras() to authenticated;
