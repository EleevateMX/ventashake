# Conectar el dominio de GoDaddy — Shakeaholic

Tu dominio `shakeaholic.mx` (y `.com.mx`, `.net`) está en **GoDaddy**, y ahí
también viven tu **sitio web (Websites + Marketing)** y tu **correo**. Por eso
la regla de oro:

> **Solo agregamos SUBDOMINIOS con registros CNAME. NO tocamos el dominio raíz
> (`shakeaholic.mx` a secas), ni los registros MX (correo). Así tu página y tu
> correo actuales siguen funcionando igual.**

## 1. Plan de subdominios → apps

Todo cuelga de `shakeaholic.mx` (un solo dominio, más simple):

| Subdominio | App | Para quién |
|---|---|---|
| `kiosko.shakeaholic.mx` | kiosko | Pantalla touch del cliente |
| `caja.shakeaholic.mx` | pos | Cajero |
| `cocina.shakeaholic.mx` | cocina-alimentos | Pantalla cocina |
| `barra.shakeaholic.mx` | cocina-bebidas | Pantalla barra de licuados |
| `pantalla.shakeaholic.mx` | cliente-display | Folios para el cliente |
| `admin.shakeaholic.mx` | admin | Gerencia |
| `rewards.shakeaholic.mx` | cliente-pwa | Celular del cliente (lealtad) |
| `costos.shakeaholic.mx` | costos | Interno (opcional; hoy usas costosshake) |

`.com.mx` y `.net` puedes dejarlos redirigiendo a `.mx` (sección 6).

## 2. Orden general (para cada app)

Es el mismo ciclo por cada app:

1. **Desplegar** la app en el hosting (Cloudflare Pages recomendado — ver
   `docs/despliegue.md` §5). Al terminar te da una URL tipo
   `shake-kiosko.pages.dev` y, al agregar el dominio personalizado, te dice
   **exactamente** el CNAME a crear.
2. En el **hosting**, en el proyecto → *Custom domains* → agregar
   `kiosko.shakeaholic.mx`. Te mostrará el **destino** (target) del CNAME.
3. En **GoDaddy**, crear el registro **CNAME** de ese subdominio apuntando al
   destino que te dio el hosting.
4. Esperar unos minutos → el hosting emite el **certificado HTTPS** solo.

## 3. Cómo crear un CNAME en GoDaddy (paso a paso)

1. Entra a **godaddy.com** → inicia sesión → **Mis productos**.
2. En **Dominios**, junto a `shakeaholic.mx`, clic en **DNS** (o *Administrar DNS*).
3. En la sección **Registros**, clic en **Agregar** (Add) → tipo **CNAME**.
4. Llena:
   - **Tipo:** `CNAME`
   - **Nombre / Host:** el subdominio **sin** el dominio. Ej. `kiosko`
     (GoDaddy le agrega `.shakeaholic.mx` solo).
   - **Valor / Apunta a (Points to):** el destino que te dio el hosting.
     - Cloudflare Pages: `tu-proyecto.pages.dev`
     - Vercel: `cname.vercel-dns.com`
   - **TTL:** 1 hora (default está bien).
5. **Guardar**. Repite para cada subdominio de la tabla.

> Los cambios de DNS tardan de unos minutos hasta ~1 hora en propagarse.

## 4. Tabla de registros a crear (ejemplo con Cloudflare Pages)

Sustituye cada `*.pages.dev` por el proyecto real que te genere el hosting
(cada app es su propio proyecto/target):

| Tipo | Nombre (Host) | Apunta a (Points to) |
|---|---|---|
| CNAME | `kiosko`   | `shake-kiosko.pages.dev` |
| CNAME | `caja`     | `shake-pos.pages.dev` |
| CNAME | `cocina`   | `shake-cocina-alimentos.pages.dev` |
| CNAME | `barra`    | `shake-cocina-bebidas.pages.dev` |
| CNAME | `pantalla` | `shake-cliente-display.pages.dev` |
| CNAME | `admin`    | `shake-admin.pages.dev` |
| CNAME | `rewards`  | `shake-cliente-pwa.pages.dev` |
| CNAME | `costos`   | `shake-costos.pages.dev` |

(Con Vercel, el "Apunta a" de todos es `cname.vercel-dns.com`; Vercel
distingue cada app por el dominio que registres en cada proyecto.)

## 5. Verificar

- En el hosting, el estado del dominio pasa a **Active/Verified** y activa
  **HTTPS** automático (candado). Prueba abriendo `https://kiosko.shakeaholic.mx`.
- Si tarda, revisa que el CNAME en GoDaddy tenga el **Nombre** correcto (solo
  el subdominio) y el **Valor** exacto que te dio el hosting (sin `https://`).

## 6. `.com.mx` y `.net` → redirigir a `.mx` (opcional)

Para que quien escriba `shakeaholic.net` llegue a tu `.mx`:

- En GoDaddy, dominio `.net`/`.com.mx` → **Reenvío de dominio (Forwarding)** →
  reenviar a `https://shakeaholic.mx` (301 permanente).
- O si quieres los mismos subdominios en `.net`, repite los CNAME ahí.

## 7. No olvidar: Supabase Auth (para la PWA con Google)

Cuando `rewards.shakeaholic.mx` esté en línea:

- **Supabase → Authentication → URL Configuration → Redirect URLs**: agrega
  `https://rewards.shakeaholic.mx`.
- **Google Cloud Console** (OAuth client): en *Authorized redirect URIs* debe
  estar `https://zyjtnaystsporbuzcmqk.supabase.co/auth/v1/callback` (ver
  `docs/flujo-lealtad.md`).

## 8. Seguridad de lo que YA tienes (correo y sitio)

- **No borres ni edites** los registros existentes de `shakeaholic.mx`:
  - Los **MX** y `TXT`/`SPF`/`DKIM` (tu **correo** de GoDaddy).
  - El registro del **dominio raíz** que apunta a tu sitio de GoDaddy
    (Websites + Marketing).
- Solo **agregas** los CNAME de subdominios nuevos. Eso es aislado y no
  afecta correo ni tu web actual.

## 9. Checklist

- [ ] Desplegar cada app en el hosting (Cloudflare Pages / Vercel) con sus
      variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- [ ] Por cada app: agregar el *custom domain* en el hosting y copiar el target
- [ ] En GoDaddy: crear el CNAME de cada subdominio (tabla §4)
- [ ] Esperar propagación + verificar HTTPS
- [ ] Agregar `rewards.shakeaholic.mx` a Supabase Redirect URLs
- [ ] (Opcional) Reenviar `.net` / `.com.mx` a `.mx`
- [ ] Configurar cada PC/pantalla en modo kiosco con su URL (ver
      `docs/despliegue.md` §7 y `docs/hardware.md`)
