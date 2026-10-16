# 🐟 Pescadería — Sistema de gestión

Punto de venta, stock por lotes (FIFO), ingreso de mercadería, proveedores y caja para una pescadería.
Node.js + Express + PostgreSQL · React + Vite + Tailwind · Knex (migraciones).

> El ticket es un **comprobante interno no fiscal** ("Comprobante no válido como factura"). No hay integración con ARCA/AFIP.

## Arrancar en desarrollo (Windows/Mac/Linux, sin instalar Postgres)

Requisitos: Node.js 22.9 o superior.

```bash
npm install
cp .env.example .env          # en Windows: copy .env.example .env
npm run db:local              # Terminal 1: Postgres embebido (PGlite) en el puerto 54320, datos en .pgdata/
npm run db:demo               # Terminal 2: crea tablas + datos de ejemplo (una sola vez)
npm run dev                   # Terminal 2: API en :3000 + frontend en http://localhost:5173
```

Usuarios de demo: **admin / admin1234** (dueño, PIN **1234**) y **cajero / cajero1234**.

Con Docker en lugar de PGlite: `docker compose up -d` y en `.env` usar
`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/pescaderia` y `DB_POOL_MAX=10`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API con recarga automática + frontend Vite |
| `npm test` | Tests de la lógica crítica (ventas, stock FIFO, caja, permisos) contra PostgreSQL real |
| `npm run build` | Compila el frontend (`client/dist`, lo sirve Express) |
| `npm start` | Producción local: API + frontend compilado en :3000 |
| `npm run db:migrar` / `db:seed` / `db:demo` | Migraciones / datos base / datos de ejemplo |

Los tests levantan solos un PostgreSQL embebido. Para correrlos contra un Postgres propio:
`TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/test npm test` (servicio `db_test` del `docker-compose.yml`).

## Documentación

- [docs/DISENO.md](docs/DISENO.md) — modelo de datos, decisiones, estructura, permisos y endpoints
- [server/src/db/sql/001_esquema_inicial.sql](server/src/db/sql/001_esquema_inicial.sql) — esquema SQL completo
- [docs/DEPLOY.md](docs/DEPLOY.md) — deploy en VPS Ubuntu (Docker Compose, Nginx, HTTPS, firewall, backups)

## Estado

- ✅ Fase 0: base, autenticación (sesiones + bcrypt), roles, PIN del dueño, auditoría, errores centralizados
- ✅ Fase 1: productos y precios, proveedores, ingreso de mercadería con lotes, stock FIFO, POS completo, ticket interno, anulaciones, caja con arqueo
- ✅ Fase 4 (mínima): Docker Compose, Nginx, HTTPS, backups diarios con rotación, script de deploy y restauración
- ✅ Fase 2: mermas (con costo real perdido), ajustes de stock con PIN, inventario por conteo físico, alertas de stock y vencimientos, cuenta corriente de proveedores (pagos y notas de crédito)
- ✅ Fase 3: clientes y fiado (límite de crédito con PIN, cobros a la caja), panel de inicio para el dueño, 12 reportes con exportación a Excel y PDF
