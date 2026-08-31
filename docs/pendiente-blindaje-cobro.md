# Pendiente: cerrar el cobro a quien no es personal

**Estado: PREPARADO, NO APLICADO.** Se aplica de madrugada (00:00-05:00 de
Merida, la unica ventana con cero ventas). Si lees esto y sigue sin
aplicarse, el hueco sigue abierto.

## El hueco

`fn_cobrar_orden` y `fn_cobrar_orden_dividido` son `SECURITY DEFINER`,
tienen `grant ... to anon` y **no comprueban nada adentro**. Con la llave
publicable -- que vive en el navegador por diseno -- alguien puede crear
una orden con `fn_crear_orden` y marcarla pagada sin pagar. Y no queda en
una fila fea de la base: `fn_cobrar_orden` llama a `fn_confirmar_venta`,
o sea que **la comanda sale y barra prepara el shake**.

Es la misma familia de agujeros que se cerro el 31/08 en
`fn_staff_vincular_auth` y `fn_crear_empleado`.

## Por que no se cerro en caliente

Es la funcion por la que pasa **cada venta**. Un candado mal puesto deja a
la caja sin poder cobrar, y eso ya paso una vez: 50 minutos el 27/08. La
regla del `CLAUDE.md` aplica entera -- al tocar el camino del dinero, la
verificacion no es un `select`: es cobrar.

## Quien las llama (verificado antes de tocar nada)

`grep` sobre `apps/*/src`, `packages/*/src`, `scripts/`,
`supabase/functions/`, `agente-impresion/src` y `apps/costos/index.html`:

| Quien | Como entra |
|---|---|
| `apps/kiosko` (modo cajero) | sesion real de Auth via PIN -> `staff-login` |
| `apps/pos` (Cobro, PedidosPendientes) | sesion real de Auth |
| Edge Functions | **ninguna las llama** -- Clip confirma por `fn_confirmar_venta` |
| `scripts/` (instaladores) | **ninguno** |
| Kiosko en autoservicio | **no las toca** -- usa `crearOrdenKioskoCaja` y Clip |

Ese ultimo grep sobre `scripts/` es el que falto la vez que se rompio el
instalador del agente de impresion. Aqui si se hizo.

## El candado

Tres puertas legitimas, y cada una por una razon:

- **personal con sesion real** -- `fn_rol_staff() is not null`
- **`service_role`** -- hoy ninguna Edge Function las llama, pero si manana
  una lo hace, que no muera por esto
- **`postgres`** -- reparaciones a mano. PostgREST nunca entra asi: conecta
  como `authenticator` y hace `SET ROLE`.

Va `session_user` y **no** `current_user`: dentro de un `SECURITY DEFINER`
`current_user` es SIEMPRE el dueno, asi que el candado no cerraria nunca.

El parche no reescribe las funciones: lee `pg_get_functiondef`, verifica
que el ancla aparezca **exactamente una vez** (ya verificado: 1 y 1) y
reemplaza. Si el ancla no cuadra, aborta. Es idempotente: si ya tiene el
candado, la deja como esta.

El SQL va aqui completo a proposito: una sesion de trabajo se recicla y
el scratchpad se va con ella. Cuando se aplique, se mueve a
`supabase/migrations/` con su nombre y este bloque se borra.

```sql
-- Cerrar fn_cobrar_orden y fn_cobrar_orden_dividido a quien no es personal.
--
-- Se parchean SIN reescribirlas: se lee pg_get_functiondef, se verifica que
-- el ancla aparezca EXACTAMENTE una vez y se reemplaza. Si el ancla no
-- cuadra, aborta -- vale mas fallar ruidosamente que dejar a medias la
-- funcion por la que pasa cada venta.
do $mig$
declare
  v_nombre text;
  v_def text;
  v_nueva text;
  v_n int;
  v_ancla constant text := $a$begin
  select * into v_orden from ordenes where id = p_orden_id for update;$a$;
  v_guardia constant text := $g$begin
  -- Solo el personal cobra.
  --
  -- Estas dos son SECURITY DEFINER y estan abiertas a `anon` porque el
  -- kiosko habla como `anon` hasta que el cajero mete su PIN. Sin candado,
  -- cualquiera con la llave publica -- que vive en el navegador por
  -- diseno -- podia marcar una orden como pagada; y eso dispara
  -- fn_confirmar_venta, o sea que la comanda sale y barra la prepara.
  --
  -- Las tres puertas legitimas, y por que cada una:
  --   . personal con sesion real  -- kiosko en modo cajero, y el POS
  --   . service_role              -- Edge Functions. Hoy NINGUNA las llama
  --                                  (Clip confirma por fn_confirmar_venta),
  --                                  pero si manana una lo hace, que no
  --                                  muera por esto.
  --   . postgres                  -- reparaciones a mano. PostgREST jamas
  --                                  entra asi: conecta como `authenticator`
  --                                  y hace SET ROLE, nunca como `postgres`.
  --                                  Por eso va `session_user` y no
  --                                  `current_user`: dentro de un SECURITY
  --                                  DEFINER `current_user` SIEMPRE es el
  --                                  dueno, y el candado no cerraria nunca.
  if fn_rol_staff() is null
     and coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'Solo el personal puede cobrar una orden';
  end if;

  select * into v_orden from ordenes where id = p_orden_id for update;$g$;
begin
  foreach v_nombre in array array['fn_cobrar_orden', 'fn_cobrar_orden_dividido'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_nombre;

    if v_def is null then
      raise exception 'No encontre %', v_nombre;
    end if;

    -- Correrlo dos veces no debe meter la guardia dos veces.
    if position('Solo el personal puede cobrar una orden' in v_def) > 0 then
      raise notice '% ya tenia el candado, la dejo como esta', v_nombre;
      continue;
    end if;

    v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    if v_n <> 1 then
      raise exception 'El ancla aparece % veces en % (esperaba exactamente 1)', v_n, v_nombre;
    end if;

    v_nueva := replace(v_def, v_ancla, v_guardia);
    execute v_nueva;
    raise notice '% blindada', v_nombre;
  end loop;
end
$mig$;
```

## Como se aplica

Cualquier sesion nueva puede hacerlo entero. Se le dice:

> Aplica el blindaje pendiente de `docs/pendiente-blindaje-cobro.md`.

**Antes de tocar nada**, confirmar que no hay ventas vivas:

```sql
select count(*) from ordenes where created_at > now() - interval '30 minutes';
```

Tiene que dar **0**. Si no, abortar: la ventana muerta es 00:00-05:00 de
Merida (la primera venta del dia es a las 6).

## Como se verifica (no con un `select`)

1. `anon` llama a `fn_cobrar_orden` -> tiene que reventar.
2. `anon` llama a `fn_cobrar_orden_dividido` -> tiene que reventar.
3. Con sesion de personal simulada: `fn_crear_orden` -> `fn_cobrar_orden`
   -> la orden queda `pagado = true`.
4. Igual con `fn_cobrar_orden_dividido` en dos partes (efectivo +
   tarjeta): es el camino nuevo del mixto con la terminal del banco.
5. Limpiar en orden: `trabajos_impresion` -> `cocina_items` ->
   `pedidos_cocina` -> `inventario_movimientos` -> `venta_confirmaciones`
   -> `ventas` -> `pagos` -> `promocion_aplicaciones` -> `orden_items` ->
   `ordenes`.
6. Despues mirar `ordenes` de la ultima hora: si aparecen `pagado = false`
   consecutivas, la tienda esta parada y hay que revertir.

## Lo que NO se puede probar sin una persona enfrente

El cobro mixto **con tarjeta real**. Se puede mandar el cobro a la
terminal y comprobar que le llega **exactamente la parte de la tarjeta**
(no el total) y que cancelar no deja nada apuntado -- eso no necesita
plastico. Pero insertar una tarjeta y que Clip autorice de verdad lo tiene
que hacer alguien en la barra.
