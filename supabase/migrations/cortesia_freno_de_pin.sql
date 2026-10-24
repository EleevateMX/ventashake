-- Se aplica DESPUÉS de desplegar el kiosko que entiende {ok:false} y de
-- recargarlo: la pantalla vieja tomaba la respuesta como cortesía dada.

set lock_timeout = '3s';

-- ── La cortesía: el mismo freno, que nunca contaba los fallos ───────────
-- `fn_cortesia_crear` anotaba el intento y luego lanzaba el error, y el
-- error deshacía la anotación: 9 intentos de cortesía registrados, 0
-- fallos. Ahora un PIN equivocado se CONTESTA ({ok:false}) y el intento
-- queda. La pantalla nueva lo entiende; la vieja recibe un objeto sin folio
-- y lo enseña como error (crearCortesia revisa `ok`).
do $$
declare
  v_def text := pg_get_functiondef('public.fn_cortesia_crear(text,text,uuid,uuid,jsonb,uuid,uuid,text,boolean)'::regprocedure);
  v_ancla text := E'  if v_aut is null then\n    raise exception ''Ese PIN no puede dar cortesías.'';\n  end if;';
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_n <> 1 then
    raise exception 'fn_cortesia_crear: el ancla aparece % veces (se esperaba 1)', v_n;
  end if;
  execute replace(v_def, v_ancla,
    E'  if v_aut is null then\n    return jsonb_build_object(''ok'', false, ''error'', ''Ese PIN no puede dar cortesías.'');\n  end if;');
end $$;

