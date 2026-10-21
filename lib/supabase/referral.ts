import { getSupabase } from "./client";

const REF_KEY = "cu-ref";

/** Stash a referral code from a ?ref= link until signup. */
export function stashReferralCode(code: string): void {
  try {
    if (code && /^[A-Za-z0-9]{4,16}$/.test(code)) {
      localStorage.setItem(REF_KEY, code.toUpperCase());
    }
  } catch {
    /* ignore */
  }
}

export function takeReferralCode(): string | null {
  try {
    const c = localStorage.getItem(REF_KEY);
    localStorage.removeItem(REF_KEY);
    return c;
  } catch {
    return null;
  }
}

/** Attribute the current user to a referrer. Idempotent. */
export async function applyReferral(code: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc("apply_referral", { p_code: code });
  if (error) return false;
  return !!data;
}

/** Claim the +20 XP referral reward for both sides (after first game). */
export async function claimReferralReward(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { data, error } = await sb.rpc("claim_referral_reward");
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

/** The current user's own referral code + share link. */
export async function fetchMyReferralCode(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("profiles")
    .select("referral_code")
    .eq("id", user.id)
    .maybeSingle();
  return (data as { referral_code: string } | null)?.referral_code ?? null;
}
