# Deploy en un VPS Ubuntu — paso a paso

Resultado: el sistema en `https://gestion.tudominio.com.ar`, con HTTPS, firewall, reinicio automático, logs con rotación y **backup diario** de la base.

```
Internet ──443──▶ Nginx (HTTPS, Let's Encrypt) ──▶ 127.0.0.1:3000 app (Docker)
                                                        │ red interna de Docker
                                                        ├──▶ db (PostgreSQL 17, sin puerto público)
                                                        └──▶ backup (pg_dump diario → ./backups)
```

**Requisitos:** un VPS con Ubuntu 24.04 (1 vCPU / 1–2 GB de RAM alcanzan), un dominio o subdominio apuntando a la IP del VPS (registro DNS tipo A), y el código en un repositorio Git (GitHub/GitLab privado).

---

## 1. Primer acceso y usuario de trabajo

```bash
ssh root@IP_DEL_VPS
adduser deploy                      # elegí una contraseña fuerte
usermod -aG sudo deploy
# Copiá tu clave SSH al nuevo usuario (desde TU computadora):
#   ssh-copy-id deploy@IP_DEL_VPS
```

Desde ahora entrá como `deploy`. Opcional pero recomendado: deshabilitá el login de root y por contraseña en `/etc/ssh/sshd_config` (`PermitRootLogin no`, `PasswordAuthentication no`) y `sudo systemctl restart ssh`.

## 2. Sistema al día, zona horaria y actualizaciones automáticas

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Argentina/Cordoba
sudo apt install -y unattended-upgrades fail2ban git curl
sudo dpkg-reconfigure -plow unattended-upgrades     # elegí "Sí"
```

## 3. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'      # 80 y 443 (se crea al instalar nginx; si falla, correlo después del paso 5)
sudo ufw enable
sudo ufw status
```

> Docker publica la app solo en `127.0.0.1:3000` y la base no publica ningún puerto, así que nada de eso queda expuesto aunque Docker manipule iptables.

## 4. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
exit    # salí y volvé a entrar para que tome el grupo
docker compose version
```

## 5. Nginx

```bash
sudo apt install -y nginx
sudo ufw allow 'Nginx Full'
```

## 6. Código y configuración

```bash
sudo mkdir -p /opt/pescaderia && sudo chown deploy:deploy /opt/pescaderia
git clone git@github.com:TU_USUARIO/pescaderia.git /opt/pescaderia
cd /opt/pescaderia
cp .env.produccion.example .env
chmod 600 .env
nano .env
```

Completá en `.env`:

| Variable | Cómo generarla |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 24 \| tr -d '/+='` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASSWORD` / `ADMIN_PIN` | Contraseña y PIN del primer usuario dueño (cambiarlos después desde "Mi cuenta") |

## 7. Levantar el sistema

```bash
chmod +x scripts/*.sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # los 3 servicios "running" / app "healthy"
curl http://127.0.0.1:3000/api/salud                # {"ok":true,...}
```

Al arrancar, la app crea las tablas (migraciones), los datos base (categorías, Caja 1, rubros de gasto) y el usuario dueño.

## 8. Nginx + HTTPS

```bash
sudo cp deploy/pescaderia-proxy.conf /etc/nginx/snippets/
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pescaderia
sudo nano /etc/nginx/sites-available/pescaderia     # cambiá server_name por tu dominio
sudo ln -s /etc/nginx/sites-available/pescaderia /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d gestion.tudominio.com.ar --redirect -m tu@email.com --agree-tos
```

Certbot configura HTTPS, redirige HTTP→HTTPS y **renueva solo** (timer de systemd: `systemctl list-timers | grep certbot`).

Entrá a `https://gestion.tudominio.com.ar` con el usuario dueño.

---

## Backups

- Corren **todos los días a las 03:30** (configurable con `HORA_BACKUP` en `.env`), en `/opt/pescaderia/backups/`:
  - `diarios/` → últimos 7 días
  - `semanales/` → domingos, últimas 4 semanas
  - `mensuales/` → día 1, últimos 6 meses
- Cada backup se verifica (`pg_restore --list`) antes de darse por bueno.
- Backup manual: `docker compose -f docker-compose.prod.yml exec backup sh /usr/local/bin/backup.sh`
- Ver que estén funcionando: `ls -lh backups/diarios/` y `docker compose -f docker-compose.prod.yml logs backup`

**Copia fuera del servidor (muy recomendado):** si el VPS se pierde, se pierden los backups locales. Opción simple con [rclone](https://rclone.org) a Google Drive / S3 / Backblaze:

```bash
sudo apt install -y rclone && rclone config        # configurá un remoto, ej. "drive"
crontab -e
# Agregar (todos los días 04:15):
15 4 * * * rclone sync /opt/pescaderia/backups drive:pescaderia-backups --quiet
```

### Restaurar un backup

```bash
cd /opt/pescaderia
./scripts/restaurar.sh backups/diarios/pescaderia_2026-10-13_0330.dump
```

El script hace un backup del estado actual antes, detiene la app, restaura y la vuelve a levantar. **Probá una restauración al menos una vez** (por ejemplo en un VPS de prueba): un backup que nunca se restauró no es un backup confiable.

---

## Actualizar el sistema (deploy de una versión nueva)

```bash
cd /opt/pescaderia
./scripts/deploy.sh
```

Hace backup → `git pull` → reconstruye → reinicia → verifica `/api/salud`. Si falla, muestra los logs. Las migraciones nuevas se aplican solas al arrancar.

## Logs

```bash
docker compose -f docker-compose.prod.yml logs -f app        # en vivo
docker compose -f docker-compose.prod.yml logs --since 1h app
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

Los logs de Docker rotan solos (5 archivos de 10 MB por servicio). Los de Nginx los rota `logrotate` del sistema.

## Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| 502 Bad Gateway | La app no está corriendo: `docker compose -f docker-compose.prod.yml ps` y `logs app` |
| "Configuración inválida" en los logs | Falta algo en `.env` (`SESSION_SECRET` de al menos 16 caracteres, `POSTGRES_PASSWORD`) |
| No mantiene la sesión | Entrar por **https** (la cookie es `Secure`); revisar que Nginx mande `X-Forwarded-Proto` |
| Hora corrida en reportes | `timedatectl` del servidor y `TZ` en `.env` |
| Disco lleno | `df -h`, `docker system df`, `du -sh backups/*` |
