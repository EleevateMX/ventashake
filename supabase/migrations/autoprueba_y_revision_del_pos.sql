/*
 * Las dos preguntas que el personal no podia contestar solo:
 * "¿el POS esta funcionando?" y "¿esta bien armada la tienda?".
 *
 * ---------------------------------------------------------------------
 * fn_autoprueba_pos
 * ---------------------------------------------------------------------
 * Un `select` no prueba nada del camino del dinero: fn_crear_orden puede
 * devolver una orden perfecta y el cobro fallar en el trigger siguiente.
 * Eso paso el 27/08 y dejo a la tienda 50 minutos creando ordenes sin poder
 * pagar ninguna. La unica verificacion honesta es cobrar.
 *
 * Asi que esto cobra de verdad y comprueba que salieran el pedido de
 * cocina, la comanda, la etiqueta en cola, el inventario y la venta.
 *
 * Y despues LO DESHACE TODO. El truco es el bloque `exception`: en plpgsql
 * abre una subtransaccion, asi que al levantar una excepcion al final se
 * revierte cada escritura. Las VARIABLES en cambio sobreviven, porque no
 * son transaccionales: por eso el reporte queda en pie aunque los datos se
 * hayan ido. No hay que limpiar nada, y no puede quedar basura si falla a
 * la mitad.
 *
 * Lo que NO prueba: la impresora fisica. Como nunca se hace commit, el
 * agente no ve esa comanda y no sale papel. Para eso esta calibrar.
 *
 * ---------------------------------------------------------------------
 * fn_revision_sistema
 * ---------------------------------------------------------------------
 * Lo que la autoprueba no puede ver: cosas que no rompen una venta hoy
 * pero muerden manana -una categoria que va a pantalla sin cocina, una
 * estacion sin impresora, un producto activo en cero pesos-.
 *
 * Cada renglon trae QUE HACER si sale mal. Un diagnostico que solo dice
 * "algo esta mal" obliga a buscar a alguien; este dice a donde ir.
 *
 * OJO con el enum: `estado_pago` solo tiene pendiente/aprobado/rechazado/
 * cancelado. Inventar 'procesando' revienta la funcion entera con
 * "invalid input value for enum" -- paso al escribirla.
 *
 * ---------------------------------------------------------------------
 * fn_reintentar_impresiones
 * ---------------------------------------------------------------------
 * Solo las ultimas 24 h. Una comanda de la semana pasada ya no la quiere
 * nadie: reimprimir historia vieja es como se llena el bote de basura de
 * papel y como se pierde la confianza en el boton.
 */

create or replace function fn_autoprueba_pos()
returns table(paso text, ok boolean, detalle text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r text[][] := array[]::text[][];
  v ordenes;
  v_suc uuid; v_alm uuid; v_prod uuid; v_nombre text; v_precio numeric;
  n int;
  v_falla text;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede correr la autoprueba';
  end if;

  begin
    select s.id into v_suc from sucursales s limit 1;
    select a.id into v_alm from almacenes a where a.sucursal_id = v_suc limit 1;
    if v_suc is null or v_alm is null then
      r := r || array[array['Sucursal y almacen', 'false', 'No hay sucursal o almacen configurados']];
      raise exception 'PRUEBA_TERMINADA';
    end if;
    r := r || array[array['Sucursal y almacen', 'true', 'configurados']];

    select p.id, p.nombre, p.precio into v_prod, v_nombre, v_precio
    from productos p
    join categorias c on c.id = p.categoria_id
    where p.activo and p.precio > 0
      and not coalesce(p.es_extra,false) and not coalesce(p.es_combo,false)
      and coalesce(c.va_a_pantalla, true)
    order by p.orden nulls last, p.nombre
    limit 1;
    if v_prod is null then
      r := r || array[array['Catalogo', 'false', 'No hay ningun producto activo que vaya a pantalla']];
      raise exception 'PRUEBA_TERMINADA';
    end if;
    r := r || array[array['Catalogo', 'true', 'se probara con: ' || v_nombre]];

    v := fn_crear_orden(v_suc, v_alm, 'pos',
          jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'cantidad', 1)),
          null, null, null, 0, false, 'AUTOPRUEBA', true);
    r := r || array[array['Crear la orden', 'true',
      'folio ' || v.folio || ', total ' || v.total ||
      case when v.descuento > 0 then ' (descuento ' || v.descuento || ')' else '' end]];

    if v.total is null or v.total < 0 then
      r := r || array[array['El total se calculo en el servidor', 'false', 'total invalido']];
      raise exception 'PRUEBA_TERMINADA';
    end if;
    r := r || array[array['El total se calculo en el servidor', 'true',
      'el cliente no manda precios: ' || v.total]];

    perform fn_cobrar_orden(v.id, 'efectivo', v.total, gen_random_uuid()::text, null, null);
    r := r || array[array['Cobrar', 'true', 'pagada y registrada']];

    select count(*) into n from pedidos_cocina where orden_id = v.id;
    r := r || array[array['La comanda llega a la estacion', (n > 0)::text, n || ' pedido(s) de cocina']];

    select count(*) into n from cocina_items ci
      join pedidos_cocina pc on pc.id = ci.pedido_id where pc.orden_id = v.id;
    r := r || array[array['Los productos van en la comanda', (n > 0)::text, n || ' renglon(es)']];

    select count(*) into n from trabajos_impresion t
      where t.orden_id = v.id
         or t.pedido_id in (select id from pedidos_cocina where orden_id = v.id);
    r := r || array[array['La etiqueta se encola para imprimir', (n > 0)::text, n || ' trabajo(s) en la cola']];

    select count(*) into n from inventario_movimientos where referencia_id = v.id;
    r := r || array[array['El inventario se descuenta', (n > 0)::text, n || ' movimiento(s)']];

    select count(*) into n from ventas where orden_id = v.id;
    r := r || array[array['La venta entra al corte', (n > 0)::text, n || ' venta(s)']];

    raise exception 'PRUEBA_TERMINADA';
  exception when others then
    -- Aqui se revirtio TODO lo de arriba. Solo sobreviven las variables.
    if sqlerrm <> 'PRUEBA_TERMINADA' then
      v_falla := sqlerrm;
      r := r || array[array['Se rompio a la mitad', 'false', v_falla]];
    end if;
  end;

  r := r || array[array['Todo lo de la prueba se deshizo', 'true',
    'no quedo ninguna orden, venta ni comanda de mentira']];

  return query
  select r[i][1], r[i][2] = 'true', r[i][3]
  from generate_subscripts(r, 1) as i;
end;
$function$;

create or replace function fn_revision_sistema()
returns table(area text, ok boolean, detalle text, que_hacer text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare n int; m int; t text;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede revisar el sistema';
  end if;

  select count(*) filter (where activa),
         count(*) filter (where activa and ultima_conexion > now() - interval '2 minutes')
    into n, m from impresoras;
  return query select 'Impresoras reportandose', (m = n and n > 0),
    m || ' de ' || n || ' activas',
    case when n = 0 then 'No hay impresoras dadas de alta: Admin -> Impresoras.'
         when m < n then 'Abre la ventana negra del agente en la PC de la tienda.'
         else 'Nada que hacer.' end;

  select count(distinct agente_version) into n from impresoras where activa;
  select string_agg(distinct coalesce(agente_version,'?'), ', ') into t from impresoras where activa;
  return query select 'Version del agente', (n <= 1), coalesce(t,'-'),
    case when n > 1 then 'Las PCs no traen la misma version: Admin -> Descargas.'
         else 'Todas iguales.' end;

  select count(*) into n from categorias c
   where c.activa and coalesce(c.va_a_pantalla,true) and c.cocina_id is null;
  return query select 'Categorias con destino', (n = 0),
    case when n = 0 then 'todas saben a que estacion van'
         else n || ' categoria(s) van a pantalla sin estacion asignada' end,
    case when n > 0 then 'Admin -> Categorias: asignales cocina, o apagales "va a pantalla".'
         else 'Nada que hacer.' end;

  select count(*) into n from cocinas co
   where not exists (select 1 from impresoras i where i.cocina_id = co.id and i.activa);
  return query select 'Estaciones con impresora', (n = 0),
    case when n = 0 then 'cada estacion tiene la suya'
         else n || ' estacion(es) sin impresora activa' end,
    case when n > 0 then 'Admin -> Impresoras: asigna una a esa estacion o no saldra papel ahi.'
         else 'Nada que hacer.' end;

  select count(*) into n from productos
   where activo and coalesce(precio,0) = 0 and not coalesce(es_extra,false);
  return query select 'Productos con precio', (n = 0),
    case when n = 0 then 'ninguno activo en cero' else n || ' activo(s) en $0' end,
    case when n > 0 then 'Ponles precio en Costeos, o quedan vendiendose gratis.'
         else 'Nada que hacer.' end;

  select count(*) into n from (
    select lower(nombre) from productos
     where activo and not coalesce(es_extra,false)
     group by lower(nombre) having count(*) > 1) d;
  return query select 'Productos sin duplicar', (n = 0),
    case when n = 0 then 'ningun nombre repetido' else n || ' nombre(s) repetido(s)' end,
    case when n > 0 then 'Un renombre sin Clave en Costeos parte el producto en dos. Avisa a gerencia.'
         else 'Nada que hacer.' end;

  select count(*) into n from cajas;
  select count(*) into m from caja_cortes where cerrado_en is null;
  return query select 'Caja', (n > 0),
    case when n = 0 then 'no hay caja configurada'
         when m > 0 then 'hay ' || m || ' turno(s) abierto(s)'
         else 'sin turno abierto' end,
    case when n = 0 then 'Sin caja no se puede cobrar. Avisa a gerencia.'
         when m = 0 then 'Se abre desde el kiosko: 5 toques a Milo -> PIN.'
         else 'Nada que hacer.' end;

  select count(*) into n from pagos
   where estado = 'pendiente' and created_at > now() - interval '24 hours';
  return query select 'Pagos resueltos', (n = 0),
    case when n = 0 then 'ninguno colgado en 24 h' else n || ' sin resolver' end,
    case when n > 0 then 'Dale a "Reconciliar pagos" en la ficha de cobros colgados.'
         else 'Nada que hacer.' end;

  select count(*) into n from ordenes
   where not pagado and not es_demo
     and estado_pago_orden in ('pending_payment','awaiting_counter_payment')
     and created_at > now() - interval '24 hours';
  return query select 'Ordenes que si se pagaron', (n < 5),
    n || ' sin pagar en 24 h',
    case when n >= 5 then 'Muchas seguidas puede ser que la caja no este pudiendo cobrar. Revisa.'
         else 'Algunas son normales: gente que se arrepiente.' end;

  select count(*) into n from trabajos_impresion
   where estado = 'failed' and created_at > now() - interval '24 hours';
  return query select 'Comandas sin fallar', (n = 0),
    case when n = 0 then 'ninguna fallo en 24 h' else n || ' agotaron reintentos' end,
    case when n > 0 then 'Dale a "Reintentar las comandas fallidas".' else 'Nada que hacer.' end;

  return;
end;
$function$;

create or replace function fn_reintentar_impresiones()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n int;
begin
  if fn_rol_staff() is null then
    raise exception 'Solo el personal puede reintentar impresiones';
  end if;

  with revividos as (
    update trabajos_impresion
       set estado = 'pending', intentos = 0, error_ultimo = null,
           next_retry_at = null, claimed_by = null, claim_expires_at = null,
           queued_at = now()
     where estado = 'failed'
       and created_at > now() - interval '24 hours'
    returning 1
  )
  select count(*) into n from revividos;
  return n;
end;
$function$;

revoke all on function fn_autoprueba_pos() from public, anon;
revoke all on function fn_revision_sistema() from public, anon;
revoke all on function fn_reintentar_impresiones() from public, anon;
grant execute on function fn_autoprueba_pos() to authenticated;
grant execute on function fn_revision_sistema() to authenticated;
grant execute on function fn_reintentar_impresiones() to authenticated;
