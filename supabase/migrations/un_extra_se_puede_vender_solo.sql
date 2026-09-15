-- Que un extra tambien se pueda vender solo, y que lo decida gerencia.
--
-- El caso: hay clientes que solo vienen por el chipotle. El extra
-- "Extra Aderezo Chipotle" ya existe, ya cuesta $10 y ya se ofrece en la
-- Chapata y el Wrap -- pero SOLO como anadido. Para comprarlo suelto no
-- habia forma, y quien lo intento acabo en la pantalla de Categorias
-- peleandose con un error de Postgres.
--
-- Por que no basta con voltear una bandera: `es_extra` es excluyente.
-- `listarProductosParaVenta` pide `es_extra = false` y
-- `listarProductosExtra` pide `es_extra = true`. Poner el chipotle en
-- false lo haria aparecer en el menu **y dejaria de poder anadirse a la
-- chapata**, que es justo lo que hoy si funciona. Se cambiaria un hueco
-- por otro.
--
-- Asi que se crea un producto companero: mismo insumo, misma receta 1:1,
-- `es_extra = false`, en una categoria visible. El anadido sigue vivo y
-- ademas hay un boton propio en el menu.
--
-- **Esto NO es el gemelo partido en dos** que documenta el CLAUDE.md. Ese
-- caso duele porque uno de los dos no tiene receta y vende sin descontar
-- (el agua Canada Dry: 50 piezas al mes invisibles). Aqui los dos salen
-- del mismo insumo con la misma receta, asi que los dos descuentan del
-- mismo bote.
--
-- El precio va aparte a proposito: un vasito de chipotle para llevar no
-- vale lo mismo que una cucharada sobre el pan, y esa decision es del
-- negocio, no del codigo. Por eso la funcion lo pide y no lo adivina.
--
-- ⚠ **`found` lo reescribe CADA consulta, no solo la que te importa.**
-- La primera version guardaba el producto suelto con `select ... into` y
-- mas abajo preguntaba `if found then update ... else insert`. Entre las
-- dos habia un `select id into v_cat from categorias`, y ese `select`
-- dejaba `found = true` aunque el producto no existiera: se iba por la
-- rama del UPDATE con `v_suelto.id` nulo, el update no tocaba ninguna
-- fila, el `returning into` dejaba todo en nulo y la receta reventaba con
-- "null value in column producto_id". Lo cazo ejecutarla. Ahora la
-- existencia va en una bandera propia (`v_ya_estaba`), que nadie pisa.
--
-- Comprobado ejecutando el cuerpo y revirtiendo: crea "Aderezo Chipotle"
-- a $25 en la categoria Extras, sale en el menu, el anadido sigue
-- ofreciendose en sus 4 productos, y al apagarlo el producto queda
-- inactivo (no borrado: un producto borrado se lleva su historial).
create or replace function public.fn_extra_vender_solo(
  p_extra_id uuid,
  p_vender boolean,
  p_precio numeric default null,
  p_categoria text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_extra productos;
  v_cat uuid;
  v_nombre text;
  v_suelto productos;
  v_ya_estaba boolean;
  v_insumo uuid;
  v_cant numeric;
begin
  if not fn_es_jefe() then
    raise exception 'Solo gerencia puede poner un extra a la venta por separado';
  end if;

  select * into v_extra from productos where id = p_extra_id and es_extra;
  if v_extra.id is null then
    raise exception 'Ese extra no existe.';
  end if;

  -- El nombre del producto suelto quita el "Extra " de adelante: en el
  -- menu el cliente lee "Aderezo Chipotle", no "Extra Aderezo Chipotle".
  v_nombre := trim(regexp_replace(v_extra.nombre, '^\s*extra\s+', '', 'i'));
  if v_nombre = '' then v_nombre := v_extra.nombre; end if;

  select * into v_suelto from productos
   where lower(trim(nombre)) = lower(v_nombre) and not es_extra
   order by activo desc limit 1;
  v_ya_estaba := (v_suelto.id is not null);

  -- Apagar: no se borra nada. Un producto apagado conserva su historial de
  -- ventas; borrarlo se llevaria por delante los renglones que lo citan.
  if not p_vender then
    if v_ya_estaba then
      update productos set activo = false where id = v_suelto.id;
    end if;
    return jsonb_build_object('vende_solo', false, 'nombre', v_nombre);
  end if;

  if p_precio is null or p_precio <= 0 then
    raise exception 'Ponle precio al producto suelto: es una decision del negocio, no se puede adivinar.';
  end if;

  select id into v_cat from categorias
   where lower(nombre) = lower(coalesce(nullif(trim(p_categoria), ''), ''))
   limit 1;
  if v_cat is null then v_cat := v_extra.categoria_id; end if;

  if v_ya_estaba then
    update productos
       set activo = true, precio = p_precio, categoria_id = v_cat, es_extra = false
     where id = v_suelto.id
    returning * into v_suelto;
  else
    insert into productos (nombre, precio, categoria_id, es_extra, es_reventa, activo, iva_incluido)
    values (v_nombre, p_precio, v_cat, false, v_extra.es_reventa, true, v_extra.iva_incluido)
    returning * into v_suelto;
  end if;

  -- La receta, copiada del extra. Sin esto el producto vende y no
  -- descuenta, que es exactamente el agujero que acabamos de tapar en
  -- otro lado: no se repite aqui.
  for v_insumo, v_cant in
    select r.insumo_id, r.cantidad from recetas r where r.producto_id = v_extra.id
  loop
    insert into recetas (producto_id, insumo_id, cantidad)
    values (v_suelto.id, v_insumo, v_cant)
    on conflict (producto_id, insumo_id) do update set cantidad = excluded.cantidad;
  end loop;

  return jsonb_build_object(
    'vende_solo', true,
    'producto_id', v_suelto.id,
    'nombre', v_suelto.nombre,
    'precio', v_suelto.precio,
    'renglones_de_receta', (select count(*) from recetas r where r.producto_id = v_suelto.id));
end;
$function$;

revoke execute on function public.fn_extra_vender_solo(uuid, boolean, numeric, text) from public, anon;
grant execute on function public.fn_extra_vender_solo(uuid, boolean, numeric, text) to authenticated;
