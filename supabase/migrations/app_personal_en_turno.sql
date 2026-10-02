-- La pestaña «Personal» de la app de iOS (02/10/26).
--
-- Quien entra con su PIN en la app ve cómo va la tienda AHORA. Gerencia ya
-- tiene `fn_panel_en_vivo` (ventas, métodos, bitácora): la app la usa tal
-- cual. Esto es lo del CAJERO, y a propósito sin dinero: quién abrió caja,
-- qué está en preparación, si las impresoras laten. Saber cuánto se vendió
-- es de gerencia, igual que en Admin.
--
-- Solo lectura. Exige personal (`fn_es_staff`), y está cerrada a anon Y a
-- PUBLIC (CLAUDE.md: hay que revocar a los dos).
create or replace function public.fn_personal_en_turno()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_inicio timestamptz := ((now() at time zone 'America/Merida')::date)::timestamp at time zone 'America/Merida';
  v_emp uuid := fn_empleado_actual();
begin
  if v_emp is null then
    raise exception 'Solo el personal puede ver esto.';
  end if;

  return jsonb_build_object(
    'ahora', to_char(now() at time zone 'America/Merida', 'HH24:MI'),
    'yo', (
      select jsonb_build_object('nombre', e.nombre, 'rol', r.slug, 'es_jefe', coalesce(fn_es_jefe(), false))
        from empleados e join roles r on r.id = e.rol_id
       where e.id = v_emp
    ),
    'corte', (
      select jsonb_build_object(
        'desde', to_char(cc.abierto_en at time zone 'America/Merida', 'HH24:MI'),
        'abrio', e.nombre)
        from caja_cortes cc
        left join empleados e on e.id = cc.empleado_apertura_id
       where cc.estado = 'abierta'
       order by cc.abierto_en desc
       limit 1
    ),
    'en_cocina', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'estacion', k.nombre,
               'estado', pc.estado,
               'folio', o.folio,
               'nombre', nullif(trim(coalesce(o.nombre_cliente, '')), ''),
               'minutos', floor(extract(epoch from (now() - pc.created_at)) / 60)
             ) order by pc.created_at), '[]'::jsonb)
        from pedidos_cocina pc
        join ordenes o on o.id = pc.orden_id
        join cocinas k on k.id = pc.cocina_id
       where pc.estado <> 'entregado' and pc.created_at >= v_inicio
    ),
    'impresoras', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nombre', i.nombre,
               'en_linea', coalesce(i.ultima_conexion > now() - interval '90 seconds', false),
               'ultima_impresion', to_char(i.ultima_impresion at time zone 'America/Merida', 'HH24:MI')
             ) order by i.nombre), '[]'::jsonb)
        from impresoras i
       where i.activa
    ),
    'impresion_atorada', (
      select count(*) from trabajos_impresion t
       where t.estado in ('pending', 'retry') and t.created_at < now() - interval '90 seconds'
    )
  );
end;
$function$;

revoke execute on function public.fn_personal_en_turno() from public, anon;
grant execute on function public.fn_personal_en_turno() to authenticated;
