# Shakeaholic — memoria del proyecto

Este archivo es para quien retome el trabajo (yo incluido, en otra sesión):
qué está vivo, cómo se opera y **qué trampas ya nos costaron caro**. Los
detalles temáticos viven en `docs/` (42 documentos); esto es el mapa.

**La tienda está ABIERTA y vendiendo.** Un error aquí no es un test que
falla: es una fila de gente esperando su shake. Verifica en producción
antes de decir que algo quedó.

---

## 1. Qué es esto

Protein bar en Mérida (The Harbor). Monorepo pnpm, 9 apps sobre un solo
Supabase (`zyjtnaystsporbuzcmqk`), desplegadas a Cloudflare Pages por
GitHub Actions al hacer push a `main`.

| App | Dominio | Quién la usa |
|---|---|---|
| `web` | `shakeaholic.mx` | El público (menú vivo, QR de Rewards) |
| `kiosko` | `kiosko.shakeaholic.mx` | Cliente y cajero en la barra |
| `pos` | `caja.shakeaholic.mx` | Caja (abrir turno, cobros manuales) |
| `cocina-bebidas` | `barra.shakeaholic.mx` | Estación de barra |
| `cocina-alimentos` | `cocina.shakeaholic.mx` | Estación de cocina |
| `cliente-display` | `pantalla.shakeaholic.mx` | TV de folios |
| `admin` | `admin.shakeaholic.mx` | Gerencia |
| `cliente-pwa` | `rewards.shakeaholic.mx` | Celular del cliente (y la app de TestFlight) |
| `costos` | `costos.shakeaholic.mx` | Costeo e inventario (HTML plano) |

`api.shakeaholic.mx` es el dominio propio de Supabase (add-on). Los
nameservers viven en **Cloudflare** desde el 24/08/26; GoDaddy solo tiene
el registro del dominio.

---

## 2. Las cinco cosas que hay que entender

### 2.1 Costeos es la fuente de la verdad del catálogo

`apps/costos` (un solo `index.html`, sin build) guarda TODO en una fila de
`app_data.data` (JSON). Al guardar, un trigger corre `fn_sync_app_data()`,
que crea/actualiza productos, insumos y recetas.

Consecuencias que hay que respetar:

- **Renombrar un producto desde Admin no sirve** para lo que viene de
  Costeos: el siguiente guardado lo revierte. Los scoops y suplementos se
  renombran EN COSTEOS.
- El renombre se ancla en la **Clave** (`codigo`). Sin Clave, el nombre
  nuevo no empata con nada: nace un producto vacío y el viejo se apaga —
  el producto se parte en dos y pierde sus extras. Por eso Costeos asigna
  Clave sola al guardar, y el ancla exige que la Clave sea única *dentro
  de su especie* (el scoop y el bote de una misma fila la comparten).
- **Guardar y publicar ya no son lo mismo.** Guardar sincroniza el catálogo
  (se sigue costeando con datos reales); **"Mostrar en el kiosko"** enseña
  el diff — altas, bajas, renombres, precios, combos — y al confirmar toca
  el timbre de las pantallas. Ojo: las pantallas leen `productos` **en
  vivo**, así que publicar sincroniza *cuándo* lo ven, no congela lo que
  ven; un reinicio del kiosko también trae lo no publicado.
- **El precio es la intención de venta**: `precioScoop` > 0 lo vende por
  scoop, `precioBote` > 0 vende el bote. El sufijo `- B` / `- R` en el
  sabor es legado que sigue funcionando, pero ya no hace falta.

### 2.2 El dinero se calcula en el servidor, siempre

`fn_crear_orden` recalcula precios y total desde `productos.precio`;
`fn_cobrar_orden` valida el monto contra ese total y es idempotente. El
cliente no manda precios. Nunca abras un camino que permita aprobar un
pago por INSERT directo (RLS lo prohíbe: `ins_pagos` rechaza cualquier
inserción con `estado = 'aprobado'`).

**Pago dividido.** `fn_cobrar_orden_dividido` cobra en 2–4 partes y valida
que sumen el total **antes de insertar ninguna**: no existe la orden
cobrada a medias. El candado contra el doble cobro sigue puesto, solo que
ahora es `(orden_id, parte)` en vez de `(orden_id)` — un segundo cobro
entero vuelve a chocar con la parte 1. `ordenes.metodo_pago` queda en
`'mixto'`; el desglose vive en `pagos`, que es de donde `vw_corte_resumen`
y `fn_panel_en_vivo` ya sacaban sus totales por método. Por eso el corte
cuadra solo: cada parte cae en su renglón.

### 2.3 Clip: la verdad se pregunta, no se escucha

El webhook `PINPAD_INTENT_STATUS_CHANGED` **no viene firmado**: es un
timbre, no una fuente. El estado real siempre se consulta autenticado.

Rutas reales de la API (descubiertas probando en producción, **no están en
la documentación de Clip**):

```
POST   https://api.payclip.io/f2f/pinpad/v1/payment
GET    .../payment?pinpadRequestId={id}     ← camelCase, como query
DELETE .../payment/{id}                     ← el id va en la ruta
```

`GET /payment/{id}` **no existe** y `?pinpad_request_id=` (snake_case) da
`ERROR_BODY_STRUCTURE`. Ese detalle causó los dos bugs de las primeras
ventas reales: cobros que se quedaban "esperando confirmación" y
cancelaciones que no llegaban a la terminal.

El campo `reference` **solo acepta alfanuméricos y guiones** — se normaliza
con NFD + quitar acentos + no-alfanumérico → guion.

Red de seguridad: webhook + sondeo del kiosko + barrido cada 2 minutos
(`clip-barrer-pendientes`). Un cobro no se pierde.

**El error mas comun de Clip no es del codigo: es la app cerrada.**
`ERR10_04` = *"STORING PAYMENT - DEVICE UNAVAILABLE: The Clip terminal is
either offline, powered off, or the Pinpad application is closed"*. Pasó
**31 veces entre el 21/08 y el 02/09**, 30 de ellas en horario de venta
—con racimos de 8 en un mismo dia (24/08 y 30/08)— y **ninguna de esas
ordenes se cobro despues**. Cuando alguien reporte "la terminal no
responde", esto es lo primero que hay que mirar, no el codigo: la Clip
Stand se apaga sola o alguien cierra la app del Pinpad.

### 2.4 La impresión vive fuera de la nube

`agente-impresion/` es un programa Node que corre **en la PC de la tienda**
y habla TSPL con dos etiquetadoras de red. Sin esa ventana abierta, las
pantallas muestran comandas pero **no sale papel**.

- Reclama trabajos con `fn_imprimir_reclamar_trabajos` y late con
  `fn_imprimir_latido`, que ahora **reporta su versión** — visible en
  Admin → En vivo junto a cada impresora. Si dice ámbar, falta actualizar.
- La etiqueta lleva familia + nombre (`Kombucha - Limonada Durazno`) pero
  **Shakes va sin familia** (`#1 Chocokiller`), y **el tamaño del vaso no
  se imprime**: vive solo en pantalla.
- Si el agente "acepta datos y no imprime", el problema es físico
  (papel/tapa/sensor): el autotest con FEED al encender lo confirma.
- **Al cambiar el rollo hay que calibrar**, o las comandas salen corridas:
  la etiquetadora mide la luz que pasa por el hueco entre etiquetas y ese
  umbral depende del papel cargado. Se hace desde el **kiosko** (5 toques a
  Milo → PIN → "¿Cambiaste el rollo?") o desde el POS, sin ir a la PC. En el
  kiosko es lo normal: el POS no queda abierto en esa máquina. Gasta dos o tres etiquetas y saca una de prueba
  al final — si esa sale derecha, quedó. Pide agente **1.2.0**; con uno
  viejo el botón lo dice en vez de fallar en silencio.
- **"Se gastan 3 y sale 1" tiene dos lecturas y hay que separarlas antes de
  tocar nada.** Al **calibrar** es lo correcto: `GAPDETECT` avanza dos o
  tres leyendo el sensor y `FORMFEED` deja el papel en su sitio. En **cada
  comanda** es una avería. Para distinguirlo sin estar en la tienda está
  **"Probar · gasta 1"** (junto a Calibrar, en el kiosko y en el POS): si
  sale una sola y derecha, lo normal está bien.
- **Abierto (31/08): se van 3 blancas en cada comanda**, y la buena sale
  ligeramente descuadrada. Sospecha principal: `CABECERA_PAPEL` (`SIZE`,
  `GAP`…) viaja delante de **cada** etiqueta desde la primera versión
  (`045348d`), y varias etiquetadoras TSPL reacomodan el rollo al que se
  les redeclara el papel. **No se quita a ciegas**: si esa cabecera es lo
  que hace que salga derecha, quitarla deja a barra imprimiendo basura en
  plena venta. El botón **"Diagnóstico (gasta 6)"** manda la misma etiqueta
  con tres cabeceras rotuladas A/B/C (agente **1.3.0**) y el papel
  contesta cuál sirve.

### 2.5 La identidad es una sola, y vive en `packages/brand`

`packages/brand/tokens.css` es la **fuente de la verdad**: los colores y
las tres tipografías. Las 8 apps de Vite lo importan en su `index.css`, así
que heredan la marca sin hacer nada.

- **Bagel Fat One** (display) · **DM Sans** (cuerpo) · **DM Mono** (cifras
  y etiquetas chicas).
- Verde `#2C4A3E`, verde profundo `#1A2E26`, tinta `#14241D`, crema
  `#E8E6CC`, y los acentos de sabor (plátano `#F0C649`, fresa `#E04E5C`,
  menta `#88C0A0`…) **uno por superficie**, nunca varios.

**La regla de tamaños, tomada del kiosko**: la display se usa de **18 px
para arriba** (títulos y cifras grandes); abajo de eso va DM Sans, y los
números y etiquetas en versalitas van en DM Mono. Bagel Fat One solo
existe en **un peso**: pedirle `font-weight: 700` hace que el navegador la
engorde sola y se ve emborronada.

**Las dos excepciones que hay que vigilar**, porque no pasan por el
empaquetador y se desvían solas:

- `apps/costos/index.html` — HTML plano. Copia los valores a mano en su
  bloque `:root`. Ya se desvió una vez (usaba Fredoka + Inter y una paleta
  verde-olivo); si se toca `tokens.css`, hay que copiarlo aquí.
- `apps/web` — carga las fuentes con su propio `<link>`.

### 2.6 La PC de la tienda se mantiene sola

- **Admin → Descargas** sirve los instaladores desde
  `admin.shakeaholic.mx/descargas/`, y dice si el agente de cada PC está al
  día comparando la versión del latido contra la del despliegue. Los
  archivos **no están versionados ahí**: `scripts/copiar-descargas.mjs` los
  copia desde `scripts/` en cada build (la carpeta está en `.gitignore`).
  Dos copias del mismo `.bat` en el repo se separan en cuanto alguien toca
  una, y entonces Admin repartiría un instalador viejo sin enterarse.
- `scripts/instalar-todo.bat` — una vez por PC. Es lo único que hay que
  bajar: los demás archivos los descarga él solo de GitHub. Va **partido en dos
  mitades a propósito**: la que instala corre elevada, la que deja el
  arranque y el escritorio corre como el usuario de la caja. Al elevarse,
  Windows puede cambiar de usuario y `%APPDATA%` apunta a otro perfil —
  ahí se guardaba el arranque automático, en un perfil que nadie abre. Por
  eso una PC quedó configurada "[OK]" y no abría nada al prender.
- `scripts/instalar-inicio.ps1` — la mitad de usuario. Crea accesos
  directos `.lnk` con icono (minimizados), resuelve Escritorio e Inicio
  **desde el registro** (con OneDrive, las rutas de siempre no existen) y
  además registra `HKCU\...\Run` como segunda red.
- `scripts/abrir-shakeaholic.bat` — el del día a día. **El orden importa**:
  espera internet → arranca el agente → abre pantallas → *y hasta el final*
  busca actualización. Antes la actualización iba primero, y su ventana de
  permiso dejaba la tienda cerrada si nadie estaba ahí para aceptarla.
- `scripts/pantallas.ps1` — acomoda cada app en su monitor. **No hay
  coordenadas escritas a mano**: le pregunta a Windows dónde están los
  monitores y reparte por tamaño (el grande es del cliente, los dos chicos
  son las estaciones, izquierda = bebidas). Después **empuja** cada ventana
  con `SetWindowPos`, porque Chrome recuerda en el perfil la última
  posición e ignora `--window-position`. Escape: `C:\Shakeaholic\pantallas.txt`
  con `kiosko=1` / `bebidas=2` / `cocina=3` manda sobre el automático.
  Cada arranque deja su bitácora en `C:\Shakeaholic\ultimo-arranque.log`.
- `scripts/abrir-caja-y-admin.bat` — POS y Admin, que ya no van en el
  arranque (el turno se abre desde el kiosko).
- **Nunca se reparte un `.ps1` para descargar.** Un `.ps1` bajado del
  navegador no abre de doble clic: Windows lo marca como venido de internet
  y PowerShell contesta *"la ejecución de scripts está deshabilitada en este
  sistema"*, que suena a PC rota cuando es la política de siempre. La salida
  **no** es cambiarle la política al equipo — eso sí sería bajarle la
  guardia — sino repartir un `.bat` que corre el script con `-ExecutionPolicy
  Bypass`, o sea permiso solo para esa ejecución. Cada `.bat` descargable se
  quita además la marca a sí mismo con `Unblock-File` al arrancar. El único
  permiso que debe aparecer es el UAC del instalador, una vez.
- Los `.bat`/`.ps1` deben ser **ASCII puro**:
  `node scripts/verificar-scripts-ascii.mjs` lo verifica.

---

## 3. Operación diaria (lo que le dices al negocio)

| Situación | Qué hacer |
|---|---|
| Abrir la tienda | Nada: la PC arranca todo sola |
| Abrir/cerrar caja o cambiar turno | **5 toques a Milo** en el kiosko → PIN |
| Cambiar precios o productos | Costeos → **Guardar**, y cuando esté listo → **"Mostrar en el kiosko"** (enseña qué va a cambiar antes de confirmar) |
| Ver la tienda a distancia | Admin → **En vivo** |
| Algo se siente raro | Admin → **¿Qué hago si…?** → *Probar una venta completa* |
| Saber si el POS está sano | Admin → **¿Qué hago si…?** — cobra de mentira y lo deshace |
| Actualizar el agente de impresión | Solo, al abrir el día siguiente |
| Instalar en una PC nueva | Admin → **Descargas** → "Instalar todo" |
| Cambiar el rollo de etiquetas | Kiosko → 5 toques a Milo → PIN → "¿Cambiaste el rollo?" → Calibrar |

---

## 4. Trampas que ya nos costaron (no repetir)

**Postgres**

- `create or replace view` **borra las reloptions**: hay que volver a
  declarar `with (security_invoker = true)` o la vista queda insegura en
  silencio.
- Cambiar la firma de una función **no la reemplaza: la duplica**. Hubo
  tres `fn_crear_orden` viejas conviviendo que no cobraban sobreprecios.
  Al cambiar parámetros, `drop function` de la firma anterior.
- `UPDATE ... FROM LATERAL` no puede referenciar la tabla destino; usar CTE.
- Un `update ... from` que empata **por nombre** le pega a TODAS las filas
  con ese nombre. En `fn_sync_app_data` eso ponía `activo = precio > 0` en
  el duplicado también, o sea **resucitaba** el que alguien acababa de
  apagar: apagarlo a mano no servía de nada. Se arregló limitando el
  update a una sola fila por nombre (`p.id = (select … limit 1)`).
- **Primero se arregla quien crea el conflicto, después se pone el
  candado.** Poner el índice único por nombre antes de arreglar ese update
  hacía fallar el guardado entero de Costeos — y dejar a la tienda sin
  poder guardar precios es peor que el duplicado que se quería evitar.
  Igual con `on conflict`: si el índice al que apunta no existe, Postgres
  rechaza la sentencia completa. Los dos van juntos o ninguno.
- `data->'a'||data->'b'` **no hace lo que parece**: `||` se aplica antes
  que `->`, así que se parsea como `data -> ('a' || data) -> 'b'` y
  devuelve NULL. Y como `->` con una llave inexistente devuelve NULL en
  vez de fallar, el `jsonb_array_elements(NULL)` no produce filas y el
  DELETE que lo usaba **no borró nada durante meses**, sin un solo error.
  Consecuencia: las recetas se escribían una vez y nunca se actualizaban —
  editar una receta en Costeos no llegaba a ningún lado, y el inventario
  descontaba cantidades viejas. **Siempre paréntesis alrededor de cada
  `data->'x'` antes de concatenar.**
- **Un `delete` sin `WHERE` dentro de una función revienta en la caja, no
  en la prueba.** Supabase (supautils) bloquea `DELETE` sin `WHERE` para
  los roles de la API: *"DELETE requires a WHERE clause"*. Con la conexión
  de administrador el mismo código pasa sin chistar. Un `delete from
  <tabla temporal>;` dentro de un trigger sobre `ordenes` dejó a la tienda
  **50 minutos sin poder cobrar** (27/08/26): las órdenes se creaban y
  ninguna se pagaba. Regla: dentro de funciones que corren desde la app,
  nada de tablas temporales ni de `delete` pelado — el conjunto se calcula
  con CTEs, aunque se repita.
- **Al tocar el camino del dinero, la verificación no es un `select`: es
  cobrar.** `fn_crear_orden` puede devolver una orden perfecta y el cobro
  fallar en el trigger siguiente. Hay que correr `fn_crear_orden` →
  `fn_cobrar_orden` de verdad y luego limpiar (el orden importa:
  `trabajos_impresion` → `cocina_items` → `pedidos_cocina` →
  `inventario_movimientos` → `venta_confirmaciones` → `ventas` → `pagos` →
  `promocion_aplicaciones` → `orden_items` → `ordenes`). Y después mirar
  `ordenes` de la última hora: si hay una fila de `pagado = false`
  consecutivas, la tienda está parada.
- **`anon` tiene `statement_timeout = 3s`** (y `authenticated`, 8 s). Si
  algo "a veces guarda y a veces no", mide el tiempo **antes** de revisar
  permisos. El guardado de Costeos tardaba 3.4 s y fallaba según la carga
  del segundo; los sospechosos obvios —sesión caducada, permisos, el
  índice único por nombre— se descartaron uno por uno y ninguno era. Se
  arregla con `alter function ... set statement_timeout`, que **sí manda
  sobre el ajuste del rol aunque el statement ya haya arrancado**
  (comprobado). Se le da aire a la función, nunca al rol entero: ese
  límite también protege al kiosko.

- **Desde la conexión de administrador no se puede comprobar un candado
  que depende del rol.** Simular `anon` con `set_config('role','anon')` y
  ver que la función "falla" no prueba nada: puede estar fallando por otra
  razón, o pasando por una puerta que solo existe para el admin. Al cerrar
  `fn_cobrar_orden` (02/09) la simulación dio verde y el candado no había
  mordido — el mensaje era "La orden no existe", no "Solo el personal".
  **Se comprueba por la puerta de enfrente**: HTTP contra PostgREST con la
  llave publicable, desde `pg_net`. Ahí sí contestó lo que debía.

- Para parchear una función grande sin reescribirla: leer
  `pg_get_functiondef`, **verificar que el ancla aparece exactamente N
  veces**, reemplazar y `execute`. Si el ancla no cuadra, abortar — así el
  parche falla ruidosamente en vez de corromper la función.

**Indicadores**

- Un indicador que **no puede volver a verde** deja de leerse. "Comandas
  que fallaron: 21" contaba historia de julio irreimprimible. Las métricas
  de salud llevan ventana de tiempo (24 h / 7 días).
- Cuenta solo lo accionable: "ventas sin comanda" bajó de 16 a 3 al excluir
  las categorías que a propósito no van a pantalla.

**Frontend**

- El kiosko **no se recarga a media venta**: la señal de recarga espera a
  que la pantalla esté en el menú y sin carrito.
- Un error que aparece y se va solo en un segundo es peor que ningún
  error: si algo se recupera con un reintento, reintenta en silencio
  (fue el rojo del login de Rewards).
- En el kiosko, las imágenes van como fondo CSS y el menú contextual está
  apagado: si no, mantener el dedo sobre Milo abre "buscar imagen".
- **Kiosko y POS son dos puertas a la misma venta, y se separan solas.** El
  kiosko sabía elegir la leche de casa y escribirla en la comanda; el POS
  no, así que un shake cobrado en caja salía a barra sin decir con qué
  prepararlo — 47 de 522 en diez días, y nadie lo notó porque cada pantalla
  por separado se veía bien. Lo que decide qué se elige solo, qué se
  escribe en la comanda y qué se cobra aparte vive ahora en
  `packages/utils/src/extras.ts`, importado por las dos. Su espejo en la
  base es `fn_clase_extra`. **Al tocar una, revisa la otra.**
- La comanda muestra cada producto **con sus extras colgando**, no plana:
  `orden_items.padre_item_id` dice de cuál shake es la creatina, y con dos
  bebidas en el mismo folio esa es la única forma de saberlo. Lo agrupa
  `agruparItemsComanda`, espejo de `fn_items_comanda` (la que arma la
  etiqueta impresa). Regla que hay que conservar en las dos: si el padre no
  está en esa pantalla, el extra **sube a renglón propio** en vez de
  desaparecer — un extra que no se ve es un extra que no se prepara.
- La opción por defecto de cada grupo (la leche de casa, la proteína, el
  frío/caliente) ya no es una expresión regular en el código: es la
  estrella de Admin → Extras, guardada por vínculo producto↔extra. Las
  reglas viejas siguen ahí de respaldo mientras nadie marque nada.
- **Las ventas apartadas viven en el navegador de esa caja**, no en la
  base (`apps/pos/src/store/espera.ts`). Meterlas a la base significaría
  una orden a medio crear que la reconciliación tendría que aprender a
  distinguir de una venta perdida: ensuciar el camino del dinero por algo
  que dura tres minutos. Al retomarlas se refrescan los precios contra el
  catálogo vivo, porque el servidor cobra el de hoy y un total en pantalla
  que no es el que se cobra es peor que no tener la función.

**Permisos de la base**

- **`SECURITY DEFINER` + `grant ... to anon` sin comprobar nada adentro es
  una puerta abierta, y había varias.** Encontradas el 31/08:
  `fn_staff_vincular_auth` hacía un `update empleados set auth_user_id`
  pelado — cualquiera se registraba en Rewards y apuntaba su cuenta a la
  fila del Gerente; y `fn_crear_empleado` dejaba darse de alta con rol
  `gerente` y el PIN que uno quisiera. Sin PIN, sin sesión, sin rastro.
  Cerradas. **Quedan ~60 funciones más con `anon` y sin control interno**
  (`fn_clientes_admin`, `fn_expediente_cliente`, `fn_rewards_admin`,
  `fn_cliente_desactivar`, `fn_actualizar_impresora`…). Muchas son
  públicas a propósito (el kiosko es `anon`: `fn_crear_orden`,
  `fn_recibo_publico`, `fn_promos_vigentes`). Hay que ir una por una:
  cerrar de golpe es cómo rompí el instalador.
- La consulta que las lista: funciones `prosecdef` con `anon=X` en
  `proacl` cuyo cuerpo no menciona `fn_es_jefe|fn_es_soporte|fn_rol_staff|
  auth.uid|agente_token`.
- **Una politica `using (true)` mas un `grant` a `anon` es una puerta
  abierta, aunque el dinero se calcule en el servidor.** `fn_crear_orden`
  LEE `productos.precio`: si el precio se puede tocar desde fuera,
  calcularlo en el servidor no protege nada. El 31/08 se cerraron
  `productos`, `categorias`, `insumos`, `recetas`, `combo_items`,
  `promociones`, `parametros`, `inventario_stock`, `lotes`,
  `transferencias` y `caja_cortes`: escribir exige `fn_es_staff()`, y
  `anon` ya no tiene el permiso de tabla. La condicion es `fn_es_staff()`
  y **no `authenticated`**, porque todo cliente de Rewards lo es.
- **Costeos no usa Supabase Auth**, tiene su propio login (`app_users`).
  Validaba bien la contrasena pero **no dejaba sesion**: seguia hablando
  como `anon`, asi que se rodeaba llamando a `app_data` directo — y ahi
  estan los costos, margenes y proveedores. Ahora `fn_costos_login`
  devuelve un token con caducidad y el documento va por `fn_costos_leer` /
  `fn_costos_guardar`. El aviso de "otro guardo" viaja por
  `app_data_senales` (solo quien y cuando): Realtime respeta RLS, y mandar
  el documento entero por ese canal era la misma fuga por otra puerta.
- **Quien pide no es quien prioriza.** El rol **`desarrollo`** está por
  encima de gerencia: es el único que abre Admin → **Soporte**, prioriza,
  mete algo a la sesión, cierra un reporte y ve las notas internas
  (`fn_es_soporte()`). Gerencia —los dueños— pide y consulta. Y `desarrollo`
  no se reparte desde Admin: `fn_crear_empleado` / `fn_actualizar_empleado`
  lo rechazan salvo que ya seas desarrollo, y esa cuenta no se puede editar
  desde ahí (si no, gerencia le cambiaría el PIN y entraría por ella).

- **Antes de cerrarle una función a `anon`, busca quién la llama fuera del
  navegador.** Le quité `anon` a `fn_admin_impresoras` para tapar una fuga
  de IPs, sin ver que es la misma que usa
  `scripts/instalar-agente-impresion.ps1`. Ese instalador corre en una PC
  recién formateada, donde lo único que hay es la llave pública: no hay
  sesión de personal que ofrecer. La instalación murió con *"(401) No
  autorizado"* y el mensaje mandaba a revisar la llave, que estaba bien.
  El `grep` que faltaba no era en `apps/`, era en `scripts/`.

**Este entorno**

- Si `git push` falla con *"could not read Username"*: el proxy inyecta la
  credencial pero git no sabe qué usuario mandar. Ya hay un
  `credential.helper` configurado; si se pierde, se arregla con un helper
  que responda `username=x-access-token` y `password=$GITHUB_TOKEN`.
- El proxy bloquea `*.pages.dev` y algunos dominios externos. Para
  verificar producción: consultar la base, o hacer la petición desde
  Supabase (pg_net / Edge Function).
- Al subir por la API de GitHub, **verifica el árbol contra el local**
  (`git diff HEAD origin/rama`): una subida parcial pasa desapercibida.

---

### 2.7 La app del cliente se compila en la nube

`.github/workflows/testflight-ios.yml` la sube a TestFlight desde un
runner de macOS: **no hace falta una Mac**. Cuatro secrets (llave de App
Store Connect + Team ID) y ningún certificado — `xcodebuild
-allowProvisioningUpdates` los crea solo. Por eso puede correr en la nube:
no hay un `.p12` que alguien tenga que exportar de su llavero.

El proyecto nativo **no se versiona**: se regenera en cada corrida desde
`capacitor.config.ts` + `scripts/app-nativa-preparar.sh`. Ese script pone
los tres ajustes que Capacitor no pone solo, y el primero es el que más
duele si falta: sin el **URL Type** `mx.shakeaholic.rewards`, el login de
Google termina bien y el teléfono no sabe a qué app devolver el resultado
— sin ningún mensaje de error.

Para retomar solo Rewards en otra sesión, el mapa está en
`docs/rewards-donde-vamos.md`; el detalle, en `docs/rewards-app-nativa.md`,
`docs/monedero-y-sellos.md` y `docs/metas-y-perfil.md`.

---

## 5. Seguridad

- Las llaves van en **Supabase Edge Function Secrets**, nunca en el repo ni
  en el chat. El `service_role` jamás dentro de SQL (quedaría legible).
- La llave publicable y el JWT anon **son públicos por diseño** (viven en
  el frontend). La seguridad real está en RLS y en las funciones.
- El personal entra con PIN → `staff-login` (Edge) → sesión real de
  Supabase Auth. `fn_es_jefe()` distingue gerencia; **no basta con
  `authenticated`**, porque un cliente de lealtad también lo es.
- Repo público: nada de costos, márgenes ni proveedores en git. Los
  respaldos `respaldo-costosshake-*.json` están en `.gitignore`.

---

## 6. Cómo trabajar aquí

```bash
pnpm --filter @shake/<app> build   # compila y verifica tipos
pnpm -r test                       # pruebas de packages
cd agente-impresion && npx vitest run
node scripts/verificar-scripts-ascii.mjs
```

Rama de trabajo `claude/shakeaholic-pos-ecosystem-z9imgr`, y se mezcla a
`main` (eso dispara el despliegue). Las migraciones se aplican con el MCP
de Supabase **y** se guardan en `supabase/migrations/` como registro.

Antes de decir "quedó": compruébalo contra producción. Casi todo se puede
verificar con una consulta — quién cobró, si la comanda salió, si el
agente late, si el renombre partió un producto en dos.
