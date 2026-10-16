#!/usr/bin/env bash
# Restaura un backup en la base de producción. REEMPLAZA los datos actuales.
# Uso (en el servidor, dentro de la carpeta del proyecto):
#   ./scripts/restaurar.sh backups/diarios/pescaderia_2026-10-13_0330.dump
set -euo pipefail

ARCHIVO="${1:-}"
COMPOSE="docker compose -f docker-compose.prod.yml"

if [[ -z "$ARCHIVO" || ! -f "$ARCHIVO" ]]; then
  echo "Uso: $0 <archivo.dump>"
  echo "Backups disponibles:"
  ls -lh backups/*/ 2>/dev/null || echo "  (no hay)"
  exit 1
fi

echo "ATENCIÓN: se van a REEMPLAZAR todos los datos actuales por los de:"
echo "  $ARCHIVO"
read -r -p "Escribí RESTAURAR para continuar: " OK
[[ "$OK" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }

echo "1/4 Backup de seguridad del estado actual..."
$COMPOSE exec -T backup sh /usr/local/bin/backup.sh

echo "2/4 Deteniendo la app..."
$COMPOSE stop app

echo "3/4 Restaurando..."
NOMBRE=$(basename "$ARCHIVO")
docker cp "$ARCHIVO" "$($COMPOSE ps -q db)":/tmp/"$NOMBRE"
$COMPOSE exec -T db sh -c "pg_restore --clean --if-exists --no-owner --no-privileges -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" /tmp/$NOMBRE && rm /tmp/$NOMBRE"

echo "4/4 Levantando la app..."
$COMPOSE start app
echo "Listo. Verificá entrando al sistema."
