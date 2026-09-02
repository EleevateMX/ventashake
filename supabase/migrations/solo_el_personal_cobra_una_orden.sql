-- Cerrar fn_cobrar_orden y fn_cobrar_orden_dividido a quien no es personal.
--
-- Se parchean SIN reescribirlas: se lee pg_get_functiondef, se verifica que
-- el ancla aparezca EXACTAMENTE una vez y se reemplaza. Si el ancla no
-- cuadra, aborta -- vale mas fallar ruidosamente que dejar a medias la
-- funcion por la que pasa cada venta.
do $mig$
declare
  v_nombre text;
  v_def text;
  v_nueva text;
  v_n int;
  v_ancla constant text := $a$begin
  select * into v_orden from ordenes where id = p_orden_id for update;$a$;
  v_guardia constant text := $g$begin
  -- Solo el personal cobra.
  --
  -- Estas dos son SECURITY DEFINER y estan abiertas a `anon` porque el
  -- kiosko habla como `anon` hasta que el cajero mete su PIN. Sin candado,
  -- cualquiera con la llave publica -- que vive en el navegador por
  -- diseno -- podia marcar una orden como pagada; y eso dispara
  -- fn_confirmar_venta, o sea que la comanda sale y barra la prepara.
  --
  -- Las tres puertas legitimas, y por que cada una:
  --   . personal con sesion real  -- kiosko en modo cajero, y el POS
  --   . service_role              -- Edge Functions. Hoy NINGUNA las llama
  --                                  (Clip confirma por fn_confirmar_venta),
  --                                  pero si manana una lo hace, que no
  --                                  muera por esto.
  --   . postgres                  -- reparaciones a mano. PostgREST jamas
  --                                  entra asi: conecta como `authenticator`
  --                                  y hace SET ROLE, nunca como `postgres`.
  --                                  Por eso va `session_user` y no
  --                                  `current_user`: dentro de un SECURITY
  --                                  DEFINER `current_user` SIEMPRE es el
  --                                  dueno, y el candado no cerraria nunca.
  if fn_rol_staff() is null
     and coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'Solo el personal puede cobrar una orden';
  end if;

  select * into v_orden from ordenes where id = p_orden_id for update;$g$;
begin
  foreach v_nombre in array array['fn_cobrar_orden', 'fn_cobrar_orden_dividido'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_nombre;

    if v_def is null then
      raise exception 'No encontre %', v_nombre;
    end if;

    -- Correrlo dos veces no debe meter la guardia dos veces.
    if position('Solo el personal puede cobrar una orden' in v_def) > 0 then
      raise notice '% ya tenia el candado, la dejo como esta', v_nombre;
      continue;
    end if;

    v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    if v_n <> 1 then
      raise exception 'El ancla aparece % veces en % (esperaba exactamente 1)', v_n, v_nombre;
    end if;

    v_nueva := replace(v_def, v_ancla, v_guardia);
    execute v_nueva;
    raise notice '% blindada', v_nombre;
  end loop;
end
$mig$;
