import { z } from 'zod';
import { notify } from '@/utils/toast';

const EnvSchema = z.object({
  // Required
  // Allow relative URLs (like "/") for development (uses Vite proxy) or full URLs for production
  VITE_API_BASE_URL: z.string().min(1, { message: 'VITE_API_BASE_URL is required' })
    .refine(
      (val) => {
        // Allow relative paths (starting with /) or valid URLs
        return val.startsWith('/') || z.string().url().safeParse(val).success;
      },
      { message: 'VITE_API_BASE_URL must be a valid URL or relative path (starting with /)' }
    ),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1, { message: 'VITE_CLERK_PUBLISHABLE_KEY is required' }),
  // Optional
  VITE_ERROR_REPORT_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  VITE_DEV_PORT: z.string().optional(),
  VITE_PREVIEW_PORT: z.string().optional(),
  // Legacy support (backward compatibility)
  VITE_GATEWAY_URL: z.string().url().optional(),
});

type Env = z.infer<typeof EnvSchema>;

let cached: Readonly<Env> | null = null;

export function getEnv(): Readonly<Env> {
  if (cached) return cached;

  // Extract only VITE_ vars from import.meta.env
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(import.meta.env)) {
    if (k.startsWith('VITE_')) raw[k] = (import.meta.env as any)[k];
  }

  // Support backward compatibility: if VITE_GATEWAY_URL exists but VITE_API_BASE_URL doesn't, use it
  if (!raw.VITE_API_BASE_URL && raw.VITE_GATEWAY_URL) {
    raw.VITE_API_BASE_URL = raw.VITE_GATEWAY_URL;
  }

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const messages = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    const isDev = import.meta.env.DEV;

    if (isDev) notify.error('Missing/invalid environment', messages);
    // Throw to fail-fast; caught by ErrorBoundary + global handlers
    throw new Error(`Env validation failed:\n${messages}`);
  }

  // Normalize optional empties to undefined
  const val = parsed.data;
  cached = Object.freeze(val);
  return cached;
}

