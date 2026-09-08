import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer, linkEmployee } from "@/lib/auth/supabase";
import { env, supabaseConfigured } from "@/lib/env";

/**
 * OAuth callback: exchange the code, verify Workspace domain, link the auth
 * user to a pre-provisioned employee. Unknown accounts are signed out and sent
 * to the unauthorized screen — no self-registration (§10).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const app = env().NEXT_PUBLIC_APP_URL;
  if (!supabaseConfigured() || !code) {
    return NextResponse.redirect(`${app}/login?m=${encodeURIComponent("Нэвтрэлт амжилтгүй")}`);
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase!.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) {
    return NextResponse.redirect(`${app}/login?m=${encodeURIComponent("Нэвтрэлт амжилтгүй")}`);
  }
  const employeeId = await linkEmployee(data.user.id, data.user.email);
  if (!employeeId) {
    await supabase!.auth.signOut();
    return NextResponse.redirect(`${app}/unauthorized`);
  }
  return NextResponse.redirect(`${app}/dashboard`);
}
