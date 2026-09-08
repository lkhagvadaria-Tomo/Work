import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, supabaseConfigured } from "@/lib/env";
import { withService } from "@/lib/db";

/**
 * Supabase Auth glue — used only for the Google Workspace sign-in flow.
 * All data access goes through lib/db (D-002); this module never queries data.
 */
export async function supabaseServer() {
  if (!supabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    env().NEXT_PUBLIC_SUPABASE_URL!,
    env().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — proxy refresh handles it
          }
        },
      },
    },
  );
}

/** Validated Supabase user for the current request, or null. */
export async function supabaseAuthUser(): Promise<{
  id: string;
  email: string;
  hostedDomain: string | null;
} | null> {
  const supabase = await supabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: data.user.id,
    email: data.user.email,
    hostedDomain: typeof meta.hd === "string" ? meta.hd : null,
  };
}

/**
 * First-login linking (§10): only a pre-provisioned active employee whose
 * email matches may enter; the Workspace domain is verified server-side.
 * Returns the employee id or null (→ unauthorized screen).
 */
export async function linkEmployee(authUid: string, email: string): Promise<string | null> {
  const domain = env().GOOGLE_WORKSPACE_DOMAIN.toLowerCase();
  if (domain && !email.toLowerCase().endsWith(`@${domain}`)) return null;
  return withService(async (tx) => {
    const { rows } = await tx.query<{ link_employee: string | null }>(
      "select app.link_employee($1, $2) as link_employee",
      [authUid, email],
    );
    const employeeId = rows[0]?.link_employee ?? null;
    if (employeeId) {
      await tx.query(
        `insert into audit_logs (actor_id, entity_type, entity_id, action, new_values)
         values ($1, 'employee', $1, 'AUTH_LINK', $2)`,
        [employeeId, JSON.stringify({ email })],
      );
    }
    return employeeId;
  });
}
