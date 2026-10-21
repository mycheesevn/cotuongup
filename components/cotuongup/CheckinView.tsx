"use client";

import { useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  claimCheckin,
  fetchCheckinHistory,
  type CheckinDay,
} from "@/lib/supabase/checkin";

/** Daily check-in: claim XP for consecutive days, 7-day calendar. */
export function CheckinView({
  lang,
  onRequireLogin,
}: {
  lang: Lang;
  onRequireLogin: () => void;
}) {
  const s = STR[lang];
  const { user } = useAuth();
  const [days, setDays] = useState<CheckinDay[] | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = async () => {
    setDays(await fetchCheckinHistory());
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <div className="cu-room-home">
            <div className="cu-guest-banner">
              📅 {s.checkinGuest}
              <button
                type="button"
                className="cu-btn small primary"
                onClick={onRequireLogin}
              >
                🔑 {s.guestJoinTeaser}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const claimedToday = (() => {
    if (!days) return false;
    const today = new Date();
    // Use Ho Chi Minh date to match the server.
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(today);
    return days.some((d) => d.checkin_date === fmt);
  })();

  const onClaim = async () => {
    if (claiming || claimedToday) return;
    setClaiming(true);
    try {
      const r = await claimCheckin();
      setResult(
        r.already_claimed
          ? s.checkinDone
          : s.checkinClaimed(r.streak, r.xp_awarded)
      );
      await load();
    } catch {
      setResult(s.checkinError);
    } finally {
      setClaiming(false);
    }
  };

  // Last 7 calendar days, oldest first.
  const week: { date: string; label: string; done: boolean }[] = [];
  {
    const doneSet = new Set((days ?? []).map((d) => d.checkin_date));
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
      const label = new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
        timeZone: "Asia/Ho_Chi_Minh",
        weekday: "short",
      }).format(d);
      week.push({ date: iso, label, done: doneSet.has(iso) });
    }
  }

  const streak = days && days.length > 0 ? days[0].streak : 0;

  return (
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div className="cu-room-home">
          <h3>📅 {s.checkinTitle}</h3>
          {streak > 0 && (
            <p className="cu-empty-note">🔥 {s.checkinStreak(streak)}</p>
          )}
          <div className="cu-checkin-week">
            {week.map((d) => (
              <div
                key={d.date}
                className={`cu-checkin-day${d.done ? " done" : ""}`}
              >
                <span className="cu-checkin-dow">{d.label}</span>
                <span className="cu-checkin-mark">{d.done ? "✅" : "·"}</span>
              </div>
            ))}
          </div>
          {result && <p className="cu-empty-note">{result}</p>}
          <button
            type="button"
            className="cu-btn primary"
            disabled={claiming || claimedToday || days === null}
            onClick={onClaim}
          >
            {claimedToday ? `✅ ${s.checkinDone}` : `📅 ${s.checkinClaim}`}
          </button>
          <p className="cu-empty-note">{s.checkinHint}</p>
        </div>
      </div>
    </main>
  );
}
