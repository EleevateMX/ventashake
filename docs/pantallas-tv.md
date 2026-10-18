# Pantallas (TV) — qué transmite cada una

Admin → **Pantallas (TV)** (18/10/26). Gerencia da de alta cada TV (nombre,
dónde está, IP), le asigna contenido con un clic y ve **qué está mostrando**.

## Por qué así

Las TVs son Hisense con VIDAA. Por red **no** se pueden encender ni abrirles
el navegador: el control de Hisense (puerto 36669) exige un certificado que
vive dentro de la app RemoteNOW y además el PIN en pantalla. Lo que sí
funciona es **DLNA** (puerto 18400): una PC de la red le manda una imagen y la
TV la muestra (probado: la TV reportó `PLAYING`).

Así que hay dos caminos:

| Contenido | Quién lo pone | Cómo se sabe que está |
|---|---|---|
| **Promos**, **Menú** | El **empujador** (PC de la tienda) por DLNA | El empujador reporta cada TV |
| **Pedidos listos** | El navegador de la TV, abierto **a mano** en `pantalla.shakeaholic.mx` | Esa página late cada minuto (`pantalla_espejo`, `folios:xxxx`) |
| **Nada** | Nadie | — |

Esta pantalla **no habla con las TVs**: asigna y lee. Solo la PC de la
tienda las alcanza en la red local.

## Base (`supabase/migrations/pantallas_tv.sql`)

- `pantallas_tv` — una fila por TV: `nombre`, `ubicacion`, `ip` (única entre
  las activas), `contenido` (`promos|menu|pedidos|nada`), `segundos` por
  imagen, `activa`, `orden`, `reenganchar_desde`, y lo último que reportó el
  empujador (`reporte`, `reportado_en`).
- `pantallas_tv_imagenes` — las imágenes de `promos` y de `menu`, con
  `orden`, `segundos` (vacío = los de la TV) y fechas `desde`/`hasta`
  opcionales (Halloween, Navidad: fuera de fechas no se mandan). Bucket
  público `pantallas` (la TV las baja por URL, sin sesión).
- `pantallas_tv_agente` — una sola fila: el **hash** de la llave del
  empujador y su latido (versión, nombre de la PC).

Gerencia (candado interno `fn_es_jefe()`): `fn_pantallas_tv_admin`,
`fn_pantalla_tv_guardar`, `fn_pantalla_tv_imagen_guardar`,
`fn_pantalla_tv_reenganchar`, `fn_pantallas_tv_llave`.

## Contrato del empujador

Lo construye la sesión que trabaja en la PC de la tienda. Habla con dos
funciones RPC, abiertas a `anon` (en la PC no hay sesión de personal) y
validadas con **su llave**: Admin → Pantallas → «Generar llave del
empujador». Se ve una vez; se guarda solo su hash; generar otra invalida la
anterior. Va en el `.env` del empujador, nunca en el repo ni en un chat.

```
POST https://zyjtnaystsporbuzcmqk.supabase.co/rest/v1/rpc/fn_pantallas_tv_agente
headers: apikey: <llave publicable>
body:    { "p_token": "tv_…", "p_version": "0.1.0", "p_agente": "PC-COCINA" }
→ {
    "ahora": "…",
    "pantallas": [
      { "id": "uuid", "nombre": "TV de la caja", "ip": "192.168.1.60",
        "contenido": "promos" | "menu" | "pedidos" | "nada",
        "segundos": 12,
        "reenganchar_desde": "2026-10-18T…" | null,
        "diapositivas": [ { "id": "uuid", "nombre": "Halloween", "url": "https://…png", "segundos": 12 } ] }
    ]
  }
```

- Solo trae TVs **activas con IP**. Las diapositivas ya vienen filtradas por
  fecha de Mérida y ordenadas; `segundos` ya trae el de la TV si la imagen no
  tiene el suyo. Para `pedidos` y `nada` la lista viene vacía: no hay que
  empujar nada (no tocar esas TVs).
- Llamarla cada **30–60 s**: es también su latido (Admin lo pinta «en línea»
  si latió en los últimos 2 minutos).
- `reenganchar_desde`: si es más nuevo que la última vez que el empujador
  puso el contenido en esa TV, volver a ponerlo ya (gerencia tocó «Volver a
  poner su contenido»).
- Llave mala → error `P0001`, hint `llave_invalida`.

```
POST …/rpc/fn_pantallas_tv_reportar
body: { "p_token": "tv_…",
        "p_reportes": [ { "id": "uuid", "estado": "mostrando", "mostrando": "Halloween",
                          "transporte": "PLAYING", "error": null } ] }
→ número de TVs actualizadas
```

- `estado`: `mostrando` · `sin_respuesta` (no contesta: apagada o sin red) ·
  `otra_entrada` (alguien le cambió de entrada; se reengancha sola) ·
  `error` (con `error` en texto).
- Reportar cada vez que cambia algo y al menos cada **2 minutos** por TV:
  un reporte de más de 3 minutos Admin lo pinta como «sin reporte».
- Hasta 50 TVs por llamada, 2 000 caracteres por reporte.

### Compatible con `agente-pantallas/` tal como está

El empujador que ya subió la otra sesión espera por TV una sola `url` (+
`tipo`, `activa`, `titulo`) y reporta por `ip` con `{ mostrando,
transporte, correcto, detalle }`. Las dos funciones aceptan también esa
forma:

- Cada TV trae además `url` y `titulo` = la diapositiva que toca **ahora**
  (rota cada `segundos` de la TV), `tipo: 'imagen'` y `activa` (false para
  `pedidos`/`nada` o sin imágenes; esas vienen con `url: null` y el agente
  las deja en paz).
- El reporte se empata por `id` o, si no trae, por `ip`; `correcto: true`
  se guarda como `estado: 'mostrando'`, `false` como `error` con el
  `detalle`.

Lo único que le falta al agente: mandar la llave. En su `.env`,
`RPC_ASIGNACIONES=fn_pantallas_tv_agente`, `RPC_REPORTE=fn_pantallas_tv_reportar`,
y pasar `{ p_token }` en las dos llamadas (hoy llama `sb.rpc(rpc)` sin
argumentos). Con `CICLO_SEGUNDOS=20` y una TV de 12 s, la rotación queda a
la vuelta del ciclo; para rotar fino, usar `diapositivas`.

Las TVs que la otra sesión encontró en la red: 192.168.1.73 (Barra trasera),
.76 (Barra larga), .80 (Caja shakeaholic), .81 (en standby: VIDAA apaga su
DLNA con la pantalla).

## Lo que falta

- **El empujador** (PC de la tienda): DLNA, reenganche, reportes.
- **Generador del menú**: renderizar el menú a imagen cuando cambian
  precios y dejarla en `pantallas_tv_imagenes` con `grupo = 'menu'`. Hasta
  entonces, gerencia sube la imagen del menú a mano.
- Si un día cansa reabrir el navegador de la TV de pedidos con el control:
  un stick HDMI por pantalla lo resuelve.
