# Levantar otra tienda con este mismo sistema

Este documento es para la sesión que va a montar **otra tienda** (la
panadería, o la que siga). No cuenta qué hace Shakeaholic — eso está en
`CLAUDE.md`. Cuenta **qué se copia, qué se cambia y qué NO se debe
copiar**.

> **Regla de oro:** la tienda nueva va en **su propio proyecto de
> Supabase y su propio repo**. No se comparte base con Shakeaholic. Aquí
> hay una sola sucursal y muchas cosas asumen eso; meter dos negocios en
> la misma base es la clase de decisión que no se puede deshacer una vez
> que hay ventas reales de los dos.

---

## 1. Qué tamaño tiene esto en realidad

Para calibrar antes de prometer fechas. Medido el 17/09/26:

| | |
|---|---|
| Apps (React + Vite, salvo una) | **9** |
| Paquetes compartidos | 6 |
| Líneas de TypeScript/HTML propias | **37 541** |
| Tablas | 62 |
| Vistas | 7 |
| **Funciones de Postgres** | **161** |
| Triggers | 27 |
| Políticas RLS | 101 |
| Tipos enum | 20 |
| Migraciones guardadas | 146 |
| Edge Functions | 7 |
| Tareas programadas (pg_cron) | 8 |
| Documentos en `docs/` | 51 |

**Lo importante de esa tabla no es el total, es dónde está el peso: 161
funciones de Postgres.** La lógica de negocio de este sistema vive en la
base de datos, no en el frontend. El frontend es una cara bonita sobre
`fn_crear_orden`, `fn_cobrar_orden`, `fn_sync_app_data`… Quien piense en
portar esto tiene que pensar en portar SQL, no React.

---

## 2. La arquitectura, en una idea

**Cinco pantallas distintas miran el mismo estado, en vivo.** El cliente
pide en el kiosko; la comanda aparece sola en barra y en cocina; el folio
sale en la TV; la caja cobra; el agente de impresión —que corre en la PC
de la tienda, no en la nube— saca la etiqueta.

Eso manda sobre todo lo demás:

- No es una app de escritorio. Es un **estado compartido** con varias
  ventanas encima. (Ver `docs/correr-sin-supabase.md`: es la razón por la
  que un `.exe` suelto no puede con esto.)
- El dinero se calcula **en el servidor**, siempre. El cliente nunca manda
  precios. Eso se copia tal cual, sin discusión.
- Lo único que vive fuera de la nube es la impresión, porque las
  etiquetadoras hablan TSPL por red local.

---

## 3. Qué se copia y qué se cambia

### 3.1 Se copia entero, sin tocar

Esto es el producto. No lo reescribas:

- **Todo `packages/`** — `utils` (dinero, efectivo, comandas, extras,
  promos, errores), `supabase` (las consultas), `types`, `ui`, `payments`.
- **El camino del dinero**: `fn_crear_orden`, `fn_cobrar_orden`,
  `fn_cobrar_orden_dividido`, el mixto, el corte de caja por
  denominaciones, la máquina de estados de la orden y sus dos triggers de
  validación.
- **El inventario**: recetas → `inventario_movimientos` →
  `inventario_stock`, con el upsert que hace nacer el renglón (si no, el
  descuento falla callado; nos costó 30 días descubrirlo).
- **La impresión**: `agente-impresion/` completo, más
  `fn_imprimir_reclamar_trabajos` y `fn_imprimir_latido`.
- **Los scripts de la PC** (`scripts/`): arranque, acomodo de pantallas,
  instalador. Cambian rutas y nombres, no la lógica.
- **`packages/brand/tokens.css`** como *mecanismo* — los valores cambian,
  la idea de una sola fuente de la verdad para la marca no.

### 3.2 Se cambia siempre

| Qué | Dónde | Nota |
|---|---|---|
| Proyecto de Supabase | `.env` de cada app | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. **No está clavado en el código**: solo hay un mapa de alias de dominio en `packages/supabase/src/client.ts` que se vacía. |
| Dominios | Cloudflare Pages + workflow | 9 proyectos `shake-*` → renombrar |
| Marca | `packages/brand/tokens.css` | Y copiarlo a mano en `apps/costos/index.html`, que es HTML plano y se desvía solo |
| Sucursal, cajas, almacenes | Tablas base | Aquí hay **1 sucursal, 1 caja, 2 almacenes** (Bodega, Kiosko) |
| **Estaciones de cocina** | `cocinas` | Aquí son 2: `alimentos` y `bebidas`. **Una panadería probablemente es 1 sola** (mostrador), o 2 distintas (horno / barra de café) |
| Impresoras | `impresoras` | IP y nombre por estación |
| Catálogo | Costeos | Ver 3.3 |
| Pasarela de cobro | `packages/payments` | Ver 3.4 |

### 3.3 El catálogo: la decisión más importante

`apps/costos` es la fuente de la verdad del catálogo aquí, y está hecho
para un negocio de **proteínas, shakes y reventa**: sus secciones son
`proteins`, `shakeIngs`, `shakeRecipes`, `foodIngs`, `foodRecipes`,
`bebidas`, `snacks`, `empaque`.

**Para una panadería eso no encaja.** Una panadería tiene harina, levadura
y masa madre; produce por lote (una hornada de 40 piezas), no por unidad;
y le importa la merma del día. Antes de copiar Costeos, decide:

- ¿Producción por lote? Entonces `recetas` necesita rendimiento
  («esta receta da 40 piezas») — hoy es 1:1 producto↔insumo.
- ¿Merma diaria? Aquí no existe como concepto.
- ¿Se hornea con anticipación? Entonces hay stock de producto terminado,
  no solo de insumo. Hoy solo se descuenta al vender.

**Mi recomendación honesta: no copies `apps/costos` a la panadería.**
Cópiale el *mecanismo* (un documento JSON + un trigger que sincroniza
catálogo) y rehaz las secciones. Es el pedazo más pegado a este negocio
en particular.

### 3.4 El cobro

`packages/payments` ya está hecho con una interfaz (`createPayment`,
`getPaymentStatus`, `cancelPayment`) y dos implementaciones: Clip y un
mock. **Cambiar de pasarela es escribir una clase nueva**, no tocar el
kiosko.

Si la panadería usa la misma Clip, se copia tal cual — pero **con sus
propias llaves, en Edge Function Secrets**, nunca en el repo.

---

## 4. El orden para levantar la tienda nueva

Este orden no es arbitrario: cada paso desbloquea el siguiente y deja algo
comprobable.

1. **Proyecto de Supabase nuevo.** Anota el id.
2. **Exportar el historial completo de Shakeaholic** con
   `scripts/exportar-migraciones.sh` (ver el aviso de abajo). Son 198
   migraciones, no las 146 del repo.
3. **Aplicarlas en orden** sobre la base nueva — el nombre de archivo
   lleva la versión delante, así que basta con el orden alfabético.
4. **Datos base**: sucursal, cocinas (¡cuántas estaciones!), almacenes,
   cajas, roles, el empleado de gerencia y el de `desarrollo`.
5. **Las 8 tareas de `pg_cron`** — no se copian solas con las migraciones
   si las creaste a mano aquí. Revísalas una por una.
6. **Edge Functions + sus secrets** (pasarela, `staff-login`).
7. **Apps**: `.env` por app, proyectos de Cloudflare Pages, dominios.
8. **Catálogo** — lo último, porque depende de decidir 3.3.
9. **La PC de la tienda**: agente de impresión, impresoras, scripts.

> ### ⚠ El repo NO puede reconstruir la base — y hay un comando que lo arregla
>
> Comprobado el 17/09/26: **la base tiene 198 migraciones aplicadas y el
> repo solo 146.** Las 52 que faltan son las primeras, justo las que crean
> las tablas: por eso **29 de las 62 tablas no tienen `create table` en
> ningún archivo** — `ordenes`, `orden_items`, `productos`, `categorias`,
> `insumos`, `recetas`, `inventario_stock`, `ventas`, `sucursales`.
>
> Y hay un segundo problema encima: **solo 7 de los 146 archivos llevan
> fecha delante**, así que «correr las migraciones en orden» no está
> definido para los otros 139.
>
> **Las dos cosas se arreglan solas**, porque Supabase guarda cada
> migración con sus sentencias en `supabase_migrations.schema_migrations`
> — las 198, 732 kB, en orden. Ese es el respaldo real del esquema.
>
> ```bash
> # La cadena sale de Supabase -> Project Settings -> Database.
> # NO la guardes en el repo ni la pegues en un chat.
> export PGURI='postgresql://postgres.[ref]:[password]@...pooler.supabase.com:5432/postgres'
> bash scripts/exportar-migraciones.sh
> ```
>
> Deja los 198 archivos con su versión delante, así que el orden
> alfabético **es** el orden de aplicación. Probado de punta a punta
> contra un Postgres 16 local: exportar → aplicar en una base vacía →
> las tablas aparecen.
>
> Hazlo **antes** de clonar nada. Sirve para las dos cosas: la tienda
> nueva arranca de un esquema completo, y Shakeaholic deja de tener su
> única copia del esquema en producción.

**Prueba de que quedó** (la misma de aquí): `fn_crear_orden` →
`fn_cobrar_orden` de verdad, y comprobar que salieron pago, venta, pedido
de cocina, comanda y movimientos de inventario. Si eso pasa, el resto es
catálogo.

---

## 5. Lo que NO se debe copiar

**El hueco de seguridad del cobro está abierto a propósito aquí, y la
tienda nueva NO tiene por qué heredarlo.**

En Shakeaholic todas las funciones del cobro están abiertas a `anon` sin
comprobar quién llama. Eso **no es el diseño**: es una cicatriz. Se
cerraron una vez y la caja dejó de cobrar a los ocho minutos de abrir,
porque el kiosko en modo cajero cobra como `anon` y su sesión caduca sin
que nadie lo note (`docs/pendiente-blindaje-cobro.md`).

En una tienda nueva, **haz que el kiosko sostenga su sesión desde el día
uno** y deja el candado puesto. Es mucho más barato hacerlo antes de tener
ventas que después.

Tampoco copies:

- Los **440 insumos fantasma** ni los productos a medias. Base limpia.
- Las **cuentas viejas** (`admin`, `Prueba` en `app_users`).
- El **sufijo `- B` / `- R`** en los sabores: es legado que aquí sigue
  funcionando por compatibilidad.

---

## 6. Las trampas que SÍ se heredan

Todas están en `CLAUDE.md` sección 4, y aplican igual en cualquier tienda.
Las cinco que más caro salieron:

1. **Nada de tablas temporales ni `delete` pelado dentro de funciones que
   corren desde la app.** Supabase bloquea `DELETE` sin `WHERE` para los
   roles de la API — con la conexión de administrador el mismo código pasa
   sin chistar. Dejó la tienda 50 minutos sin cobrar.
2. **`found` lo reescribe CADA consulta.** Guarda la existencia en una
   bandera propia si entre el `select … into` y el `if found` hay
   cualquier otra consulta.
3. **`create or replace view` borra el `security_invoker`.** Hay que
   volver a declararlo o la vista queda insegura en silencio.
4. **`anon` tiene `statement_timeout = 3s`.** Si algo «a veces guarda y a
   veces no», mide el tiempo antes de revisar permisos.
5. **Al tocar el camino del dinero, la verificación no es un `select`: es
   cobrar.** Y probar con una sesión recién nacida no prueba nada — la
   sesión que importa es la de la pantalla que lleva días encendida.

Y la regla de producto que más ha valido: **un indicador que no puede
volver a verde deja de leerse**, y **una falla callada es peor que una
ruidosa** (el inventario no descontó durante 30 días sin un solo error en
pantalla).

---

## 7. Qué le va a faltar a la panadería

Cosas que este sistema **no** tiene y una panadería sí necesita:

- **Producción por lote y rendimiento de receta** (una hornada da N
  piezas). Hoy la receta es 1:1.
- **Merma del día** — lo que no se vendió y se tira. Aquí no existe.
- **Stock de producto terminado.** Aquí solo hay stock de insumo; el
  producto se «fabrica» al venderse.
- **Pedidos por encargo** (un pastel para el sábado). No hay concepto de
  orden futura: todo es venta inmediata.

Las cuatro tocan el mismo pedazo —recetas e inventario— así que conviene
diseñarlas juntas antes de escribir la primera migración de la panadería,
no después.

---

## 8. Por dónde empezar a leer el código

En este orden, y no más de lo necesario:

| Para entender | Lee |
|---|---|
| El negocio y las trampas | `CLAUDE.md` (completo, una vez) |
| Qué quedó vivo y qué abierto | `docs/estado-al-2-de-septiembre.md` |
| El camino del dinero | `fn_crear_orden`, `fn_cobrar_orden`, `apps/kiosko/src/pages/Pago.tsx` |
| Inventario | `CLAUDE.md` 2.3.5 y `fn_descontar_inventario_por_orden` |
| Impresión | `CLAUDE.md` 2.4 y `agente-impresion/` |
| Qué NO se puede portar tal cual | `docs/correr-sin-supabase.md` |
