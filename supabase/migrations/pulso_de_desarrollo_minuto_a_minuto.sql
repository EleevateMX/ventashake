-- El pulso de desarrollo: minuto a minuto, y enfocado en lo que se atora.
--
-- "En vivo" ya contesta "como va el dia" para gerencia. Esto contesta otra
-- pregunta, la del que sostiene el sistema: **que esta roto AHORA**.
--
-- El corazon es `latido`: un renglon por minuto de la ultima hora con
-- cuantas ordenes se levantaron, cuantas se cobraron y cuantas etiquetas
-- salieron. Lo que importa no son las barras altas, son los HUECOS: un
-- minuto con ordenes levantadas y CERO cobradas es la firma exacta de la
-- tienda parada. Es lo que paso el 02/09 de 07:28 a 07:31 y no lo vio
-- nadie hasta que llego una foto por WhatsApp.
--
-- Los 60 minutos se generan siempre, aunque no haya pasado nada: si solo
-- se pintaran los minutos con actividad, el hueco --que es el dato-- se
-- cerraria solo en la grafica.
--
-- Solo para el rol `desarrollo`. Aqui SI se puede exigir sesion sin
-- riesgo, al reves que en el camino del cobro: esto es una pantalla de
-- diagnostico. Si falla, no se vende igual; simplemente no carga. Y
-- truena en vez de devolver datos vacios, porque una pantalla de
-- diagnostico que se ve normal cuando no tiene permiso es una que miente.
--
-- Ojo con `trabajos_impresion`: NO tiene `updated_at`. La hora en que
-- salio el papel es `printed_at`. La primera version usaba updated_at y se
-- creo sin error --Postgres no valida el cuerpo de una plpgsql al
-- crearla-- asi que habria reventado en cuanto alguien abriera la
-- pantalla. Lo cazo ejecutarla.
create or replace function public.fn_pulso_desarrollo()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_res jsonb;
begin
  if not fn_es_soporte() then
    raise exception 'Solo desarrollo puede ver el pulso';
  end if;

  select jsonb_build_object(
    'ahora', now(),

    'latido', (
      select coalesce(jsonb_agg(x order by x.minuto), '[]'::jsonb) from (
        select
          to_char(m.minuto at time zone 'America/Merida', 'HH24:MI') as etiqueta,
          m.minuto,
          (select count(*) from ordenes o
            where o.created_at >= m.minuto and o.created_at < m.minuto + interval '1 minute'
              and not o.es_demo) as levantadas,
          (select count(*) from pagos p
            where p.estado = 'aprobado' and p.parte = 1
              and p.updated_at >= m.minuto and p.updated_at < m.minuto + interval '1 minute') as cobradas,
          (select count(*) from trabajos_impresion t
            where t.printed_at >= m.minuto and t.printed_at < m.minuto + interval '1 minute') as impresas,
          (select count(*) from pagos p
            where p.estado in ('rechazado','cancelado')
              and p.updated_at >= m.minuto and p.updated_at < m.minuto + interval '1 minute') as fallidas
        from generate_series(
          date_trunc('minute', now()) - interval '59 minutes',
          date_trunc('minute', now()), interval '1 minute') as m(minuto)
      ) x),

    'atorado', jsonb_build_object(
      'ordenes_cobrando', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'folio', o.folio, 'total', o.total,
          'minutos', round(extract(epoch from (now() - o.created_at))/60)) order by o.created_at), '[]'::jsonb)
        from ordenes o
        where o.estado_pago_orden = 'payment_processing'
          and o.created_at > now() - interval '12 hours'
          and o.created_at < now() - interval '3 minutes'),
      'impresion_pendiente', (
        select count(*) from trabajos_impresion
        where estado in ('pending','claimed','printing','retry')
          and created_at < now() - interval '90 seconds'),
      'efectivo_mixto_colgado', (
        select count(*) from pagos
        where proveedor = 'mixto_efectivo' and estado = 'pendiente'
          and created_at < now() - interval '10 minutes'),
      'comandas_fallidas_24h', (
        select count(*) from trabajos_impresion
        where estado = 'failed' and created_at > now() - interval '24 hours')
    ),

    -- Lo que contesto la terminal cuando dijo que no. El codigo importa:
    -- ERR10_04 es "la app del Pinpad esta cerrada", no un bug.
    'fallos_de_clip', (
      select coalesce(jsonb_agg(f order by f->>'ts' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'ts', p.updated_at,
          'hora', to_char(p.updated_at at time zone 'America/Merida', 'HH24:MI'),
          'folio', o.folio, 'monto', p.monto,
          'codigo', coalesce(p.proveedor_error::jsonb ->> 'code', p.estado::text),
          'mensaje', coalesce(p.proveedor_error::jsonb ->> 'message', '')) as f
        from pagos p join ordenes o on o.id = p.orden_id
        where p.proveedor = 'clip' and p.estado in ('rechazado','cancelado')
          and p.updated_at > now() - interval '6 hours'
        order by p.updated_at desc limit 12
      ) t),

    -- El estado de las maquinas y de la configuracion que ya nos ha
    -- mordido: el modo del kiosko cambiado sin querer, un corte que lleva
    -- dias abierto, un agente sin actualizar.
    'infra', jsonb_build_object(
      'impresoras', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'nombre', i.nombre, 'version', i.agente_version,
          'hace_segundos', round(extract(epoch from (now() - i.ultima_conexion)))) order by i.nombre), '[]'::jsonb)
        from impresoras i where i.activa),
      'modo_kiosko', (select modo_pago::text from configuracion_kiosko limit 1),
      'corte_horas', (
        select round(extract(epoch from (now() - abierto_en))/3600, 1)
        from caja_cortes where cerrado_en is null limit 1),
      'ordenes_sin_pagar_hoy', (
        select count(*) from ordenes
        where not pagado and estado = 'pendiente'
          and created_at >= ((now() at time zone 'America/Merida')::date::timestamp at time zone 'America/Merida'))
    )
  ) into v_res;

  return v_res;
end $function$;

revoke execute on function public.fn_pulso_desarrollo() from public, anon;
grant execute on function public.fn_pulso_desarrollo() to authenticated;
