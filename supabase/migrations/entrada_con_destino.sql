-- La entrada elige a dónde va: bodega o kiosko (20/10/26).
--
-- Perla: «cuando doy entrada a una proteína se va a bodega, y para que
-- aparezca en kiosko tengo que traspasarla». Un bote para la barra (la fila
-- que se vende por scoop) se abre ahí mismo; un bote de venta puede quedarse
-- en bodega o ir directo al anaquel. Antes, el único camino al kiosko era
-- «por pieza» en bebidas y snacks.
--
-- Cada línea puede traer `almacen` = 'kiosko' y `unidad`:
--   - proteína → siempre en scoops (botes × scoops por bote), vaya a bodega
--     o a kiosko. Antes la conversión solo se hacía para bodega.
--   - bebida/snack con `unidad` = 'caja' → cajas × piezas por caja, en
--     piezas (el kiosko se cuenta en piezas).
--   - bebida/snack con `unidad` = 'pieza' (o sin `unidad`, como mandaba la
--     versión anterior de Costeos) → piezas sueltas, igual que antes.
-- El costo de compra se sigue guardando por bote o por caja. Cancelar no
-- cambia: usa el almacén y el factor que quedaron en la línea.
-- `fn_crear_orden` y el cobro no se tocan.

set lock_timeout = '3s';

do $$
declare
  v_def text := pg_get_functiondef('public.fn_entrada_confirmar(uuid, text, text, text, date, numeric, jsonb, text)'::regprocedure);
  v_cambios text[][] := array[
    -- 1. La proteína se convierte a scoops vaya a donde vaya. La búsqueda
    --    ya exige que el insumo sea tipo proteína (19/10), así que para una
    --    bebida no encuentra nada y el factor se queda en 1.
    array[E'    if v_alm <> coalesce(v_kiosko, ''00000000-0000-0000-0000-000000000000''::uuid) then\n      select coalesce(nullif(x->>''scoops'', '''')::numeric, 1), true into v_factor, v_es_prot',
          E'    if true then\n      select coalesce(nullif(x->>''scoops'', '''')::numeric, 1), true into v_factor, v_es_prot'],
    -- 2. Caja de bebida o snack directo al kiosko: en piezas.
    array[E'    v_stock := v_cant * v_factor;',
          E'    if not v_es_prot and v_alm = v_kiosko and v_alm <> p_almacen_id and l->>''unidad'' = ''caja'' then\n      v_factor := greatest(coalesce(nullif(l->>''piezas_por_caja'', '''')::numeric, 1), 1);\n    end if;\n    v_stock := v_cant * v_factor;'],
    -- 3. El costo por caja se reconstruye solo para las piezas sueltas.
    array[E'    v_piezas := case when v_alm = v_kiosko and v_alm <> p_almacen_id\n',
          E'    v_piezas := case when v_alm = v_kiosko and v_alm <> p_almacen_id and not v_es_prot and coalesce(l->>''unidad'', ''pieza'') = ''pieza''\n'],
    -- 4. La nota dice lo que pasó.
    array[E'''Entrada'' || case when v_alm = v_kiosko and v_alm <> p_almacen_id then '' por pieza'' else '''' end',
          E'''Entrada'' || case when v_alm = v_kiosko and v_alm <> p_almacen_id then case when not v_es_prot and coalesce(l->>''unidad'', ''pieza'') = ''pieza'' then '' por pieza'' else '' directo al kiosko'' end else '''' end']
  ];
  i int; v_n int;
begin
  for i in 1 .. array_length(v_cambios, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_cambios[i][1], ''))) / length(v_cambios[i][1]);
    if v_n <> 1 then
      raise exception 'fn_entrada_confirmar: el ancla % aparece % veces (se esperaba 1)', i, v_n;
    end if;
    v_def := replace(v_def, v_cambios[i][1], v_cambios[i][2]);
  end loop;
  execute v_def;
end $$;
