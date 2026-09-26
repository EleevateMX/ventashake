-- Espejo de claseExtra (@shake/utils). Una galleta CON grupo escrito en
-- Admin compite en su grupo como cualquier opcion; sin grupo sigue siendo
-- promocion, sin "de casa". Nacio de los combos Milo (26/09): el grupo
-- "Galleta" a $0 que puso gerencia se ignoraba porque el nombre decia
-- "Galleta". Un valor por omision no le gana a una decision.
create or replace function public.fn_clase_extra(p_nombre text, p_grupo text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p_nombre ~* '^\s*(leche\y|agua\y|sin leche)' then 'base'
    when p_nombre ~* '^\s*prote[ií]na'                 then 'proteina'
    when p_nombre ~* 'galleta'
         and nullif(trim(coalesce(p_grupo, '')), '') is null then null
    when nullif(trim(coalesce(p_grupo, '')), '') is not null
      then 'g:' || trim(p_grupo)
    else null
  end
$function$;
