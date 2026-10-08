-- =============================================================================
-- Ventas sin internet (08/10/26).
--
-- El 07/10 se fue el internet de 21:07 a 22:00, en plena cena, y no entro ni
-- una venta. El kiosko, barra, cocina y el agente de impresion viven en la
-- MISMA PC, y las etiquetadoras en la red de la tienda: lo unico que de
-- verdad necesita internet es el registro y Clip. Asi que sin internet el
-- kiosko cobra efectivo (o registra la terminal del banco), imprime la
-- comanda por la red local, guarda la venta en el navegador y la manda aqui
-- cuando vuelve la conexion.
--
-- fn_venta_sin_internet NO reemplaza el camino del dinero: lo ENVUELVE.
-- Crea la orden con fn_crear_orden y la cobra con fn_cobrar_orden, las de
-- siempre, sin tocarlas. Lo que agrega:
--
--   * Idempotencia por el id que le puso el kiosko: si el navegador manda la
--     misma venta dos veces (se corto a media respuesta), la segunda devuelve
--     la orden de la primera. Todo va en UNA transaccion: o queda la venta
--     completa (orden + pago + registro) o no queda nada.
--   * El precio lo pone el servidor, como siempre. Si el de la pantalla no
--     coincide (cambio un precio durante la falla), la venta se cobra al
--     precio del servidor y la diferencia queda anotada para revision: el
--     corte enseña la diferencia real en vez de esconderla.
--   * La hora real de la venta: ordenes.created_at y el pago se mueven a
--     `vendida_en`. Los triggers de la orden (inventario, mancuernas, sellos,
--     cocina) solo actuan en la transicion a pagado, asi que mover la hora
--     despues no los vuelve a disparar.
--   * La comanda NO se vuelve a mandar si ya salio en la tienda, o si la
--     venta es de hace mas de 10 minutos: imprimir a barra un pedido de hace
--     una hora es peor que no imprimir. Los trabajos quedan 'cancelled' y el
--     pedido de cocina 'entregado'.
-- =============================================================================

create table if not exists ventas_sin_internet (
  id uuid primary key,                       -- lo pone el kiosko
  orden_id uuid references ordenes(id),
  folio_local text,
  vendida_en timestamptz not null,
  recibida_en timestamptz not null default now(),
  metodo text not null,
  total_pantalla numeric not null,
  total_servidor numeric,
  diferencia numeric,
  estado text not null default 'ok' check (estado in ('ok', 'revisar')),
  comanda_suprimida boolean not null default false,
  empleado_id uuid references empleados(id),
  payload jsonb not null
);
create index if not exists ventas_sin_internet_vendida_idx on ventas_sin_internet (vendida_en);
alter table ventas_sin_internet enable row level security;
revoke all on ventas_sin_internet from anon, authenticated, public;

create or replace function public.fn_venta_sin_internet(p_venta jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '15s'
as $$
declare
  v_id uuid := (p_venta->>'id')::uuid;
  v_vendida timestamptz := (p_venta->>'vendida_en')::timestamptz;
  v_metodo text := p_venta->>'metodo';
  v_total_pantalla numeric := coalesce((p_venta->>'total_pantalla')::numeric, 0);
  v_empleado uuid := nullif(p_venta->>'empleado_id', '')::uuid;
  v_previa ventas_sin_internet;
  v_orden ordenes;
  v_pago pagos;
  v_suprimir boolean;
  v_dif numeric;
  v_preparar timestamptz := nullif(p_venta->>'preparar_a', '')::timestamptz;
begin
  if v_id is null then raise exception 'La venta no trae id.'; end if;
  if v_metodo not in ('efectivo', 'tarjeta') then
    raise exception 'Sin internet solo se registra efectivo o terminal del banco.';
  end if;
  if v_vendida is null or v_vendida > now() + interval '5 minutes' or v_vendida < now() - interval '7 days' then
    raise exception 'La hora de la venta no es valida.';
  end if;
  if jsonb_typeof(p_venta->'items') is distinct from 'array' or jsonb_array_length(p_venta->'items') = 0 then
    raise exception 'La venta no trae productos.';
  end if;
  if v_empleado is not null and not exists (select 1 from empleados where id = v_empleado) then
    raise exception 'El cajero de la venta no existe.';
  end if;

  -- Ya registrada: se devuelve lo mismo. El candado de la llave primaria
  -- hace que dos envios simultaneos no creen dos ordenes: el segundo espera
  -- y luego encuentra la fila.
  select * into v_previa from ventas_sin_internet where id = v_id;
  if found then
    select * into v_orden from ordenes where id = v_previa.orden_id;
    return jsonb_build_object('ok', true, 'repetida', true, 'orden_id', v_orden.id,
      'folio', v_orden.folio, 'total', v_orden.total, 'diferencia', v_previa.diferencia);
  end if;
  insert into ventas_sin_internet (id, vendida_en, metodo, total_pantalla, folio_local, empleado_id, payload)
  values (v_id, v_vendida, v_metodo, v_total_pantalla, p_venta->>'folio_local', v_empleado, p_venta);

  select * into v_orden from fn_crear_orden(
    nullif(p_venta->>'sucursal_id', '')::uuid,
    nullif(p_venta->>'almacen_id', '')::uuid,
    'pos'::canal_orden,
    p_venta->'items',
    nullif(p_venta->>'corte_id', '')::uuid,
    v_empleado,
    nullif(p_venta->>'cliente_id', '')::uuid,
    0,
    false,
    nullif(p_venta->>'nombre_cliente', ''),
    (p_venta->>'para_llevar')::boolean);

  if v_preparar is not null and v_preparar > now() then
    perform fn_orden_programar(v_orden.id, v_preparar);
  end if;

  select * into v_pago from fn_cobrar_orden(
    v_orden.id, v_metodo::metodo_pago, v_orden.total,
    'Sin internet ' || coalesce(p_venta->>'folio_local', ''),
    v_empleado, v_id);

  -- La hora real. Despues del cobro: los triggers ya corrieron.
  update ordenes set created_at = v_vendida where id = v_orden.id;
  update pagos set created_at = v_vendida where id = v_pago.id;

  -- La comanda ya salio en la tienda (o ya es vieja): que no vuelva a salir.
  v_suprimir := coalesce((p_venta->>'comanda_impresa')::boolean, false)
                or v_vendida < now() - interval '10 minutes';
  if v_suprimir then
    update trabajos_impresion
       set estado = 'cancelled',
           error_ultimo = 'Venta sin internet: la comanda ya salio en la tienda'
     where orden_id = v_orden.id and estado in ('pending', 'retry');
    update cocina_items set estado = 'entregado'
     where pedido_id in (select id from pedidos_cocina where orden_id = v_orden.id);
    update pedidos_cocina set estado = 'entregado' where orden_id = v_orden.id;
  end if;

  v_dif := round(v_total_pantalla - v_orden.total, 2);
  update ventas_sin_internet
     set orden_id = v_orden.id,
         total_servidor = v_orden.total,
         diferencia = v_dif,
         estado = case when abs(v_dif) > 0.01 then 'revisar' else 'ok' end,
         comanda_suprimida = v_suprimir
   where id = v_id;

  return jsonb_build_object('ok', true, 'repetida', false, 'orden_id', v_orden.id,
    'folio', v_orden.folio, 'total', v_orden.total, 'diferencia', v_dif);
end;
$$;
-- El kiosko en modo cajero habla como anon (seccion 2.2 de CLAUDE.md), igual
-- que con fn_crear_orden y fn_cobrar_orden, que esta funcion solo envuelve.
revoke execute on function public.fn_venta_sin_internet(jsonb) from public;
grant execute on function public.fn_venta_sin_internet(jsonb) to anon, authenticated;

-- La estacion del vinculo (Admin -> Extras -> «se prepara en»), para que la
-- comanda que imprime el kiosko sin internet mande el cafe del combo a
-- barra, igual que fn_crear_pedidos_cocina. Columna agregada AL FINAL; y al
-- reemplazar la vista hay que volver a declarar security_invoker o se pierde.
create or replace view public.vw_producto_extras
with (security_invoker = true) as
 SELECT pe.producto_id,
    e.id AS extra_id,
    e.nombre,
    COALESCE(pe.precio, e.precio) AS precio,
    e.activo,
    pe.grupo,
    e.marca,
    pe.por_defecto,
    pe.requiere_grupo,
    e.onzas,
    pe.estacion
   FROM producto_extras pe
     JOIN productos e ON e.id = pe.extra_id;
