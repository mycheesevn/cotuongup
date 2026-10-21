"use client";

import { useCallback, useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  QUEST_IDS,
  claimQuest,
  fetchQuestStatus,
  type QuestId,
  type QuestStatus,
} from "@/lib/supabase/quests";

const QUEST_META: { id: QuestId; icon: string; labelKey: "questFirstGame" | "questFirstPuzzle" | "questFirstRoom" }[] = [
  { id: "first_game", icon: "♟️", labelKey: "questFirstGame" },
  { id: "first_puzzle", icon: "🧩", labelKey: "questFirstPuzzle" },
  { id: "first_room", icon: "👥", labelKey: "questFirstRoom" },
];

/** Onboarding quests for new users: small tasks, instant XP. */
export function QuestCard({ lang }: { lang: Lang }) {
  const s = STR[lang];
  const { user } = useAuth();
  const [status, setStatus] = useState<QuestStatus | null>(null);
  const [claiming, setClaiming] = useState<QuestId | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setStatus(null);
      return;
    }
    try {
      setStatus(await fetchQuestStatus());
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Refresh when something relevant happens elsewhere (game/puzzle/room).
  useEffect(() => {
    const onRefresh = () => reload();
    window.addEventListener("xq:quest-refresh", onRefresh);
    return () => window.removeEventListener("xq:quest-refresh", onRefresh);
  }, [reload]);

  if (!user || !status) return null;
  if (QUEST_IDS.every((id) => status[id].claimed)) return null;

  const claim = async (id: QuestId) => {
    setClaiming(id);
    try {
      const xp = await claimQuest(id);
      if (xp > 0) {
        setToast(`🎉 ${s.roomXpEarned(xp)}`);
        window.dispatchEvent(new CustomEvent("xq:profile-refresh"));
        window.setTimeout(() => setToast(null), 3500);
      }
      await reload();
    } catch {
      await reload();
    } finally {
      setClaiming(null);
    }
  };

  return (
    <section className="cu-quest-card" aria-label={s.questTitle}>
      <h3>{s.questTitle}</h3>
      <ul>
        {QUEST_META.map((q) => {
          const st = status[q.id];
          return (
            <li key={q.id} className={st.done ? "cu-quest-done" : ""}>
              <span className="cu-quest-icon">{q.icon}</span>
              <span className="cu-quest-label">{s[q.labelKey]}</span>
              <span className="cu-quest-reward">{s.questReward}</span>
              {st.claimed ? (
                <span className="cu-quest-claimed">✓ {s.questClaimed}</span>
              ) : st.done ? (
                <button
                  type="button"
                  className="cu-btn small primary"
                  disabled={claiming === q.id}
                  onClick={() => claim(q.id)}
                >
                  {s.questClaim}
                </button>
              ) : (
                <span className="cu-quest-pending">○</span>
              )}
            </li>
          );
        })}
      </ul>
      {toast && <div className="cu-quest-toast">{toast}</div>}
    </section>
  );
}
