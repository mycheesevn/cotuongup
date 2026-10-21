import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * SynerWorlds one-tap login hand-off (mint side).
 *
 * The hub lives on a different origin, so its browser session cannot
 * carry into a game directly. Instead the hub client sends the signed-in
 * user's own Supabase access token here; this route (which already holds
 * the service-role key for push notifications) validates the caller,
 * mints a ONE-TIME magic-link token for that same account, and returns
 * the target game URL with `?sso=<token_hash>` appended. The game
 * redeems it with supabase.auth.verifyOtp and strips the param.
 *
 * Security shape: a token can only ever log in its owner's own account,
 * targets are restricted to the family game origins, and the minted
 * token is single-use + short-lived. Any failure degrades to a plain
 * link (the player just signs in manually in the game).
 */

const HUB_ORIGINS = new Set([
  "https://synerworlds.com",
  "https://synerworlds-my-cheese-vn.vercel.app",
]);
const GAME_ORIGINS = new Set([
  "https://cotuong.synerworlds.com",
  "https://chess.synerworlds.com",
  "https://sudoku.synerworlds.com",
  "https://crosswords.synerworlds.com",
  "https://wordsearch.synerworlds.com",
  "https://cochieutuong.synerworlds.com",
  "https://conhao.synerworlds.com",
  "https://coganh.synerworlds.com",
  "https://oanquan.synerworlds.com",
  "https://cangua.synerworlds.com",
  "https://pacclone.vercel.app",
  "https://chess-my-cheese-vn.vercel.app",
  "https://chess-tau-liart.vercel.app",
  "https://cochieutuong-my-cheese-vn.vercel.app",
  "https://coganh-my-cheese-vn.vercel.app",
  "https://conhao-my-cheese-vn.vercel.app",
  "https://conhao.vercel.app",
  "https://oanquan-my-cheese-vn.vercel.app",
  "https://oanquan-delta.vercel.app",
  "https://cangua-my-cheese-vn.vercel.app",
  "https://cangua-pi.vercel.app",
  "https://sudoku-my-cheese-vn.vercel.app",
  "https://sudoku-neon-phi.vercel.app",
  "https://crosswords-red.vercel.app",
  "https://wordsearch-gamma.vercel.app",
]);

// Full-mesh SSO (2026-10-17): any family site may CALL the mint (the
// caller proves identity with its own Supabase access token, so a token
// can only ever mint a login for its own account) and any family site —
// the hub included — may be the TARGET of a minted login.
const FAMILY_ORIGINS = new Set([...HUB_ORIGINS, ...GAME_ORIGINS]);

function corsHeaders(origin: string | null): Record<string, string> {
  return origin && FAMILY_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : {};
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(req.headers.get("origin")),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    return json({ error: "not_configured" }, 500);
  }

  // 1) Who is calling? The hub forwards the user's own access token.
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return json({ error: "unauthorized" }, 401);
  const anonClient = createClient(url, anon);
  const { data: userData, error: userErr } =
    await anonClient.auth.getUser(token);
  if (userErr || !userData.user?.email) {
    return json({ error: "unauthorized" }, 401);
  }
  const email = userData.user.email;

  // 2) Where to? Only our own games may receive a minted login.
  const body = (await req.json().catch(() => null)) as {
    target_url?: string;
  } | null;
  let target: URL;
  try {
    target = new URL(body?.target_url ?? "");
  } catch {
    return json({ error: "bad_target" }, 400);
  }
  if (!FAMILY_ORIGINS.has(target.origin)) {
    return json({ error: "bad_target" }, 400);
  }

  // 3) Mint a one-time magic-link token for the caller's own account.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashed = link?.properties?.hashed_token;
  if (linkErr || !hashed) return json({ error: "mint_failed" }, 502);

  target.searchParams.set("sso", hashed);
  return json({ url: target.toString() });
}
