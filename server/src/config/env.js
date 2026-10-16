import { z } from 'zod';

process.env.TZ ||= 'America/Argentina/Cordoba';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1, 'Falta DATABASE_URL'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET tiene que tener al menos 16 caracteres'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Acepta TRUE/True/true: algunos paneles (ej. Coolify) guardan el valor en mayúsculas
  COOKIE_SECURE: z
    .preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(['true', 'false']).default('false'))
    .transform((v) => v === 'true'),
  LOG_LEVEL: z.string().default('info'),
  ADMIN_USUARIO: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_PIN: z.string().optional(),
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  console.error('Configuración inválida (revisá el archivo .env):');
  for (const issue of resultado.error.issues) console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

if (resultado.data.NODE_ENV === 'production' && resultado.data.SESSION_SECRET.startsWith('cambiame')) {
  console.error('SESSION_SECRET sigue con el valor de ejemplo. Generá uno aleatorio antes de producción.');
  process.exit(1);
}

export const env = resultado.data;
