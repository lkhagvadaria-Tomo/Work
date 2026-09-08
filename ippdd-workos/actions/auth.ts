"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEV_COOKIE, DEV_PERSONAS, signDevSession } from "@/lib/auth/dev";
import { devAuthEnabled, env, supabaseConfigured } from "@/lib/env";
import { supabaseServer } from "@/lib/auth/supabase";

/** Dev impersonation login — hard-gated (D-004). */
export async function devLogin(formData: FormData): Promise<void> {
  if (!devAuthEnabled()) redirect("/login");
  const key = formData.get("persona") as string;
  const persona = DEV_PERSONAS.find((p) => p.key === key);
  if (!persona) redirect("/login");
  const store = await cookies();
  store.set(DEV_COOKIE, signDevSession(persona.authUid), {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // dev only — this cookie never exists in production
    path: "/",
    maxAge: 12 * 3600,
  });
  redirect("/dashboard");
}

/** Google sign-in via Supabase Auth (production path). */
export async function googleLogin(): Promise<void> {
  if (!supabaseConfigured()) {
    redirect("/login?m=" + encodeURIComponent("Supabase Auth тохируулагдаагүй байна (.env)"));
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase!.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback`,
      queryParams: {
        hd: env().GOOGLE_WORKSPACE_DOMAIN, // Workspace domain hint (verified server-side too)
        access_type: "online",
        prompt: "select_account",
      },
    },
  });
  if (error || !data.url) {
    redirect("/login?m=" + encodeURIComponent("Google нэвтрэлт эхлүүлж чадсангүй"));
  }
  redirect(data.url);
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(DEV_COOKIE);
  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase!.auth.signOut();
  }
  redirect("/login");
}
