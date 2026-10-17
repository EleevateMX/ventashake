-- La clave de compras es la que Costeos tiene configurada (17/10/26).
--
-- Perla no podía dar entrada a mercancía («Clave de compras incorrecta») ni
-- con su clave ni con la de encargado. Costeos guarda la clave en SU
-- documento (app_data → params.claveCompras / params.clave), y al cambiarla
-- intentaba copiarla a `parametros.clave_compras` con un UPDATE directo. Desde
-- el 31/08 `anon` ya no puede escribir `parametros`, así que esa copia falla
-- en silencio: la pantalla aceptaba la clave (la compara contra el
-- documento) y el servidor la rechazaba (la compara contra la copia vieja).
--
-- Las tres funciones que piden esa clave —dar entrada, cancelar entrada y
-- «Mostrar en el kiosko»— aceptan ahora la de compras o la de encargado del
-- documento de Costeos, que es lo que la pantalla siempre dijo. La copia en
-- `parametros` se sigue aceptando para no romper a nadie.
--
-- Parche con ancla: los cuerpos se leen en ejecución, y la migración no
-- trae `drop`/`delete` (el conector los corta).

do $$
declare
  v_def text;
  v_ok text := 'nullif(trim(coalesce(p_clave, '''')), '''') is null or not (
       trim(p_clave) = trim(coalesce(%s, ''''))
       or exists (select 1 from app_data a
                   where trim(p_clave) in (nullif(trim(a.data->''params''->>''claveCompras''), ''''),
                                           nullif(trim(a.data->''params''->>''clave''), ''''))))';
  a1 text := '  if v_clave_real is null or p_clave is null or p_clave <> v_clave_real then';
  a2 text := '    if v_clave is null or nullif(trim(coalesce(p_clave, '''')), '''') is null
       or trim(p_clave) <> trim(v_clave) then';
  f text;
begin
  foreach f in array array['public.fn_entrada_confirmar(uuid,text,text,text,date,numeric,jsonb,text)',
                           'public.fn_entrada_cancelar(uuid,text)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then
      raise exception 'ancla de % no aparece exactamente una vez', f;
    end if;
    execute replace(v_def, a1, '  if ' || format(v_ok, 'v_clave_real') || ' then');
  end loop;

  v_def := pg_get_functiondef('public.fn_catalogo_publicar(text,text)'::regprocedure);
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then
    raise exception 'ancla de fn_catalogo_publicar no aparece exactamente una vez';
  end if;
  execute replace(v_def, a2, '    if ' || format(v_ok, 'v_clave') || ' then');
end $$;
