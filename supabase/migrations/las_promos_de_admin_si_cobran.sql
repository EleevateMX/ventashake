-- Las promos de Admin nunca tocaron un precio.
--
-- `promociones` la leia UNA sola funcion, fn_promos_cliente, que sirve para
-- sugerirle algo al cliente en Rewards. El camino del dinero
-- (fn_crear_orden) jamas la miro. Por eso la clienta capturo "Cookie Duo"
-- el 23/08, dos veces, y no paso nada: no habia nada que pasara.
--
-- Y no era cosa de "conectarla" nada mas: la tabla no dice A QUE aplica.
-- Una fila descuento_monto = 25 conectada tal cual habria quitado $25 de
-- TODA orden entre las 6 y las 18 h. Faltaba el alcance.
--
-- OJO: el valor del enum va en su PROPIA sentencia, antes que todo esto.
-- Postgres no deja usar un valor de enum en la misma transaccion en que se
-- agrega:
--
--   alter type tipo_promocion add value if not exists 'n_x_precio';

alter table promociones
  add column if not exists productos uuid[],
  add column if not exists cantidad integer,
  add column if not exists automatica boolean not null default false;

comment on column promociones.productos is
  'A que productos aplica. NULL = a ninguno: la promo no toca precios, '
  'solo se sugiere en Rewards (comportamiento historico).';
comment on column promociones.cantidad is
  'La N de "N x precio". 2 en un 2x25.';
comment on column promociones.automatica is
  'true = el motor la aplica sola al crear la orden. false = solo se '
  'sugiere. Las promos que ya existian nacen en false: nada cambia para ellas.';

-- Una promo automatica que no pueda cobrar nada no se guarda. Mejor que
-- Admin no la deje capturar, a que la guarde y mienta.
alter table promociones drop constraint if exists promos_automaticas_tienen_sentido;
alter table promociones add constraint promos_automaticas_tienen_sentido check (
  not automatica or (
    tipo in ('n_x_precio', 'descuento_pct')
    and productos is not null and array_length(productos, 1) >= 1
    and (tipo <> 'n_x_precio' or coalesce(cantidad, 0) >= 2)
    and valor >= 0
  )
);

-- El registro de aplicaciones nacio pensando en promos de cliente. Una
-- promo automatica la disfruta tambien quien no se identifico.
alter table promocion_aplicaciones alter column cliente_id drop not null;

-- ...y por eso mismo NO debe gastar el throttle de 15 dias del cliente.
-- Sin esto, comprar dos cookies en promo dejaria al cliente sin sus promos
-- personales por dos semanas -- un castigo por aprovechar una oferta.
create or replace function fn_promos_cliente(p_cliente uuid)
returns setof promociones
language sql
stable security definer
set search_path to 'public'
as $function$
  with ctx as (
    select c.sabor_favorito,
           (now() at time zone 'America/Merida') as ahora,
           (select count(*) from ordenes o where o.cliente_id = p_cliente and o.pagado = true
              and o.created_at >= now() - interval '30 days') as compras_30d
    from clientes c where c.id = p_cliente
  )
  select p.* from promociones p, ctx
  where p.activa
    and not p.automatica
    and (p.vence_en is null or p.vence_en >= (ctx.ahora)::date)
    and (p.sabor_favorito is null or p.sabor_favorito = ctx.sabor_favorito)
    and (p.dias_semana is null or extract(dow from ctx.ahora)::int = any(p.dias_semana))
    and (p.hora_inicio is null or ctx.ahora::time >= p.hora_inicio)
    and (p.hora_fin is null or ctx.ahora::time <= p.hora_fin)
    and (p.min_compras_30d is null or ctx.compras_30d >= p.min_compras_30d)
    -- throttle: sin promos aplicadas al cliente en los ultimos 15 dias.
    -- Solo cuentan las que se le dieron a el; las automaticas son del
    -- mostrador, no suyas.
    and not exists (
      select 1 from promocion_aplicaciones pa
      join promociones pp on pp.id = pa.promocion_id
      where pa.cliente_id = p_cliente
        and not pp.automatica
        and pa.created_at >= now() - interval '15 days'
    );
$function$;
