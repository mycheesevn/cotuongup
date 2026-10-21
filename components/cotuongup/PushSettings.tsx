"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  currentSubscription,
  fetchPushStatus,
  pushCapability,
  pushPermission,
  sendTestPush,
  subscribePush,
  unsubscribePush,
  type PushStatus,
} from "@/lib/push/client";
import { STR, type Lang } from "@/lib/jieqi/i18n";

type PushState =
  | { kind: "unsupported"; reason: string }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" }
  | { kind: "working" };

/** Drawer section: push notification opt-in with capability-aware messaging. */
export function PushSettings({ lang }: { lang: Lang }) {
  const s = STR[lang];
  const [state, setState] = useState<PushState>({ kind: "working" });
  const [tested, setTested] = useState(false);
  const [diag, setDiag] = useState<PushStatus | null>(null);
  const [showDiag, setShowDiag] = useState(false);

  const refresh = useCallback(async () => {
    const cap = pushCapability();
    if (!cap.ok) {
      setState({
        kind: "unsupported",
        reason:
          cap.reason === "ios-needs-install"
            ? s.pushIosInstall
            : s.pushUnsupported,
      });
      return;
    }
    if (pushPermission() === "denied") {
      setState({ kind: "denied" });
      return;
    }
    // currentSubscription() awaits navigator.serviceWorker.ready, which can
    // hang indefinitely if the SW registration is broken. Timeout after 5s
    // and treat as "off" so the UI never sticks on Loading.
    try {
      const sub = await Promise.race([
        currentSubscription(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      setState({ kind: sub ? "on" : "off" });
    } catch {
      setState({ kind: "off" });
    }
  }, [s]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const accessToken = async (): Promise<string | null> => {
    const sb = getSupabase();
    const { data } = (await sb?.auth.getSession()) || { data: null };
    return data?.session?.access_token || null;
  };

  const enable = async () => {
    setState({ kind: "working" });
    try {
      const token = await accessToken();
      if (!token) throw new Error("not_authenticated");
      await subscribePush(token);
      setState({ kind: "on" });
    } catch (e) {
      if ((e as Error).message === "denied") setState({ kind: "denied" });
      else refresh();
    }
  };

  const disable = async () => {
    setState({ kind: "working" });
    try {
      const token = await accessToken();
      if (token) await unsubscribePush(token);
    } finally {
      setState({ kind: "off" });
    }
  };

  const test = async () => {
    const token = await accessToken();
    if (!token) return;
    const ok = await sendTestPush(token);
    setTested(ok);
    setTimeout(() => setTested(false), 3000);
  };

  const checkDiag = async () => {
    const token = await accessToken();
    if (!token) return;
    setDiag(await fetchPushStatus(token));
    setShowDiag(true);
  };

  return (
    <section>
      <h2>🔔 {s.pushTitle}</h2>
      {state.kind === "working" && <p className="cu-push-hint">{s.loading}</p>}
      {state.kind === "unsupported" && (
        <p className="cu-push-hint">{state.reason}</p>
      )}
      {state.kind === "denied" && <p className="cu-push-hint">{s.pushDenied}</p>}
      {(state.kind === "on" || state.kind === "off") && (
        <label className="cu-check-toggle">
          <input
            type="checkbox"
            checked={state.kind === "on"}
            onChange={(e) => (e.target.checked ? enable() : disable())}
          />
          <span>{state.kind === "on" ? s.pushOff : s.pushOn}</span>
        </label>
      )}
      {state.kind === "on" && (
        <>
          <button type="button" className="cu-btn" onClick={test}>
            {tested ? "✓" : `📨 ${s.pushTest}`}
          </button>
          <button
            type="button"
            className="cu-btn small"
            onClick={checkDiag}
            style={{ marginTop: 6 }}
          >
            🔍 {lang === "vi" ? "Kiểm tra lỗi" : "Diagnose"}
          </button>
        </>
      )}
      {showDiag && diag && (
        <div className="cu-push-hint" style={{ marginTop: 6 }}>
          <div>
            VAPID: {diag.vapidConfigured ? "✓" : "✗"}{" "}
            {lang === "vi" ? "đã cấu hình" : "configured"}
          </div>
          <div>
            Keys: {diag.keysMatch ? "✓" : "✗"}{" "}
            {lang === "vi" ? "khớp nhau" : "match"}
          </div>
          <div>
            {lang === "vi" ? "Đăng ký" : "Subscriptions"}:{" "}
            {diag.subscriptionCount}
          </div>
          {!diag.vapidConfigured && (
            <div>
              {lang === "vi"
                ? "Thiếu VAPID key trên server."
                : "Missing VAPID keys on server."}
            </div>
          )}
          {diag.vapidConfigured && !diag.keysMatch && (
            <div>
              {lang === "vi"
                ? "Public/private key không khớp — kiểm tra lại env vars."
                : "Public/private keys don't match — check env vars."}
            </div>
          )}
          {diag.subscriptionCount === 0 && (
            <div>
              {lang === "vi"
                ? "Chưa có đăng ký nào — tắt rồi bật lại thông báo."
                : "No subscriptions — toggle push off and on."}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const NUDGE_KEY = "cu-push-nudge-seen";

/** One-time gentle nudge to enable push (shown after login, dismissible). */
export function PushNudge({ lang }: { lang: Lang }) {
  const s = STR[lang];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(NUDGE_KEY)) return;
    } catch {
      return;
    }
    const cap = pushCapability();
    if (!cap.ok) return;
    if (pushPermission() !== "default") return;
    currentSubscription().then((sub) => {
      if (!sub) {
        // Wait a beat so it doesn't fight the login toast.
        setTimeout(() => setVisible(true), 4000);
      }
    });
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(NUDGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const enable = async () => {
    try {
      const sb = getSupabase();
      const { data } = (await sb?.auth.getSession()) || { data: null };
      const token = data?.session?.access_token;
      if (token) await subscribePush(token);
    } catch {
      /* user can enable later from the drawer */
    }
    dismiss();
  };

  if (!visible) return null;
  return (
    <div className="cu-push-nudge" role="dialog" aria-live="polite">
      <div className="cu-push-nudge-title">🔔 {s.pushNudgeTitle}</div>
      <div className="cu-push-nudge-text">{s.pushNudgeText}</div>
      <div className="cu-push-nudge-row">
        <button type="button" className="cu-btn" onClick={enable}>
          {s.pushNudgeOn}
        </button>
        <button type="button" className="cu-btn" onClick={dismiss}>
          {s.pushNudgeLater}
        </button>
      </div>
    </div>
  );
}
