# Reporte de conciliación de datos legacy

Auditoría del JSON `app_data` (2026-07-01). **Nada se corrigió en
automático** — estas listas requieren decisión humana antes o después del
ETL (el ETL migra la 1ª aparición y omite el resto).

## Nombres duplicados

| Nombre | Veces | Colección | Acción sugerida |
|---|---|---|---|
| (sin nombre) | 4 | snacks | borrar o nombrar en el legacy antes del ETL |
| Gatorade | 3 | bebidas | ¿son sabores distintos? renombrar (ej. "Gatorade Lima") |
| Barra de Proteína (Kirkland) | 2 | snacks | unificar o diferenciar sabor |
| Birdman (Falcon) Chai | 2 | proteins | unificar (mismo producto capturado 2 veces) |
| Ghost Energy (Welchs Grape) | 2 | bebidas | unificar |

## Datos incompletos (conteos)

| Problema | Cantidad | Efecto |
|---|---|---|
| Líneas de receta sin cantidad | **106 / 145** (20 recetas) | costeo y descuento de inventario subestimados; quedan con nota `PENDIENTE-CANTIDAD` |
| Ingredientes shake sin costo | 25 / 42 | costo receta $0 en esas líneas |
| Ingredientes alimento sin costo | 13 / 32 | ídem |
| Recetas de shake sin precio | **16 / 16** | productos creados **inactivos** hasta asignar precio |
| Recetas de alimento sin precio | 4 / 7 | ídem |

## Positivo

- 0 insumos huérfanos: todas las líneas de receta referencian ingredientes
  que sí existen.
- Parámetros consistentes (IVA 0.16, food cost 0.30, merma 0.02) entre el
  JSON y la tabla `parametros`.

## Proceso de conciliación propuesto

1. Correr `pnpm etl:dry` — regenera estas listas con detalle por ítem en
   `supabase/seed/reportes/`.
2. Decidir duplicados (tabla de arriba).
3. `pnpm etl:aplicar`.
4. Capturar en `apps/costos`: precios de los 16 shakes, cantidades de las
   106 líneas y costos de los 38 ingredientes — la app marca en rojo el
   food cost incompleto.
