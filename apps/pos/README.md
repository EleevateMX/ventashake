# POS de caja (fase 5–6)

Se migrará desde el repo `puntodeventa`. Debe consumir exclusivamente
`@shake/supabase` y `@shake/types` — cero queries sueltas.

Flujo objetivo (ya soportado por la base):

1. `abrirCaja()` — corte abierto por caja (único, garantizado por índice).
2. Carrito con productos de `listarProductos()` (precio desde `productos`).
3. `crearOrden()` con `corte_id`, `almacen_id` (Kiosko) y `empleado_id`.
4. `cobrarOrden()` con método (efectivo / tarjeta / clip / cortesía / otro).
   El trigger de la base descuenta inventario por receta, registra la venta
   y genera pedidos de cocina — el frontend NO duplica esa lógica.
5. `cerrarCaja()` + `resumenCorte()` para el corte.
