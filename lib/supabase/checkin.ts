import { getSupabase } from "./client";

export interface CheckinResult {
  streak: number;
  xp_awarded: number;
  already_claimed: boolean;
}

export interface CheckinDay {
  checkin_date: string;
  streak: number;
}

/** Claim today's check-in. Idempotent — safe to call twice. */
export async function claimCheckin(): Promise<CheckinResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { data, error } = await sb.rpc("cu_claim_checkin");
  if (error) throw error;
  const row = (data as CheckinResult[] | null)?.[0];
  if (!row) throw new Error("no_result");
  return row;
}

/** Last 7 check-in days for the calendar view (direct read of the
 *  self-RLS `cu_checkins` table — there is no history RPC). */
export async function fetchCheckinHistory(): Promise<CheckinDay[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("cu_checkins")
    .select("checkin_date, streak")
    .order("checkin_date", { ascending: false })
    .limit(7);
  if (error || !data) return [];
  return data as CheckinDay[];
}
