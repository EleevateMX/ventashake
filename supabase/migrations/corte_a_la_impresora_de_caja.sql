-- El comprobante de corte se manda a la impresora de caja desde Admin
-- (18/10/26).
--
-- Admin → Comprobantes → «Imprimir en ticket (80 mm)» abría el diálogo de
-- impresión del navegador: imprimía en la impresora de la computadora de
-- quien estuviera viendo Admin, no en la de la caja. Ahora lo encola para
-- «Caja — Tickets», la misma que imprime los tickets, y el agente de caja lo
-- saca.
--
-- `fn_encolar_corte_caja` usa el corte como llave de idempotencia: solo
-- imprime UNA vez (es la del cierre automático). Ésta, como
-- `fn_ticket_imprimir`, manda la primera si nunca salió y si no una copia
-- marcada `reimpresion`, sin apilar si ya hay una en cola. Tope: 10 copias.
-- Solo gerencia (Admin). También dice si el agente de caja está en línea,
-- para que la pantalla no prometa un papel que no va a salir.

set lock_timeout = '3s';

create or replace function public.fn_corte_imprimir_caja(p_corte_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_c record;
  v_printer uuid;
  v_orig trabajos_impresion;
  v_copias int;
  v_en_linea boolean;
begin
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede mandar a imprimir un corte.';
  end if;

  select id, folio, cerrado_en into v_c from caja_cortes where id = p_corte_id;
  if v_c.id is null then raise exception 'No encuentro ese corte.'; end if;
  if v_c.cerrado_en is null then raise exception 'Ese corte sigue abierto: se imprime al cerrarlo.'; end if;

  v_printer := fn_impresora_caja();
  if v_printer is null then
    return jsonb_build_object('estado', 'sin_impresora', 'folio', v_c.folio);
  end if;
  select coalesce(ultima_conexion > now() - interval '2 minutes', false)
    into v_en_linea from impresoras where id = v_printer;

  select * into v_orig from trabajos_impresion
   where idempotency_key = p_corte_id and tipo_documento = 'corte'
   limit 1;

  if exists (select 1 from trabajos_impresion
              where tipo_documento = 'corte'
                and (id = v_orig.id or copia_de = v_orig.id)
                and estado in ('pending', 'claimed', 'printing', 'retry')) then
    return jsonb_build_object('estado', 'ya_en_cola', 'folio', v_c.folio, 'agente_en_linea', v_en_linea);
  end if;

  if v_orig.id is null then
    perform fn_encolar_corte_caja(p_corte_id);
    return jsonb_build_object('estado', 'en_cola', 'reimpresion', false, 'folio', v_c.folio, 'agente_en_linea', v_en_linea);
  end if;

  select count(*) into v_copias from trabajos_impresion where copia_de = v_orig.id;
  if v_copias >= 10 then
    raise exception 'Ese corte ya se reimprimió 10 veces.';
  end if;

  insert into trabajos_impresion (printer_id, tipo_documento, payload, idempotency_key, copia_de, numero_copia)
  values (v_printer, 'corte', v_orig.payload || jsonb_build_object('reimpresion', true),
          gen_random_uuid(), v_orig.id, v_copias + 2);

  return jsonb_build_object('estado', 'en_cola', 'reimpresion', true, 'folio', v_c.folio, 'agente_en_linea', v_en_linea);
end;
$$;
