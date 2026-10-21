import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Shared session cookie: on the family domains the Supabase session
 * cookie is scoped to .synerworlds.com, so signing in on ANY family
 * site (hub or any game) signs the player in on ALL of them — no
 * hand-off needed for ordinary navigation. Elsewhere (localhost dev,
 * legacy *.vercel.app) the cookie stays host-only, exactly as before.
 */
function familyCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.hostname.endsWith("synerworlds.com")
    ? ".synerworlds.com"
    : undefined;
}

/** Browser Supabase client. Null when env vars are not configured. */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createBrowserClient(url, key, {
      cookieOptions: { domain: familyCookieDomain() },
    });
  }
  return client;
}

/** Whether Supabase is configured (auth + cloud saves available). */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
