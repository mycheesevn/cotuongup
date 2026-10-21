// Server-side plumbing for the /api/rooms routes: caller identity and
// the service-role client. Identity accepts BOTH family transports:
//   1. `Authorization: Bearer <supabase access token>` — the pattern every
//      existing API route uses (app/api/push/_auth.ts, lib/live/client).
//   2. The @supabase/ssr session cookie (shared `.synerworlds.com`
//      cookie) — what the task contract describes for route handlers.
// Either one proving the same user is fine; neither → 401 at the route.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Service-role client (bypasses RLS — the only client that may touch
 *  `cu_match_secrets`). Mirrors lib/push/server.ts `serviceClient()`. */
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("not_configured");
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the calling user's id, or null when unauthenticated. */
export async function callerUserId(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  // 1) Bearer token (explicit, used by all family API clients).
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token) {
    const sb = createClient(url, anon);
    const { data, error } = await sb.auth.getUser(token);
    if (!error && data.user) return data.user.id;
    return null;
  }

  // 2) SSR session cookie.
  try {
    const cookieStore = await cookies();
    const sb = createServerClient(url, anon, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          /* read-only in route handlers */
        },
      },
    });
    const { data, error } = await sb.auth.getUser();
    if (!error && data.user) return data.user.id;
  } catch {
    /* cookies unavailable — fall through to null */
  }
  return null;
}
