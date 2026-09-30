-- Fondo de caja establecido (pedido de Perla, 30/09).
--
-- Gerencia fija un fondo estandar; al abrir turno se sugiere, se puede
-- abrir con otro monto si ese dia hace falta, y queda registrado con
-- cuanto se abrio DE VERDAD y cuanto se esperaba.
--
-- Lo sugerido lo escribe la base al abrir (trigger), no la pantalla: asi
-- el registro no depende de que el kiosko o el POS esten al dia, y
-- cambiar el fondo manana no reescribe lo que se esperaba ayer.
-- Sin fondo establecido (null) todo sigue exactamente como hoy.

alter table parametros add column if not exists fondo_caja numeric
  check (fondo_caja is null or fondo_caja between 0 and 50000);
comment on column parametros.fondo_caja is
  'Fondo estandar con el que se abre la caja. Null = sin fondo establecido.';

alter table caja_cortes add column if not exists fondo_sugerido numeric;
comment on column caja_cortes.fondo_sugerido is
  'El fondo establecido al momento de abrir este turno. fondo_inicial es con cuanto se abrio de verdad.';

create or replace function public.trg_corte_fondo_sugerido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.fondo_sugerido := (select fondo_caja from parametros where id = 'default');
  return new;
end;
$function$;
revoke execute on function public.trg_corte_fondo_sugerido() from public, anon, authenticated;

drop trigger if exists trg_corte_fondo_sugerido on caja_cortes;
create trigger trg_corte_fondo_sugerido
  before insert on caja_cortes
  for each row execute function trg_corte_fondo_sugerido();

-- Solo gerencia fija el fondo.
create or replace function public.fn_fondo_caja_guardar(p_monto numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede fijar el fondo de caja.';
  end if;
  if p_monto is not null and p_monto not between 0 and 50000 then
    raise exception 'Ese fondo no tiene sentido.';
  end if;
  update parametros set fondo_caja = p_monto, updated_at = now() where id = 'default';
end;
$function$;
revoke execute on function public.fn_fondo_caja_guardar(numeric) from public, anon;
grant execute on function public.fn_fondo_caja_guardar(numeric) to authenticated;

-- La vista gana la columna al final; create or replace borra el
-- security_invoker, asi que se vuelve a poner.
create or replace view vw_corte_resumen as
 SELECT cc.id AS corte_id,
    cc.caja_id,
    ca.nombre AS caja,
    cc.estado,
    cc.abierto_en,
    cc.cerrado_en,
    cc.fondo_inicial,
    cc.efectivo_contado,
    count(DISTINCT o.id) AS num_ordenes,
    COALESCE(sum(p.monto) FILTER (WHERE (p.metodo = 'efectivo'::metodo_pago)), (0)::numeric) AS total_efectivo,
    COALESCE(sum(p.monto) FILTER (WHERE (p.metodo = 'tarjeta'::metodo_pago)), (0)::numeric) AS total_tarjeta,
    COALESCE(sum(p.monto) FILTER (WHERE (p.metodo = 'clip'::metodo_pago)), (0)::numeric) AS total_clip,
    COALESCE(sum(p.monto) FILTER (WHERE (p.metodo = 'cortesia'::metodo_pago)), (0)::numeric) AS total_cortesia,
    COALESCE(sum(p.monto) FILTER (WHERE (p.metodo = 'otro'::metodo_pago)), (0)::numeric) AS total_otro,
    COALESCE(sum(p.monto), (0)::numeric) AS total_pagado,
    (cc.fondo_inicial + COALESCE(sum(p.monto) FILTER (WHERE (p.metodo = 'efectivo'::metodo_pago)), (0)::numeric)) AS efectivo_esperado,
    (cc.efectivo_contado - (cc.fondo_inicial + COALESCE(sum(p.monto) FILTER (WHERE (p.metodo = 'efectivo'::metodo_pago)), (0)::numeric))) AS diferencia,
    cc.fondo_sugerido
   FROM (((caja_cortes cc
     JOIN cajas ca ON ((ca.id = cc.caja_id)))
     LEFT JOIN ordenes o ON (((o.corte_id = cc.id) AND (o.es_demo = false))))
     LEFT JOIN pagos p ON (((p.orden_id = o.id) AND (p.estado = 'aprobado'::estado_pago))))
  GROUP BY cc.id, ca.nombre;
alter view vw_corte_resumen set (security_invoker = true);
