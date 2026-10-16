#!/bin/sh
# Backup de PostgreSQL con rotación: 7 diarios, 4 semanales (domingos), 6 mensuales (día 1).
# Corre dentro del contenedor "backup" (usa PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
# Manual:  docker compose -f docker-compose.prod.yml exec backup sh /usr/local/bin/backup.sh
set -eu

DIR=/backups
FECHA=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DIR/diarios" "$DIR/semanales" "$DIR/mensuales"

ARCHIVO="$DIR/diarios/${PGDATABASE}_${FECHA}.dump"
TMP="$ARCHIVO.parcial"

# Formato custom (-Fc): comprimido y permite restaurar tablas sueltas con pg_restore
pg_dump --format=custom --no-owner --no-privileges --file="$TMP"
# Verifica que el archivo se pueda leer antes de darlo por bueno
pg_restore --list "$TMP" > /dev/null
mv "$TMP" "$ARCHIVO"
echo "$(date '+%F %T') Backup OK: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

[ "$(date +%u)" = "7" ] && cp "$ARCHIVO" "$DIR/semanales/"
[ "$(date +%d)" = "01" ] && cp "$ARCHIVO" "$DIR/mensuales/"

# Rotación
find "$DIR/diarios"   -name '*.dump' -mtime +7   -delete
find "$DIR/semanales" -name '*.dump' -mtime +28  -delete
find "$DIR/mensuales" -name '*.dump' -mtime +186 -delete
find "$DIR" -name '*.parcial' -mmin +60 -delete
