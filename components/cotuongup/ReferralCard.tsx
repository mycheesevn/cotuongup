"use client";

import { useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import { fetchMyReferralCode } from "@/lib/supabase/referral";
import { copyText, siteOrigin } from "@/lib/jieqi/share";

/** "Invite friends" — referral link with +20 XP for both sides. */
export function ReferralCard({ lang }: { lang: Lang }) {
  const s = STR[lang];
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchMyReferralCode().then(setCode).catch(() => {});
  }, []);

  if (!code) return null;
  const link = `${siteOrigin()}/?ref=${code}`;

  const copy = async () => {
    const ok = await copyText(link);
    setMsg(ok ? s.referralCopied : link);
    window.setTimeout(() => setMsg(null), 3000);
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: s.referralTitle,
          text: `${s.referralDesc}\n${link}`,
          url: link,
        });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    copy();
  };

  return (
    <div className="cu-referral">
      <h3>{s.referralTitle}</h3>
      <p className="cu-muted">{s.referralDesc}</p>
      <div className="cu-referral-row">
        <code className="cu-referral-code">{code}</code>
        <button type="button" className="cu-btn small" onClick={copy}>
          📋 {s.referralCopy}
        </button>
        <button type="button" className="cu-btn small" onClick={share}>
          📤 {s.referralShare}
        </button>
      </div>
      {msg && <p className="cu-ok">{msg}</p>}
    </div>
  );
}
