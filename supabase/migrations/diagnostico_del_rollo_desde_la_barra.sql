-- Diagnostico del rollo: la MISMA etiqueta mandada de tres formas.
--
-- Sintoma real (31/08): en CADA comanda salen tres etiquetas en blanco y
-- despues la buena, ligeramente descuadrada. Eso NO es la calibracion —esa
-- gasta tres a proposito, una sola vez— sino algo que pasa en cada
-- impresion.
--
-- La sospecha es la cabecera que declara el papel (SIZE, GAP...), que viaja
-- delante de CADA etiqueta desde la primera version del agente: varias
-- etiquetadoras TSPL reacomodan el rollo cuando se les redeclara el papel.
--
-- No se puede quitar a ciegas con la tienda vendiendo: si resulta que esa
-- cabecera es lo que hace que salga derecha, quitarla deja a barra
-- imprimiendo basura. Asi que se mandan las tres seguidas y rotuladas, y el
-- papel contesta cual sirve.
create or replace function fn_imprimir_diagnostico_staff(p_impresora_id uuid)
returns trabajos_impresion
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_impresora impresoras;
  v_trabajo trabajos_impresion;
  v_minima int[] := array[1,3,0];
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede mandar un diagnostico de impresion';
  end if;

  select * into v_impresora from impresoras where id = p_impresora_id and activa;
  if not found then
    raise exception 'Esa impresora no existe o esta apagada';
  end if;

  -- Mismo candado que calibrar: la version viaja en cada latido. Sin el, el
  -- boton se queda esperando en la cola y parece que no hizo nada.
  if coalesce(string_to_array(regexp_replace(coalesce(v_impresora.agente_version, '0'),
                                             '[^0-9.]', '', 'g'), '.')::int[],
              array[0]) < v_minima then
    raise exception
      'La PC de la tienda trae el agente % y todavia no sabe hacer este diagnostico. Se actualiza sola manana al abrir; para hacerlo hoy, Admin -> Descargas -> "Solo el agente de impresion".',
      coalesce(v_impresora.agente_version, 'viejo');
  end if;

  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key)
  values (v_impresora.id, 'comanda', jsonb_build_object(
    'diagnostico', true, 'impresora', v_impresora.nombre, 'hora', now()
  ), gen_random_uuid())
  returning * into v_trabajo;

  return v_trabajo;
end;
$$;

revoke all on function fn_imprimir_diagnostico_staff(uuid) from public, anon;
grant execute on function fn_imprimir_diagnostico_staff(uuid) to authenticated;
