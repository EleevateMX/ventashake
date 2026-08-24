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
| `cliente-pwa` | `rewards.shakeaholic.mx` | Celular del cliente |
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
- **El precio es la intención de venta**: `precioScoop` > 0 lo vende por
  scoop, `precioBote` > 0 vende el bote. El sufijo `- B` / `- R` en el
  sabor es legado que sigue funcionando, pero ya no hace falta.

### 2.2 El dinero se calcula en el servidor, siempre

`fn_crear_orden` recalcula precios y total desde `productos.precio`;
`fn_cobrar_orden` valida el monto contra ese total y es idempotente. El
cliente no manda precios. Nunca abras un camino que permita aprobar un
pago por INSERT directo.

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

### 2.5 La PC de la tienda se mantiene sola

- `scripts/instalar-todo.bat` — una vez por PC. Se auto-eleva, instala el
  agente, deja el arranque de Windows y abre todo.
- `scripts/abrir-shakeaholic.bat` — el del día a día (y está en el
  arranque). Compara versión del agente contra la publicada y **se
  actualiza solo** antes de abrir. Abre kiosko, barra y cocina.
- `scripts/abrir-caja-y-admin.bat` — POS y Admin, que ya no van en el
  arranque (el turno se abre desde el kiosko).
- Los `.bat`/`.ps1` deben ser **ASCII puro**:
  `node scripts/verificar-scripts-ascii.mjs` lo verifica.

---

## 3. Operación diaria (lo que le dices al negocio)

| Situación | Qué hacer |
|---|---|
| Abrir la tienda | Nada: la PC arranca todo sola |
| Abrir/cerrar caja o cambiar turno | **5 toques a Milo** en el kiosko → PIN |
| Cambiar precios o productos | Costeos o Admin → botón **"Actualizar pantallas"** |
| Ver la tienda a distancia | Admin → **En vivo** |
| Algo se siente raro | Admin → **Diagnóstico** |
| Actualizar el agente de impresión | Solo, al abrir el día siguiente |

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
