-- La caja reconoce al cliente de Rewards por el servidor (29/10/26).
--
-- Adrián compró un lector de QR y «no funcionaba»: el lector sí escribía
-- `shk-c60014` y el cliente existe. El kiosko y el POS buscaban al cliente
-- leyendo la tabla `clientes` directo, y el 22/08 `seguridad_cierra_pii_anon`
-- le quitó esa lectura a la caja (datos personales) sin dejarle un reemplazo:
-- desde entonces la búsqueda contestaba «no existe» SIEMPRE, por código o por
-- teléfono. De 9 867 ventas desde el 22/08, ninguna quedó ligada a un cliente
-- y nadie sumó mancuernas en caja.
--
-- `fn_cliente_para_caja` busca por código exacto (SHK-…) o teléfono exacto
-- (10 dígitos) y devuelve SOLO lo que la caja usa: id, nombre, código,
-- teléfono enmascarado, mancuernas y cupones vigentes. Nada de correo.
-- Abierta a anon a propósito: el kiosko en modo cajero cobra como anon.
-- Freno: 30 búsquedas fallidas en 15 min y deja de contestar (intentos_pin,
-- origen 'cliente'), para que no sirva para adivinar teléfonos. El fallo se
-- CONTESTA, no se lanza: un raise desharía el intento registrado.

create or replace function public.fn_cliente_para_caja(p_texto text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_t text := upper(btrim(coalesce(p_texto, '')));
  v_m text[];
  v_tel text;
  c clientes;
begin
  if fn_pin_fallos_recientes('cliente') >= 30 then
    return jsonb_build_object('ok', false, 'error', 'Demasiadas búsquedas sin resultado. Espera unos minutos.');
  end if;

  v_m := regexp_match(v_t, '^SHK[^0-9A-Z]*([0-9A-Z]+)$');
  if v_m is not null then
    select * into c from clientes where codigo = 'SHK-' || v_m[1] and activo limit 1;
  else
    v_tel := regexp_replace(v_t, '[^0-9]', '', 'g');
    if length(v_tel) > 10 then v_tel := right(v_tel, 10); end if;
    if length(v_tel) <> 10 then
      return jsonb_build_object('ok', true, 'cliente', null);
    end if;
    select * into c from clientes where telefono = v_tel and activo order by created_at limit 1;
  end if;

  if c.id is null then
    perform fn_pin_registrar_intento('cliente', false);
    return jsonb_build_object('ok', true, 'cliente', null);
  end if;

  return jsonb_build_object('ok', true, 'cliente', jsonb_build_object(
    'id', c.id,
    'nombre', c.nombre,
    'codigo', c.codigo,
    'telefono', case when c.telefono is null then null else '••• ' || right(c.telefono, 4) end,
    'mancuernas', coalesce(c.mancuernas, 0),
    'saldo_mancuernas', coalesce(c.saldo_mancuernas, 0),
    'cupones', coalesce((
      select jsonb_agg(to_jsonb(cu) order by cu.vence_en)
        from cupones cu
       where cu.cliente_id = c.id and cu.estado = 'activo' and cu.vence_en >= now()), '[]'::jsonb)
  ));
end;
$function$;

grant execute on function public.fn_cliente_para_caja(text) to anon, authenticated;
