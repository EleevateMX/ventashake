-- El kiosko imprime el ticket de caja cuando el cliente lo pide (17/10/26).
--
-- La cola del ticket ya existe (configuracion_ticket_caja.sql,
-- encolar_ticket_y_corte_automaticos.sql): `fn_encolar_ticket_venta` arma el
-- payload y lo encola UNA vez por venta (idempotency_key = la orden). El
-- encolado automático en cada cobro nace apagado. Lo que pidió gerencia es
-- otra cosa: que en «¡Listo!» haya un botón para imprimirlo solo si el
-- cliente lo quiere, y que desde el historial se pueda reimprimir.
--
-- `fn_ticket_imprimir` hace las dos con una sola regla:
--   · si la venta nunca tuvo ticket → el de siempre (`fn_encolar_ticket_venta`);
--   · si ya lo tuvo → una COPIA del mismo payload (`copia_de`, `numero_copia`,
--     `reimpresion: true`), con llave nueva. Las mancuernas, el cajero y los
--     precios salen como se imprimieron la primera vez.
--   · si hay uno esperando en la cola, no se apila otro: dos toques al botón
--     no son dos tickets.
-- Abierta a `anon` porque el kiosko en modo cajero cobra como `anon`
-- (CLAUDE.md §2.2). Para que no sirva de cañón de papel: solo ventas pagadas,
-- no canceladas, de las últimas 48 horas, y máximo 5 copias por venta.

create or replace function public.fn_ticket_imprimir(p_orden_id uuid default null, p_folio integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_o record;
  v_printer uuid;
  v_orig trabajos_impresion;
  v_copias int;
begin
  select id, folio, pagado, estado::text as estado, created_at into v_o
    from ordenes
   where (p_orden_id is not null and id = p_orden_id)
      or (p_orden_id is null and p_folio is not null and folio = p_folio)
   order by created_at desc
   limit 1;
  if v_o.id is null then raise exception 'No encuentro esa venta.'; end if;
  if not v_o.pagado then raise exception 'Esa venta no está pagada: no lleva ticket.'; end if;
  if v_o.estado = 'cancelada' then raise exception 'Esa venta se canceló.'; end if;
  if v_o.created_at < now() - interval '48 hours' then
    raise exception 'Solo se imprimen tickets de las últimas 48 horas. Para uno anterior, Admin → Cortes → Tickets.';
  end if;

  v_printer := fn_impresora_caja();
  if v_printer is null then
    return jsonb_build_object('estado', 'sin_impresora', 'folio', v_o.folio);
  end if;

  -- Ya hay uno en camino: no se apila otro.
  if exists (select 1 from trabajos_impresion
              where orden_id = v_o.id and tipo_documento = 'ticket'
                and estado in ('pending', 'claimed', 'printing', 'retry')) then
    return jsonb_build_object('estado', 'ya_en_cola', 'folio', v_o.folio);
  end if;

  select * into v_orig from trabajos_impresion
   where idempotency_key = v_o.id and tipo_documento = 'ticket'
   limit 1;

  if v_orig.id is null then
    perform fn_encolar_ticket_venta(v_o.id);
    return jsonb_build_object('estado', 'en_cola', 'reimpresion', false, 'folio', v_o.folio);
  end if;

  select count(*) into v_copias from trabajos_impresion where copia_de = v_orig.id;
  if v_copias >= 5 then
    raise exception 'Ese ticket ya se reimprimió 5 veces.';
  end if;

  insert into trabajos_impresion (orden_id, printer_id, tipo_documento, payload,
                                  idempotency_key, copia_de, numero_copia)
  values (v_o.id, v_printer, 'ticket', v_orig.payload || jsonb_build_object('reimpresion', true),
          gen_random_uuid(), v_orig.id, v_copias + 2);

  return jsonb_build_object('estado', 'en_cola', 'reimpresion', true, 'folio', v_o.folio);
end;
$$;

-- El kiosko pregunta si hay impresora de caja y si el ticket ya sale solo,
-- para decidir qué botón pintar («Imprimir ticket» o «Reimprimir»). Sin
-- datos sensibles: dos banderas.
create or replace function public.fn_ticket_estado_caja()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'hay_impresora', fn_impresora_caja() is not null,
    'auto', coalesce((select imprimir_ticket_auto from configuracion_ticket where id = 'default'), false));
$$;
