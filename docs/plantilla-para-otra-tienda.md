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

Para calibrar antes de prometer fechas. Medido el 17/09/26 y otra vez el
19/10/26 — en un mes el sistema casi duplicó su base:

| | 17/09 | **19/10** |
|---|---|---|
| Apps | 9 | **11** (+ checador, + app nativa de iOS) |
| Paquetes compartidos | 6 | 6 |
| Líneas de TypeScript/HTML propias | 37 541 | **~62 000** |
| Tablas | 62 | **111** |
| Vistas | 7 | 8 |
| **Funciones de Postgres** | 161 | **363** |
| Triggers | 27 | 37 |
| Políticas RLS | 101 | 111 |
| Migraciones aplicadas en la base | 198 | **326** |
| Migraciones guardadas en el repo | 146 | 252 |
| Edge Functions | 7 | **17** |
| Tareas programadas (pg_cron) | 8 | 10 |
| Programas en la PC de la tienda | 1 | **3** (etiquetas, tickets, TVs) |
| Documentos en `docs/` | 51 | 57 |

**Lo importante de esa tabla no es el total, es dónde está el peso: 363
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
- **La impresión**: `agente-impresion/` (etiquetas, TSPL) y
  `agente-caja/` (tickets, ESC/POS) completos, más la cola
  `trabajos_impresion`, `fn_imprimir_reclamar_trabajos`,
  `fn_imprimir_latido` y `fn_imprimir_confirmar`. Ver la sección 9.1.
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
9. **La PC de la tienda**: agente de etiquetas, agente de tickets,
   impresoras con IP fija (reservada en el router), scripts. Y el de TVs
   si aplica.

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
| Todo lo construido, con veredicto | La sección 9 de este documento |

---

## 9. Todo lo que se construyó, y si conviene llevárselo (al 19/10/26)

Tres veredictos:

- **✅ Tómalo**: está probado en venta real y no depende del giro.
- **🔧 Tómalo, pero ajústalo**: la idea sirve; los detalles son de aquí.
- **⛔ No lo tomes así**: aquí funciona porque ya está vivo y moverlo
  cuesta, pero en una tienda nueva sale más barato hacerlo bien desde el
  día uno.

### 9.1 Impresión — lo que más vale llevarse

Hay **tres programas** en la PC de la tienda, cada uno con su impresora:

| Programa | Carpeta | Imprime en | Idioma | Se instala con |
|---|---|---|---|---|
| Etiquetas de comanda | `agente-impresion/` | Etiquetadoras de red (barra, cocina) | TSPL | `instalar-todo.bat` / `instalar-agente-impresion.bat` |
| Tickets de caja | `agente-caja/` | Térmica de 80 mm (`:9100`) | ESC/POS | Admin → Descargas → «Agente de tickets de caja» |
| TVs | `agente-pantallas/` | TVs por DLNA | — | `instalar-agente-pantallas` |

**Cómo funcionan las tres impresoras.** La base tiene una cola,
`trabajos_impresion`, y cada impresora tiene su token. El agente reclama
sus trabajos, los imprime y confirma. Late cada pocos segundos reportando
su versión, y Admin la compara contra la esperada. Una reimpresión es una
copia ligada al original (`copia_de`), con tope de copias, y no se apila
si ya hay una en cola.

- ✅ **La cola, el token por impresora y el latido con versión.** Con eso
  se sabe a distancia si la impresora está viva y al día.
- ✅ **Imprimir solo desde un trigger, envuelto en un bloque que se traga
  sus propios errores.** Una impresora rota nunca debe frenar un cobro ni
  un corte. Aquí están envueltos el ticket de venta, el corte, la comanda
  y la dinámica de premios.
- ✅ **La forma de instalar**:
  - se reparte un `.bat` que se quita solo la marca de internet y corre el
    `.ps1` con `-ExecutionPolicy Bypass` (nunca un `.ps1` suelto);
  - la llave pública la toma del `.env` de la PC;
  - imprime una prueba directa por TCP antes de nada;
  - deja una ventana minimizada que se relanza si se cae, con acceso en el
    Inicio de **todos** los usuarios;
  - **no dice LISTO hasta que el servidor ve el latido**.
- ✅ **Admin → Ticket de caja**: datos del negocio, pie, QR de Rewards, QR
  del WiFi, cuándo imprime solo y el logo convertido a 1 bit
  (`packages/utils/src/logoTicket.ts`, con pruebas).
- ✅ **Botones desde el kiosko**: calibrar al cambiar el rollo, «Probar ·
  gasta 1» y «Imprimir ticket». Así nadie tiene que ir a la PC.
- ✅ **Admin manda el corte a la impresora de caja**
  (`fn_corte_imprimir_caja`), no al diálogo del navegador de quien está
  viendo Admin.
- 🔧 **Frases del pie por temporada y dinámicas con premios** («Trick or
  Shake»). Son de la marca; llévalas solo si el negocio nuevo va a hacer
  esas dinámicas.
- ⛔ **Servicio de Windows (node-windows).** Quedó dos veces «corriendo»
  sin reportarse nunca. La ventana que se relanza sola funciona.
- ⛔ **Que cualquiera con la llave pública pueda rotar el token de una
  impresora** (`fn_rotar_token_impresora` y `fn_admin_impresoras` abiertas
  a `anon`, porque el instalador corre en una PC sin sesión). En la nueva,
  Admin genera un **código de instalación de un solo uso** y el instalador
  lo pide.
- ⛔ **Mandar la cabecera de papel (`SIZE`, `GAP`) delante de cada
  etiqueta.** Es la sospecha principal de las tres etiquetas en blanco por
  comanda. En la nueva, prueba desde el principio con la cabecera una sola
  vez.
- **Qué comprar**: etiquetadora TSPL de red y térmica ESC/POS de red, las
  dos con **IP fija reservada en el router**. Las de USB obligan a
  instalar drivers y amarran la impresora a una PC.

### 9.2 Caja y dinero

- ✅ **El dinero se calcula en el servidor**: pago dividido que valida las
  partes antes de insertar, mixto con la tarjeta primero, y la máquina de
  estados que no deja regresar.
- ✅ **Clip**: las rutas reales (CLAUDE.md 2.3), preguntar en vez de creerle
  al webhook, y el barrido cada 2 min. Y enseñarle a la tienda que
  `ERR10_04` es la app del Pinpad cerrada.
- ✅ **Contar por denominación** al abrir y al cerrar, separando billetes y
  monedas (el $20 existe como los dos: `efectivo.ts`).
- ✅ **Fondo fijo y cambio de turno**: se calcula el retiro y qué se queda,
  quien recibe firma con su PIN, y sale el comprobante con folio. En Admin
  están **Comprobantes**, y el corte se imprime solo al cerrar, en la de
  caja.
- ✅ **El cierre del día se calcula en vivo, no se guarda**; solo se guardan
  las aclaraciones. Incluye la conciliación con la API de transacciones
  de Clip.
- ✅ **Vender sin internet**: efectivo o terminal del banco, folio
  provisional, comanda por la red local, y se registra al volver con una
  función que envuelve a las de siempre. **Pon además un segundo internet
  (4G con failover)**: es lo que más resuelve.
- ✅ **Caja en vivo y avisos push a gerencia** (empieza a contar, entrega,
  abre, cierra) y la bitácora de lo que se quita del carrito.
- ✅ **Cortesías** a $0, con PIN de una lista nominal (ni gerencia la trae
  por rol) y que sí bajan inventario.
- ✅ **Ventas en espera en el navegador**, no en la base, y al retomarlas
  se refrescan contra el precio de hoy.
- ⛔ **Las funciones del cobro abiertas a `anon`** (sección 5). El kiosko
  debe sostener su sesión desde el día uno.
- ⛔ **El correo de cortes sin proveedor.** Aquí quedó construido y
  esperando llave de Resend. Decide al arrancar si va o no; una cola que
  nunca sale es un indicador que no vuelve a verde.

### 9.3 Inventario

- ✅ **El descuento por trigger al cobrar, con upsert.** Que pueda quedar en
  negativo es a propósito: un negativo se ve.
- ✅ **Kardex por renglón**, salidas con motivo, reinicio con PIN y
  cancelación que regresa lo descontado (opcional y una sola vez).
- ✅ **La mercancía entra como MOVIMIENTO** (kiosko → «¿Llegó
  mercancía?»), por caja o por pieza, y el traspaso resta en el origen.
- ✅ **Un combo descuenta lo que se eligió** (`inventario_como` y
  `combo_fijos`), armado en Admin → Combos con semáforo.
- ✅ **«Lo que no descuenta» y Revisión del menú**: nombran con nombre y
  apellido lo que está chueco, sin arreglarlo solos.
- ⛔ **El modelo de Costeos**: un documento JSON que manda la
  **diferencia** contra su último número. Casi todos los bugs caros de
  inventario salieron de ahí:
  - entradas contadas dos veces;
  - 630 insumos fantasma;
  - una pestaña vieja que deshacía ventas;
  - recetas que no se reapuntan al renombrar;
  - productos partidos en dos.

  En la nueva: catálogo en **tablas**, inventario **solo por
  movimientos**, y que ninguna pantalla mande un total, solo eventos.
  Costeos puede seguir siendo la hoja donde se calcula el costo, pero sin
  ser dueño de la existencia.
- 🔧 **Proteína en scoops.** La idea (una unidad base y la presentación
  como factor) sí se lleva; en una panadería serán gramos o piezas por
  lote (sección 7).

### 9.4 Menú, comanda y cocina

- ✅ **Las reglas de qué se ofrece, qué se elige solo y qué se cobra viven
  en `@shake/utils`** (`extras.ts`, `observaciones.ts`, `gruposDeExtras`,
  `dobleScoopDe`, `otrasPartes`). Tienen pruebas, y las importan el
  kiosko y el POS. Su espejo en la base es `fn_clase_extra`.
- ✅ **Las reglas de los extras**:
  - observaciones con alcance por categoría o por producto;
  - «elige una» que nunca preselecciona algo que cobra;
  - «solo si…» (`requiere_grupo`);
  - un extra se puede vender suelto como su gemelo.
- ✅ **La comanda**: cada extra cuelga de su producto, el combo se reparte
  por estación y cada tarjeta dice dónde va la otra parte.
- ✅ **`traerTodo()`** para paginar: PostgREST corta en 1 000 filas y no
  avisa.
- 🔧 **Kiosko y POS como dos apps.** Aquí la tienda cobra desde el kiosko en
  modo cajero y el POS quedó de respaldo. Dos puertas a la misma venta se
  separan solas; en la nueva, empieza con **una sola app de caja**.
- ⛔ **Productos gemelos** (el mismo artículo como bebida costeada y como
  extra sin costear, con la misma clave). Un artículo, un producto.

### 9.5 TVs

- ✅ **Admin → Pantallas (TV)**: qué le toca a cada TV, qué está mostrando
  y las imágenes con fechas de temporada. El empujador entra con su
  propia llave, que Admin genera y enseña una sola vez.
- ✅ **La TV de folios** que late y se ve en Admin.
- ⛔ **TVs Hisense VIDAA.** No dejan encenderse ni abrir el navegador por
  red; solo aceptan imágenes por DLNA, y su puerto de control pide un
  certificado de su app. **En la nueva, un stick HDMI o una mini PC que
  abra la URL**: la pantalla se vuelve una página web más y el empujador
  sobra.

### 9.6 Personal

- ✅ **El checador** (CLAUDE.md 2.8):
  - guarda eventos, no turnos;
  - la hora la pone el servidor y nada se edita ni se borra;
  - reglas por persona, por día de la semana y excepciones de una fecha;
  - una sola comida por jornada;
  - un turno sin salida caduca a las 12 h como mínimo.
- ✅ **Permisos por persona**, y el corte con candado **en el servidor**
  (`hint = 'requiere_autorizacion'` → PIN de quien sí puede).
- ✅ **Descuento de personal calculado en el servidor**: envuelve a
  `fn_crear_orden`, con clave bcrypt o un QR de 2 minutos desde la app.
- 🔧 **Expediente y contratos.** Llévalos, pero la plantilla del contrato
  la revisa el abogado del negocio nuevo; la de aquí dice BORRADOR a
  propósito.
- 🔧 **Checador desde el teléfono.** Viene apagado. Si se usa, primero
  hay que hacer el código que rota en el kiosko: la geocerca sola se
  puede engañar.

### 9.7 Clientes (Rewards y apps)

- 🔧 **Todo esto es caro de sostener**: tarjeta 13+1, mancuernas, PWA, app
  nativa de iOS, Apple Wallet, avisos push y pedidos por la app (estos
  nacen apagados). Tómalo **solo si el negocio nuevo lo va a usar desde el
  inicio**. La app de iOS pide cuenta de Apple Developer, ficha a mano y
  revisión.
- ✅ **«La sorpresa no se anuncia»**, y que el servidor no mande el número.
  Esconderlo solo en la pantalla sería teatro.

### 9.8 La PC y la operación

- ✅ **La PC**: `instalar-todo.bat` partido en dos mitades (elevada y de
  usuario), el arranque en orden (internet → agente → pantallas →
  actualizar al final) y `pantallas.ps1`, que reparte las ventanas por
  tamaño de monitor.
- ✅ **Admin → Descargas** con la versión de cada agente, y los
  instaladores se copian en el build, no se duplican en el repo.
- ✅ **Admin → «¿Qué hago si…?»** (una venta de prueba que se deshace),
  **Pulso**, y **En vivo** con el sello de «hace N s».
- ✅ **`hoyEnMerida()`**: la fecha del negocio no es la de UTC. **Cambia la
  zona horaria** si la tienda nueva está en otro lado.
- ✅ **`.bat`/`.ps1` en ASCII puro** (`verificar-scripts-ascii.mjs`), y
  probar con **Windows PowerShell 5.1**, no con `pwsh`:
  - `@(Invoke-RestMethod)` anida el arreglo;
  - `[datetime]"…Z"` sale en hora local.

### 9.9 Los patrones de base de datos que más ahorraron

Todos están contados en CLAUDE.md sección 4. Los que más conviene llevarse
desde el primer día:

1. **Envolver, no tocar**: `fn_venta_sin_internet`, `fn_cortesia_crear`,
   `fn_crear_orden_personal` y `fn_cerrar_corte_con_fondo` llaman a las
   del dinero sin cambiarlas.
2. **El parche anclado** para funciones grandes: el ancla debe aparecer
   exactamente N veces, o no se aplica.
3. **Todo lo que cuelga de la cadena del cobro se traga sus propios
   errores.**
4. **Probar cobrando dentro de una transacción que se deshace**, no con un
   `select`.
5. **Cada candado se prueba por HTTP con la llave publicable.** Hay que
   revocar a `anon` **y** a PUBLIC, y si contesta el mensaje de tu propio
   candado, la puerta sigue abierta.
6. **`search_path` con `extensions`** en toda función que use `crypt`.
7. **`statement_timeout` por función**, nunca para el rol entero.
8. **Exportar las migraciones** (`scripts/exportar-migraciones.sh`) y, en
   la nueva, **guardarlas todas en el repo desde la primera**. Así el
   repo sí reconstruye la base.

### 9.10 El orden recomendado para la tienda nueva

Lo mínimo para abrir primero, y lo demás cuando haya ventas:

1. Dinero y caja: crear, cobrar, el corte con fondo fijo y la pasarela.
2. Las comandas en pantalla y el agente de etiquetas.
3. El ticket de caja con su agente.
4. Inventario por movimientos, con kardex.
5. Checador y permisos.
6. Caja en vivo, cierre del día y TVs.
7. Rewards y apps, al final y solo si se van a usar.
