import { z } from "zod";

/**
 * Environment validation (server-side). Fails fast with a readable message
 * instead of failing deep inside a request.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required (local Postgres or Supabase connection string)"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional().or(z.literal("")),
  SUPABASE_SECRET_KEY: z.string().optional().or(z.literal("")),
  GOOGLE_WORKSPACE_DOMAIN: z.string().default("netgroup.mn"),
  GOOGLE_CLIENT_ID: z.string().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal("")),
  AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  AI_API_KEY: z.string().optional().or(z.literal("")),
  AI_MODEL: z.string().optional().or(z.literal("")),
  DEV_AUTH: z.string().optional(),
  SESSION_SECRET: z.string().default("dev-only-change-me"),
});

export type Env = z.infer<typeof serverSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Supabase Auth is configured (production sign-in path available). */
export function supabaseConfigured(): boolean {
  const e = env();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/** Dev impersonation is allowed ONLY outside production AND with DEV_AUTH=1. */
export function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && env().DEV_AUTH === "1";
}
