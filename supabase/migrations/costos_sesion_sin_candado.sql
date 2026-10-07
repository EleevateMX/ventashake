-- =============================================================================
-- Costeos: la sesion ya no se forma en fila, y la existencia real carga (07/10/26).
--
-- 1. fn_costos_sesion hacia UPDATE de la fila de la sesion en CADA llamada.
--    Dentro de fn_costos_guardar ese candado dura lo que dura el sync del
--    catalogo, asi que todo lo demas que Costeos pedia con el mismo token
--    (otro guardado, leer, existencias) esperaba detras. El 07/10, 14:40-14:44:
--    39 guardados en cinco minutos, hasta 19 s cada uno, 20 caidos por
--    tiempo. Ahora solo se renueva si lleva mas de un minuto sin usarse, y
--    con SKIP LOCKED: si otro ya la tiene tomada, la sesion es valida igual
--    y no hace falta esperar para renovarla.
--
-- 2. fn_costos_existencias era STABLE y llama a fn_costos_sesion, que
--    escribe. PostgREST corre las STABLE en transaccion de solo lectura:
--    "cannot execute UPDATE in a read-only transaction" (405), y la pestana
--    Inventario de Costeos no podia ensenar la existencia real. Pasa a
--    VOLATILE.
--
-- 3. fn_costos_version: cuando se guardo el documento por ultima vez. Costeos
--    la usa para saber si lo que quedo sin guardar en el navegador (sesion
--    caducada, internet caido) se puede recuperar sin pisar a nadie.
-- =============================================================================

create or replace function public.fn_costos_sesion(p_token uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_usuario text; v_ultimo timestamptz;
begin
  if p_token is null then return null; end if;
  select usuario, ultimo_uso into v_usuario, v_ultimo
    from costos_sesiones
   where token = p_token and expira_en > now();
  if v_usuario is null then return null; end if;
  -- Solo se renueva si lleva mas de un minuto sin usarse, y sin esperar:
  -- si otro guardado ya tiene la fila, la sesion vale igual.
  if v_ultimo is null or v_ultimo < now() - interval '1 minute' then
    perform 1 from costos_sesiones where token = p_token for update skip locked;
    if found then
      update costos_sesiones
         set ultimo_uso = now(), expira_en = now() + interval '12 hours'
       where token = p_token;
    end if;
  end if;
  return v_usuario;
end
$$;
-- La version anterior tambien borraba aqui las sesiones vencidas hace mas de
-- un dia. Se quito: el canal por el que se aplican las migraciones rechaza
-- ese bloque sin decir por que (07/10). Es una fila por cada vez que alguien
-- entra a Costeos; no estorba. Si algun dia se quiere limpiar, desde el SQL
-- Editor: borrar de costos_sesiones lo que tenga expira_en de hace mas de un
-- dia.

alter function public.fn_costos_existencias(uuid) volatile;

create or replace function public.fn_costos_version(p_token uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if fn_costos_sesion(p_token) is null then
    raise exception 'Tu sesion de Costeos caduco. Vuelve a entrar.';
  end if;
  return (select updated_at from app_data where id = 'shakeaholic');
end
$$;
-- Costeos no usa Supabase Auth: habla como anon y el token ES la credencial,
-- igual que fn_costos_leer.
revoke execute on function public.fn_costos_version(uuid) from public;
grant execute on function public.fn_costos_version(uuid) to anon, authenticated;
