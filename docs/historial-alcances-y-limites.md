# Shakeaholic — alcances, límites e historial por fecha

Corte al **19 de noviembre de 2026**. Sale de dos fuentes que no se
contradicen: el historial del repositorio (549 cambios, del 01/07 al 17/11)
y la tabla de órdenes de la base de producción. Las fechas son las del día
en que el cambio se subió; lo que se sube a `main` queda en producción ese
mismo día.

---

## 1. Resumen

| Hito | Fecha | Cómo se sabe |
|---|---|---|
| Arranca la construcción | **01/07/2026** | Primer cambio: monorepo, migraciones del POS y app de costos |
| Primeras 6 apps conectadas a la base | 02/07 | Caja, kiosko, cocina, barra, pantalla de folios y Admin |
| Despliegue automático a internet | 16/07 | Cada cambio a `main` publica las apps en Cloudflare Pages |
| **Primera venta real cobrada** | **30/07** | 4 órdenes pagadas ese día, en la caja (canal `pos`) |
| Ventas de prueba, sueltas | 30/07 – 09/08 | De 1 a 4 órdenes por día, no todos los días |
| **Punto de venta funcional (primer día completo de operación)** | **10/08/2026** | 28 órdenes cobradas en efectivo, tarjeta y Clip; desde ahí vende todos los días |
| Cobro integrado con la terminal Clip, de punta a punta | 17/08 | Ese día: 85 órdenes, el primer día de volumen normal |
| Sesión real del personal y el agujero de precios cerrado | 21/08 | Antes, el personal hablaba con la base como anónimo |
| Clip estable (las rutas reales de su API) | 22/08 | Se destrabaron los cobros que se quedaban «esperando» |
| Operación de crucero | desde la semana del 31/08 | 860 a 1 200 tickets por semana desde entonces |

**En una frase:** el sistema vende de forma continua desde el **10 de
agosto de 2026**. Quedó completo para el día a día (Clip integrado,
sesiones del personal y comandas impresas) entre el **17 y el 22 de
agosto**. Todo lo posterior son módulos nuevos y arreglos sobre algo que ya
estaba vendiendo.

### Tickets cobrados por semana

| Semana (lunes) | Tickets | Nota |
|---|---:|---|
| 27/07 | 6 | Primeras ventas de prueba (30/07) |
| 03/08 | 10 | Prueba |
| **10/08** | **161** | **Arranque real** |
| 17/08 | 475 | Clip integrado |
| 24/08 | 727 | |
| 31/08 | 862 | Pago dividido, mixto y venta en espera |
| 07/09 | 1 089 | |
| 14/09 | 914 | |
| 21/09 | 1 047 | Checador, personal, permisos |
| 28/09 | 1 163 | |
| 05/10 | 1 204 | Semana más alta |
| 12/10 | 1 088 | |
| 19/10 | 1 092 | |
| 26/10 | 1 072 | |
| 02/11 | 1 142 | |
| 09/11 | 1 064 | |
| 16/11 | 488 | Semana en curso al hacer este corte |

---

## 2. Alcance del sistema cuando se volvió funcional (10/08/2026)

Lo que **sí** hacía el día que empezó a vender todos los días:

| Módulo | Qué hacía |
|---|---|
| **Caja (POS)** | Entrar con PIN, cobrar en efectivo y registrar tarjeta, corte de caja con total tecleado, descuentos con candado de gerente (26/07) |
| **Kiosko** | Autoservicio de varios pasos (16/07) y **modo cajero** (30/07): el cajero levanta el pedido y cobra en el mismo acto. Leche pegada al shake y proteína a elegir (03/08) |
| **Cocina y barra (KDS)** | Comandas en pantalla por estación, en tiempo real, con «Entregar ya» (17/07) |
| **Pantalla de folios** | Tablero de pedidos listos para el cliente |
| **Admin** | Dashboard, empleados (alta y PIN), impresoras, panel de salud del sistema, conciliación manual (16–17/07) |
| **Costeos** | App de costeo real; al guardar, sincroniza el catálogo (productos, insumos y recetas) |
| **Catálogo** | Datos reales cargados desde Costeos (02/07: 57 productos, 182 insumos, 182 recetas); suplementos, scoops, snacks por marca y fotos (28/07) |
| **Inventario** | Descuento automático por receta al cobrar (trigger) |
| **Dinero** | Órdenes y cobros atómicos e idempotentes; el servidor recalcula precios; máquina de estados del pago (17/07) |
| **Impresión** | Cola de impresión y agente local en la PC de la tienda (17/07); al día siguiente, 11/08, etiquetas en TSPL para las etiquetadoras de barra y cocina |
| **Lealtad (Rewards)** | Mancuernas, cupones y QR del cliente (02/07); app web con Google (28/07); cierre del círculo en caja (08/08) |
| **Promociones y combos** | Promociones personalizadas (02/07) y combos que agrupan productos (19/07) |
| **Web pública** | `shakeaholic.mx` (08/08) |
| **Instalación** | Lanzador de las 3 pantallas en la PC de la sucursal (28/07) |

## 3. Límites que tenía al arrancar, y cuándo se resolvió cada uno

| Límite el 10/08 | Se resolvió | Cómo |
|---|---|---|
| La terminal Clip no estaba integrada: la tarjeta se cobraba aparte y solo se registraba | 17/08 y 22/08 | Cobro real por la API de PinPad; luego las rutas correctas de su API |
| El personal hablaba con la base como anónimo (sin sesión real) | 21/08 | El PIN abre una sesión de verdad, en el kiosko y en la caja |
| Se podían alterar precios desde fuera | 21/08 y 31/08 | Se cerró el agujero de precios y luego las tablas del catálogo y del costeo |
| El corte se capturaba como un total tecleado | 25/08 y 02/09 | Conteo por denominación, al abrir y al cerrar |
| Guardar en Costeos publicaba de inmediato en el kiosko | 25/08 | Guardar y «Mostrar en el kiosko» se separaron, con vista previa del cambio |
| Las recetas editadas en Costeos no llegaban al inventario | 26/08 | Error de paréntesis en el sync que nunca borraba las recetas viejas |
| Solo un método de pago por venta | 31/08 | Pago dividido y cobro mixto (efectivo + terminal) |
| No se podía apartar una cuenta para atender al siguiente | 31/08 – 02/09 | Venta en espera |
| El inventario dejaba de bajar «en silencio» (264 insumos) | 07/09 | El renglón de existencia nace solo y los combos se abren |
| Órdenes de caja que se quedaban «cobrando» para siempre | 07/09 | El barredor cubre también el canal de caja |
| Listas cortadas en 1 000 filas sin aviso (se perdían extras del menú) | 20/09 | Lectura paginada en todas las listas que crecen |
| Sin reloj checador, sin permisos por persona, sin descuento de personal | 23/09 – 26/09 | Módulos nuevos (ver historial) |
| Sin internet no se vendía | 08/10 | Venta sin internet en efectivo o terminal del banco |
| El corte solo reflejaba el efectivo | 01/11 | Corte completo: ventas por método, cancelaciones, cortesías y descuentos |

---

## 4. Historial de cambios y módulos, por fecha

Tipo: **Nuevo** = módulo o función que no existía · **Mejora** = algo que ya
existía y ahora hace más · **Arreglo** = algo que fallaba.

### Julio 2026 — construcción

| Fecha | Módulo | Qué cambió | Tipo |
|---|---|---|---|
| 01/07 | Base | Monorepo, migraciones del POS y app de costos (fórmula alineada con el tablero anterior) | Nuevo |
| 02/07 | Todas | Seis apps conectadas a Supabase: caja, kiosko, cocina, barra, folios y Admin; prueba de punta a punta | Nuevo |
| 02/07 | Catálogo | Carga del catálogo real desde Costeos | Nuevo |
| 02/07 | Rewards | Lealtad con mancuernas, cupones y QR; app web con Google; canje en caja y kiosko | Nuevo |
| 02/07 | Promociones | Promociones personalizadas | Nuevo |
| 16/07 | Despliegue | Publicación automática de las 8 apps a Cloudflare Pages | Nuevo |
| 16/07 | Marca | Identidad Shakeaholic en todas las apps | Mejora |
| 16/07 | Caja / kiosko | Login de cajero por PIN; kiosko de autoservicio rediseñado | Nuevo |
| 16/07 | Admin | Dashboard, empleados con alta, edición y PIN | Nuevo |
| 17/07 | Dinero | Cobros atómicos e idempotentes; fin del autoaprobado; máquina de estados del pago | Arreglo |
| 17/07 | Impresión | Cola de impresión, agente local y panel de impresoras en Admin | Nuevo |
| 17/07 | Admin | Panel Sistema: salud, modo de pago del kiosko, conciliación manual | Nuevo |
| 19/07 | Costeos | Costeo de empaques corregido; entradas de compra con prorrateo de envío | Arreglo / Nuevo |
| 19/07 | Combos | Productos que agrupan otros productos | Nuevo |
| 26/07 | Caja | Candado de gerente en descuentos y cupones; alta de clientes | Nuevo |
| 28/07 | Catálogo | Suplementos vendibles, extras por receta, venta de scoops, fotos de producto | Nuevo |
| 28/07 | Clip | Autenticación contra la API de Clip | Nuevo |
| 28/07 | Instalación | Lanzador de las 3 pantallas en la PC de la sucursal | Nuevo |
| 30/07 | Kiosko | **Modo cajero**: levantar el pedido y cobrar en el mismo acto | Nuevo |
| 30/07 | — | **Primera venta real cobrada** | Hito |

### Agosto 2026 — arranque

| Fecha | Módulo | Qué cambió | Tipo |
|---|---|---|---|
| 03/08 | Kiosko | La leche va pegada al shake; elegir proteína | Mejora |
| 08/08 | Web | Página pública shakeaholic.mx | Nuevo |
| **10/08** | — | **Primer día completo de operación** | Hito |
| 11/08 | Impresión | Etiquetas de comanda en TSPL (barra y cocina) con instalador del agente | Nuevo |
| 17/08 | Clip | **Cobro real en la terminal Clip, de punta a punta** | Nuevo |
| 17/08 | Kiosko | Nombre del pedido, observaciones en un toque, teclado táctil propio | Mejora |
| 17/08 | Admin | Categorías en una sola página; Clientes con expediente | Nuevo |
| 17/08 | Rewards | Expediente completo del cliente y recibo digital por QR | Mejora |
| 17/08 | Infraestructura | Todas las apps bajo shakeaholic.mx y api.shakeaholic.mx | Mejora |
| 20/08 | Catálogo | Cada categoría elige a qué pantalla va | Mejora |
| 21/08 | Seguridad | Sesión real para el personal; cabeceras de seguridad; login de Costeos real | Arreglo |
| 21/08 | Costeos | Respaldo automático cada noche; renombrar ya no duplica | Nuevo / Arreglo |
| 22/08 | Clip | Barrido de cobros atorados; ruta real de su API; referencia legible | Arreglo |
| 23/08 | Admin | Pestaña **En vivo**: la tienda en tiempo real | Nuevo |
| 23/08 | Kiosko | Historial de pedidos; acceso al corte de caja | Nuevo |
| 24/08 | PC de la tienda | Un clic abre el día; el agente se actualiza solo y reporta su versión | Nuevo |
| 24/08 | Rewards | Se vuelve app: monedero de mancuernas, tarjeta de sellos 13+1, pase con QR, metas; TestFlight | Nuevo |
| 25/08 | Costeos | Guardar deja de ser publicar; Admin enseña el cambio antes de publicar | Mejora |
| 25/08 | Caja | Corte por denominación | Mejora |
| 25/08 | Rewards | Canje del saldo | Nuevo |
| 26/08 | Inventario | Las recetas vuelven a sincronizar; calculadora de cambio | Arreglo / Nuevo |
| 27/08 | Comandas | Parpadeo, aquí o para llevar, el extra con su producto | Mejora |
| 27/08 | Promociones | Las promos de Admin ya cobran | Arreglo |
| 30/08 | Impresión | Calibrar la etiquetadora desde la barra y el kiosko | Nuevo |
| 30/08 | Admin | Descargas: los instaladores servidos desde el dominio | Nuevo |
| 31/08 | Admin | «¿Qué hago si…?» (19 fichas con botones que comprueban), Peticiones, reportar un problema | Nuevo |
| 31/08 | Cobro | **Pago dividido, cobro mixto con terminal, venta en espera**, corregir un renglón | Nuevo |
| 31/08 | Seguridad | Puerta de desarrollo; catálogo y costeo cerrados a la llave pública | Arreglo |

### Septiembre 2026 — operación y control

| Fecha | Módulo | Qué cambió | Tipo |
|---|---|---|---|
| 02/09 | Costeos | El guardado fallaba por tiempo (3 s), no por permisos | Arreglo |
| 02/09 | Caja | Abrir caja contando billetes; cortes de caja en Admin | Mejora |
| 06/09 | Caja | El billete y la moneda de $20 dejan de pisarse; aviso a pantalla completa si no pasa la tarjeta; tickets del turno | Arreglo / Nuevo |
| 06/09 | Admin | Pulso, minuto a minuto (solo desarrollo) | Nuevo |
| 07/09 | Inventario | El descuento deja de fallar callado; cargar mercancía desde el kiosko | Arreglo / Nuevo |
| 07/09 | Kiosko | Botón visible «Caja y turno» | Mejora |
| 15/09 | Inventario | Recetas en cero visibles | Arreglo |
| 17/09 | Base | Exportador del historial: el repositorio ya puede reconstruir la base | Nuevo |
| 17/09 | Comandas | Las observaciones salen solo donde aplican | Mejora |
| 17/09 | Rewards | La sorpresa deja de anunciarse | Mejora |
| 17/09 | Admin | Paneles que se refrescan solos; «Ventas de hoy» dejaba de contar después de las 18:00 | Arreglo |
| 18/09 | Kiosko | El doble scoop cobraba $39 en vez de $49 | Arreglo |
| 20/09 | Kiosko | No preselecciona nada que cobre; extras que dependen de un grupo («solo si…») | Arreglo / Nuevo |
| 20/09 | Catálogo | El corte de 1 000 filas sacaba productos del menú | Arreglo |
| 20/09 | Admin | Revisión del menú: nombra lo que está chueco | Nuevo |
| 23/09 | Personal | **Reloj checador** (barra y teléfono con geocerca), expediente y contratos | Nuevo |
| 23/09 | Personal | **Descuento de personal** calculado por el servidor | Nuevo |
| 23/09 | Comandas | Reimprimir la comanda; «Preparar después» con hora de entrega | Nuevo |
| 24/09 | Personal | Reglas del checador por persona; beneficio por categoría | Mejora |
| 26/09 | Personal | **Permisos por persona**; el corte con candado | Nuevo |
| 26/09 | Combos | El combo se reparte por estación; galleta obligatoria en los combos Milo | Mejora |
| 26/09 | Inventario | Fin de los insumos fantasma de Costeos | Arreglo |
| 27/09 | Alimentos | Doble proteína en alimentos | Nuevo |
| 30/09 | Ventas | **Historial por periodo y cierre diario**, con conciliación de Clip | Nuevo |
| 30/09 | Inventario | Kardex por producto, salidas con motivo, reiniciar con PIN | Nuevo |
| 30/09 | Caja | Fondo inicial + efectivo vendido; fondo de caja establecido | Mejora |
| 30/09 | Admin | Eliminar extras, combos y categorías; categoría desde Costeos | Mejora |

### Octubre 2026 — apps del cliente, inventario fino y caja a distancia

| Fecha | Módulo | Qué cambió | Tipo |
|---|---|---|---|
| 02/10 | Rewards iOS | **App nativa de iPhone** (SwiftUI): tarjeta, menú, Apple Wallet, modo personal con Face ID, avisos push, aliados, eliminar cuenta | Nuevo |
| 02/10 | Personal | Precio de personal escaneando el código de la app | Nuevo |
| 06/10 | Pedidos por la app | Pagar primero (Clip Checkout) y pasar a recoger; **nace apagado** | Nuevo |
| 06/10 | Rewards web | La app web queda a la par de la de iPhone (Android y navegador), con push web | Nuevo |
| 06/10 | Personal | Una sola comida por jornada; la salida manda | Arreglo |
| 07/10 | Costeos | Lo no guardado se recupera; botón de guardar que dice su estado; reiniciar inventario a 0 | Arreglo / Nuevo |
| 08/10 | Kiosko | **Vender sin internet** (efectivo y terminal del banco) | Nuevo |
| 09/10 | Caja | **Fondo fijo, retiro calculado, entrega de turno con PIN y comprobante** | Nuevo |
| 09/10 | Impresión | Frases de la etiqueta por temporada, con Milo | Nuevo |
| 09/10 | Inventario | La proteína en scoops; la elegida descuenta su bote | Arreglo |
| 10/10 | Impresión | Comprobante de corte en la impresora de tickets; dinámicas con premios («Trick or Shake») | Nuevo |
| 10/10 | Inventario | Botes de venta y «abriste un bote para la barra» | Nuevo |
| 13/10 | iOS | Ver y mandar la revisión de la App Store desde GitHub | Nuevo |
| 15/10 | Kiosko | **Cortesías** con PIN (en $0, con comanda e inventario) | Nuevo |
| 15/10 | Admin | Costeos dentro de Admin | Mejora |
| 16/10 | Combos | Cada opción descuenta su producto real; una sola pantalla de combos | Arreglo / Mejora |
| 17/10 | Inventario | Kardex con ventas en Costeos; conteo por peso; cancelar puede regresar inventario | Nuevo |
| 17/10 | Admin | **Caja en vivo** (también desde el teléfono); avisos de caja a gerencia | Nuevo |
| 17/10 | Kiosko | Imprimir el ticket de caja solo si el cliente lo pide; reimprimir | Nuevo |
| 18/10 | Caja | Agente de tickets de caja con instalador; Admin → Ticket de caja | Nuevo |
| 18/10 | Pantallas | Admin → Pantallas (TV): qué transmite cada TV | Nuevo |
| 18/10 | Inventario | Las entradas de Costeos se contaban dos veces en bodega | Arreglo |
| 19/10 | Costeos | Bebida y proteína con el mismo nombre ya no comparten insumo | Arreglo |
| 20/10 | Costeos | La entrada elige si va a bodega o al kiosko | Mejora |
| 24/10 | Kiosko | **Cupones de descuento con PIN**; producción de preparados | Nuevo |
| 26/10 | Impresión | El boleto de la dinámica solo en barra y uno por vaso; frases por estación | Arreglo / Mejora |
| 29/10 | Rewards en caja | El cliente se busca por el servidor (desde el 22/08 no se ligaba ninguna venta); el cobro pregunta si suma mancuernas y escucha el lector QR | Arreglo / Nuevo |

### Noviembre 2026

| Fecha | Módulo | Qué cambió | Tipo |
|---|---|---|---|
| 01/11 | Caja | **Corte completo**: ventas por método, cancelaciones, devoluciones, cortesías y descuentos | Mejora |
| 05/11 | Web | Un solo link para bajar la app: shakeaholic.mx/app | Nuevo |
| 05/11 | Rewards | Gerencia cambia cuánto se gana y qué no suma | Nuevo |
| 17/11 | Kiosko | Pedidos de la app en la caja: aviso con sonido, panel y «Marcar como entregado» | Nuevo |
| 17/11 | Admin | Qué sale en la app: esconder categorías y productos del menú del cliente | Nuevo |
| 17/11 | Apps del cliente | Personalizar por secciones, como el kiosko (web y iPhone) | Mejora |
| 17/11 | Apps del cliente | Avance de sellos y recompensas (interruptor en Admin, **apagado**) | Nuevo |
| 17/11 | Apps del cliente | Código de canje que cambia cada 30 s (interruptor en Admin, **apagado**) | Nuevo |
| 17/11 | iOS | **Versión 1.1** enviada a revisión; Google regresa a la app | Arreglo / Mejora |
| 18/11 | iOS | Apple aprueba la 1.1 y la publica | Hito |

---

## 5. Alcance hoy (19/11/2026)

Diez apps sobre una sola base:

| Área | Qué cubre |
|---|---|
| **Venta** | Kiosko en modo cajero y caja; efectivo, Clip, mixto, terminal del banco, pago dividido; venta en espera; venta sin internet; cortesías y cupones con PIN; descuento de personal |
| **Caja** | Apertura y corte por denominación, fondo fijo, entrega de turno con firma por PIN, comprobante impreso, Caja en vivo y avisos a gerencia |
| **Producción** | Comandas por estación en pantalla y en etiqueta, combos repartidos por estación, reimpresión, «Preparar después» |
| **Catálogo y costeo** | Costeos como fuente de la verdad, publicar con vista previa, revisión del menú, observaciones por alcance, extras por grupo |
| **Inventario** | Descuento por receta, combos y proteína elegida; entradas, traspasos, salidas, conteos, kardex, producción de preparados |
| **Gerencia** | En vivo, ventas y cierre diario con conciliación de Clip, cortes y comprobantes, permisos, impresoras, pantallas TV, descargas, «¿Qué hago si…?» |
| **Personal** | Reloj checador (barra y teléfono), reglas por persona, expediente, contratos, permisos |
| **Clientes** | Rewards en iPhone (App Store) y web/Android: mancuernas, sellos, cupones, Apple Wallet, push, aliados, metas; pedidos por la app (apagados) |

## 6. Límites hoy

Lo que el sistema **no** hace todavía, o hace con una condición:

| Límite | Detalle |
|---|---|
| Las funciones del cobro no piden sesión | Abiertas a propósito desde el 02/09: el kiosko cobra sin sesión vigente. El servidor sigue poniendo los precios, así que el riesgo es regalarse un producto, no cambiar precios. Pendiente: que el kiosko sostenga su sesión y después cerrar |
| Sin facturación electrónica (CFDI) | Existe el campo, ninguna pantalla lo usa |
| Sin devoluciones parciales | Cancelar es la única devolución |
| Una sola sucursal por base | Otra tienda se monta como proyecto aparte (`docs/plantilla-para-otra-tienda.md`) |
| La impresión depende de la PC de la tienda | Sin el agente abierto, las pantallas muestran comandas pero no sale papel |
| Sin internet, Clip no cobra | Se vende en efectivo o terminal del banco; lo que más resolvería es un segundo internet (4G) |
| El correo del comprobante de corte no sale | Falta la llave del servicio de correo (Resend); los comprobantes esperan en cola. Se imprimen y se ven en Admin |
| Costeos reconoce los insumos por nombre | Un nombre repetido entre secciones mezcla inventarios; Costeos lo avisa, pero el arreglo de fondo no se ha hecho |
| «Solo si…» y promo + precio de personal no los revisa el servidor | El riesgo es de merchandising (una galleta), no de precio |
| Pedidos por la app | Construidos y **apagados** en Admin |
| Código de canje y avance de sellos | Construidos y **apagados**; el código se puede prender ahora que la 1.1 está en la App Store |
| Android | App web instalable; no está en Google Play |
| Apple como inicio de sesión en la web | Falta el Services ID de Apple |
| Checador desde el teléfono | La geocerca sube el costo de hacer trampa, no lo impide |
| Avisos del checador por WhatsApp o Telegram | No existen |
| ~116 funciones de la base abiertas a la llave pública sin candado interno | Muchas son públicas a propósito; se revisan una por una |
