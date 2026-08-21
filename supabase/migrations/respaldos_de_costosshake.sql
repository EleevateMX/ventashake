-- ============================================================================
-- Respaldos de costosshake: uno de hoy y uno automatico cada noche
-- ============================================================================
-- `app_data` es UNA fila con 220 kB de JSON, y de ella cuelga todo el
-- catalogo: 128 proteinas, 51 recetas de shake, 43 bebidas, 39 snacks. Cada
-- vez que se guarda, la sincronizacion reescribe productos, insumos y
-- recetas. O sea que un mal guardado no daña un renglon: daña el menu.
--
-- Y ya sabemos que se puede dañar solo. El guardado por tecla creo cientos de
-- productos basura ("Monster - Peachy K", "Agua Purificada - e") antes de que
-- lo frenaramos, y `app_data.app_data_update` sigue abierta a cualquiera con
-- la llave publicable: hoy por hoy, una sola sentencia puede reescribir el
-- documento entero.
--
-- Con un historial de versiones, cualquiera de esas cosas se deshace. Sin el,
-- se rehace a mano.
--
-- Se guarda el JSON completo y no un diff: 220 kB por copia son centavos, y
-- un respaldo que hay que reconstruir aplicando parches no es un respaldo,
-- es una tarea pendiente para el peor momento.

create table if not exists public.app_data_respaldos (
  id bigserial primary key,
  data jsonb not null,
  tomado_en timestamptz not null default now(),
  origen text not null default 'automatico',
  nota text
);

create index if not exists ix_app_data_respaldos_fecha
  on public.app_data_respaldos (tomado_en desc);

alter table public.app_data_respaldos enable row level security;
-- Sin politicas a proposito: un respaldo no lo lee ninguna app. Solo llegan
-- las funciones con definer y la llave de servicio. Si el documento vivo esta
-- abierto a cualquiera, lo ultimo que conviene es que su respaldo tambien.

/**
 * Toma una copia del documento.
 *
 * No guarda dos veces lo mismo: si el contenido es identico al ultimo
 * respaldo, no hace nada. Asi el historial son versiones de verdad y no
 * trescientas copias del mismo dia sin tocar nada.
 */
create or replace function public.fn_respaldar_costosshake(p_origen text default 'automatico', p_nota text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual jsonb;
  v_ultimo jsonb;
  v_id bigint;
begin
  select data into v_actual from app_data limit 1;
  if v_actual is null then
    return null;
  end if;

  select data into v_ultimo from app_data_respaldos order by tomado_en desc limit 1;
  if v_ultimo is not null and v_ultimo = v_actual then
    return null;  -- nada cambio desde el ultimo
  end if;

  insert into app_data_respaldos (data, origen, nota)
  values (v_actual, coalesce(p_origen, 'automatico'), p_nota)
  returning id into v_id;

  -- Se conservan los ultimos 60. A una copia por dia es un bimestre de
  -- historial, que alcanza de sobra para notar y deshacer un destrozo.
  delete from app_data_respaldos
  where id not in (select id from app_data_respaldos order by tomado_en desc limit 60);

  return v_id;
end;
$$;

/**
 * Devuelve el documento a una version anterior.
 *
 * Escribe en `app_data`, lo que dispara la sincronizacion completa: el
 * catalogo vuelve a como estaba en esa fecha. Por eso pide el id exacto de
 * la copia y no "la de ayer": restaurar es una decision, no un descuido.
 *
 * Antes de pisar nada toma un respaldo del estado actual, para que
 * restaurar tambien se pueda deshacer.
 */
create or replace function public.fn_restaurar_costosshake(p_respaldo_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_data jsonb;
begin
  select data into v_data from app_data_respaldos where id = p_respaldo_id;
  if v_data is null then
    raise exception 'No existe el respaldo %.', p_respaldo_id;
  end if;

  perform fn_respaldar_costosshake('antes-de-restaurar',
                                   'estado previo a restaurar el respaldo ' || p_respaldo_id);
  update app_data set data = v_data, updated_at = now(), updated_by = 'restauracion';
end;
$$;

revoke all on function public.fn_respaldar_costosshake(text, text) from public;
revoke all on function public.fn_restaurar_costosshake(bigint) from public;
grant execute on function public.fn_respaldar_costosshake(text, text) to service_role;
grant execute on function public.fn_restaurar_costosshake(bigint) to service_role;

-- El respaldo de hoy, ahora mismo.
select public.fn_respaldar_costosshake('manual', 'primer respaldo, a peticion de la sucursal');

-- Y uno cada noche a las 23:30 de Merida (05:30 UTC), despues de cerrar.
select cron.unschedule('respaldo-costosshake')
where exists (select 1 from cron.job where jobname = 'respaldo-costosshake');

select cron.schedule(
  'respaldo-costosshake',
  '30 5 * * *',
  $cron$select public.fn_respaldar_costosshake('automatico', null)$cron$
);
