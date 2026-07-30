# Conectar `shakeaholic.mx` — paquete completo

Todo lo necesario para pasar de los `*.pages.dev` provisionales al dominio
propio: qué subdominio va a qué app, cómo se agrega, y —lo que casi siempre se
olvida— **qué hay que actualizar después** para que nada se rompa.

El dominio está en **GoDaddy** y las apps en **Cloudflare Pages**.

---

## 1. Decisión previa: ¿nameservers en GoDaddy o en Cloudflare?

Hay dos caminos y conviene elegir antes de empezar, porque cambiar después
implica rehacer registros.

### Opción A — Dejar el DNS en GoDaddy (CNAME por subdominio)

- Cada subdominio se agrega **dos veces**: una en Cloudflare Pages y otra como
  CNAME en GoDaddy. Son 8 subdominios → 16 pasos.
- No hay tiempo de espera grande: cada CNAME propaga en minutos.
- La raíz `shakeaholic.mx` **no se puede apuntar con CNAME** (limitación del
  DNS); necesita el reenvío de GoDaddy o mover los nameservers.

### Opción B — Mover los nameservers a Cloudflare *(recomendado)*

- Se hace **una sola vez**: GoDaddy → Nameservers → *Custom* → los dos que te
  dé Cloudflare.
- A partir de ahí, cada dominio que agregues en Pages **crea su propio
  registro solo**. Ya no vuelves a entrar a GoDaddy.
- La raíz sí se puede apuntar (Cloudflare hace CNAME flattening).
- **Tarda de 1 a 24 horas en propagar.** Hazlo con calma, nunca el día que
  abres la tienda.

Con 8 subdominios por conectar, la B ahorra bastante trabajo.

---

## 2. Mapa de subdominios

| Subdominio | Proyecto en Cloudflare Pages | Quién lo usa |
|---|---|---|
| `kiosko` | `shake-kiosko` | Pantalla del cliente / cajero |
| `caja` | `shake-pos` | Cajero (PC o iPad) |
| `cocina` | `shake-cocina-alimentos` | Pantalla de cocina |
| `barra` | `shake-cocina-bebidas` | Pantalla de barra |
| `pantalla` | `shake-cliente-display` | TV de folios para el cliente |
| `admin` | `shake-admin` | Gerencia |
| `rewards` | `shake-cliente-pwa` | Celular del cliente (lealtad) |
| `costos` | `shake-costos` | Costeo e inventario, uso interno |

> **La raíz `shakeaholic.mx` no está cubierta.** Hoy no existe una página web
> del negocio en el repositorio: las ocho apps son herramientas de operación,
> no un sitio público. Ver §5.

---

## 3. El procedimiento, por subdominio

### 3.1 En Cloudflare Pages

1. **Workers & Pages** → abre el proyecto (ej. `shake-kiosko`).
2. Pestaña **Custom domains** → **Set up a custom domain**.
3. Escribe el subdominio completo: `kiosko.shakeaholic.mx` → **Continue**.
4. - Con **nameservers en Cloudflare**: crea el registro solo. Terminaste.
   - Con **DNS en GoDaddy**: te muestra el CNAME. Cópialo y sigue a 3.2.

### 3.2 En GoDaddy *(solo en la opción A)*

**Mis productos → DNS** de `shakeaholic.mx` → **Agregar registro**:

| Campo | Valor |
|---|---|
| Tipo | `CNAME` |
| Nombre | `kiosko` (solo el subdominio, sin el dominio) |
| Valor | Lo que te dio Cloudflare (ej. `shake-kiosko.pages.dev`) |
| TTL | 1 hora |

### 3.3 Esperar y verificar

En Cloudflare el dominio pasa a **Active** y emite el certificado HTTPS solo.
Cuando `https://kiosko.shakeaholic.mx` abra con candado, ese quedó.

Repetir para los ocho.

---

## 4. Lo que hay que actualizar DESPUÉS

Esta es la parte que se olvida y provoca fallas raras días después.

### 4.1 Google (si ya configuraste el login de lealtad)

Google valida los orígenes carácter por carácter. **Agregar** —sin borrar los
viejos hasta comprobar que todo jala—:

**Google Cloud → Credenciales → tu ID de cliente → Orígenes autorizados:**
```
https://rewards.shakeaholic.mx
https://kiosko.shakeaholic.mx
```

La URI de redirección **no cambia**: sigue apuntando a Supabase.

### 4.2 Supabase

**Authentication → URL Configuration → Redirect URLs**, agregar:
```
https://rewards.shakeaholic.mx
https://kiosko.shakeaholic.mx/auth/callback
```

### 4.3 Variable del kiosko

El QR de Rewards apunta a donde diga `VITE_URL_REWARDS`. En Cloudflare Pages,
proyecto `shake-kiosko` → **Settings → Environment variables**:

```
VITE_URL_REWARDS = https://rewards.shakeaholic.mx
```

**Requiere volver a desplegar** para que el build la tome (Deployments →
*Retry deployment*). Sin esto el QR sigue mandando al `.pages.dev` viejo —
funciona, pero se ve poco profesional impreso en un letrero.

### 4.4 El lanzador de las pantallas

`scripts/abrir-pantallas.bat` y los bloques de PowerShell traen las URLs
`.pages.dev`. Cámbialas por las nuevas en la NUC de la sucursal.

### 4.5 El iPad

Borra el icono de la pantalla de inicio y vuelve a agregarlo desde
`https://caja.shakeaholic.mx`, o seguirá abriendo el dominio viejo.

---

## 5. La raíz del dominio

`shakeaholic.mx` a secas no lleva a ningún lado todavía. Tres caminos:

| Opción | Qué implica |
|---|---|
| **Reenvío a Rewards** | GoDaddy → *Reenvío de dominio* → `rewards.shakeaholic.mx`. Gratis e inmediato, pero la barra del navegador cambia de dirección |
| **Página del negocio** | Una landing estática con menú, horario, ubicación y botón a Rewards. No existe hoy; hay que construirla |
| **Dejarla vacía** | Nadie teclea la raíz si todo se reparte por QR y accesos directos |

Si vas a imprimir el dominio en vasos, letreros o redes, conviene la segunda:
que alguien teclee `shakeaholic.mx` y le salga un error es peor que no ponerlo.

---

## 6. Orden recomendado

1. Decidir A o B (§1). Si es B, mover nameservers **hoy** y esperar.
2. Conectar primero **`rewards`** — es el único que el cliente ve y el que
   necesita Google.
3. Configurar Google y Supabase con el dominio ya vivo
   (`docs/rewards-paso-a-paso.md`).
4. Conectar los otros siete cuando quieras: son internos y no urgen.
5. Actualizar el lanzador de la NUC y el icono del iPad.
