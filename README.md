# 🥤 shake-pos-ecosistema

Ecosistema de punto de venta + costos de **Shakeaholic** sobre Supabase
(fuente única de verdad). Monorepo pnpm.

```
apps/costos            ✅ app de costeo funcional (insumos, productos, recetas, parámetros)
apps/{pos,kiosko,admin,cocina-*,cliente-display}   fases 5–7
packages/{types,supabase,utils,ui}                 código compartido
supabase/{migrations,seed,functions}               SQL versionado, ETL, edge functions
docs/                                              diagnóstico, arquitectura, flujos, plan
```

Empieza por **`docs/diagnostico.md`** y **`docs/plan-fases.md`**.

## Correr en local

Requisitos: Node ≥ 20 y pnpm (`corepack enable`).

```bash
pnpm install

# Variables de la app de costos (anon key: Supabase Dashboard → Settings → API)
cp .env.example apps/costos/.env
#   → llenar VITE_SUPABASE_ANON_KEY

pnpm dev:costos          # http://localhost:5180
```

### Migrar los datos legacy (una vez)

```bash
cp .env.example .env     # → llenar SUPABASE_SERVICE_ROLE_KEY (raíz, NUNCA se commitea)
pnpm etl:dry             # simulación + reporte de conciliación
pnpm etl:aplicar         # migra app_data → insumos/productos/recetas
```

Detalles y advertencias: `supabase/seed/README.md` y
`docs/reporte-conciliacion.md`.

## Reglas de oro

- `app_data` y `app_users` **no se tocan** (legacy intacto).
- Migraciones SQL **solo aditivas**, versionadas en `supabase/migrations/`.
- `service_role` **jamás** en `apps/` — solo scripts/edge functions.
- Toda query a Supabase vive en `packages/supabase` — cero queries sueltas
  en componentes.
- La lógica transaccional (pago → inventario → cocina) vive en la base
  (triggers); los frontends no la duplican.
