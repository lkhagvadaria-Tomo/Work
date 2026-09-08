import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge route guard (Next 16 proxy). This is a UX-level redirect only — real
 * authorization lives server-side (requireSession) and in the database (RLS).
 * It never trusts cookie contents, only their presence.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/unauthorized", "/error"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  const hasDevSession = request.cookies.has("workos_dev_session");
  const hasSupabaseSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
  if (!hasDevSession && !hasSupabaseSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)).*)"],
};
