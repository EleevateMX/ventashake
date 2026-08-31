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

El SQL vive en `supabase/migrations/` una vez aplicado; mientras tanto,
en el scratchpad de la sesion (`madrugada-blindaje.sql`).

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
