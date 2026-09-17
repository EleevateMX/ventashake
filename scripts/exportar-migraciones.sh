#!/usr/bin/env bash
# Exporta el historial COMPLETO de migraciones desde la base a
# supabase/migrations/, en orden y con su version por delante.
#
# Por que existe: el repo tenia 146 archivos y la base 198 aplicadas. Las
# 52 que faltaban eran las primeras -- las que crean las tablas -- asi que
# el repo NO podia reconstruir la base. Supabase guarda cada migracion con
# sus sentencias en `supabase_migrations.schema_migrations`; esto las baja.
#
# Uso:
#   export PGURI='postgresql://postgres.[ref]:[password]@...pooler.supabase.com:5432/postgres'
#   bash scripts/exportar-migraciones.sh
#
# La cadena sale de Supabase -> Project Settings -> Database -> Connection
# string. NO la guardes en el repo ni la pegues en un chat.
set -euo pipefail

: "${PGURI:?Falta PGURI. Ver el encabezado de este archivo.}"
DESTINO="${1:-supabase/migrations}"
mkdir -p "$DESTINO"

echo "Leyendo el historial..."
TOTAL=$(psql "$PGURI" -tAc "select count(*) from supabase_migrations.schema_migrations")
echo "  $TOTAL migraciones en la base."

# Una por una: el nombre del archivo lleva la version delante para que el
# orden alfabetico sea el orden real de aplicacion.
psql "$PGURI" -tAc \
  "select version || ' ' || coalesce(nullif(name,''),'sin_nombre')
     from supabase_migrations.schema_migrations order by version" \
| while read -r VERSION NOMBRE; do
    ARCHIVO="$DESTINO/${VERSION}_${NOMBRE}.sql"
    psql "$PGURI" -tAc \
      "select array_to_string(statements, E';\n') || ';'
         from supabase_migrations.schema_migrations where version = '$VERSION'" \
      > "$ARCHIVO"
    printf '  %s\n' "$(basename "$ARCHIVO")"
  done

echo
echo "Listo: $(ls -1 "$DESTINO"/*.sql | wc -l) archivos en $DESTINO"
echo
echo "Ahora los viejos duplicados (los que no llevan version delante) ya"
echo "sobran: el mismo contenido esta en el archivo con version. Revisalos"
echo "con 'git status' antes de borrarlos."
