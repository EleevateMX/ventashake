-- El ticket de caja se edita desde Admin, y solo gerencia (18/10/26).
--
-- Las funciones que cambian el ticket (`configuracion_ticket`, `logos_ticket`)
-- las dejó otra sesión como SECURITY DEFINER **sin candado**: con la llave
-- pública cualquiera podía cambiar el QR de Rewards por un enlace suyo, el
-- WiFi o la dirección, o borrar el logo. Nadie las llama sin sesión (el
-- agente de caja solo LEE las tablas), así que se cierran con `fn_es_jefe()`.
-- Misma firma: se reemplazan, no se duplican.
--
-- De paso `fn_actualizar_configuracion_ticket`:
--   · deja VACIAR un texto (antes `coalesce` lo hacía imposible: el RFC o el
--     teléfono no se podían quitar). Llave presente y vacía = se borra;
--     llave ausente = no se toca.
--   · acepta `logo_activo`, `imprimir_ticket_auto` e `imprimir_corte_auto`,
--     que existían en la tabla y no había forma de cambiar.

set lock_timeout = '3s';

create or replace function public.fn_actualizar_configuracion_ticket(p_cambios jsonb)
returns configuracion_ticket
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_fila public.configuracion_ticket;
  -- texto: llave presente → su valor (vacío = null); ausente → lo de antes
  c jsonb := coalesce(p_cambios, '{}'::jsonb);
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar el ticket.';
  end if;
  if c ? 'nombre_negocio' and nullif(btrim(c->>'nombre_negocio'), '') is null then
    raise exception 'El ticket necesita el nombre del negocio.';
  end if;
  if c ? 'copias' and coalesce((c->>'copias')::int, 0) not between 1 and 3 then
    raise exception 'Copias: de 1 a 3.';
  end if;
  if c ? 'wifi_seguridad' and coalesce(c->>'wifi_seguridad', '') not in ('WPA', 'WEP', 'nopass') then
    raise exception 'Seguridad del WiFi: WPA, WEP o sin contraseña.';
  end if;

  update public.configuracion_ticket t set
    nombre_negocio      = case when c ? 'nombre_negocio' then btrim(c->>'nombre_negocio') else t.nombre_negocio end,
    linea_sucursal      = case when c ? 'linea_sucursal' then nullif(btrim(c->>'linea_sucursal'), '') else t.linea_sucursal end,
    direccion           = case when c ? 'direccion' then nullif(btrim(c->>'direccion'), '') else t.direccion end,
    rfc                 = case when c ? 'rfc' then upper(nullif(btrim(c->>'rfc'), '')) else t.rfc end,
    telefono            = case when c ? 'telefono' then nullif(btrim(c->>'telefono'), '') else t.telefono end,
    mensaje_pie         = case when c ? 'mensaje_pie' then nullif(btrim(c->>'mensaje_pie'), '') else t.mensaje_pie end,
    redes               = case when c ? 'redes' then nullif(btrim(c->>'redes'), '') else t.redes end,

    wifi_activo         = coalesce((c->>'wifi_activo')::boolean, t.wifi_activo),
    wifi_titulo         = case when c ? 'wifi_titulo' then nullif(btrim(c->>'wifi_titulo'), '') else t.wifi_titulo end,
    wifi_mensaje        = case when c ? 'wifi_mensaje' then nullif(btrim(c->>'wifi_mensaje'), '') else t.wifi_mensaje end,
    wifi_ssid           = case when c ? 'wifi_ssid' then nullif(btrim(c->>'wifi_ssid'), '') else t.wifi_ssid end,
    wifi_seguridad      = coalesce(c->>'wifi_seguridad', t.wifi_seguridad),
    wifi_password       = case when c ? 'wifi_password' then nullif(c->>'wifi_password', '') else t.wifi_password end,
    wifi_oculta         = coalesce((c->>'wifi_oculta')::boolean, t.wifi_oculta),

    rewards_activo      = coalesce((c->>'rewards_activo')::boolean, t.rewards_activo),
    rewards_titulo      = case when c ? 'rewards_titulo' then nullif(btrim(c->>'rewards_titulo'), '') else t.rewards_titulo end,
    rewards_mensaje     = case when c ? 'rewards_mensaje' then nullif(btrim(c->>'rewards_mensaje'), '') else t.rewards_mensaje end,
    rewards_url_ios     = case when c ? 'rewards_url_ios' then nullif(btrim(c->>'rewards_url_ios'), '') else t.rewards_url_ios end,
    rewards_url_android = case when c ? 'rewards_url_android' then nullif(btrim(c->>'rewards_url_android'), '') else t.rewards_url_android end,

    mostrar_iva          = coalesce((c->>'mostrar_iva')::boolean, t.mostrar_iva),
    mostrar_mancuernas   = coalesce((c->>'mostrar_mancuernas')::boolean, t.mostrar_mancuernas),
    mostrar_cajero       = coalesce((c->>'mostrar_cajero')::boolean, t.mostrar_cajero),
    copias               = coalesce((c->>'copias')::integer, t.copias),
    logo_activo          = coalesce((c->>'logo_activo')::boolean, t.logo_activo),
    imprimir_ticket_auto = coalesce((c->>'imprimir_ticket_auto')::boolean, t.imprimir_ticket_auto),
    imprimir_corte_auto  = coalesce((c->>'imprimir_corte_auto')::boolean, t.imprimir_corte_auto),
    updated_at           = now()
  where t.id = 'default'
  returning * into v_fila;

  if not found then
    raise exception 'No existe la configuracion de ticket';
  end if;
  return v_fila;
end;
$$;

create or replace function public.fn_logo_ticket_guardar(p_nombre text, p_bitmap text, p_ancho integer, p_alto integer, p_original text default null, p_umbral integer default 170, p_activar boolean default true)
returns logos_ticket
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v public.logos_ticket;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar el logo del ticket.';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El logo necesita un nombre.';
  end if;
  -- 576 puntos es el ancho de un ticket de 80 mm; el ancho va en múltiplos
  -- de 8 porque cada byte del raster son 8 puntos.
  if p_ancho is null or p_ancho < 8 or p_ancho > 576 or p_ancho % 8 <> 0 then
    raise exception 'Ancho del logo: de 8 a 576 puntos, en múltiplos de 8.';
  end if;
  if p_alto is null or p_alto < 1 or p_alto > 1200 then
    raise exception 'Alto del logo: de 1 a 1200 puntos.';
  end if;
  if length(p_bitmap) > 200000 or length(coalesce(p_original, '')) > 700000 then
    raise exception 'El logo es demasiado grande.';
  end if;
  -- El raster tiene que cuadrar con sus medidas: si no, la impresora lee
  -- bytes de más o de menos y saca basura a media hoja.
  if length(decode(p_bitmap, 'base64')) <> (p_ancho / 8) * p_alto then
    raise exception 'El logo no cuadra con sus medidas.';
  end if;

  insert into public.logos_ticket (nombre, bitmap, ancho, alto, original, umbral)
  values (btrim(p_nombre), p_bitmap, p_ancho, p_alto, p_original, coalesce(p_umbral, 170))
  returning * into v;

  if p_activar then
    update public.configuracion_ticket set logo_id = v.id, logo_activo = true, updated_at = now() where id = 'default';
  end if;
  return v;
end;
$$;

create or replace function public.fn_logo_ticket_activar(p_logo_id uuid)
returns configuracion_ticket
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v public.configuracion_ticket;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede cambiar el logo del ticket.';
  end if;
  if p_logo_id is not null and not exists (select 1 from public.logos_ticket where id = p_logo_id) then
    raise exception 'Ese logo no existe.';
  end if;
  update public.configuracion_ticket
     set logo_id = p_logo_id, updated_at = now()
   where id = 'default'
  returning * into v;
  return v;
end;
$$;

create or replace function public.fn_logo_ticket_borrar(p_logo_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede borrar un logo del ticket.';
  end if;
  -- La FK es ON DELETE SET NULL: borrar el activo deja el ticket sin logo.
  delete from public.logos_ticket where id = p_logo_id;
end;
$$;
