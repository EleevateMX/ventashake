-- Gerencia puede mandarle una venta apartada al kiosko, lista para cobrar.
--
-- Lo que NO hace, y es la decision de siempre: la apartada **no se mueve a
-- la base**. Sigue viviendo en el navegador del kiosko que la aparto.
-- Meterla a `ordenes` seria una orden a medio crear que la reconciliacion
-- tendria que distinguir de una venta perdida, y el dinero se toma en la
-- barra de todos modos -el efectivo entra al cajon y la terminal Clip esta
-- ahi-. Asi que esto no cobra nada: le pone la cuenta al cajero enfrente.
--
-- Lo que viaja es un timbre, igual que "recargar pantallas": el nombre de
-- la pantalla y **cual** apartada. El kiosko que tenga esa venta en su
-- navegador la retoma; los demas no encuentran nada y la ignoran solos.
-- Por eso no hace falta apuntarle a una pestana en concreto.
alter table senales_pantallas
  add column if not exists dato text;

comment on column senales_pantallas.dato is
  'Carga util de la senal. En "retomar", la referencia local de la venta apartada.';

create or replace function public.fn_pantallas_retomar_espera(p_venta_ref text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_ref text := nullif(btrim(coalesce(p_venta_ref, '')), '');
begin
  -- Mismo candado que fn_pantallas_recargar: esto lo toca gerencia desde
  -- Admin, y mueve la pantalla que el cajero tiene enfrente.
  if not coalesce(fn_es_jefe(), false) then
    raise exception 'Solo gerencia puede mandar una venta al kiosko';
  end if;
  if v_ref is null then
    raise exception 'Falta decir cual venta apartada.';
  end if;

  insert into senales_pantallas (pantalla, accion, dato)
  values ('kiosko', 'retomar', left(v_ref, 64));

  -- La tabla es un timbre, no una bitacora: se barre sola.
  delete from senales_pantallas where creado_en < now() - interval '1 day';
end;
$function$;

revoke execute on function public.fn_pantallas_retomar_espera(text) from anon;

-- El vistazo tiene que decir CUAL es cada apartada para poder senalarla.
--
-- `ref` es el identificador local del navegador, no un folio ni un id de
-- producto: no dice nada del cliente ni del pedido, y sin el no hay forma
-- de apuntarle a una venta en concreto (por posicion seria fragil: la
-- lista cambia entre que se publica y que alguien toca el boton).
create or replace function public.fn_espera_publicar(
  p_pantalla text,
  p_cuantas integer,
  p_total numeric,
  p_etiquetas jsonb default '[]'::jsonb,
  p_ventas jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_etiquetas jsonb; v_ventas jsonb;
begin
  if coalesce(btrim(p_pantalla), '') = '' then
    raise exception 'Falta decir que pantalla es.';
  end if;

  select coalesce(jsonb_agg(left(e, 60)), '[]'::jsonb) into v_etiquetas
  from (
    select jsonb_array_elements_text(coalesce(p_etiquetas, '[]'::jsonb)) e
    limit 12
  ) t;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_ventas
  from (
    select jsonb_build_object(
             'etiqueta', left(coalesce(v->>'etiqueta', 'Venta'), 60),
             'total', greatest(0, coalesce((v->>'total')::numeric, 0)),
             'hora', left(coalesce(v->>'hora', ''), 5),
             'ref', left(coalesce(v->>'ref', ''), 64),
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'n', left(coalesce(i->>'n', '?'), 60),
                        'c', greatest(1, coalesce((i->>'c')::int, 1)),
                        'h', left(coalesce(i->>'h', ''), 5)))
               from (
                 select jsonb_array_elements(coalesce(v->'items', '[]'::jsonb)) i
                 limit 20
               ) s
             ), '[]'::jsonb)
           ) x
    from (
      select jsonb_array_elements(coalesce(p_ventas, '[]'::jsonb)) v
      limit 12
    ) t
  ) y;

  insert into ventas_en_espera_vistazo
    (pantalla, cuantas, total, etiquetas, ventas, actualizado_en)
  values (left(btrim(p_pantalla), 40), greatest(0, coalesce(p_cuantas, 0)),
          greatest(0, coalesce(p_total, 0)), v_etiquetas, v_ventas, now())
  on conflict (pantalla) do update set
    cuantas = excluded.cuantas,
    total = excluded.total,
    etiquetas = excluded.etiquetas,
    ventas = excluded.ventas,
    actualizado_en = now();
end;
$function$;

-- ---------------------------------------------------------------------
-- `revoke ... from anon` NO le quita el permiso a PUBLIC.
--
-- Es el espejo de la trampa que ya estaba documentada al reves. Las dos
-- funciones que nacieron hoy llevaban el revoke a `anon` y aun asi `anon`
-- las podia ejecutar: heredaba el EXECUTE de PUBLIC. Comprobado por HTTP
-- con la llave publicable: contestaba el mensaje del candado interno
-- ("Solo gerencia puede...") en vez de "permission denied". Las salvo el
-- candado, que es defensa de verdad, pero no era lo que yo habia dicho.
--
-- Y la comprobacion tambien estaba mal: un `aclexplode` unido a pg_roles
-- **esconde la fila de PUBLIC**, porque su grantee es 0 y no empata con
-- ningun rol. Hay que sacarla con coalesce(rolname, 'PUBLIC').
revoke execute on function public.fn_pantallas_retomar_espera(text) from public;
revoke execute on function public.fn_extra_bebida_requiere(uuid, uuid, text) from public;
