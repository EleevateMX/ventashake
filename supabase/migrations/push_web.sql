-- =============================================================================
-- Avisos push para la PWA (Android y web), 06/10/26.
--
-- Mismo carril que los de iOS (`avisos_push.sql`): la cola no cambia, el
-- trigger no cambia, Admin → Avisos no cambia. Lo único nuevo es que un
-- "teléfono" puede ser una suscripción de Web Push: su token es el
-- endpoint que da el navegador y trae dos llaves (p256dh, auth) con las que
-- la Edge Function cifra el aviso. La Edge Function `push-cola` mira
-- `plataforma` y habla con Apple o con el navegador según corresponda.
-- =============================================================================

alter table push_dispositivos add column if not exists claves jsonb;

-- La PWA registra su suscripción con la sesión del cliente. Un endpoint es
-- de un solo navegador: si cambia de cuenta, se reasigna (igual que iOS).
create or replace function public.fn_push_registrar_web(p_endpoint text, p_claves jsonb, p_version text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_cliente uuid; v_empleado uuid;
begin
  if v_uid is null then raise exception 'Entra a tu cuenta.'; end if;
  if coalesce(btrim(p_endpoint), '') = '' then raise exception 'Suscripción vacía.'; end if;
  if p_claves is null or p_claves->>'p256dh' is null or p_claves->>'auth' is null then
    raise exception 'Suscripción incompleta.';
  end if;
  select id into v_cliente from clientes where auth_user_id = v_uid and activo limit 1;
  select id into v_empleado from empleados where auth_user_id = v_uid and activo limit 1;
  insert into push_dispositivos (auth_user_id, cliente_id, empleado_id, token, plataforma, entorno, claves, app_version, activo, visto_en, ultimo_error)
  values (v_uid, v_cliente, v_empleado, btrim(p_endpoint), 'web', 'production', p_claves, p_version, true, now(), null)
  on conflict (token) do update
    set auth_user_id = excluded.auth_user_id,
        cliente_id = excluded.cliente_id,
        empleado_id = excluded.empleado_id,
        plataforma = 'web',
        claves = excluded.claves,
        app_version = excluded.app_version,
        activo = true,
        visto_en = now(),
        ultimo_error = null;
end;
$$;
revoke execute on function public.fn_push_registrar_web(text, jsonb, text) from anon, public;
grant execute on function public.fn_push_registrar_web(text, jsonb, text) to authenticated;
