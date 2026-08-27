# Flujo costos

`apps/costos` reemplaza al index.html legacy leyendo/escribiendo **las
mismas tablas que usa el POS**.

## Operación

1. **Insumos**: alta/edición en `insumos`. `costo_unitario` es columna
   generada (`costo_compra / contenido`) — nunca se captura a mano.
2. **Productos**: alta con categoría, precio e IVA incluido sí/no.
3. **Receta**: líneas insumo + cantidad (en la unidad del insumo). El
   editor muestra el costo en vivo (`@shake/utils` espeja la vista).
4. **Costeo**: `vw_costeo_producto` (v3, fórmula validada contra el
   `finishCalc` del tablero legacy) calcula por producto:
   - `costo_receta` (insumos sin empaque) y `costo_empaque`
   - `costo_con_merma` = costo_receta × (1 + merma) — merma del producto
     o default global; **la merma NO aplica al empaque** (igual que legacy)
   - `costo_total` = costo_con_merma + costo_empaque + mano_obra
     (mano de obra del producto si > 0, si no la global de parámetros)
   - `precio_sin_iva` / `precio_con_iva`
   - `food_cost_pct` = costo_total / precio_sin_iva (rojo si > meta)
   - `margen` (utilidad $) y `margen_pct`
   - `precio_sugerido` = costo_total / food_cost_meta × (1+IVA),
     redondeado a múltiplos de $5
5. **Recalculo en cascada**: al cambiar `costo_compra` de un insumo, la
   vista refleja el nuevo costeo de todos los productos que lo usan.
   Sin jobs, sin duplicación.

## Parámetros globales

`parametros` (id 'default'): `iva`, `food_cost_meta`, `merma_default`,
`mano_obra`. Editables en la pestaña Parámetros.

## Compatibilidad con la lógica legacy

Fórmulas portadas 1:1 del tablero original: IVA, food cost objetivo,
merma, mano de obra, empaque (via insumos tipo `empaque` en receta),
precio sugerido, precio final, margen y utilidad. Verificar contra 2–3
productos conocidos después del ETL (checklist en pendientes.md).

## Categorías: quién manda, y cómo se subdividen

**Costeos NO decide la categoría de un producto que ya existe.** El sync
hace `categoria_id = coalesce(<la del JSON>, <la que ya tenía>)`, y hoy
ningún renglón del costeo trae el campo `categoria`. Consecuencia práctica:
**mover un producto de categoría desde Admin es permanente** — al revés de
lo que pasa con el nombre, que sí se revierte.

Con una excepción que hay que conocer: un producto **nuevo** nace en la
categoría genérica de su lista (`bebidas` → *Bebidas*, `snacks` → *Snacks*).
Un sabor nuevo de Ghost dado de alta en Costeos aparece en *Bebidas*, no en
*Energy Drinks - Ghost*; hay que moverlo una vez desde Admin y ahí se queda.

### Las subcategorías son nombres, no una tabla

No hay tabla de padres. La jerarquía vive en el nombre, con el separador
` - `:

```
Energy Drinks - Ghost      Snacks - Barras Proteicas
Energy Drinks - Monster    Snacks - Galletas Proteicas
Scoops - Proteínas         Suplementos - Creatinas
```

`agruparCategorias` (en `packages/supabase/src/queries/catalogo.ts`) lo
pliega solo: el kiosko pinta la familia arriba y las marcas/tipos como
chips debajo. **Crear una subcategoría no necesita ni una línea de
frontend** — basta con nombrarla así.

Dos cosas que hay que respetar al crear una:

1. **Heredar `va_a_pantalla` del padre.** *Energy Drinks* y *Snacks* van en
   `false` porque los sirve el cajero. Una hija que naciera en `true` haría
   que cada lata mande comanda a barra.
2. **Nada más.** La baja por desaparecer del costeo ya alcanza a cualquier
   subcategoría: el sync mira la familia (`split_part(nombre, ' - ', 1)`),
   no el nombre completo. Antes era una lista literal y se había olvidado
   *Energy Drinks* — una lata borrada del costeo se quedaba viva para
   siempre.

El `orden` de las categorías va de **10 en 10** justo para esto: dejar hueco
para meter subcategorías en su lugar sin renumerar el menú entero.
