"use client";

import { STR, type Lang } from "@/lib/jieqi/i18n";

interface Props {
  lang: Lang;
  title: string;
  text: string;
  onDismiss: () => void;
}

/**
 * Signup nudge shown at emotional peaks (win, puzzle solved).
 * Session-scoped: parent controls visibility, dismissed = hidden until reload.
 */
export function SignupNudge({ lang, title, text, onDismiss }: Props) {
  const s = STR[lang];
  return (
    <div className="cu-signup-nudge" role="dialog" aria-label={s.nudgeSignup}>
      <div className="cu-signup-nudge-text">
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <div className="cu-signup-nudge-actions">
        <button
          type="button"
          className="cu-btn cu-btn-primary"
          onClick={() => {
            onDismiss();
            window.dispatchEvent(new CustomEvent("xq:open-auth"));
          }}
        >
          🔑 {s.nudgeSignup}
        </button>
        <button type="button" className="cu-btn" onClick={onDismiss}>
          {s.nudgeLater}
        </button>
      </div>
    </div>
  );
}
