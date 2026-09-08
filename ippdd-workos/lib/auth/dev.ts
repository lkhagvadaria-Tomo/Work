import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { devAuthEnabled, env } from "@/lib/env";

/**
 * Development impersonation (docs/DECISIONS.md D-004).
 *
 * Available ONLY when NODE_ENV !== 'production' AND DEV_AUTH=1. Every entry
 * point re-checks `devAuthEnabled()`; nothing here is reachable in production.
 * Personas map to the seeded development employees (supabase/seed.sql).
 */

export const DEV_COOKIE = "workos_dev_session";

export const DEV_PERSONAS = [
  { key: "LA_EMPLOYEE", authUid: "00000000-0000-4000-8000-000000000002", label: "А.Лхагвадарь — Ажилтан (пилот)" },
  { key: "REVIEWER_USER", authUid: "00000000-0000-4000-8000-000000000003", label: "Б.Онон — Хянагч" },
  { key: "DIRECTOR_USER", authUid: "00000000-0000-4000-8000-000000000001", label: "О.Мөнх-Эрдэнэ — Захирал" },
  { key: "ADMIN_USER", authUid: "00000000-0000-4000-8000-000000000004", label: "WorkOS Admin (dev)" },
] as const;

export type DevPersonaKey = (typeof DEV_PERSONAS)[number]["key"];

function hmac(payload: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(payload).digest("base64url");
}

export function signDevSession(authUid: string): string {
  if (!devAuthEnabled()) throw new Error("dev auth is disabled");
  const payload = Buffer.from(
    JSON.stringify({ sub: authUid, exp: Date.now() + 12 * 3600_000 }),
  ).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function verifyDevSession(cookie: string | undefined): string | null {
  if (!devAuthEnabled() || !cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub: string;
      exp: number;
    };
    if (typeof data.sub !== "string" || Date.now() > data.exp) return null;
    return data.sub;
  } catch {
    return null;
  }
}
