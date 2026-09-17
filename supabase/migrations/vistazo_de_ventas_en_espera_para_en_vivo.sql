-- Gerencia quiere ver desde Admin cuales ventas estan apartadas.
--
-- Las apartadas viven en el localStorage de cada pantalla **a proposito**:
-- meterlas a `ordenes` seria una orden a medio crear que la
-- reconciliacion tendria que aprender a distinguir de una venta perdida,
-- y ensuciar el camino del dinero por algo que dura tres minutos es mal
-- negocio. Esa decision no cambia.
--
-- Lo que se hace es distinto: la pantalla publica un **vistazo**. No es
-- una orden ni pretende serlo -- no tiene items, ni precios por renglon,
-- ni folio, y nada la lee para cobrar. Es lo mismo que el latido de la
-- impresora: un "aqui estoy y esto tengo" que solo sirve para mirar de
-- lejos. La verdad de la venta sigue en el navegador que la aparto, y si
-- esa pantalla se apaga, el vistazo caduca solo.
--
-- Una fila por pantalla, no por venta: la pantalla reescribe su renglon
-- entero cada vez que su lista cambia. Asi no hay que borrar apartadas
-- una por una ni queda basura si el navegador se cierra a media venta.
create table if not exists public.ventas_en_espera_vistazo (
  pantalla      text primary key,
  cuantas       integer not null default 0,
  total         numeric(10,2) not null default 0,
  etiquetas     jsonb not null default '[]'::jsonb,
  actualizado_en timestamptz not null default now()
);

comment on table public.ventas_en_espera_vistazo is
  'Solo para mirar de lejos: cuantas ventas tiene apartadas cada pantalla. NO son ordenes y nada cobra con esto.';

alter table public.ventas_en_espera_vistazo enable row level security;

-- Leer es de personal. Las etiquetas llevan el nombre del cliente
-- ("Chapata de Ana"), asi que no se abre a anon.
drop policy if exists sel_vistazo_espera on public.ventas_en_espera_vistazo;
create policy sel_vistazo_espera on public.ventas_en_espera_vistazo
  for select using (fn_es_staff());

grant select on public.ventas_en_espera_vistazo to authenticated;

/**
 * La pantalla publica su lista. Abierta a `anon` igual que el resto del
 * kiosko en modo cajero -- ver el aviso de la seccion 2.2 de CLAUDE.md:
 * esa pantalla lleva dias encendida y su sesion caduca sin que nadie lo
 * note, asi que pedirle sesion es como se tumba la caja.
 *
 * Lo que se puede hacer abusando de esto es escribir un renglon de
 * vistazo falso, que no cobra nada, no crea ninguna orden y caduca solo.
 * El limite esta puesto donde importa: se recortan las etiquetas y su
 * numero, para que nadie use esto de pizarron.
 */
create or replace function public.fn_espera_publicar(
  p_pantalla text,
  p_cuantas integer,
  p_total numeric,
  p_etiquetas jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_limpias jsonb;
begin
  if coalesce(btrim(p_pantalla), '') = '' then
    raise exception 'Falta decir que pantalla es.';
  end if;

  select coalesce(jsonb_agg(left(e, 60)), '[]'::jsonb) into v_limpias
  from (
    select jsonb_array_elements_text(coalesce(p_etiquetas, '[]'::jsonb)) e
    limit 12
  ) t;

  insert into ventas_en_espera_vistazo (pantalla, cuantas, total, etiquetas, actualizado_en)
  values (left(btrim(p_pantalla), 40), greatest(0, coalesce(p_cuantas, 0)),
          greatest(0, coalesce(p_total, 0)), v_limpias, now())
  on conflict (pantalla) do update set
    cuantas = excluded.cuantas,
    total = excluded.total,
    etiquetas = excluded.etiquetas,
    actualizado_en = now();
end;
$$;

revoke all on function public.fn_espera_publicar(text, integer, numeric, jsonb) from public;
grant execute on function public.fn_espera_publicar(text, integer, numeric, jsonb)
  to anon, authenticated, service_role;

/**
 * Lo que ve Admin. Un vistazo viejo no es una venta apartada: es una
 * pantalla que se apago sin limpiar. Por eso se descartan los de mas de
 * 12 horas, la misma vigencia que usa el navegador para olvidarlas.
 */
create or replace function public.fn_espera_en_vivo()
returns table (
  pantalla text, cuantas integer, total numeric,
  etiquetas jsonb, hace_minutos integer
)
language sql
stable
security definer
set search_path = public
as $$
  select v.pantalla, v.cuantas, v.total, v.etiquetas,
         (extract(epoch from (now() - v.actualizado_en)) / 60)::int
  from ventas_en_espera_vistazo v
  where fn_es_staff()
    and v.cuantas > 0
    and v.actualizado_en > now() - interval '12 hours'
  order by v.pantalla;
$$;

revoke all on function public.fn_espera_en_vivo() from public;
revoke execute on function public.fn_espera_en_vivo() from anon;
grant execute on function public.fn_espera_en_vivo() to authenticated, service_role;
