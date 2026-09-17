-- `fn_rewards_admin` contaba las tarjetas llenas con un 13 escrito a mano.
--
-- Mientras `requeridos` era un numero que solo se cambiaba con un update
-- suelto, daba igual. Ahora gerencia lo edita desde Admin, asi que ese 13
-- fijo haria que el panel contara con una regla que ya no existe -- y
-- mentiria en silencio, que es la peor forma de mentir de un indicador.
--
-- Parche por ancla e idempotente, igual que el del resumen del cliente.
do $patch$
declare v_def text; v_ancla text; v_nuevo text; v_n int;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='fn_rewards_admin' and pronamespace='public'::regnamespace;

  v_ancla :=
'        ''bebida_listas'', count(*) filter (where sellos_bebida >= 13),
        ''alimento_listas'', count(*) filter (where sellos_alimento >= 13),';

  v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / nullif(length(v_ancla),0);
  if coalesce(v_n,0) = 0 then
    raise notice 'Ya estaba parcheada.';
    return;
  end if;
  if v_n <> 1 then
    raise exception 'ABORTADO: el ancla aparece % veces, no 1.', v_n;
  end if;

  v_nuevo :=
'        ''bebida_listas'', count(*) filter (
          where sellos_bebida >= (select cs.requeridos from config_sellos cs where cs.tipo = ''bebida'')),
        ''alimento_listas'', count(*) filter (
          where sellos_alimento >= (select cs.requeridos from config_sellos cs where cs.tipo = ''alimento'')),';

  execute replace(v_def, v_ancla, v_nuevo);
end $patch$;
