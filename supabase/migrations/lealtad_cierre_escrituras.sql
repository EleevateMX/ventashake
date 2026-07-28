-- ============================================================================
-- Lealtad: cerrar las escrituras antes de abrir el login de Google
-- ============================================================================
-- Hoy `clientes`, `cupones` y `mancuernas_movimientos` están abiertos a
-- cualquiera que tenga la anon key (que es pública por diseño):
--
--   * `upd_clientes` es USING (true) sin WITH CHECK  → cualquiera puede hacer
--     `update clientes set mancuernas = 999999` y fabricarse cupones infinitos.
--   * `upd_cupones` es USING (true)                  → cualquiera puede volver
--     a 'activo' un cupón ya usado y canjearlo otra vez.
--   * los SELECT son USING (true)                    → un cliente logueado ve
--     el padrón completo (nombre, teléfono, correo, cumpleaños) de los demás.
--
-- Mientras nadie usaba lealtad esto no se explotaba. En cuanto se enciende el
-- login de Google y la PWA de Rewards queda pública, es alcanzable desde el
-- celular de cualquier cliente. Se cierra con el mismo patrón que ya usa el
-- resto del sistema: SECURITY DEFINER como única vía de escritura, y la tabla
-- sin GRANT de escritura para anon/authenticated.
--
-- Aditiva y no destructiva: no borra datos ni columnas, solo reemplaza las
-- políticas permisivas por funciones que validan del lado del servidor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Alta de cliente (la usa caja: POS → Clientes → dar de alta)
-- ---------------------------------------------------------------------------
-- El servidor fija mancuernas = 0, activo = true y auth_user_id = null: el
-- cliente no puede llegar con saldo regalado ni adueñarse de una cuenta.
create or replace function fn_cliente_registrar(
  p_nombre            text,
  p_telefono          text default null,
  p_email             text default null,
  p_notas             text default null,
  p_fecha_nacimiento  date default null,
  p_sabor_favorito    text default null
) returns clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := nullif(trim(p_telefono), '');
  v_row clientes;
begin
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre del cliente es obligatorio.';
  end if;

  -- Un teléfono identifica a una persona: si ya existe, se devuelve la ficha
  -- que ya estaba en lugar de duplicar al cliente y partirle sus mancuernas.
  if v_tel is not null then
    select * into v_row from clientes where telefono = v_tel and activo limit 1;
    if found then
      raise exception 'Ya existe un cliente con el teléfono %: "%".', v_tel, v_row.nombre;
    end if;
  end if;

  insert into clientes (nombre, telefono, email, notas, fecha_nacimiento, sabor_favorito)
  values (
    trim(p_nombre), v_tel, nullif(trim(p_email), ''), nullif(trim(p_notas), ''),
    p_fecha_nacimiento, nullif(trim(p_sabor_favorito), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Edición de la ficha (solo datos de contacto)
-- ---------------------------------------------------------------------------
-- Deliberadamente NO toca mancuernas, codigo, auth_user_id ni activo: esos son
-- saldo, identidad y estado, y solo los mueve el sistema.
create or replace function fn_cliente_actualizar(
  p_id       uuid,
  p_nombre   text,
  p_telefono text default null,
  p_email    text default null,
  p_notas    text default null
) returns clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := nullif(trim(p_telefono), '');
  v_row clientes;
begin
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre del cliente es obligatorio.';
  end if;

  if v_tel is not null and exists (
    select 1 from clientes where telefono = v_tel and activo and id <> p_id
  ) then
    raise exception 'Ya hay otro cliente con el teléfono %.', v_tel;
  end if;

  update clientes
     set nombre   = trim(p_nombre),
         telefono = v_tel,
         email    = nullif(trim(p_email), ''),
         notas    = nullif(trim(p_notas), '')
   where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'El cliente no existe.';
  end if;
  return v_row;
end;
$$;

-- Baja lógica: nunca se borra (histórico de órdenes y movimientos).
create or replace function fn_cliente_desactivar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update clientes set activo = false where id = p_id;
  if not found then
    raise exception 'El cliente no existe.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Vincular la cuenta de Google con la ficha de lealtad
-- ---------------------------------------------------------------------------
-- La identidad la pone el servidor con auth.uid() y auth.jwt(), NO el cliente:
-- así nadie puede mandar el auth_user_id de otro y quedarse con sus mancuernas.
-- Idempotente: entrar mil veces con la misma cuenta devuelve la misma ficha.
create or replace function fn_vincular_cliente_auth(p_nombre text default null)
returns clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_nom   text := nullif(trim(p_nombre), '');
  v_row   clientes;
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión.' using errcode = '28000';
  end if;

  select * into v_row from clientes where auth_user_id = v_uid;
  if found then
    return v_row;
  end if;

  -- Si ya lo habían dado de alta en caja con ese mismo correo, se reclama esa
  -- ficha en vez de crear una segunda: conserva sus mancuernas y sus cupones.
  -- El correo viene del token de Google (verificado), no de un parámetro.
  if v_email is not null then
    update clientes
       set auth_user_id = v_uid,
           nombre       = coalesce(v_nom, nombre)
     where id = (
       select id from clientes
        where lower(email) = v_email and auth_user_id is null and activo
        order by created_at
        limit 1
     )
    returning * into v_row;
    if found then
      return v_row;
    end if;
  end if;

  insert into clientes (auth_user_id, nombre, email)
  values (v_uid, coalesce(v_nom, v_email, 'Cliente'), v_email)
  returning * into v_row;

  return v_row;
end;
$$;

-- Una cuenta de Google = una sola ficha de lealtad.
create unique index if not exists clientes_auth_user_id_uniq
  on clientes (auth_user_id) where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Canje de cupón (atómico)
-- ---------------------------------------------------------------------------
-- Antes se leía el cupón y después se actualizaba en dos viajes: entre uno y
-- otro el mismo cupón podía canjearse en dos cajas a la vez. Aquí la condición
-- viaja dentro del UPDATE, así que solo una transacción se lo lleva.
create or replace function fn_canjear_cupon(
  p_cupon_id uuid,
  p_orden_id uuid default null
) returns cupones
language plpgsql
security definer
set search_path = public
as $$
declare v_row cupones;
begin
  update cupones
     set estado      = 'usado',
         usado_en    = now(),
         orden_id_uso = p_orden_id
   where id = p_cupon_id
     and estado = 'activo'
     and vence_en >= now()
  returning * into v_row;

  if found then
    return v_row;
  end if;

  -- No se pudo: averiguar por qué para dar un mensaje útil en caja.
  select * into v_row from cupones where id = p_cupon_id;
  if not found then
    raise exception 'El cupón no existe.';
  elsif v_row.estado <> 'activo' then
    raise exception 'El cupón ya fue usado o está cancelado.';
  else
    raise exception 'El cupón está vencido.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Cerrar la escritura directa
-- ---------------------------------------------------------------------------
-- Las políticas permisivas se van: ya no hace falta ninguna, porque todo lo
-- que escribe pasa por las funciones de arriba (que corren como dueño).
drop policy if exists upd_clientes on clientes;
drop policy if exists ins_clientes on clientes;
drop policy if exists upd_cupones  on cupones;

-- Una política sin GRANT no protege, y un GRANT sin política tampoco: se
-- cierran los dos lados.
revoke insert, update, delete, truncate, references, trigger
  on clientes, cupones, mancuernas_movimientos
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Acotar la lectura
-- ---------------------------------------------------------------------------
-- Caja (anon + PIN) necesita buscar clientes por teléfono para identificarlos,
-- así que ahí la lectura sigue abierta. Un cliente logueado desde su celular
-- (authenticated) NO tiene por qué ver el padrón: se queda con lo suyo.
drop policy if exists sel_clientes   on clientes;
drop policy if exists sel_cupones    on cupones;
drop policy if exists sel_mancuernas on mancuernas_movimientos;

create policy sel_clientes_caja on clientes
  for select to anon using (true);
create policy sel_clientes_propio on clientes
  for select to authenticated using (auth_user_id = auth.uid());

create policy sel_cupones_caja on cupones
  for select to anon using (true);
create policy sel_cupones_propio on cupones
  for select to authenticated using (
    exists (select 1 from clientes c where c.id = cupones.cliente_id and c.auth_user_id = auth.uid())
  );

create policy sel_mancuernas_caja on mancuernas_movimientos
  for select to anon using (true);
create policy sel_mancuernas_propio on mancuernas_movimientos
  for select to authenticated using (
    exists (select 1 from clientes c where c.id = mancuernas_movimientos.cliente_id and c.auth_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 7. Permisos de ejecución
-- ---------------------------------------------------------------------------
-- Postgres regala EXECUTE a PUBLIC en cada función nueva, y Supabase además da
-- grants explícitos a anon/authenticated: hay que revocar de los tres.
revoke execute on function fn_cliente_registrar(text, text, text, text, date, text)
  from public, anon, authenticated;
revoke execute on function fn_cliente_actualizar(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function fn_cliente_desactivar(uuid) from public, anon, authenticated;
revoke execute on function fn_vincular_cliente_auth(text) from public, anon, authenticated;
revoke execute on function fn_canjear_cupon(uuid, uuid) from public, anon, authenticated;

-- Caja opera con la anon key (el cajero se identifica con PIN, no con Auth).
grant execute on function fn_cliente_registrar(text, text, text, text, date, text) to anon, authenticated;
grant execute on function fn_cliente_actualizar(uuid, text, text, text, text)      to anon, authenticated;
grant execute on function fn_cliente_desactivar(uuid)                              to anon, authenticated;
grant execute on function fn_canjear_cupon(uuid, uuid)                             to anon, authenticated;

-- Vincular la cuenta solo tiene sentido con sesión iniciada.
grant execute on function fn_vincular_cliente_auth(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Quitar de la calle los trabajos de mantenimiento de lealtad
-- ---------------------------------------------------------------------------
-- Estas cuatro reparten cupones y mancuernas, o son disparadores internos. No
-- las llama ninguna app: las corre `cron` (como postgres, así que revocarlas
-- al público no afecta el calendario). Hoy, en cambio, cualquiera con la anon
-- key puede invocarlas por /rest/v1/rpc y forzar el reparto cuando quiera.
--
--   cupones-cumpleanos    0 6 1 * *   fn_generar_cupones_cumpleanos()
--   cupones-expirar       0 5 * * *   fn_expirar_cupones()
--   lealtad-reactivacion  0 6 * * 1   fn_reactivacion()
--   (trigger de ordenes)              fn_acumular_mancuernas()
revoke execute on function fn_generar_cupones_cumpleanos() from public, anon, authenticated;
revoke execute on function fn_expirar_cupones()            from public, anon, authenticated;
revoke execute on function fn_reactivacion()               from public, anon, authenticated;
revoke execute on function fn_acumular_mancuernas()        from public, anon, authenticated;
