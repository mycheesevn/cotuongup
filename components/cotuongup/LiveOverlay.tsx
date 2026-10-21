"use client";

import { useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";

export type LivePhase = "intro" | "live" | "outro";

interface Props {
  lang: Lang;
  phase: LivePhase;
  /** Epoch ms when egress started (drives the on-air clock). */
  startedAt: number;
  onStop: () => void;
}

function fmtElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const h = Math.floor(m / 60);
  const mm = h > 0 ? String(m % 60).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * Stream-mode branding shown INSIDE the captured tab while a game is live:
 * a 2 s intro card, then a persistent brand bar over the app header (the
 * site address big and always visible, TV-channel style — it overlays the
 * header only, never the board), and a 2 s outro card when stopping.
 * Mirrors the family match-video spec: site CTA card first and last.
 */
export function LiveOverlay({ lang, phase, startedAt, onStop }: Props) {
  const s = STR[lang];
  const [elapsed, setElapsed] = useState(0);
  // Brand bar always shows the canonical host (family share-URL rule) —
  // never the origin the stream happens to be captured from.
  const host = "cotuongup.synerworlds.com";

  useEffect(() => {
    if (phase !== "live") return;
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [phase, startedAt]);

  if (phase === "intro" || phase === "outro") {
    return (
      <div className="cu-live-card" aria-hidden={phase === "intro"}>
        <div className="cu-live-card-pill">
          <span className="cu-live-dot" /> {s.liveOnAir}
        </div>
        {phase === "outro" && (
          <div className="cu-live-card-thanks">{s.liveOutroTitle}</div>
        )}
        <div className="cu-live-card-domain">{host.toUpperCase()}</div>
        <div className="cu-live-card-tagline">{s.liveTagline}</div>
        <div className="cu-live-card-brand">SynerWorlds</div>
      </div>
    );
  }

  return (
    <div className="cu-live-bar">
      <div className="cu-live-bar-brand">
        <span className="cu-live-bar-domain">{host.toUpperCase()}</span>
        <span className="cu-live-bar-tagline">{s.liveTagline}</span>
      </div>
      <div className="cu-live-bar-controls">
        <span className="cu-live-bar-onair">
          <span className="cu-live-dot" /> LIVE {fmtElapsed(elapsed)}
        </span>
        <button type="button" className="cu-btn cu-live-stop" onClick={onStop}>
          {s.liveStop}
        </button>
      </div>
    </div>
  );
}
