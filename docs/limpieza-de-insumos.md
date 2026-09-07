# La limpieza del catálogo de insumos

**No borres nada leyendo solo el número.** Este documento existe para que
la limpieza sea una decisión, no una corazonada. Los datos son del
7 de septiembre de 2026.

---

## Qué pasó

El catálogo tiene **1 628 insumos** y la tienda no vende 1 628 cosas.
Sobran unos 440, y no los metió nadie a mano: los fue creando la
sincronización de Costeos a partir de renglones que todavía no eran nada.

Hubo **dos causas distintas**, y conviene no confundirlas porque solo una
sigue viva:

### 1. El rebote del guardado (ya atendido)

Costeos guardaba mientras alguien escribía, y cada estado intermedio del
campo se sincronizaba como un insumo nuevo. Escribir «Canada Dry Ginger
Ale» dejó, uno por tecleo:

```
Canada          Canada Dry Gi        Canada Dry Ginger A
Canada Dr       Canada Dry Ginger    Canada Dry Ginger S
Canada Dry                           Canada Dry Ginger Ale
```

Ocho insumos, siete basura, cada uno con su propio renglón de stock. Lo
mismo con «Monster - Peachy Keen» y con las aguas.

Se arregló haciendo que los campos de texto guarden **al salir del
campo**, no en cada tecla.

### 2. El relleno de los renglones nuevos (la que seguía viva)

Al agregar una proteína, Costeos crea el renglón con **marca `Nueva` y
sabor `—`** para que se vea que está vacío. Guardaba en ese momento, y la
sincronización tomaba ese relleno por un nombre de verdad. Conforme
escribían el sabor pero aún no la marca, nacía uno por cada sabor:

```
Nueva - —              Nueva - Chai            Nueva - Key Lime Pie
Nueva - Tamarindo      Nueva - Chocolate       Nueva - Pan de Muerto
Nueva - Birthday Cake  Nueva - Vainilla        Nueva - Lemon Cake …
```

**62 insumos** que empiezan con `Nueva - `. El botón de empaque hacía lo
mismo con `Nuevo empaque`.

Nadie lo estaba haciendo mal: la pantalla pone ese relleno a propósito.
Lo que estaba mal era tomarlo por un nombre.

**Arreglado por los dos lados** (07/09):

- La base ignora los renglones con relleno: una proteína entra al
  catálogo solo cuando marca **y** sabor son de verdad — el nombre del
  insumo es `marca - sabor`, así que con uno solo el nombre ya nace
  mentiroso. El empaque, solo cuando ya no se llama «Nuevo empaque».
  (`costeos_no_da_de_alta_los_renglones_en_blanco`, parche por ancla
  sobre `fn_sync_app_data`.)
- Costeos ya no guarda al agregar un renglón, solo cuando hay algo que
  guardar. Así se ahorra además una sincronización entera —3.4 s— por
  cada renglón en blanco.

Comprobado ejecutando la sincronización de verdad con dos renglones de
relleno inyectados y revirtiendo: no nació ningún insumo, y los 459
productos, 1 628 insumos y 3 085 recetas quedaron igual.

---

## Lo que queda por limpiar, y qué tan seguro es

| Cuántos | Qué son | ¿Seguro borrarlos? |
|---|---|---|
| **440** | Ningún producto **activo** los usa **y** nunca tuvieron un movimiento | **Sí.** Los 440 tienen stock **cero**. No hay inventario real detrás de ninguno. |
| 201 de esos 440 | Además, su nombre es prefijo exacto de otro más largo («Canada Dry Gi» ⊂ «Canada Dry Ginger Ale») | Sí, y son la firma inconfundible del rebote |
| 449 | No los usa ningún producto **pero tienen stock distinto de cero** | **No.** Eso es inventario de verdad mal etiquetado. Borrarlo lo desaparece. Hay que mirarlos uno por uno. |

La consulta que los lista, para revisarlos antes de decidir:

```sql
select i.id, i.nombre, i.created_at::date,
       coalesce((select s.stock_actual from inventario_stock s
                 where s.insumo_id = i.id limit 1), 0) as stock
from insumos i
where i.activo
  and not exists (select 1 from recetas r join productos p on p.id = r.producto_id
                  where r.insumo_id = i.id and p.activo)
  and not exists (select 1 from inventario_movimientos m where m.insumo_id = i.id)
order by i.nombre;
```

### Si se decide limpiar

**Apagar, no borrar.** `activo = false` es reversible y `delete` no —y
`insumos` cuelga de `recetas` e `inventario_stock` con `on delete
cascade`, así que un borrado se lleva cosas por delante sin avisar.

```sql
-- Revisa primero la lista de arriba. Esto apaga solo los de stock cero.
update insumos set activo = false
where activo
  and not exists (select 1 from recetas r join productos p on p.id = r.producto_id
                  where r.insumo_id = insumos.id and p.activo)
  and not exists (select 1 from inventario_movimientos m where m.insumo_id = insumos.id)
  and not exists (select 1 from inventario_stock s
                  where s.insumo_id = insumos.id and s.stock_actual <> 0);
```

**No es urgente.** Un insumo apagado de más no rompe nada; uno borrado de
más se lleva su receta. Y desde que la causa está tapada, la lista ya no
crece.

---

## Lo que la limpieza NO arregla

Que sobren insumos y que las ventas no descuenten son **dos problemas
distintos**, y borrar los 440 no mueve ni una pieza de inventario. Lo que
sí descuenta está en:

- `el_descuento_de_inventario_deja_de_perderse` — el renglón de stock
  ahora nace solo cuando se vende algo que no lo tenía. Eran 264 insumos
  del Kiosko con ventas registradas y sin renglón que bajar.
- **Admin → Inventario → «Lo que no descuenta»** — los 42 productos que
  se venden sin receta, cada uno con su causa.

Y el gemelo partido en dos —«Agua Mineral - Canada Dry» existe como
bebida de $22 costeada y como extra de $10 sin costear, con la misma
clave `CANDAM`— tampoco se arregla borrando: se arregla en Costeos,
decidiendo cuál de los dos se vende.
