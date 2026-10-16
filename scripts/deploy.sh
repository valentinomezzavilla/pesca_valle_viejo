#!/usr/bin/env bash
# Deploy / actualización en el VPS. Correr en la carpeta del proyecto:
#   ./scripts/deploy.sh
# Hace: backup previo → baja el código nuevo → reconstruye → reinicia → verifica salud.
# Las migraciones de base corren solas al arrancar la app.
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
cd "$(dirname "$0")/.."

[[ -f .env ]] || { echo "Falta el archivo .env (copiá .env.produccion.example)"; exit 1; }

if $COMPOSE ps --status running --services 2>/dev/null | grep -q '^backup$'; then
  echo "==> Backup antes de actualizar"
  $COMPOSE exec -T backup sh /usr/local/bin/backup.sh
fi

echo "==> Bajando la última versión"
git pull --ff-only

echo "==> Construyendo y levantando"
$COMPOSE up -d --build --remove-orphans

echo "==> Esperando que la app responda"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/salud > /dev/null; then
    echo "==> OK: la app está funcionando"
    docker image prune -f > /dev/null
    exit 0
  fi
  sleep 2
done

echo "ERROR: la app no respondió. Últimos logs:"
$COMPOSE logs --tail=80 app
exit 1
