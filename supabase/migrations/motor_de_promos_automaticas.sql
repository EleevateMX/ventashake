-- El motor: que promos estan vigentes AHORA, y cuanto descuentan.

create or replace function fn_promos_vigentes()
returns setof promociones
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.* from promociones p, (select (now() at time zone 'America/Merida') as ahora) ctx
  where p.activa
    and p.automatica
    and (p.vence_en is null or p.vence_en >= ctx.ahora::date)
    and (p.dias_semana is null or extract(dow from ctx.ahora)::int = any(p.dias_semana))
    and (p.hora_inicio is null or ctx.ahora::time >= p.hora_inicio)
    and (p.hora_fin  is null or ctx.ahora::time <= p.hora_fin);
$function$;

comment on function fn_promos_vigentes() is
  'Promos automaticas que aplican en este momento (hora de Merida). El '
  'check de la tabla ya garantiza que traen alcance y tipo cobrable.';

/*
 * Cuanto descuenta cada promo sobre estas lineas.
 *
 * p_lineas: [{"producto_id": uuid, "cantidad": int, "precio": numeric}]
 *           -- precio UNITARIO ya resuelto (el de la linea, no el de
 *           catalogo: un extra puede tener sobreprecio por producto).
 *
 * n_x_precio: se desdobla en unidades, se ordenan de MAS CARA a mas barata
 *   y se agrupan de N en N. Cada grupo COMPLETO paga `valor`. Las de mas
 *   arriba entran primero, o sea el cliente sale ganando -- es lo que
 *   esperaria cualquiera que lea "2 x 25" en un pizarron.
 *   Un grupo incompleto no descuenta: tres cookies en un 2x25 son un
 *   paquete y una suelta.
 *
 * descuento_pct: valor (0-1) sobre lo que suman los productos alcanzados.
 *   No sobre el ticket entero: un 20% en shakes no debe tocar la comida.
 *
 * Nunca devuelve negativo: si alguien captura un "2 x 40" sobre cookies de
 * $15, el descuento es 0, no un cargo extra.
 *
 * La misma regla vive en packages/utils/src/promos.ts para previsualizarla
 * en el kiosko. Las dos estan probadas contra los mismos casos: el numero
 * que ve el cajero antes de pedir el dinero tiene que ser el que se cobra.
 */
create or replace function fn_descuento_promos(p_lineas jsonb)
returns table(promocion_id uuid, descuento numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  with lineas as (
    select (l->>'producto_id')::uuid as pid,
           greatest(0, coalesce((l->>'cantidad')::int, 0)) as cant,
           greatest(0, coalesce((l->>'precio')::numeric, 0)) as precio
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
  ),
  unidades as (
    select li.pid, li.precio
    from lineas li, generate_series(1, li.cant)
  ),
  promo as (select * from fn_promos_vigentes()),
  elegibles as (
    select pr.id as promo_id, pr.tipo, pr.cantidad as n, pr.valor, u.precio,
           row_number() over (partition by pr.id order by u.precio desc, u.pid) as rn
    from promo pr
    join unidades u on u.pid = any(pr.productos)
  ),
  paquetes as (
    select promo_id, n, valor, ((rn - 1) / n) as paquete,
           count(*) as piezas, sum(precio) as suma
    from elegibles
    where tipo = 'n_x_precio'
    group by promo_id, n, valor, ((rn - 1) / n)
  ),
  por_paquete as (
    select promo_id, sum(greatest(0, suma - valor)) as descuento
    from paquetes where piezas = n group by promo_id
  ),
  por_pct as (
    select promo_id, round(sum(precio) * least(1, greatest(0, valor)), 2) as descuento
    from elegibles where tipo = 'descuento_pct' group by promo_id, valor
  )
  select promo_id, descuento from por_paquete where descuento > 0
  union all
  select promo_id, descuento from por_pct where descuento > 0;
$function$;

grant execute on function fn_promos_vigentes() to anon, authenticated;
grant execute on function fn_descuento_promos(jsonb) to anon, authenticated;
