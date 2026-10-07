-- =============================================================================
-- Reiniciar el inventario desde Costeos (07/10/26).
--
-- Perla quiere poner todo en 0 y capturar desde ahi. El reinicio de Admin
-- (fn_inventario_reiniciar) pone en 0 el SISTEMA pero no toca Costeos, y
-- Costeos no manda existencias: manda la DIFERENCIA contra su propio numero
-- anterior (costos_stock_sync.ultimo_valor). Si Costeos decia 10, el sistema
-- quedaba en 0, y al capturar 12 en Costeos el sistema recibia +2, no 12.
--
-- Por eso el reinicio de Costeos hace las tres cosas en UNA transaccion:
--   1. el sistema a 0, con un movimiento 'reinicio' por renglon (la historia
--      no se borra: queda cuanto habia y quien lo autorizo);
--   2. costos_stock_sync.ultimo_valor a 0;
--   3. los numeros de inventario del documento de Costeos a 0, y una marca
--      `reinicioInventario` en el documento.
-- Despues de esto, lo que se capture en Costeos entra completo.
--
-- La marca protege del caso de las dos pestanas: una pestana abierta desde
-- antes del reinicio guardaria sus numeros viejos y el sistema los volveria
-- a sumar enteros. fn_costos_guardar rechaza un documento cuya marca no
-- coincide con la guardada.
--
-- Autoriza el PIN de alguien con el permiso 'reiniciar_inventario' (gerencia
-- siempre lo tiene), igual que el reinicio de Admin. Un PIN equivocado NO se
-- contesta con raise: el raise desharia tambien el intento fallido y el
-- freno de 15 intentos no contaria nada. Se anota y se devuelve el error.
-- =============================================================================

create or replace function public._costos_inv_cero(p_arr jsonb, p_campos text[])
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_arr is null or jsonb_typeof(p_arr) <> 'array' or coalesce(array_length(p_campos, 1), 0) = 0 then p_arr
    else (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(x) = 'object'
                    then x || (select jsonb_object_agg(c, 0) from unnest(p_campos) c)
                    else x end
               order by n), '[]'::jsonb)
        from jsonb_array_elements(p_arr) with ordinality t(x, n))
  end;
$$;
revoke execute on function public._costos_inv_cero(jsonb, text[]) from public, anon, authenticated;

create or replace function public.fn_costos_reiniciar_inventario(
  p_token uuid, p_kiosko boolean, p_bodega boolean, p_motivo text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
set statement_timeout to '30s'
as $$
declare
  v_usuario text; v_k uuid; v_b uuid; v_alm uuid[] := '{}';
  v_aut uuid; v_aut_nombre text; v_n int; v_piezas numeric;
  v_marca text := to_char(now() at time zone 'America/Merida', 'YYYY-MM-DD"T"HH24:MI:SS');
  v_kio boolean := coalesce(p_kiosko, false);
  v_bod boolean := coalesce(p_bodega, false);
begin
  v_usuario := fn_costos_sesion(p_token);
  if v_usuario is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  if not v_kio and not v_bod then
    raise exception 'Elige kiosko, bodega o los dos.';
  end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo del reinicio.';
  end if;

  begin
    select a.empleado_id, a.nombre into v_aut, v_aut_nombre
      from fn_autorizar_con_pin(p_pin, 'reiniciar_inventario') a;
  exception when others then
    perform fn_pin_registrar_intento('autorizar', false);
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;

  select id into v_k from almacenes where tipo = 'kiosko' order by id limit 1;
  select id into v_b from almacenes where tipo = 'bodega' order by id limit 1;
  if v_kio and v_k is not null then v_alm := v_alm || v_k; end if;
  if v_bod and v_b is not null then v_alm := v_alm || v_b; end if;

  -- 1. El sistema a 0, con su movimiento.
  with objetivo as (
    select s.id, s.almacen_id, s.insumo_id, s.stock_actual
      from inventario_stock s
     where s.almacen_id = any(v_alm)
       and s.stock_actual <> 0
  ),
  mov as (
    insert into inventario_movimientos
      (insumo_id, almacen_id, cantidad, tipo, costo_unitario, nota,
       empleado_id, motivo, existencia_antes, existencia_despues)
    select o.insumo_id, o.almacen_id, -o.stock_actual, 'reinicio', i.costo_unitario,
           'Reinicio de inventario desde Costeos (' || v_usuario || '): ' || trim(p_motivo),
           v_aut, 'reinicio', o.stock_actual, 0
      from objetivo o join insumos i on i.id = o.insumo_id
    returning 1
  ),
  stk as (
    update inventario_stock s set stock_actual = 0
      from objetivo o where s.id = o.id
    returning 1
  )
  select (select count(*) from stk), coalesce((select sum(abs(stock_actual)) from objetivo), 0)
    into v_n, v_piezas;

  -- 2. Lo ultimo que Costeos dijo, a 0: asi la proxima captura entra completa.
  update costos_stock_sync
     set ultimo_valor = 0, updated_at = now()
   where almacen_id = any(v_alm) and ultimo_valor <> 0;

  -- 3. Los numeros del documento a 0, y la marca. El trigger de app_data
  --    corre el sync con todo en 0 contra ultimo_valor en 0: no mueve nada.
  update app_data
     set data = data
           || jsonb_build_object('reinicioInventario', v_marca)
           || jsonb_strip_nulls(jsonb_build_object(
                'proteins',  _costos_inv_cero(data->'proteins',  array_remove(array[
                               case when v_bod then 'invOriginal' end,
                               case when v_kio then 'invScoops' end,
                               case when v_kio then 'invIndividual' end], null)),
                'shakeIngs', _costos_inv_cero(data->'shakeIngs', array_remove(array[
                               case when v_bod then 'invOriginal' end,
                               case when v_kio then 'invPorcion' end,
                               case when v_kio then 'invIndividual' end], null)),
                'foodIngs',  _costos_inv_cero(data->'foodIngs',  array_remove(array[
                               case when v_bod then 'invOriginal' end,
                               case when v_kio then 'invPorcion' end,
                               case when v_kio then 'invIndividual' end], null)),
                'bebidas',   _costos_inv_cero(data->'bebidas',   array_remove(array[
                               case when v_bod then 'invOriginal' end,
                               case when v_kio then 'invIndividual' end], null)),
                'snacks',    _costos_inv_cero(data->'snacks',    array_remove(array[
                               case when v_bod then 'invOriginal' end,
                               case when v_kio then 'invIndividual' end], null)),
                'empaque',   _costos_inv_cero(data->'empaque',   array_remove(array[
                               case when v_bod then 'stock' end], null)))),
         updated_at = now(),
         updated_by = v_usuario
   where id = 'shakeaholic';

  return jsonb_build_object('ok', true, 'renglones', v_n, 'piezas', v_piezas,
                            'autorizo', v_aut_nombre, 'marca', v_marca);
end;
$$;
-- Costeos habla como anon: el token y el PIN son la credencial.
revoke execute on function public.fn_costos_reiniciar_inventario(uuid, boolean, boolean, text, text) from public;
grant execute on function public.fn_costos_reiniciar_inventario(uuid, boolean, boolean, text, text) to anon, authenticated;

-- Una pestana de antes del reinicio no puede volver a subir sus numeros.
create or replace function public.fn_costos_guardar(p_token uuid, p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '20s'
as $$
declare v_usuario text; v_cuando timestamptz; v_marca text;
begin
  v_usuario := fn_costos_sesion(p_token);
  if v_usuario is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Eso no es un documento de costeo.';
  end if;
  select data->>'reinicioInventario' into v_marca from app_data where id = 'shakeaholic';
  if v_marca is not null and v_marca is distinct from (p_data->>'reinicioInventario') then
    raise exception 'El inventario se reinicio desde otra pantalla. Recarga Costeos para seguir.';
  end if;
  update app_data
     set data = p_data, updated_at = now(), updated_by = v_usuario
   where id = 'shakeaholic'
  returning updated_at into v_cuando;
  if v_cuando is null then
    raise exception 'No se encontro el documento de costeo.';
  end if;
  return v_cuando;
end
$$;
