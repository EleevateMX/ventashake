# Migraciones

Historial en el proyecto Supabase **Shakeaholic** (`zyjtnaystsporbuzcmqk`):

| Versión | Nombre | Estado |
|---|---|---|
| `20260612155254` | `shakeaholic_inicial` | aplicada (app_data / app_users legacy) |
| `20260701201338` | `core_unificado` | aplicada (núcleo relacional: sucursales, almacenes, insumos, productos, recetas, inventario, órdenes, ventas, parámetros, vista de costeo v1) |
| `20260701...` | `pos_operativo_aditivo` | aplicada — versionada aquí como `20260701220000_pos_operativo_aditivo.sql` |
| `20260701...` | `fix_sel_ordenes_pos` | aplicada — versionada aquí como `20260701223000_fix_sel_ordenes_pos.sql` |

Las dos primeras se aplicaron directamente en el proyecto hosted antes de
existir este repo; su SQL vive en el historial de Supabase
(`supabase migration list`). A partir de ahora **toda migración nueva se
versiona en esta carpeta** y se aplica con el MCP de Supabase o
`supabase db push`.

Reglas:

- **Solo migraciones aditivas.** Nada de `DROP TABLE` / `DROP COLUMN` sobre
  objetos con datos. `app_data` y `app_users` son intocables.
- Después de cada migración, regenerar `packages/types/src/database.ts`.
