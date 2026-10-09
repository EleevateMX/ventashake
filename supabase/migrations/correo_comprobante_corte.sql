-- El comprobante del corte llega por correo a gerencia (09/10/26).
--
-- Gerencia escogió correo en vez de papel: la impresora de tickets de la
-- tienda no sirve, y un comprobante que depende de una impresora que falla
-- es un comprobante que un día no existe. El comprobante vive siempre en
-- Admin → Cortes; el correo es la copia que llega sola.
--
-- Mismo camino que los avisos push: aquí solo se ENCOLA (dentro de un
-- bloque que se traga cualquier error: un correo jamás tumba un corte), y
-- la Edge Function `correo-cola` es la única que habla con el servicio de
-- correo. Sin su llave (RESEND_API_KEY en los secrets) no manda nada y lo
-- dice en la cola.
--
-- Se encola:
--   * al CERRAR un corte (lo que entregó, retiró y dejó), y
--   * al ABRIR el siguiente si lo recibido no cuadra con lo que se dejó
--     (la incidencia de la entrega, que es lo que gerencia quiere saber).
--
-- Los correos de gerencia NO van en `parametros`: esa tabla la lee el
-- kiosko sin sesión, y una lista de correos no tiene por qué ser pública.

create table if not exists public.correos_cortes (
  correo text primary key check (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  activo boolean not null default true,
  agregado_por uuid references public.empleados(id),
  agregado_en timestamptz not null default now()
);
alter table public.correos_cortes enable row level security;
revoke all on table public.correos_cortes from anon, authenticated, public;

create table if not exists public.correos_cola (
  id bigserial primary key,
  tipo text not null check (tipo in ('corte_cerrado', 'entrega_con_diferencia', 'reenvio')),
  corte_id uuid not null references public.caja_cortes(id) on delete cascade,
  creado_en timestamptz not null default now(),
  proximo_intento timestamptz not null default now(),
  intentos int not null default 0,
  enviado_en timestamptz,
  para text[],
  error text,
  pedido_por uuid references public.empleados(id)
);
alter table public.correos_cola enable row level security;
revoke all on table public.correos_cola from anon, authenticated, public;
create index if not exists correos_cola_pendientes_idx on public.correos_cola (proximo_intento) where enviado_en is null;

-- Encolar, sin que nada pueda tumbar el corte.
create or replace function public.trg_corte_encolar_correo()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    if not exists (select 1 from correos_cortes where activo) then
      return new;
    end if;
    if tg_op = 'UPDATE' and new.estado = 'cerrada' and old.estado is distinct from 'cerrada' then
      insert into correos_cola (tipo, corte_id) values ('corte_cerrado', new.id);
    elsif tg_op = 'INSERT' and new.corte_anterior_id is not null and new.fondo_esperado is not null
          and new.fondo_inicial <> new.fondo_esperado then
      insert into correos_cola (tipo, corte_id) values ('entrega_con_diferencia', new.corte_anterior_id);
    end if;
  exception when others then
    raise warning 'No se pudo encolar el correo del corte %: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;
revoke all on function public.trg_corte_encolar_correo() from public, anon, authenticated;

create or replace trigger trg_corte_correo_cierre
  after update of estado on public.caja_cortes
  for each row execute function public.trg_corte_encolar_correo();

create or replace trigger trg_corte_correo_entrega
  after insert on public.caja_cortes
  for each row execute function public.trg_corte_encolar_correo();

-- Admin: la lista de correos, y cómo van los últimos envíos.
create or replace function public.fn_correos_cortes()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  return jsonb_build_object(
    'correos', coalesce((select jsonb_agg(correo order by correo) from correos_cortes where activo), '[]'::jsonb),
    'ultimos', coalesce((
      select jsonb_agg(x order by x.creado_en desc) from (
        select q.id, q.tipo, q.creado_en, q.enviado_en, q.intentos, q.error, c.folio
          from correos_cola q join caja_cortes c on c.id = q.corte_id
         order by q.creado_en desc limit 8
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;
revoke all on function public.fn_correos_cortes() from public, anon;
grant execute on function public.fn_correos_cortes() to authenticated;

create or replace function public.fn_correos_cortes_guardar(p_correos text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_emp uuid; v text; v_limpios text[];
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar quién recibe los cortes.';
  end if;
  v_emp := fn_empleado_actual();
  select coalesce(array_agg(distinct lower(trim(c))), '{}') into v_limpios
    from unnest(coalesce(p_correos, '{}')) c where trim(c) <> '';
  if array_length(v_limpios, 1) > 5 then
    raise exception 'Son demasiados correos (máximo 5).';
  end if;
  foreach v in array v_limpios loop
    if v !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception '«%» no parece un correo.', v;
    end if;
  end loop;
  update correos_cortes set activo = false where activo and not (correo = any (v_limpios));
  insert into correos_cortes (correo, activo, agregado_por)
  select x, true, v_emp from unnest(v_limpios) x
  on conflict (correo) do update set activo = true;
end;
$function$;
revoke all on function public.fn_correos_cortes_guardar(text[]) from public, anon;
grant execute on function public.fn_correos_cortes_guardar(text[]) to authenticated;

create or replace function public.fn_corte_reenviar_comprobante(p_corte_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia.';
  end if;
  if not exists (select 1 from correos_cortes where activo) then
    raise exception 'No hay correos registrados. Agrégalos arriba, en «Comprobantes por correo».';
  end if;
  if not exists (select 1 from caja_cortes where id = p_corte_id) then
    raise exception 'Ese corte no existe.';
  end if;
  insert into correos_cola (tipo, corte_id, pedido_por) values ('reenvio', p_corte_id, fn_empleado_actual());
end;
$function$;
revoke all on function public.fn_corte_reenviar_comprobante(uuid) from public, anon;
grant execute on function public.fn_corte_reenviar_comprobante(uuid) to authenticated;

-- Cada minuto, si hay algo que mandar, se despierta a la Edge Function.
-- La llave publicable es pública por diseño; la función no acepta
-- contenido ni devuelve datos: solo vacía la cola.
select cron.unschedule(jobid) from cron.job where jobname = 'correo-cola';
select cron.schedule(
  'correo-cola',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://api.shakeaholic.mx/functions/v1/correo-cola',
      headers := '{"Content-Type":"application/json","apikey":"sb_publishable_cMUhN7qNUY_AY-E4U1dCnw_fR_C9sOb","Authorization":"Bearer sb_publishable_cMUhN7qNUY_AY-E4U1dCnw_fR_C9sOb"}'::jsonb,
      body := '{}'::jsonb
    )
    where exists (select 1 from correos_cola where enviado_en is null and intentos < 6 and proximo_intento <= now());
  $cron$
);
