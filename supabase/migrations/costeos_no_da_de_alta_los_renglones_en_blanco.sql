-- Que un renglon a medio llenar no nazca como catalogo.
--
-- El catalogo de insumos tenia 1628 renglones y 440 de ellos no los usa
-- ningun producto activo ni se han movido nunca. Se venia culpando al
-- rebote del guardado --que era real y ya se atendio: los campos de
-- texto guardan al salir del campo, no en cada tecla--, pero mirando los
-- 39 que nacieron del 3 al 5 de septiembre, ese ya no es el motivo
-- principal. El motivo es mas simple:
--
--   "Nueva - Tamarindo", "Nueva - Chocolate", "Nueva - Chai",
--   "Nueva - Birthday Cake", "SASCHA FITNESS - —",
--   "BIRDMAN Falcon Performance - —"
--
-- Al agregar una proteina, Costeos crea el renglon con **marca "Nueva" y
-- sabor "—"** de relleno, y guarda en ese momento. La sincronizacion lo
-- toma en serio y da de alta un insumo llamado "Nueva - —"; despues,
-- conforme escriben el sabor pero todavia no la marca, nace uno por cada
-- sabor: 62 insumos que empiezan con "Nueva - ". Lo mismo hace el boton
-- de empaque con "Nuevo empaque".
--
-- No es que alguien lo este haciendo mal: la pantalla pone ese relleno
-- justamente para que se vea que el renglon es nuevo. Lo que estaba mal
-- es tomarlo por un nombre.
--
-- Ahora un renglon de proteina entra al catalogo solo cuando marca Y
-- sabor son de verdad --el nombre del insumo es "marca - sabor", asi que
-- con uno solo el nombre ya nace mentiroso-- y el empaque solo cuando ya
-- no se llama "Nuevo empaque".
--
-- Parche por ancla, como manda el CLAUDE.md: se lee la definicion viva,
-- se comprueba que cada ancla aparece EXACTAMENTE una vez y solo
-- entonces se reemplaza. Si el ancla no cuadra, esto truena aqui y la
-- funcion se queda como estaba -- que es mucho mejor que corromper la
-- que sincroniza todo el catalogo con la tienda vendiendo.
--
-- Comprobado disparando la sincronizacion de verdad con los dos
-- renglones de relleno inyectados, y revirtiendo: no nacio ni un insumo
-- (1628 -> 1628) y los 459 productos y 3085 recetas quedaron igual.
do $$
declare
  v_def text;
  v_ancla_prot text := 'jsonb_array_elements(data->''proteins'') x where coalesce(trim(x->>''marca''),'''')<>'''' or coalesce(trim(x->>''sabor''),'''')<>''''';
  v_nueva_prot text := 'jsonb_array_elements(data->''proteins'') x where coalesce(trim(x->>''marca''),'''') not in ('''',''Nueva'') and coalesce(trim(x->>''sabor''),'''') not in ('''',''—'',''-'')';
  v_ancla_emp text := 'jsonb_array_elements(data->''empaque'') x where coalesce(trim(x->>''nombre''),'''')<>''''';
  v_nueva_emp text := 'jsonb_array_elements(data->''empaque'') x where coalesce(trim(x->>''nombre''),'''') not in ('''',''Nuevo empaque'')';
  v_n int;
begin
  v_def := pg_get_functiondef('public.fn_sync_app_data()'::regprocedure);

  select count(*) into v_n from regexp_matches(v_def, regexp_replace(
    v_ancla_prot, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), 'g');
  if v_n <> 1 then
    raise exception 'El ancla de proteins aparece % veces, esperaba 1. No se toca nada.', v_n;
  end if;

  select count(*) into v_n from regexp_matches(v_def, regexp_replace(
    v_ancla_emp, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), 'g');
  if v_n <> 1 then
    raise exception 'El ancla de empaque aparece % veces, esperaba 1. No se toca nada.', v_n;
  end if;

  v_def := replace(v_def, v_ancla_prot, v_nueva_prot);
  v_def := replace(v_def, v_ancla_emp, v_nueva_emp);
  execute v_def;
end $$;
