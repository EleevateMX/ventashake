-- Conciliacion de Clip por terminal (pedido de Perla, 30/09).
--
-- La terminal principal esta integrada: sus cobros entran como metodo
-- 'clip' y ya vienen confirmados por la API. La terminal CHICA no: se cobra
-- alla y en el POS se registra a mano con "Tarjeta". Para comprobar que ese
-- "Tarjeta" coincide con lo cobrado de verdad, se baja la lista de
-- transacciones de Clip del dia (API de Transacciones, GET /payments) y se
-- separa:
--
--   - la que empata con un pago integrado nuestro  -> terminal principal
--   - la que no empata con nada                    -> terminal chica
--
-- Empatar primero por referencia ("Folio-6577", la que mandamos a la
-- terminal) si Clip la devuelve; si no, por mismo monto a +/- 3 minutos.
-- Asi no hace falta que la API diga el numero de serie (no lo documenta).
--
-- La tabla guarda la transaccion tal como la reporta Clip (`raw`), sin
-- datos completos de tarjeta: Clip solo da los ultimos 4 digitos.

create table if not exists clip_transacciones (
  receipt_no       text primary key,
  creado_en        timestamptz not null,
  dia              date not null,
  total            numeric not null,
  status           text,
  metodo           text,
  last4            text,
  merchant_invoice text,
  raw              jsonb not null,
  pago_id          uuid references pagos(id) on delete set null,
  terminal         text not null default 'chica' check (terminal in ('principal', 'chica')),
  bajada_en        timestamptz not null default now()
);
create index if not exists clip_transacciones_dia on clip_transacciones (dia);
alter table clip_transacciones enable row level security;
revoke all on clip_transacciones from public, anon, authenticated;

-- Empata las transacciones de un dia con los pagos integrados. Idempotente:
-- se puede correr cuantas veces se quiera (se vuelve a bajar el dia y se
-- reempata desde cero).
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
    -- 1) Por referencia, si Clip la devuelve.
    if nullif(trim(coalesce(t.merchant_invoice, '')), '') is not null then
      select p.id into v_pago
        from pagos p
       where p.metodo = 'clip' and p.estado = 'aprobado'
         and p.clip_payload->>'reference' = t.merchant_invoice
         and not exists (select 1 from clip_transacciones x where x.pago_id = p.id)
       limit 1;
    end if;
    -- 2) Por monto y hora: el pago integrado sin pareja mas cercano.
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
end;
$function$;
revoke execute on function public.fn_clip_conciliar_dia(date) from public, anon, authenticated;

-- Lo que ve gerencia: por dia, lo de Clip separado por terminal contra lo
-- que registro el POS.
create or replace function public.fn_clip_conciliacion(p_desde date, p_hasta date)
returns table(
  dia date,
  bajado boolean,
  clip_principal_real numeric, clip_pos numeric,
  tarjeta_chica_real numeric, tarjeta_pos numeric,
  transacciones int, sin_pareja int
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as dia
  ),
  real as (
    select t.dia,
           sum(t.total) filter (where t.terminal = 'principal') as principal,
           sum(t.total) filter (where t.terminal = 'chica')     as chica,
           count(*)::int as n,
           count(*) filter (where t.terminal = 'chica')::int as chicas
      from clip_transacciones t
     where t.dia between p_desde and p_hasta
       and coalesce(lower(t.status), 'paid') in ('paid', 'approved')
     group by t.dia
  ),
  pos as (
    select (o.created_at at time zone 'America/Merida')::date as dia,
           sum(p.monto) filter (where p.metodo = 'clip')    as clip,
           sum(p.monto) filter (where p.metodo = 'tarjeta') as tarjeta
      from ordenes o
      join pagos p on p.orden_id = o.id and p.estado = 'aprobado'
     where not o.es_demo
       and (o.created_at at time zone 'America/Merida')::date between p_desde and p_hasta
     group by 1
  )
  select d.dia,
         r.dia is not null,
         coalesce(r.principal, 0), coalesce(pos.clip, 0),
         coalesce(r.chica, 0), coalesce(pos.tarjeta, 0),
         coalesce(r.n, 0), coalesce(r.chicas, 0)
    from dias d
    left join real r on r.dia = d.dia
    left join pos on pos.dia = d.dia
   where fn_es_jefe()
   order by d.dia desc;
$function$;
revoke execute on function public.fn_clip_conciliacion(date, date) from public, anon;
grant execute on function public.fn_clip_conciliacion(date, date) to authenticated;

-- El detalle de un dia: cada transaccion de Clip y con que pago empato.
create or replace function public.fn_clip_transacciones_dia(p_dia date)
returns table(receipt_no text, hora text, total numeric, status text, metodo text,
              last4 text, terminal text, folio int, referencia text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.receipt_no,
         to_char(t.creado_en at time zone 'America/Merida', 'HH24:MI'),
         t.total, t.status, t.metodo, t.last4, t.terminal,
         o.folio, t.merchant_invoice
    from clip_transacciones t
    left join pagos p on p.id = t.pago_id
    left join ordenes o on o.id = p.orden_id
   where fn_es_jefe() and t.dia = p_dia
   order by t.creado_en;
$function$;
revoke execute on function public.fn_clip_transacciones_dia(date) from public, anon;
grant execute on function public.fn_clip_transacciones_dia(date) to authenticated;
