-- Cierre diario consolidado e historial por periodo (pedido de Perla, 30/09).
--
-- Una sola funcion arma el dia completo: ventas por metodo, los cortes de
-- ese dia (fondo, esperado, contado, diferencia) y Clip tal como lo reporta
-- Clip, separado por terminal, contra lo que registro el POS. El cierre de
-- un dia y el historial de un mes son la MISMA funcion con distinto rango.
--
-- Se calcula en vivo, no se "consolida" en una tabla al cerrar: si manana
-- se cancela una venta de hoy o se corrige un corte, el historial se entera
-- solo. Una copia tomada al cierre se quedaria vieja sin que nadie lo note.
-- Lo unico que se guarda es lo que NO se puede calcular: las aclaraciones,
-- con quien y cuando (append-only, como el checador).
--
-- Criterio de ventas: el mismo que vw_ventas_diarias (pagos aprobados, sin
-- ordenes canceladas) y ademas sin ordenes de prueba (es_demo), igual que
-- los cortes. El fondo inicial NO es venta: vive solo en el lado del corte.

-- Que dias ya se bajaron de Clip, aunque no hayan tenido transacciones: un
-- dia sin transacciones de Clip es un dato, no un hueco.
create table if not exists clip_dias_bajados (
  dia          date primary key,
  bajado_en    timestamptz not null default now(),
  transacciones int not null default 0
);
alter table clip_dias_bajados enable row level security;
revoke all on clip_dias_bajados from public, anon, authenticated;

-- La conciliacion por dia (la llama la Edge Function clip-transacciones)
-- ahora tambien deja anotado que ese dia ya se bajo.
create or replace function public.fn_clip_conciliar_dia(p_dia date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t record; v_pago uuid;
begin
  update clip_transacciones set pago_id = null, terminal = 'chica' where dia = p_dia;

  for t in
    select * from clip_transacciones
     where dia = p_dia and coalesce(lower(status), 'paid') in ('paid', 'approved')
     order by creado_en
  loop
    v_pago := null;
    if nullif(trim(coalesce(t.merchant_invoice, '')), '') is not null then
      select p.id into v_pago
        from pagos p
       where p.metodo = 'clip' and p.estado = 'aprobado'
         and p.clip_payload->>'reference' = t.merchant_invoice
         and not exists (select 1 from clip_transacciones x where x.pago_id = p.id)
       limit 1;
    end if;
    if v_pago is null then
      select p.id into v_pago
        from pagos p
       where p.metodo = 'clip' and p.estado = 'aprobado'
         and p.monto = t.total
         and p.created_at between t.creado_en - interval '3 minutes' and t.creado_en + interval '3 minutes'
         and not exists (select 1 from clip_transacciones x where x.pago_id = p.id)
       order by abs(extract(epoch from (p.created_at - t.creado_en)))
       limit 1;
    end if;
    if v_pago is not null then
      update clip_transacciones set pago_id = v_pago, terminal = 'principal' where receipt_no = t.receipt_no;
    end if;
  end loop;

  insert into clip_dias_bajados (dia, bajado_en, transacciones)
  values (p_dia, now(), (select count(*) from clip_transacciones where dia = p_dia))
  on conflict (dia) do update set bajado_en = excluded.bajado_en, transacciones = excluded.transacciones;
end;
$function$;
revoke execute on function public.fn_clip_conciliar_dia(date) from public, anon, authenticated;

create table if not exists cierres_dia_notas (
  id          uuid primary key default gen_random_uuid(),
  dia         date not null,
  nota        text not null check (length(trim(nota)) > 0),
  creada_por  uuid references empleados(id),
  creada_en   timestamptz not null default now()
);
create index if not exists cierres_dia_notas_dia on cierres_dia_notas (dia);
alter table cierres_dia_notas enable row level security;
revoke all on cierres_dia_notas from public, anon, authenticated;

-- Nada se edita ni se borra: una aclaracion se corrige con otra.
create or replace function public.trg_cierres_notas_solo_se_agrega()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  raise exception 'Las aclaraciones del cierre no se editan ni se borran: agrega otra.';
end;
$function$;
revoke execute on function public.trg_cierres_notas_solo_se_agrega() from public, anon, authenticated;
drop trigger if exists trg_cierres_notas_solo_se_agrega on cierres_dia_notas;
create trigger trg_cierres_notas_solo_se_agrega
  before update or delete on cierres_dia_notas
  for each row execute function trg_cierres_notas_solo_se_agrega();

create or replace function public.fn_cierre_dias(p_desde date, p_hasta date)
returns table(
  dia date,
  ordenes int, venta_total numeric, ticket_promedio numeric,
  efectivo numeric, tarjeta numeric, clip numeric, cortesia numeric, otro numeric,
  cortes int, cortes_abiertos int,
  fondo_inicial numeric, efectivo_esperado numeric, efectivo_contado numeric, dif_efectivo numeric,
  clip_bajado boolean, clip_real numeric, tarjeta_real numeric,
  dif_clip numeric, dif_tarjeta numeric, dif_total numeric,
  estatus text, motivo text,
  notas int, ultima_nota text, ultima_nota_por text, ultima_nota_en timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as dia
  ),
  ventas as (
    select (o.created_at at time zone 'America/Merida')::date as dia,
           count(distinct o.id)::int as ordenes,
           coalesce(sum(p.monto), 0) as total,
           coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0) as efectivo,
           coalesce(sum(p.monto) filter (where p.metodo = 'tarjeta'),  0) as tarjeta,
           coalesce(sum(p.monto) filter (where p.metodo = 'clip'),     0) as clip,
           coalesce(sum(p.monto) filter (where p.metodo = 'cortesia'), 0) as cortesia,
           coalesce(sum(p.monto) filter (where p.metodo = 'otro'),     0) as otro
      from ordenes o
      join pagos p on p.orden_id = o.id and p.estado = 'aprobado'
     where o.estado <> 'cancelada' and not o.es_demo
       and (o.created_at at time zone 'America/Merida')::date between p_desde and p_hasta
     group by 1
  ),
  -- Un corte es del dia de SUS VENTAS (la fecha de su primera orden), no
  -- del dia en que se abrio: el turno de la manana se abre la NOCHE
  -- anterior, al cerrar el vespertino, con el fondo ya contado. Por fecha
  -- de apertura, el efectivo de la manana caia en el dia equivocado. Sin
  -- ventas, cuenta el dia en que cerro (o en que abrio, si sigue abierto).
  cortes_dia as (
    select r.*,
           coalesce(
             (select min(o.created_at) from ordenes o where o.corte_id = r.corte_id and not o.es_demo),
             r.cerrado_en, r.abierto_en) at time zone 'America/Merida' as momento
      from vw_corte_resumen r
     where r.abierto_en >= (p_desde - 3)::timestamp at time zone 'America/Merida'
       and r.abierto_en <  (p_hasta + 1)::timestamp at time zone 'America/Merida'
  ),
  cortes as (
    select r.momento::date as dia,
           count(*)::int as n,
           count(*) filter (where r.cerrado_en is null)::int as abiertos,
           coalesce(sum(r.fondo_inicial), 0) as fondo,
           coalesce(sum(r.efectivo_esperado), 0) as esperado,
           coalesce(sum(r.efectivo_contado) filter (where r.cerrado_en is not null), 0) as contado,
           coalesce(sum(r.diferencia) filter (where r.cerrado_en is not null), 0) as diferencia
      from cortes_dia r
     where r.momento::date between p_desde and p_hasta
     group by 1
  ),
  clipreal as (
    select t.dia,
           coalesce(sum(t.total) filter (where t.terminal = 'principal'), 0) as principal,
           coalesce(sum(t.total) filter (where t.terminal = 'chica'), 0) as chica
      from clip_transacciones t
     where t.dia between p_desde and p_hasta
       and coalesce(lower(t.status), 'paid') in ('paid', 'approved')
     group by t.dia
  ),
  -- Un dia se cuenta como "bajado de Clip" aunque ese dia no haya habido
  -- ninguna transaccion: basta con que alguien lo haya consultado.
  bajados as (
    select distinct b.dia from clip_dias_bajados b where b.dia between p_desde and p_hasta
  ),
  notas as (
    select n.dia, count(*)::int as n,
           (array_agg(n.nota order by n.creada_en desc))[1] as ultima,
           (array_agg(e.nombre order by n.creada_en desc))[1] as por,
           max(n.creada_en) as en
      from cierres_dia_notas n
      left join empleados e on e.id = n.creada_por
     where n.dia between p_desde and p_hasta
     group by n.dia
  ),
  junto as (
    select d.dia,
           coalesce(v.ordenes, 0) as ordenes, coalesce(v.total, 0) as total,
           coalesce(v.efectivo, 0) as efectivo, coalesce(v.tarjeta, 0) as tarjeta,
           coalesce(v.clip, 0) as clip, coalesce(v.cortesia, 0) as cortesia, coalesce(v.otro, 0) as otro,
           coalesce(c.n, 0) as cortes, coalesce(c.abiertos, 0) as abiertos,
           coalesce(c.fondo, 0) as fondo, coalesce(c.esperado, 0) as esperado,
           coalesce(c.contado, 0) as contado, coalesce(c.diferencia, 0) as dif_ef,
           (b.dia is not null) as bajado,
           cr.principal, cr.chica,
           nt.n as notas, nt.ultima, nt.por, nt.en
      from dias d
      left join ventas v on v.dia = d.dia
      left join cortes c on c.dia = d.dia
      left join clipreal cr on cr.dia = d.dia
      left join bajados b on b.dia = d.dia
      left join notas nt on nt.dia = d.dia
     where v.dia is not null or c.dia is not null
  )
  select j.dia, j.ordenes, j.total,
         case when j.ordenes > 0 then round(j.total / j.ordenes, 2) else 0 end,
         j.efectivo, j.tarjeta, j.clip, j.cortesia, j.otro,
         j.cortes, j.abiertos,
         j.fondo, j.esperado, j.contado, j.dif_ef,
         j.bajado,
         case when j.bajado then coalesce(j.principal, 0) end,
         case when j.bajado then coalesce(j.chica, 0) end,
         case when j.bajado then coalesce(j.principal, 0) - j.clip end,
         case when j.bajado then coalesce(j.chica, 0) - j.tarjeta end,
         j.dif_ef + case when j.bajado
                         then (coalesce(j.principal, 0) - j.clip) + (coalesce(j.chica, 0) - j.tarjeta)
                         else 0 end,
         case
           when j.dia >= (now() at time zone 'America/Merida')::date then 'pendiente'
           when j.abiertos > 0 then 'pendiente'
           when j.ordenes > 0 and j.cortes = 0 then 'pendiente'
           when not j.bajado and (j.tarjeta > 0 or j.clip > 0) then 'pendiente'
           when coalesce(j.notas, 0) > 0 then 'aclarado'
           when j.dif_ef = 0
                and (not j.bajado or (coalesce(j.principal, 0) = j.clip and coalesce(j.chica, 0) = j.tarjeta))
             then 'cuadrado'
           else 'con_diferencia'
         end,
         case
           when j.dia >= (now() at time zone 'America/Merida')::date then 'el dia no ha terminado'
           when j.abiertos > 0 then 'hay un turno sin cerrar'
           when j.ordenes > 0 and j.cortes = 0 then 'hubo ventas sin corte'
           when not j.bajado and (j.tarjeta > 0 or j.clip > 0) then 'falta bajar Clip'
         end,
         coalesce(j.notas, 0), j.ultima, j.por, j.en
    from junto j
   where fn_es_jefe()
   order by j.dia desc;
$function$;
revoke execute on function public.fn_cierre_dias(date, date) from public, anon;
grant execute on function public.fn_cierre_dias(date, date) to authenticated;

create or replace function public.fn_cierre_dia_notas(p_dia date)
returns table(id uuid, nota text, creada_por text, creada_en timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select n.id, n.nota, e.nombre, n.creada_en
    from cierres_dia_notas n
    left join empleados e on e.id = n.creada_por
   where fn_es_jefe() and n.dia = p_dia
   order by n.creada_en;
$function$;
revoke execute on function public.fn_cierre_dia_notas(date) from public, anon;
grant execute on function public.fn_cierre_dia_notas(date) to authenticated;

create or replace function public.fn_cierre_dia_aclarar(p_dia date, p_nota text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia aclara el cierre del dia.';
  end if;
  if nullif(trim(coalesce(p_nota, '')), '') is null then
    raise exception 'Escribe la aclaracion.';
  end if;
  insert into cierres_dia_notas (dia, nota, creada_por) values (p_dia, trim(p_nota), fn_empleado_actual());
end;
$function$;
revoke execute on function public.fn_cierre_dia_aclarar(date, text) from public, anon;
grant execute on function public.fn_cierre_dia_aclarar(date, text) to authenticated;
