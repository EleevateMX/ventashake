-- Admin → Comprobantes (09/10/26): todos los comprobantes de corte en un
-- rango de fechas, con quién entregó y quién recibió, para buscarlos sin
-- abrir corte por corte. Solo gerencia.
--
-- Una sola consulta en el servidor y no tres en la pantalla: «quién recibe»
-- es quien abrió el corte SIGUIENTE (corte_anterior_id), y ese cruce es el
-- mismo que hace fn_corte_comprobante. El rango está topado a un año para
-- que nunca se acerque al corte de 1,000 filas de PostgREST (~3 cortes al
-- día son ~1,100 al año).

create or replace function public.fn_comprobantes_cortes(p_desde date, p_hasta date)
 returns table (
   corte_id uuid, folio bigint, caja text, abierto_en timestamptz, cerrado_en timestamptz,
   entrega text, recibe text, num_ordenes bigint, ventas_efectivo numeric,
   efectivo_contado numeric, diferencia numeric, retiro numeric, fondo_dejado numeric,
   reposicion numeric, recibido_contado numeric, recibido_diferencia numeric, recibido_notas text
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no tiene sentido.';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'Escoge un rango de un año o menos.';
  end if;
  return query
  select c.id, c.folio, r.caja::text, c.abierto_en, c.cerrado_en,
         ec.nombre::text, er.nombre::text, r.num_ordenes, r.total_efectivo,
         c.efectivo_contado, r.diferencia, c.retiro, c.fondo_dejado, c.reposicion,
         s.fondo_inicial,
         case when s.fondo_esperado is null then null else s.fondo_inicial - s.fondo_esperado end,
         s.notas_apertura
    from caja_cortes c
    join vw_corte_resumen r on r.corte_id = c.id
    left join empleados ec on ec.id = c.empleado_cierre_id
    left join lateral (
      select x.* from caja_cortes x where x.corte_anterior_id = c.id order by x.abierto_en limit 1
    ) s on true
    left join empleados er on er.id = s.empleado_apertura_id
   where c.estado = 'cerrada'
     and (c.cerrado_en at time zone 'America/Merida')::date between p_desde and p_hasta
   order by c.cerrado_en desc;
end;
$function$;

revoke all on function public.fn_comprobantes_cortes(date, date) from public, anon;
grant execute on function public.fn_comprobantes_cortes(date, date) to authenticated;

-- Historial: cada corte apunta al que se cerró justo antes en su caja, para
-- que el comprobante diga quién recibió también en los cortes viejos. Solo
-- es el enlace; el fondo esperado de los viejos se queda en null (ese día
-- nadie dejó un fondo registrado y no se inventa). Aplicado aparte como
-- `comprobantes_enlazar_historial`: 127 de 128 enlazados, ninguno repetido.
with enlace as (
  select c.id,
         (select p.id from caja_cortes p
           where p.caja_id = c.caja_id and p.estado = 'cerrada' and p.id <> c.id
             and p.cerrado_en <= c.abierto_en
           order by p.cerrado_en desc limit 1) as anterior
    from caja_cortes c
   where c.corte_anterior_id is null
)
update caja_cortes c
   set corte_anterior_id = e.anterior
  from enlace e
 where e.id = c.id and e.anterior is not null and c.corte_anterior_id is null;
