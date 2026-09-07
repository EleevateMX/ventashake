-- Las ordenes de CAJA que se quedan "cobrando" para siempre.
--
-- Habia 238 ordenes diciendo `payment_processing` o `pending_payment`, con
-- su pago ya rechazado, algunas de hace **19 dias**. La orden decia una cosa
-- y el pago otra, y nadie las cerraba nunca.
--
-- La causa es de una linea: este expirador solo miraba `canal = 'kiosko'` y
-- exigia `expira_en`. Eso es del flujo de AUTOSERVICIO, donde la orden nace
-- con caducidad porque el cliente puede irse. La tienda opera en modo
-- CAJERO, o sea `canal = 'pos'`, y ahi `expira_en` es null: **ninguna de las
-- 238 entraba por la puerta**. No es que el expirador fallara; es que ese
-- camino nunca tuvo quien lo barriera.
--
-- Por que ensucia mas de lo que parece: cada reintento de Clip levanta una
-- orden NUEVA en vez de recobrar la misma, asi que un cobro que falla cuatro
-- veces deja cuatro cadaveres y una venta buena. De 111 ordenes "sin pagar"
-- de la ultima semana, 96 eran reintentos que SI se cobraron. El indicador
-- de ventas abandonadas era 86% ruido, y con ese ruido encima no se puede
-- ver la venta que de verdad se perdio.
--
-- Tres decisiones que importan:
--
-- 1. **Se marcan `expired`, no `cancelled`.** La transicion valida ya existe
--    en `fn_validar_transicion_estado_pago_orden` desde los cuatro estados
--    que barremos, asi que no hace falta tocar la maquina de estados ni
--    pedir `app.transition_context`. Y `expired` es la verdad: nadie las
--    cancelo, se quedaron sin quien las terminara.
--    (Ojo: `payment_processing -> pending_payment` esta PROHIBIDO a
--    proposito. Ir para atras seria dejar re-cobrable una orden que quiza
--    ya se cobro por otro lado. No se intenta.)
--
-- 2. **Seis horas de edad, y ni un minuto menos.** El kiosko sondea a Clip
--    120 segundos y se rinde; `clip-barrer-pendientes` espera 3 minutos.
--    Seis horas deja los dos caminos terminados con muchisimo margen: esto
--    NO puede cruzarse con una venta viva. Es a proposito que sea absurdo
--    de holgado -- barrer rapido no gana nada y arriesga la caja.
--
-- 3. **No se tocan las que tienen un pago aprobado o uno pendiente.** Un
--    pago pendiente es el efectivo apuntado de un cobro mixto que todavia
--    espera a la terminal; expirarlo dejaria dinero apuntado sin orden.
--    Hoy ninguna de las 238 trae uno, pero el candado va puesto igual.
--
-- No se toca `ordenes.estado` (sigue en 'pendiente'): eso es del reporte de
-- ventas y no es lo que estaba roto. Y no se borra nada -- expirar es
-- reversible mirando `ordenes_auditoria`, borrar no.
--
-- Comprobado en produccion: las 238 no tenian comanda ni pedido de cocina
-- (nadie preparo nada; son carritos a medias, no ventas sin entregar). Se
-- cerraron en dos pasadas, quedaron 0 colgadas y los 2241 pagos aprobados,
-- 2241 ventas y 2240 ordenes pagadas siguen intactos. Y con una orden
-- recien creada en `payment_processing`, el barrido movio 0 y despues se
-- pudo cobrar normal.
create or replace function public.fn_expirar_ordenes_kiosko()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_orden record;
  v_n integer := 0;
begin
  -- 1) Autoservicio: la orden trae su propia caducidad.
  for v_orden in
    select id from ordenes
    where canal = 'kiosko'
      and estado_pago_orden in ('pending_payment', 'awaiting_counter_payment', 'payment_processing', 'payment_unknown')
      and expira_en is not null
      and expira_en < now()
    for update skip locked
  loop
    update ordenes set estado_pago_orden = 'expired', updated_at = now() where id = v_orden.id;
    insert into ordenes_auditoria (orden_id, evento, detalle)
      values (v_orden.id, 'expirada', jsonb_build_object('motivo', 'vencio_expira_en'));
    v_n := v_n + 1;
  end loop;

  -- 2) Caja: no hay `expira_en`, asi que manda la edad. El tope por corrida
  --    evita que la primera pasada mueva cientos de renglones de golpe.
  for v_orden in
    select o.id from ordenes o
    where o.canal <> 'kiosko'
      and not o.pagado
      and not o.es_demo
      and o.estado_pago_orden in ('pending_payment', 'awaiting_counter_payment', 'payment_processing', 'payment_unknown')
      and o.created_at < now() - interval '6 hours'
      and not exists (select 1 from pagos p where p.orden_id = o.id and p.estado in ('aprobado', 'pendiente'))
    order by o.created_at
    limit 200
    for update skip locked
  loop
    update ordenes set estado_pago_orden = 'expired', updated_at = now() where id = v_orden.id;
    insert into ordenes_auditoria (orden_id, evento, detalle)
      values (v_orden.id, 'expirada', jsonb_build_object('motivo', 'caja_sin_cobrar_6h'));
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;
