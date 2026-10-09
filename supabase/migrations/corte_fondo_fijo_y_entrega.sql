-- Corte con fondo fijo, retiro y entrega de turno (09/10/26).
--
-- Lo pidió gerencia al formalizar el cambio de turno: cada turno arranca con
-- un fondo fijo ($3,000, `parametros.fondo_caja`), al cerrar se retira todo
-- lo demás, y quien recibe confirma lo que recibe. Sin cortes parciales ni
-- tablas nuevas: es el MISMO corte de siempre con cuatro datos más.
--
--   fondo_dejado / desglose_fondo   lo que se queda en el cajón al cerrar,
--                                   por denominación (sale de lo contado)
--   retiro                          lo contado menos lo que se queda
--   reposicion (+ quién autorizó)   lo que se puso de fuera cuando lo
--                                   contado no alcanzaba para el fondo
--   fondo_esperado / corte_anterior al ABRIR: lo que dejó el corte anterior
--                                   (más la reposición). Lo pone el servidor.
--   notas_apertura                  la incidencia si lo recibido no cuadra
--   folio                           COR-00128, para el comprobante
--
-- Reglas que se cuidan aquí y no en la pantalla:
--   * El fondo sale de lo CONTADO: no se puede dejar un billete que no se
--     contó, ni dejar más de lo que hay.
--   * La diferencia del turno se queda en el turno que cierra (ya era así:
--     contado − esperado). El que recibe responde solo de lo que recibe.
--   * La reposición la autoriza quien puede hacer cortes, con el mismo
--     candado del corte (si quien cierra no puede, ya trae el PIN de quien
--     sí).
--   * El fondo esperado lo pone un trigger: la pantalla no lo puede mandar.
--
-- Un corte cerrado sin desglose del fondo (el POS, que no cambió) se guarda
-- como siempre: fondo_dejado y retiro quedan en null, y el siguiente turno
-- no tiene fondo esperado — como hoy.

alter table public.caja_cortes
  add column if not exists folio bigint,
  add column if not exists fondo_dejado numeric(12,2),
  add column if not exists desglose_fondo jsonb,
  add column if not exists retiro numeric(12,2),
  add column if not exists reposicion numeric(12,2),
  add column if not exists reposicion_autorizada_por uuid references public.empleados(id),
  add column if not exists fondo_esperado numeric(12,2),
  add column if not exists corte_anterior_id uuid references public.caja_cortes(id) on delete set null,
  add column if not exists notas_apertura text;

-- Folio: los viejos en el orden en que se abrieron, los nuevos en secuencia.
create sequence if not exists public.caja_cortes_folio_seq;

with s as (
  select id, row_number() over (order by abierto_en, id) as n
    from public.caja_cortes
)
update public.caja_cortes c
   set folio = s.n
  from s
 where s.id = c.id and c.folio is null;

select setval('public.caja_cortes_folio_seq', greatest(coalesce((select max(folio) from public.caja_cortes), 0), 1));
alter table public.caja_cortes alter column folio set default nextval('public.caja_cortes_folio_seq');
alter sequence public.caja_cortes_folio_seq owned by public.caja_cortes.folio;
create unique index if not exists caja_cortes_folio_uq on public.caja_cortes (folio);
create index if not exists caja_cortes_anterior_idx on public.caja_cortes (corte_anterior_id);

-- Al abrir: el fondo sugerido de siempre y, ahora, de qué corte viene esta
-- caja y cuánto debería traer. Lo que mande la pantalla en esas columnas se
-- ignora.
create or replace function public.trg_corte_fondo_sugerido()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_ant record;
begin
  new.fondo_sugerido := (select fondo_caja from parametros where id = 'default');

  select c.id, c.fondo_dejado, c.reposicion
    into v_ant
    from caja_cortes c
   where c.caja_id = new.caja_id and c.estado = 'cerrada'
   order by c.cerrado_en desc nulls last
   limit 1;

  new.corte_anterior_id := v_ant.id;
  new.fondo_esperado := case
    when v_ant.fondo_dejado is null then null
    else v_ant.fondo_dejado + coalesce(v_ant.reposicion, 0)
  end;
  return new;
end;
$function$;

-- Cerrar con fondo: ENVUELVE a fn_cerrar_corte, no la toca. El candado del
-- corte (permiso o PIN de quien autoriza) sigue viviendo en un solo lugar,
-- el POS sigue llamando a la de siempre, y cambiarle la firma a la vieja
-- habría obligado a borrarla y recrearla con la tienda abierta. Misma idea
-- que fn_venta_sin_internet sobre fn_crear_orden.
--
-- Primero se valida el fondo (si está mal, no se cierra nada), luego se
-- cierra con la de siempre y al final se anota el fondo — todo en la misma
-- transacción: o queda el corte con su fondo, o no queda nada.
create or replace function public.fn_cerrar_corte_con_fondo(
  p_corte_id uuid,
  p_efectivo numeric,
  p_desglose jsonb,
  p_desglose_fondo jsonb,
  p_reposicion numeric default null,
  p_notas text default null,
  p_pin_autoriza text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_r jsonb; v_aut uuid;
  v_fondo numeric; v_rep numeric; v_folio bigint;
  d record;
begin
  if p_desglose_fondo is null then
    raise exception 'Falta decir qué billetes y monedas se quedan de fondo.';
  end if;

  if p_desglose is null then
    raise exception 'Para dejar el fondo hace falta el conteo por billetes y monedas.';
  end if;
  v_fondo := 0;
  for d in
    select e.especie, f.key as den, f.value as piezas
      from unnest(array['billetes', 'monedas']) as e(especie)
      cross join lateral jsonb_each(coalesce((p_desglose_fondo -> e.especie), '{}'::jsonb)) as f
  loop
    -- Por separado y en orden: convertir a número algo que no lo es
    -- reventaría con un error que nadie entiende.
    if jsonb_typeof(d.piezas) <> 'number' or d.den !~ '^[0-9]+$' then
      raise exception 'El fondo trae una cantidad que no se entiende (% de $%).', d.especie, d.den;
    end if;
    if (d.piezas)::text::numeric < 0 or (d.piezas)::text::numeric <> trunc((d.piezas)::text::numeric) then
      raise exception 'El fondo trae una cantidad que no se entiende (% de $%).', d.especie, d.den;
    end if;
    if (d.piezas)::text::numeric > coalesce(((p_desglose -> d.especie) ->> d.den)::numeric, 0) then
      raise exception 'El fondo deja más % de $% de los que se contaron.', d.especie, d.den;
    end if;
    v_fondo := v_fondo + d.den::numeric * (d.piezas)::text::numeric;
  end loop;
  if v_fondo > p_efectivo then
    raise exception 'El fondo no puede ser mayor que lo contado.';
  end if;

  v_rep := nullif(round(coalesce(p_reposicion, 0), 2), 0);
  if v_rep is not null and (v_rep < 0 or v_rep > 50000) then
    raise exception 'Esa reposición no tiene sentido.';
  end if;

  -- El corte de siempre, con su candado. Si pide autorización, el error
  -- (con su hint) sube tal cual a la pantalla.
  v_r := fn_cerrar_corte(p_corte_id, p_efectivo, p_desglose, p_notas, p_pin_autoriza);
  v_aut := (v_r ->> 'autorizo_id')::uuid;

  -- La reposición la autoriza quien autorizó el corte: el mismo permiso.
  update caja_cortes
     set desglose_fondo = p_desglose_fondo,
         fondo_dejado = v_fondo,
         retiro = p_efectivo - v_fondo,
         reposicion = v_rep,
         reposicion_autorizada_por = case when v_rep is null then null else v_aut end
   where id = p_corte_id
   returning folio into v_folio;

  return v_r || jsonb_build_object(
    'folio', v_folio,
    'fondo_dejado', v_fondo,
    'retiro', p_efectivo - v_fondo,
    'reposicion', v_rep
  );
end;
$function$;

revoke all on function public.fn_cerrar_corte_con_fondo(uuid, numeric, jsonb, jsonb, numeric, text, text) from public, anon;
grant execute on function public.fn_cerrar_corte_con_fondo(uuid, numeric, jsonb, jsonb, numeric, text, text) to authenticated;

-- Antes de abrir: cuánto debería traer la caja y quién la entregó. La
-- pantalla lo enseña; el que manda es el trigger de arriba.
create or replace function public.fn_fondo_esperado(p_caja_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not coalesce(fn_es_staff(), false) then
    raise exception 'Solo el personal.';
  end if;
  if exists (select 1 from caja_cortes where caja_id = p_caja_id and estado <> 'cerrada') then
    return null;
  end if;
  select jsonb_build_object(
           'corte_id', c.id,
           'folio', c.folio,
           'fondo_esperado', c.fondo_dejado + coalesce(c.reposicion, 0),
           'fondo_dejado', c.fondo_dejado,
           'reposicion', c.reposicion,
           'desglose_fondo', c.desglose_fondo,
           'entrego', e.nombre,
           'cerrado_en', c.cerrado_en
         )
    into v
    from caja_cortes c
    left join empleados e on e.id = c.empleado_cierre_id
   where c.caja_id = p_caja_id and c.estado = 'cerrada'
   order by c.cerrado_en desc nulls last
   limit 1;
  if v is null or (v ->> 'fondo_dejado') is null then
    return null;
  end if;
  return v;
end;
$function$;

revoke all on function public.fn_fondo_esperado(uuid) from public, anon;
grant execute on function public.fn_fondo_esperado(uuid) to authenticated;

-- El comprobante de un corte: todo lo que va en el papel (o en el correo),
-- armado en un solo lugar para que el kiosko, Admin y el correo digan lo
-- mismo. Quien RECIBE es quien abrió el corte siguiente.
create or replace function public.fn_corte_comprobante(p_corte_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not (coalesce(fn_es_staff(), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo el personal.';
  end if;
  select jsonb_build_object(
           'corte_id', c.id,
           'folio', c.folio,
           'caja', r.caja,
           'estado', c.estado,
           'abierto_en', c.abierto_en,
           'cerrado_en', c.cerrado_en,
           'abrio', ea.nombre,
           'entrega', ec.nombre,
           'autorizo', eau.nombre,
           'num_ordenes', r.num_ordenes,
           'fondo_inicial', c.fondo_inicial,
           'fondo_esperado_apertura', c.fondo_esperado,
           'ventas_efectivo', r.total_efectivo,
           'efectivo_esperado', r.efectivo_esperado,
           'efectivo_contado', c.efectivo_contado,
           'diferencia', r.diferencia,
           'retiro', c.retiro,
           'fondo_dejado', c.fondo_dejado,
           'desglose_fondo', c.desglose_fondo,
           'reposicion', c.reposicion,
           'reposicion_autorizo', erp.nombre,
           'notas', c.notas,
           'total_tarjeta', r.total_tarjeta,
           'total_clip', r.total_clip,
           'total_pagado', r.total_pagado,
           'recibe', er.nombre,
           'recibido_en', s.abierto_en,
           'recibido_contado', s.fondo_inicial,
           'recibido_esperado', s.fondo_esperado,
           'recibido_diferencia', case when s.fondo_esperado is null then null else s.fondo_inicial - s.fondo_esperado end,
           'recibido_notas', s.notas_apertura,
           'corte_siguiente_id', s.id,
           'corte_siguiente_folio', s.folio
         )
    into v
    from caja_cortes c
    join vw_corte_resumen r on r.corte_id = c.id
    left join empleados ea on ea.id = c.empleado_apertura_id
    left join empleados ec on ec.id = c.empleado_cierre_id
    left join empleados eau on eau.id = c.cierre_autorizado_por
    left join empleados erp on erp.id = c.reposicion_autorizada_por
    left join lateral (
      select x.* from caja_cortes x
       where x.corte_anterior_id = c.id
       order by x.abierto_en
       limit 1
    ) s on true
    left join empleados er on er.id = s.empleado_apertura_id
   where c.id = p_corte_id;
  if v is null then
    raise exception 'Ese corte no existe.';
  end if;
  return v;
end;
$function$;

revoke all on function public.fn_corte_comprobante(uuid) from public, anon;
grant execute on function public.fn_corte_comprobante(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
