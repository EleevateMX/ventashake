-- `fn_mi_resumen_lealtad` deja de mandarle numeros de sellos al cliente.
--
-- Se aplica como PARCHE POR ANCLA y no reescribiendo la funcion entera:
-- son ~150 lineas de las que aqui solo cambian dos bloques, y volver a
-- teclearlas es la forma mas facil de perder una en el camino. El ancla se
-- cuenta antes de tocar nada: si no aparece exactamente una vez, esto
-- aborta ruidosamente en vez de dejar la funcion a medias.
--
-- Es idempotente: si el bloque viejo ya no esta (o sea, ya se parcheo),
-- no hace nada.
do $patch$
declare v_def text; v_ancla text; v_nuevo text; v_n int;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname = 'fn_mi_resumen_lealtad' and pronamespace = 'public'::regnamespace;

  v_ancla :=
'    -- Las dos tarjetas de sellos, con lo que falta y si ya se puede cobrar.
    ''sellos'', (
      select coalesce(jsonb_agg(jsonb_build_object(
        ''tipo'', cs.tipo,
        ''tiene'', case when cs.tipo = ''bebida'' then v_cliente.sellos_bebida else v_cliente.sellos_alimento end,
        ''requeridos'', cs.requeridos,
        ''faltan'', greatest(0, cs.requeridos - case when cs.tipo = ''bebida'' then v_cliente.sellos_bebida else v_cliente.sellos_alimento end),
        ''listo'', (case when cs.tipo = ''bebida'' then v_cliente.sellos_bebida else v_cliente.sellos_alimento end) >= cs.requeridos
      ) order by cs.tipo desc), ''[]''::jsonb)
      from config_sellos cs where cs.activo
    ),

    ''premios'', (
      select coalesce(jsonb_agg(jsonb_build_object(
        ''tipo'', ps.tipo, ''nombre'', p.nombre, ''precio'', p.precio
      ) order by ps.tipo, p.nombre), ''[]''::jsonb)
      from premios_sellos ps join productos p on p.id = ps.producto_id
      where ps.activo and p.activo
    ),';

  v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / nullif(length(v_ancla), 0);
  if coalesce(v_n, 0) = 0 then
    raise notice 'Ya estaba parcheada: no hay nada que hacer.';
    return;
  end if;
  if v_n <> 1 then
    raise exception 'ABORTADO: el ancla aparece % veces, no 1. La funcion no se toco.', v_n;
  end if;

  v_nuevo :=
'    -- La sorpresa NO viaja con numeros.
    --
    -- Ni "tienes 3", ni "te faltan 10", ni el catalogo de premios. Si el
    -- dato sale del servidor, sale tambien para quien abra el inspector
    -- del navegador, y ahi se acabo la sorpresa: esconderlo solo en la
    -- pantalla habria sido teatro. Aqui viaja UNA frase, y solo cuando ya
    -- esta cerca. El personal sigue viendo el numero exacto por sus
    -- propias funciones, porque quien entrega el premio tiene que saber.
    ''sorpresa'', (
      select coalesce(jsonb_agg(jsonb_build_object(
        ''tipo'', cs.tipo,
        ''nombre'', coalesce(cs.nombre, initcap(cs.tipo)),
        ''estado'', case when t.tiene >= cs.requeridos then ''lista'' else ''cerca'' end,
        ''texto'', case when t.tiene >= cs.requeridos
                      then cs.aviso_listo_texto
                      else replace(coalesce(cs.aviso_texto, ''''), ''{faltan}'',
                                   (cs.requeridos - t.tiene)::text)
                 end
      ) order by cs.tipo desc), ''[]''::jsonb)
      from config_sellos cs
      cross join lateral (
        select case when cs.tipo = ''bebida''
                    then coalesce(v_cliente.sellos_bebida, 0)
                    else coalesce(v_cliente.sellos_alimento, 0) end
      ) as t(tiene)
      where cs.activo
        and cs.aviso_desde > 0
        and (t.tiene >= cs.requeridos or cs.requeridos - t.tiene <= cs.aviso_desde)
    ),';

  execute replace(v_def, v_ancla, v_nuevo);
end $patch$;
