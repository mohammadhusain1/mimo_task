import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/smart_print?schema=public'),
  JWT_SECRET: z.string().min(16).default('super_secret_jwt_key_for_smart_print_system_2026_min_32_chars'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  FILE_STORAGE_ALLOWLIST: z.string().default('example.com,storage.googleapis.com,s3.amazonaws.com,cdn.smartprint.local'),
  PAGE_COUNT_DEFAULT: z.coerce.number().default(1),
  ADMIN_EMAIL: z.string().email().default('admin@smartprint.com'),
  ADMIN_PASSWORD: z.string().default('Admin@123'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = parsedEnv.data;
