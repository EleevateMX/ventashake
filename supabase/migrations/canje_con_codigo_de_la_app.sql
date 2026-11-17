-- Canjear con código de la app (17/11/26, pedido de gerencia).
--
-- El QR de Rewards (SHK-…) es fijo: una captura de pantalla o el teléfono
-- de otra persona bastaban para gastarle sus mancuernas o su premio. El QR
-- fijo y el pase de Wallet siguen sirviendo para GANAR; para USAR, la caja
-- pide un código de 6 dígitos que la app muestra y cambia cada 30 s.
--
--   * rewards_ganancia.exigir_codigo_canje: nace APAGADO. Se prende en
--     Admin → Rewards cuando la app de iPhone con el código ya esté en la
--     tienda (antes, quien tenga la versión vieja no podría canjear).
--   * fn_canje_codigo_emitir(): el cliente con sesión pide su código (vive
--     45 s; pedir otro mata el anterior).
--   * fn_canje_codigo_validar(cliente, codigo): la caja (anon) lo valida y
--     deja un permiso de 20 min para ESE cliente. Un código equivocado se
--     CONTESTA ({ok:false}), no se lanza: un raise deshace el registro del
--     fallo y el freno nunca contaría (lección del cupón). 10 fallos en 15
--     min y se cierra.
--   * fn_canjear_mancuernas y fn_canjear_sellos exigen el permiso cuando el
--     interruptor está prendido (parche anclado, sin tocar lo demás).

alter table public.rewards_ganancia add column if not exists exigir_codigo_canje boolean not null default false;

create table if not exists public.rewards_codigos_canje (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  codigo text not null,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  usado_en timestamptz
);
create index if not exists rewards_codigos_canje_cliente on public.rewards_codigos_canje (cliente_id, creado_en desc);
alter table public.rewards_codigos_canje enable row level security;

create table if not exists public.rewards_canje_permisos (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  valido_hasta timestamptz not null,
  otorgado_en timestamptz not null default now()
);
alter table public.rewards_canje_permisos enable row level security;

create table if not exists public.rewards_canje_fallos (
  id bigserial primary key,
  cliente_id uuid not null,
  en timestamptz not null default now()
);
create index if not exists rewards_canje_fallos_cliente on public.rewards_canje_fallos (cliente_id, en desc);
alter table public.rewards_canje_fallos enable row level security;

create or replace function public.fn_canje_exige_codigo()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce((select exigir_codigo_canje from rewards_ganancia where id = 1), false);
$function$;

create or replace function public.fn_canje_codigo_emitir()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cliente uuid; v_codigo text; v_expira timestamptz := now() + interval '45 seconds';
begin
  select id into v_cliente from clientes where auth_user_id = auth.uid() limit 1;
  if v_cliente is null then raise exception 'Entra a tu cuenta para canjear'; end if;
  update rewards_codigos_canje set expira_en = now()
   where cliente_id = v_cliente and usado_en is null and expira_en > now();
  v_codigo := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into rewards_codigos_canje (cliente_id, codigo, expira_en) values (v_cliente, v_codigo, v_expira);
  delete from rewards_codigos_canje where cliente_id = v_cliente and creado_en < now() - interval '1 day';
  return jsonb_build_object('codigo', v_codigo, 'qr', 'SHKR-' || v_codigo, 'expira_en', v_expira, 'segundos', 30);
end;
$function$;

create or replace function public.fn_canje_codigo_validar(p_cliente_id uuid, p_codigo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_digitos text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'); v_id uuid; v_hasta timestamptz := now() + interval '20 minutes';
begin
  if p_cliente_id is null then
    return jsonb_build_object('ok', false, 'error', 'Primero identifica al cliente.');
  end if;
  if (select count(*) from rewards_canje_fallos f where f.cliente_id = p_cliente_id and f.en > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera unos minutos.');
  end if;
  v_digitos := right(v_digitos, 6);
  select c.id into v_id from rewards_codigos_canje c
   where c.cliente_id = p_cliente_id and c.codigo = v_digitos and c.usado_en is null and c.expira_en > now()
   order by c.creado_en desc limit 1;
  if v_id is null then
    insert into rewards_canje_fallos (cliente_id) values (p_cliente_id);
    return jsonb_build_object('ok', false, 'error', 'Ese código no sirve o ya cambió. Pide al cliente el que tiene ahora en su app.');
  end if;
  update rewards_codigos_canje set usado_en = now() where id = v_id;
  insert into rewards_canje_permisos (cliente_id, valido_hasta) values (p_cliente_id, v_hasta)
    on conflict (cliente_id) do update set valido_hasta = excluded.valido_hasta, otorgado_en = now();
  return jsonb_build_object('ok', true, 'valido_hasta', v_hasta);
end;
$function$;
grant execute on function public.fn_canje_codigo_validar(uuid, text) to anon, authenticated;

create or replace function public.fn_canje_codigo_config(p_exigir boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar cómo se canjea';
  end if;
  update rewards_ganancia set exigir_codigo_canje = coalesce(p_exigir, false), actualizado_en = now() where id = 1;
  return fn_rewards_reglas();
end;
$function$;

do $$
declare v text; a text; f text;
begin
  -- Las reglas públicas dicen si se pide el código.
  select pg_get_functiondef('public.fn_rewards_reglas()'::regprocedure) into v;
  a := '    ''tope_por_orden'', coalesce(g.tope_por_orden, 100),';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla fn_rewards_reglas'; end if;
  execute replace(v, a, a || $p$
    'exigir_codigo_canje', coalesce(g.exigir_codigo_canje, false),$p$);

  -- La app del cliente sabe si tiene que enseñar el botón de canje.
  select pg_get_functiondef('public.fn_mi_resumen_lealtad()'::regprocedure) into v;
  a := '    ''paquetes'', (';
  if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla resumen'; end if;
  execute replace(v, a, $p$    'canje_con_codigo', fn_canje_exige_codigo(),

$p$ || a);

  -- El candado en los dos canjes.
  a := '  -- entera. Vuelve cuando el kiosko sostenga su sesion.' || chr(10);
  foreach f in array array['public.fn_canjear_mancuernas(uuid,integer)', 'public.fn_canjear_sellos(uuid,text,uuid)'] loop
    select pg_get_functiondef(f::regprocedure) into v;
    if (length(v) - length(replace(v, a, ''))) / length(a) <> 1 then raise exception 'ancla %', f; end if;
    execute replace(v, a, a || $p$
  if fn_canje_exige_codigo() and not exists (
       select 1 from rewards_canje_permisos cp
        where cp.cliente_id = v_cliente.id and cp.valido_hasta > now()) then
    raise exception using
      message = 'Para usar mancuernas o el premio, pide al cliente el código de canje de su app.',
      hint = 'requiere_codigo_canje';
  end if;
$p$);
  end loop;
end $$;
