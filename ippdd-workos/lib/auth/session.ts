import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyDevSession, DEV_COOKIE } from "@/lib/auth/dev";
import { supabaseAuthUser } from "@/lib/auth/supabase";
import { devAuthEnabled, supabaseConfigured } from "@/lib/env";
import { queryAs } from "@/lib/db";
import type { Employee } from "@/types/db";

export interface Session {
  authUid: string;
  employee: Employee;
}

/**
 * Resolve the current session: gated dev impersonation first (never active in
 * production), then Supabase Auth (Google Workspace). A valid auth identity
 * without a provisioned active employee row yields null → unauthorized screen.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  let authUid: string | null = null;

  if (devAuthEnabled()) {
    const store = await cookies();
    authUid = verifyDevSession(store.get(DEV_COOKIE)?.value);
  }
  if (!authUid && supabaseConfigured()) {
    const user = await supabaseAuthUser();
    authUid = user?.id ?? null;
  }
  if (!authUid) return null;

  const rows = await queryAs<Employee>(
    authUid,
    `select id, auth_user_id, employee_code, email, full_name, department_id,
            position_title, manager_id, system_role, active
       from employees where auth_user_id = app.auth_uid() and active`,
  );
  if (rows.length === 0) return null;
  return { authUid, employee: rows[0] };
});

/** Session or redirect to /login. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
