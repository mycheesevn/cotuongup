"use client";

import { STR, type Lang } from "@/lib/jieqi/i18n";
import { loadGuestStats } from "@/lib/guestStats";

interface Props {
  lang: Lang;
}

/** "Look what you'd keep" nudge for guests, with their real numbers. */
export function GuestTeaser({ lang }: Props) {
  const s = STR[lang];
  const stats = loadGuestStats();
  const parts: string[] = [];
  if (stats.games > 0) parts.push(s.guestTeaserGames(stats.games));
  if (stats.puzzles > 0) parts.push(s.guestTeaserPuzzles(stats.puzzles));

  return (
    <div className="cu-guest-teaser">
      {parts.length > 0 && (
        <p className="cu-guest-teaser-stats">📊 {parts.join(", ")}.</p>
      )}
      <p>{s.guestTeaserCta}</p>
      <button
        type="button"
        className="cu-btn primary"
        onClick={() => window.dispatchEvent(new CustomEvent("xq:open-auth"))}
      >
        🔑 {s.authLogin}
      </button>
    </div>
  );
}
