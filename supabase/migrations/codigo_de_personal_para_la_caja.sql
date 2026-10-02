-- =============================================================================
-- El beneficio de personal se cobra escaneando un código de la app, no solo
-- tecleando la clave (02/10/26).
--
-- La app (modo personal, con la sesión del PIN) pide un código SHKP-XXXXXXXX
-- que vive 2 minutos y se usa UNA vez. La cajera lo escanea en «Es para
-- personal» igual que un QR de cliente; el servidor lo cambia por el
-- empleado y aplica EXACTAMENTE el mismo cálculo de siempre
-- (fn_personal_calcular, límites por grupo, tope, turno checado).
--
-- Por qué un código y no la clave en el QR: la clave es secreta y
-- «personal e intransferible»; un QR en pantalla se fotografía en dos
-- segundos. Un código que caduca vale lo que vale un boleto: nada después.
--
-- Al escanearlo en la caja (fn_personal_identificar) el código se ANCLA a
-- esa venta: queda vivo 20 minutos más para que la captura y el cobro no
-- lo alcancen vencido. Al cobrar (fn_crear_orden_personal) se marca usado.
-- Cotizar no lo consume: se cotiza muchas veces en una venta.
--
-- fn_crear_orden NO se toca. La clave tecleada sigue funcionando igual.
-- =============================================================================

create table if not exists personal_codigos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references empleados(id),
  codigo text not null unique,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null,
  anclado_en timestamptz,
  usado_en timestamptz,
  orden_id uuid references ordenes(id)
);
create index if not exists personal_codigos_empleado_idx on personal_codigos (empleado_id, expira_en desc);
alter table personal_codigos enable row level security;
revoke all on personal_codigos from anon, authenticated, public;

-- Quién es: por código (SHKP-…) o por clave (bcrypt), en un solo lugar para
-- que identificar, cotizar y cobrar no se separen.
create or replace function public.fn_personal_empleado_por(p_clave text)
returns table(id uuid, nombre text, codigo_id uuid)
language plpgsql stable security definer set search_path to 'public', 'extensions'
as $$
begin
  if coalesce(p_clave, '') ~* '^\s*SHKP-' then
    return query
      select e.id, e.nombre, c.id
        from personal_codigos c
        join empleados e on e.id = c.empleado_id
       where c.codigo = upper(btrim(p_clave))
         and c.usado_en is null
         and c.expira_en > now()
         and e.activo and e.beneficio_personal
         and e.clave_personal_hash is not null
       limit 1;
  else
    return query
      select e.id, e.nombre, null::uuid
        from empleados e
       where e.activo and e.beneficio_personal
         and e.clave_personal_hash is not null
         and e.clave_personal_hash = crypt(p_clave, e.clave_personal_hash)
       order by e.created_at limit 1;
  end if;
end;
$$;
revoke execute on function public.fn_personal_empleado_por(text) from anon, authenticated, public;

create or replace function public.fn_personal_identificar(p_clave text)
returns table(empleado_id uuid, nombre text, motivo text, usado_shake integer, usado_alimento integer, usado_bebida integer, usado_importe numeric, tope numeric, max_shake integer, max_alimento integer, max_bebida integer)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v_emp record;
begin
  if fn_pin_fallos_recientes('personal') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  select * into v_emp from fn_personal_empleado_por(p_clave);

  if v_emp.id is null then
    perform fn_pin_registrar_intento('personal', false);
    if coalesce(p_clave, '') ~* '^\s*SHKP-' then
      raise exception 'Ese código ya se usó o venció: pide otro en la app.';
    end if;
    raise exception 'Esa clave no es de nadie.';
  end if;
  perform fn_pin_registrar_intento('personal', true);

  -- Escaneado en la caja: el código se ancla a esta venta y aguanta la
  -- captura y el cobro. Pedir otro en la app ya no lo mata.
  if v_emp.codigo_id is not null then
    update personal_codigos
       set anclado_en = coalesce(anclado_en, now()),
           expira_en = greatest(expira_en, now() + interval '20 minutes')
     where id = v_emp.codigo_id;
  end if;

  return query
    select v_emp.id, v_emp.nombre, fn_personal_puede(v_emp.id),
           r.usado_shake, r.usado_alimento, r.usado_bebida,
           r.usado_importe, r.tope, r.max_shake, r.max_alimento, r.max_bebida
      from fn_personal_restante(v_emp.id) r;
end;
$function$;

create or replace function public.fn_personal_cotizar(p_clave text, p_items jsonb)
returns table(nombre text, descuento numeric, motivo text)
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v_emp record; v_c record; v_r record; v_motivo text;
begin
  if fn_pin_fallos_recientes('personal') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  select * into v_emp from fn_personal_empleado_por(p_clave);

  if v_emp.id is null then
    perform fn_pin_registrar_intento('personal', false);
    if coalesce(p_clave, '') ~* '^\s*SHKP-' then
      raise exception 'Ese código ya se usó o venció: pide otro en la app.';
    end if;
    raise exception 'Esa clave no es de nadie.';
  end if;
  perform fn_pin_registrar_intento('personal', true);

  v_motivo := fn_personal_puede(v_emp.id);
  select * into v_c from fn_personal_calcular(v_emp.id, p_items);
  select * into v_r from fn_personal_restante(v_emp.id);

  if v_motivo is null then
    if v_c.descuento <= 0 then
      v_motivo := 'Nada de este pedido tiene precio de personal.';
    elsif fn_personal_exceso(v_emp.id, p_items) is not null then
      v_motivo := fn_personal_exceso(v_emp.id, p_items);
    elsif v_r.usado_importe + v_c.importe > v_r.tope then
      v_motivo := format('Pasa su tope de $%s. Hoy lleva $%s y esto suma $%s.',
        round(v_r.tope), round(v_r.usado_importe), round(v_c.importe));
    end if;
  end if;

  return query select v_emp.nombre,
                      case when v_motivo is null then v_c.descuento else 0::numeric end,
                      v_motivo;
end;
$function$;

create or replace function public.fn_crear_orden_personal(p_clave text, p_sucursal_id uuid, p_almacen_id uuid, p_canal canal_orden, p_items jsonb, p_corte_id uuid default null::uuid, p_empleado_id uuid default null::uuid, p_cliente_id uuid default null::uuid, p_es_demo boolean default false, p_nombre_cliente text default null::text, p_para_llevar boolean default null::boolean)
returns ordenes
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  v_emp record; v_motivo text; v_r record; v_c record;
  v_dia date; v_orden ordenes; v_item jsonb; v_p record; v_cant int;
begin
  if fn_pin_fallos_recientes('personal') >= 15 then
    raise exception 'Demasiados intentos. Espera unos minutos.';
  end if;

  select * into v_emp from fn_personal_empleado_por(p_clave);

  if v_emp.id is null then
    perform fn_pin_registrar_intento('personal', false);
    if coalesce(p_clave, '') ~* '^\s*SHKP-' then
      raise exception 'Ese código ya se usó o venció: pide otro en la app.';
    end if;
    raise exception 'Esa clave no es de nadie.';
  end if;
  perform fn_pin_registrar_intento('personal', true);

  v_motivo := fn_personal_puede(v_emp.id);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;

  select * into v_c from fn_personal_calcular(v_emp.id, p_items);
  select * into v_r from fn_personal_restante(v_emp.id);
  v_dia := (now() at time zone 'America/Merida')::date;

  if v_c.descuento <= 0 then
    raise exception 'Nada de este pedido tiene precio de personal.';
  end if;

  -- Los limites son POR GRUPO y no se sustituyen entre si: no pedir
  -- alimento no da derecho a un segundo shake.
  v_motivo := fn_personal_exceso(v_emp.id, p_items);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;
  if v_r.usado_importe + v_c.importe > v_r.tope then
    raise exception 'Pasa tu tope diario de $%. Hoy llevas $% y esto suma $%.',
      round(v_r.tope), round(v_r.usado_importe), round(v_c.importe);
  end if;

  v_orden := fn_crear_orden(
    p_sucursal_id, p_almacen_id, p_canal, p_items, p_corte_id, p_empleado_id,
    p_cliente_id, v_c.descuento, p_es_demo,
    coalesce(nullif(btrim(coalesce(p_nombre_cliente, '')), ''), v_emp.nombre),
    p_para_llevar
  );

  -- El código es de un solo uso: queda ligado a la orden que cobró.
  if v_emp.codigo_id is not null then
    update personal_codigos set usado_en = now(), orden_id = v_orden.id where id = v_emp.codigo_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    continue when coalesce(v_item->>'padre_linea', '') <> '';
    v_cant := greatest(coalesce((v_item->>'cantidad')::int, 1), 1);
    select id, nombre, precio, precio_personal, grupo_personal into v_p
      from productos where id = (v_item->>'producto_id')::uuid;
    if v_p.id is null or v_p.precio_personal is null or v_p.grupo_personal is null then
      continue;
    end if;
    insert into personal_consumos (
      empleado_id, orden_id, dia, grupo, producto_id, producto,
      cantidad, importe_personal, precio_publico
    ) values (
      v_emp.id, v_orden.id, v_dia, v_p.grupo_personal, v_p.id, v_p.nombre,
      v_cant, v_p.precio_personal * v_cant, v_p.precio * v_cant
    );
  end loop;

  return v_orden;
end;
$function$;

-- La app pide el código con la sesión del PIN. Uno vivo a la vez: pedir
-- otro vence el anterior, salvo el que la caja ya ancló a una venta.
create or replace function public.fn_personal_codigo_emitir()
returns table(codigo text, expira_en timestamptz, segundos integer)
language plpgsql security definer set search_path to 'public'
as $$
declare v_emp record; v_codigo text; v_exp timestamptz;
begin
  select e.id, e.beneficio_personal, (e.clave_personal_hash is not null) as tiene_clave
    into v_emp
    from empleados e
   where e.auth_user_id = auth.uid() and e.activo
   limit 1;
  if v_emp.id is null then
    raise exception 'Entra con tu PIN para pedir tu código.';
  end if;
  if not (v_emp.beneficio_personal and v_emp.tiene_clave) then
    raise exception 'Tu beneficio todavía no está activo. Pídele a gerencia que te dé tu clave.';
  end if;

  update personal_codigos
     set expira_en = now()
   where empleado_id = v_emp.id and usado_en is null and anclado_en is null and expira_en > now();

  v_codigo := 'SHKP-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8));
  v_exp := now() + interval '120 seconds';
  insert into personal_codigos (empleado_id, codigo, expira_en) values (v_emp.id, v_codigo, v_exp);

  return query select v_codigo, v_exp, 120;
end;
$$;
revoke execute on function public.fn_personal_codigo_emitir() from anon, public;
grant execute on function public.fn_personal_codigo_emitir() to authenticated;

-- Lo mío: cuánto llevo hoy, cuánto me queda y la lista de precios de
-- personal. Solo contesta al propio empleado (por su sesión), nunca a otro.
create or replace function public.fn_mi_personal()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_emp record; v_cfg record;
  v_hoy date := (now() at time zone 'America/Merida')::date;
  v_activo boolean;
begin
  select e.id, e.nombre, e.beneficio_personal, (e.clave_personal_hash is not null) as tiene_clave
    into v_emp
    from empleados e
   where e.auth_user_id = auth.uid() and e.activo
   limit 1;
  if v_emp.id is null then
    raise exception 'Entra con tu PIN.';
  end if;
  select * into v_cfg from personal_config where id = 'default';
  v_activo := v_emp.beneficio_personal and v_emp.tiene_clave;

  return jsonb_build_object(
    'nombre', v_emp.nombre,
    'beneficio', v_activo,
    'motivo', case when v_activo then fn_personal_puede(v_emp.id)
                   else 'Tu beneficio todavía no está activo. Pídele a gerencia que te dé tu clave.' end,
    'exige_turno', v_cfg.exige_turno,
    'tope', v_cfg.tope_diario,
    'usado_importe', coalesce((select sum(c.importe_personal) from personal_consumos c
                                where c.empleado_id = v_emp.id and c.dia = v_hoy), 0),
    'grupos', (select coalesce(jsonb_agg(jsonb_build_object(
                 'slug', g.slug, 'nombre', g.nombre, 'max', g.max_diario,
                 'usado', coalesce((select sum(c.cantidad) from personal_consumos c
                                     where c.empleado_id = v_emp.id and c.dia = v_hoy and c.grupo = g.slug), 0)
               ) order by g.orden, g.slug), '[]'::jsonb) from personal_grupos g),
    'hoy', (select coalesce(jsonb_agg(jsonb_build_object(
                 'producto', c.producto, 'cantidad', c.cantidad, 'importe', c.importe_personal,
                 'hora', to_char(c.created_at at time zone 'America/Merida', 'HH24:MI')
               ) order by c.created_at), '[]'::jsonb)
              from personal_consumos c where c.empleado_id = v_emp.id and c.dia = v_hoy),
    'precios', (select coalesce(jsonb_agg(jsonb_build_object(
                 'nombre', p.nombre, 'categoria', ca.nombre, 'precio', p.precio,
                 'precio_personal', p.precio_personal, 'grupo', p.grupo_personal
               ) order by ca.nombre nulls last, p.nombre), '[]'::jsonb)
                from productos p left join categorias ca on ca.id = p.categoria_id
               where p.activo and p.archivado_en is null and p.precio_personal is not null and not p.es_extra)
  );
end;
$$;
revoke execute on function public.fn_mi_personal() from anon, public;
grant execute on function public.fn_mi_personal() to authenticated;
