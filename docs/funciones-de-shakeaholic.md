# Funciones de Shakeaholic — catálogo para replicar la tienda

Qué hace el sistema, pantalla por pantalla. **Solo funciones**: colores,
tipografías, logos, fotos y textos de marca los decide el cliente nuevo.

Para el *cómo* replicarlo (qué se copia, qué se cambia, qué no se hereda)
ver [`plantilla-para-otra-tienda.md`](plantilla-para-otra-tienda.md).
Las razones de cada decisión viven en `CLAUDE.md`.

> Corte al 17/11/2026. Lo marcado **(interruptor)** se prende o apaga desde
> Admin sin tocar código; casi todo nace apagado o con el comportamiento de
> siempre, para que encenderlo sea decisión del negocio.

---

## Índice

1. [Mapa de las apps](#1-mapa-de-las-apps)
2. [Kiosko / caja de mostrador](#2-kiosko--caja-de-mostrador)
3. [Cobro y dinero](#3-cobro-y-dinero)
4. [Caja: apertura, corte y cambio de turno](#4-caja-apertura-corte-y-cambio-de-turno)
5. [POS (caja secundaria)](#5-pos-caja-secundaria)
6. [Pantallas de preparación (barra y cocina)](#6-pantallas-de-preparación-barra-y-cocina)
7. [Impresión (etiquetas y tickets)](#7-impresión-etiquetas-y-tickets)
8. [TV de folios y pantallas de promoción](#8-tv-de-folios-y-pantallas-de-promoción)
9. [Menú, extras, combos y promociones](#9-menú-extras-combos-y-promociones)
10. [Costeos (fuente del catálogo y los costos)](#10-costeos-fuente-del-catálogo-y-los-costos)
11. [Inventario](#11-inventario)
12. [Programa de lealtad (Rewards)](#12-programa-de-lealtad-rewards)
13. [App del cliente (web/Android e iPhone)](#13-app-del-cliente-webandroid-e-iphone)
14. [Pedidos por la app (pagar y recoger)](#14-pedidos-por-la-app-pagar-y-recoger)
15. [Personal](#15-personal)
16. [Admin (gerencia)](#16-admin-gerencia)
17. [Reportes y conciliación](#17-reportes-y-conciliación)
18. [Operación sin internet](#18-operación-sin-internet)
19. [PC de la tienda](#19-pc-de-la-tienda)
20. [Seguridad y reglas que no se negocian](#20-seguridad-y-reglas-que-no-se-negocian)
21. [Integraciones externas](#21-integraciones-externas)
22. [Lo que NO hace (todavía)](#22-lo-que-no-hace-todavía)

---

## 1. Mapa de las apps

| App | Quién la usa | Para qué |
|---|---|---|
| **Kiosko** | Cajero (y cliente en autoservicio) | Tomar pedidos, cobrar, caja y turno, checador, mercancía |
| **POS** | Caja secundaria | Cobros manuales, abrir/cerrar caja |
| **Barra** | Estación de bebidas | Ver y marcar comandas de bebidas |
| **Cocina** | Estación de alimentos | Ver y marcar comandas de alimentos |
| **TV de folios** | Clientes en espera | Folios en preparación y listos |
| **Admin** | Gerencia | Todo lo administrativo (sección 16) |
| **App del cliente** | Clientes | Tarjeta de lealtad, menú, pedidos, cupones (web/Android) |
| **App de iPhone** | Clientes | Lo mismo, nativa, con Apple Wallet y Face ID |
| **Costeos** | Gerencia / compras | Costeo, recetas, catálogo, compras e inventario |
| **Checador** | Personal | Checar entrada/salida desde el celular (geocerca) |
| **Sitio público** | Público | Menú vivo, liga inteligente para bajar la app |

Más tres programas que corren **en la PC de la tienda**: agente de
etiquetas, agente de tickets de caja y el «empujador» de imágenes a las TVs.

Todo comparte **una sola base de datos** y se ve en vivo: lo que se cobra
en el kiosko aparece al instante en barra, cocina, TV y Admin.

---

## 2. Kiosko / caja de mostrador

### Tomar el pedido
- Menú por categorías derivado de los productos activos (una categoría
  aparece sola cuando tiene algo vendible).
- Buscador con teclado en pantalla.
- **Personalizar** cada producto, por secciones:
  - Base (agua / tipo de leche), con la «de casa» preseleccionada; la base
    gratis viaja como nota, la que cuesta como renglón cobrado.
  - Proteína por **marca → sabor**, con la de casa por omisión.
  - **Doble scoop** de la marca elegida (y «doble proteína» en alimentos).
  - **Grupos «elige una»** definidos en Admin (¿qué café?, ¿qué wrap?).
    Regla: se preselecciona la marcada con estrella; si nadie marcó y todas
    son gratis, la primera; **si alguna cuesta, ninguna**.
  - Extras que **dependen de un grupo** («solo si…», p. ej. galletas solo
    con un preparado).
  - Adicionales con cantidad y precio.
  - **Observaciones** en chips («Sin hielo», «Sin cebolla»), acotadas por
    categoría o producto.
  - Aviso del **tamaño de vaso** cuando lo elegido lo cambia.
- Carrito con cantidades, nombre del pedido (con sugerencias aprendidas de
  ventas anteriores) y total que el servidor confirma.
- **Venta en espera**: apartar una cuenta y atender al siguiente; se retoma
  desde un chip y se re-cotiza contra el precio de hoy.
- Historial de pedidos del turno, con reimpresión de ticket.

### Durante el cobro
- **¿Suma mancuernas?**: franja que escucha al lector de QR; el cliente
  escanea y queda ligado; o búsqueda por teléfono; o alta rápida.
- Panel de **canje de Rewards**: usar mancuernas (25 %, 50 %, todo) o el
  premio de la tarjeta de sellos sobre un producto del carrito.
  **(interruptor)** pedir el **código de canje** de la app (cambia cada 30 s).
- **Es para personal**: precio de personal con clave o QR de la app del
  empleado (sección 15).
- **Cupón de descuento** con PIN autorizado ($ fijo o % sobre un producto).
- **Cortesía**: venta en $0 con motivo y PIN de quien puede autorizar.
- Métodos: efectivo, terminal integrada, mixto, terminal del banco
  (sección 3).
- Pantalla «¡Listo!» con folio e **imprimir ticket**.

### Herramientas del personal («Caja y turno», con PIN)
- Abrir / cerrar caja y cambio de turno (sección 4).
- **¿Llegó mercancía?** — entrada por caja o pieza; si vino de bodega, la
  resta allá.
- **¿Abriste un bote de venta para la barra?** — pasa un producto de venta a
  insumo de barra.
- **¿Preparaste algo?** — producción de preparados (sale la receta, entra
  el producto elaborado).
- **¿Cambiaste el rollo?** — calibrar etiquetadora, probar (gasta 1),
  diagnóstico.
- **Checar** entrada / salida a comer / regreso / salida.

### Avisos en el kiosko
- **Pedidos de la app**: suena y anuncia el pedido nuevo encima de cualquier
  pantalla; chip con pendientes; panel con todo el pedido (lo de mostrador
  resaltado) y «Marcar como entregado».
- Recarga remota desde Admin, que **espera** a que no haya venta ni ventana
  abierta.
- Retomar una venta apartada que gerencia le manda desde Admin.
- Aviso rojo de **sin internet** (sección 18).

---

## 3. Cobro y dinero

- **El precio lo calcula el servidor, siempre.** La pantalla nunca manda
  precios; el servidor recalcula total con el catálogo vivo.
- Cobro **idempotente** (un doble toque no cobra dos veces).
- **Efectivo** con cálculo de cambio.
- **Terminal integrada** (Clip): manda el cobro a la terminal, sondea el
  estado, cancela, recibe webhook (solo como timbre: el estado se pregunta),
  barrido automático de cobros pendientes cada 2 min.
- **Mixto**: la tarjeta primero; el efectivo se apunta y se aprueba hasta que
  la terminal autoriza (cancelar no deja nada a medias).
- **Pago dividido** en 2–4 partes, validado antes de insertar ninguna.
- **Terminal del banco** (no integrada): solo registra lo cobrado allá.
- Reembolso por la terminal integrada.
- **Cancelar venta** (Admin) con opción de **regresar al inventario**.
- **Máquina de estados de la orden** que no deja regresar a «cobrable» algo
  que pudo haberse cobrado.
- Barredor de órdenes abandonadas y caducadas.
- Reintentos de terminal sin perder la venta buena.

---

## 4. Caja: apertura, corte y cambio de turno

- Apertura con **conteo por denominación** (billetes y monedas por
  separado; el $20 existe en las dos).
- **Fondo fijo** configurable; el sistema sugiere qué billetes retirar y
  cuáles dejar.
- Corte con conteo por denominación, esperado vs contado, diferencia.
- **Cambio de turno**: quien entrega cierra y retira; quien recibe pone su
  PIN (firma), ve el fondo esperado y cuenta.
- **Reposición** de fondo autorizada.
- Cerrar caja **bloqueado** si hay ventas sin internet sin registrar.
- **Permisos**: quién puede abrir caja y hacer el corte; sin permiso, pide
  el PIN de alguien que sí pueda.
- **Comprobante de corte** con folio (`COR-00001`): ventas por método con
  tickets, cancelaciones, devoluciones, cortesías, descuentos (cupón,
  personal, promoción, Rewards).
  - En pantalla, impreso en la térmica de tickets (80 mm) y por correo.
- **Archivo de comprobantes** por fecha y persona (quién entregó / recibió).
- **Avisos push a gerencia** al abrir, empezar a contar, entregar y cerrar.

---

## 5. POS (caja secundaria)

- Cobro manual con las mismas reglas de extras y precios que el kiosko
  (comparten la misma lógica).
- Cupones de cliente, promociones, descuento manual (con permiso).
- Abrir / cerrar caja y corte.
- Calibrar y probar etiquetadoras.
- Ventas en espera locales.

---

## 6. Pantallas de preparación (barra y cocina)

- Cada renglón va a la estación de su categoría; **un extra sigue a su
  producto** salvo que se diga otra cosa.
- **Combos repartidos** por estación; cada parte dice «COMBO» y en qué está
  la otra parte («🥪 se prepara en COCINA · ✓ LISTA»).
- Producto con sus extras colgando (no lista plana); si el padre no está en
  esa pantalla, el extra sube a renglón propio.
- Estados: pendiente → en preparación → listo → entregado.
- Tamaño de vaso a la vista.
- Escuchan recarga remota.

---

## 7. Impresión (etiquetas y tickets)

### Etiquetas de comanda (TSPL, red local)
- Un agente en la PC reclama trabajos y los imprime en cada etiquetadora.
- Latido con versión, visible en Admin (ámbar si falta actualizar).
- Calibrar, probar y diagnóstico desde el kiosko/POS.
- **Frases del pie** por temporada, por estación, con imagen opcional.
- **Dinámicas con premios** («rasca y gana» en la etiqueta): rondas
  barajadas al abrirse, un boleto por compra o por vaso, premios entregados.
- Lo de mostrador (envasados) **no imprime etiqueta**.

### Ticket de caja (ESC/POS)
- Agente propio; ticket por venta (automático o a pedido), copias marcadas
  como reimpresión, tope de copias.
- Contenido editable en Admin: datos del negocio, pie, Rewards, WiFi, QR,
  logo convertido a 1 bit con vista previa.
- Comprobante de corte impreso.

### Instalación
- Instaladores descargables desde Admin que configuran todo y no dicen
  «listo» hasta que el servidor ve el latido.

---

## 8. TV de folios y pantallas de promoción

- **TV de folios**: en preparación y listos; un folio está listo cuando
  todas sus partes lo están.
- **Pantallas (TV)** desde Admin: a cada TV se le asigna Promos, Menú,
  Pedidos o Nada; imágenes con fechas de temporada; ver qué está
  mostrando. Las TVs sin navegador reciben imágenes por DLNA desde un
  programa en la PC.

---

## 9. Menú, extras, combos y promociones

- **Productos y categorías**: activar/desactivar, ordenar, renombrar (también
  en Costeos), eliminar (borra si nunca se vendió, archiva si tiene historia).
- **Qué sale en la app** por categoría o producto (lo interno se vende en
  caja pero no aparece al público). **(interruptor)**
- **Extras** por producto: precio por vínculo, grupo, «de casa» (estrella),
  «solo si…» (depende de un grupo), «se prepara en» (estación).
- **Vender un extra solo** como botón del menú (crea un gemelo con la receta
  copiada).
- **Observaciones** con alcance por categoría o producto.
- **Combos**: lo fijo y lo que se elige, cada opción ligada al producto que
  descuenta inventario; semáforo de combo listo.
- **Promociones**: las que cobran (bajan el total sobre productos definidos)
  y las sugerencias (solo se muestran al cliente en la app).
- **Revisión del menú**: lista lo que está chueco (grupo de una opción,
  extra apagado ligado, «solo si…» imposible, nombres duplicados, extras sin
  categoría, productos sin receta) y botón para actualizar el kiosko.
- **Publicar al kiosko** con diff de cambios (altas, bajas, renombres,
  precios, combos).

---

## 10. Costeos (fuente del catálogo y los costos)

- Hoja de costeo de **bebidas, snacks, proteínas, shakes, alimentos y
  empaques**: costo, precio, margen.
- **Al guardar crea/actualiza** productos, insumos y recetas en la base.
- Clave única por producto como ancla de renombres.
- Categoría elegida al dar de alta.
- Recetas con empaque; prorrateo de envío.
- **Compras / entradas** de mercancía por caja o por pieza, a bodega o a
  kiosko; cancelar entrada.
- **Traspasos** bodega → kiosko con existencia real.
- **Inventario** con existencia real del sistema, conteo, conteo por **peso**
  (botes abiertos), aplicar conteo, reiniciar a 0 con PIN y respaldo.
- **Kardex** con ventas y su ticket.
- Login propio con sesión de 12 h; lo no guardado se conserva y se ofrece
  al volver; detecta si otro guardó en medio.
- Aviso de **nombres repetidos entre secciones**.
- Se abre también dentro de Admin.

---

## 11. Inventario

- **Descuento automático por venta** según receta (incluye opciones de
  combo, proteína elegida, doble scoop).
- Almacenes: bodega y kiosko; traspasos.
- Existencias pueden quedar en **negativo** (visible y corregible).
- **Kardex** por insumo: tipo, entrada, salida, saldo, responsable, ticket.
- **Salidas** con motivo (merma, caducidad, consumo).
- **Reiniciar** con PIN de gerencia.
- **Producción** de preparados con receta y rendimiento.
- **«Lo que no descuenta»**: productos vendidos sin receta, con su causa.
- **Proteína**: de qué bote sale cada sabor elegido.
- Limpieza automática de insumos fantasma.

---

## 12. Programa de lealtad (Rewards)

### Monedero (mancuernas)
- Se ganan al cobrar: **pesos por mancuerna, tope por ticket e interruptor**
  editables; **qué no suma** por categoría o producto. **(interruptor)**
- Dos bolsas: **ganadas** (promoción) y **compradas** (recargas con bono,
  no caducan).
- Canje en caja: N mancuernas = $1, sin dar cambio.
- **Código de canje** que cambia cada 30 s para *usar* (una captura del QR
  ya no sirve). **(interruptor)**
- Paquetes de recarga y **tarjetas de regalo** con código.
- Cupón automático cada cierto número de mancuernas.

### Tarjeta de sellos (13+1)
- Tarjetas por tipo (bebidas / alimentos), compras requeridas, precio mínimo
  que sella, catálogo de premios.
- El premio se canjea poniendo en $0 un producto del carrito.
- Modo **sorpresa**: la app no dice cuánto falta, solo un guiño configurable.
- **Avance visible** («3 de 13» con círculos) por tarjeta. **(interruptor)**

### Otros
- **Metas**: reseña y publicación en redes, con captura revisada por
  gerencia antes de acreditar.
- **Cupones** personales con vencimiento.
- **Aliados**: marcas asociadas con su promo.
- Expediente del cliente para gerencia (qué pide, últimas compras).
- Alta por la app (Google / Apple) o por teléfono en caja.

---

## 13. App del cliente (web/Android e iPhone)

- **Tarjeta**: QR fijo para ganar, saldo, valor en pesos, progreso, sellos,
  cupones, «Canjear en caja», recargas, tarjeta de regalo.
- **Apple Wallet** (iPhone y Apple Watch) con el QR.
- **Menú** con familias, fotos, «con qué va», promos del día.
- **Pedir y pagar** (sección 14).
- **Aliados**.
- **Cuenta**: perfil con foto, compras, favoritos, movimientos, eliminar
  cuenta.
- **Avisos push** (iPhone por APNs, Android/web por Web Push): automáticos
  (mancuernas, pedido recibido/listo) y campañas desde Admin.
- **Modo personal**: con PIN (y Face ID en iPhone) ve su beneficio de
  personal, código para la caja y —gerencia— el panel en vivo.
- Instalable (PWA) y **liga inteligente** única: iPhone → App Store,
  Android → app web, computadora → QR.

---

## 14. Pedidos por la app (pagar y recoger)

**(interruptor)** con horario, minutos de preparación y mensaje de cerrado.

- El cliente arma su pedido con las mismas reglas de personalización.
- Paga en la página de pago de la terminal (tarjeta / OXXO); se aprueba solo
  después de preguntarle al proveedor.
- Al pagarse: comanda a barra/cocina como cualquier venta; push «recibido» y
  «listo».
- En el kiosko: anuncio con sonido, panel, entregar (exige que barra y
  cocina estén listas).
- En Admin → En vivo: estado y entregar manual.
- Lo escondido de la app se rechaza en el servidor.

---

## 15. Personal

- **Personas**: alta con PIN, rol (cajero, gerente, admin, desarrollo),
  correo para reconocerlo en la app.
- **Permisos** por persona: cobrar, abrir caja, hacer corte, descuento
  manual; listas aparte para **cortesías** y **cupones**.
- **Reloj checador**:
  - Desde el kiosko con PIN; o desde el celular con **geocerca** validada en
    el servidor (radio y precisión configurables). **(interruptor)**
  - Entrada, salida a comer, regreso, salida; una comida por jornada.
  - La hora la pone el servidor; **nada se edita ni se borra**: se corrige
    agregando con motivo.
  - Reglas generales y **por grupo de personas**, por día de la semana y
    excepciones de una fecha: jornada, comida pagada o no, tolerancia,
    horario → llegadas tarde y salidas anticipadas.
  - Histórico con bruto y trabajado; exportar a Excel.
- **Expediente**: requisitos documentales (obligatorios, con vencimiento),
  archivos privados con URL firmada de 2 min y bitácora de accesos.
- **Contratos**: plantilla editable, variables, concordancia de género,
  faltantes a la vista, documento congelado al generarse, impresión.
- **Descuento de personal**: precio de personal por producto o categoría,
  límites diarios por grupo, tope en pesos, requiere turno checado, clave
  (bcrypt) o QR de la app que caduca en 2 min.

---

## 16. Admin (gerencia)

| Sección | Qué hace |
|---|---|
| Dashboard | Ventas del día (fecha del negocio), refresco cada 10 s con sello de «hace N s» |
| En vivo | Comandas, impresoras con latido, ventas apartadas en otros kioskos, pedidos de la app |
| Caja en vivo | Qué tiene la pantalla de caja ahora, cobrado por método, efectivo esperado, lo quitado del carrito, conteo del corte en vivo |
| Diagnóstico | Problemas concretos con ejemplos y qué hacer |
| Menú | Productos, precios, qué sale en la app |
| Revisión del menú | Lo que está chueco, con nombre |
| Categorías | Orden, estación, renombrar, eliminar |
| Combos | Armado con semáforo |
| Extras | Vínculos, grupos, estrella, «solo si…», estación, observaciones, vender solo |
| Inventario | Existencias, kardex, salidas, reinicio, producción, proteína, lo que no descuenta |
| Costeos | Costeos dentro de Admin |
| Promos | Promos que cobran y sugerencias |
| Ventas | Historial y cierre del día, cancelar, exportar |
| Cortes de caja | Desglose, tickets del turno, fondo fijo, destinatarios del correo |
| Comprobantes | Archivo de comprobantes de corte |
| Clientes | Base de lealtad con expediente |
| Nombres | Nombres de pedido aprendidos |
| Metas | Bandeja de capturas por aprobar |
| Rewards | Ganancia, qué no suma, sellos, guiño, avance, código de canje, pedidos por la app, paquetes, tarjetas de regalo |
| Avisos | Campañas push con historial |
| Aliados | Marcas aliadas |
| Personal | Personas, checador, expediente, contratos, permisos, descuentos |
| Impresoras | Estado, frases, dinámicas con premios |
| Ticket de caja | Contenido y logo del ticket |
| Pantallas (TV) | Qué muestra cada TV |
| Descargas | Instaladores y si cada agente está al día |
| ¿Qué hago si…? | Guía de problemas + venta de prueba que se deshace |
| Peticiones | Pedidos al equipo de desarrollo, con seguimiento |
| Soporte / Pulso / Sistema | Solo rol desarrollo: priorizar, salud del sistema |

---

## 17. Reportes y conciliación

- **Cierre del día calculado en vivo** (no se guarda): semana, mes, año o
  rango; estatus Cuadrado / Con diferencia / Aclarado / Pendiente;
  aclaraciones con autor; exportar a Excel.
- Un corte pertenece al día de sus ventas.
- **Conciliación con la terminal**: baja las transacciones del proveedor,
  empata con los pagos integrados y separa la terminal no integrada.
- Ventas por método, cortesías, cupones dados, consumos de personal.

---

## 18. Operación sin internet

- El kiosko sigue cobrando **efectivo y terminal del banco** sin internet.
- Folio provisional, comanda impresa por la red local, catálogo y corte con
  respaldo local; la página abre sin conexión.
- Al volver, cada venta se registra sola (idempotente, al precio del
  servidor, con la hora real; diferencias quedan para revisión).
- Detector que pregunta al servidor, no al navegador.

---

## 19. PC de la tienda

- **Instalar todo** en una PC nueva con un solo archivo.
- Arranque automático: espera internet → agentes → pantallas en su monitor
  → busca actualización al final.
- Acomodo automático de ventanas por monitor (o manual con un archivo).
- Agentes de etiquetas y de tickets se relanzan si se caen.
- Bitácora del último arranque.

---

## 20. Seguridad y reglas que no se negocian

- El dinero se calcula en el servidor; el cliente nunca manda precios.
- Seguridad a nivel de fila en todas las tablas; escribir catálogo exige
  personal.
- El personal entra con PIN → sesión real; gerencia se distingue en el
  servidor (no basta con «tener sesión»).
- PIN y claves con bcrypt y freno de intentos (15 en 15 min).
- Historiales que solo se agregan (checador, consumos de personal, eventos
  de caja, aclaraciones).
- Llaves de proveedores solo en los secretos del servidor.
- Fecha del negocio en la zona horaria local, no UTC.
- Listas que pueden crecer se piden paginadas (el servidor corta en 1 000
  filas sin avisar).

---

## 21. Integraciones externas

| Para qué | Con qué |
|---|---|
| Base de datos, auth, tiempo real, archivos, funciones | Supabase |
| Terminal de tarjeta y pago en línea | Clip (terminal integrada + checkout) |
| Login de clientes | Google y Apple |
| Pases | Apple Wallet |
| Push | APNs (iPhone) y Web Push (Android/web) |
| Correo de comprobantes | Resend (pendiente de llave) |
| Hosting web | Cloudflare Pages |
| Compilar y subir iPhone | GitHub Actions + Fastlane |

---

## 22. Lo que NO hace (todavía)

- Devoluciones parciales: cancelar es la única devolución.
- Varias sucursales en la misma base.
- Facturación electrónica (CFDI). Existe la columna `ventas.cfdi_solicitado`,
  pero ninguna pantalla la usa.
- Avisos por WhatsApp/Telegram del checador.
- Cupones de cliente con código de canje dinámico (solo mancuernas y sellos).
- App de Android en Google Play (hoy es app web instalable).
