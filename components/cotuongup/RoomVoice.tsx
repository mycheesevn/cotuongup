"use client";

import { STR, type Lang } from "@/lib/jieqi/i18n";
import { useRoomVoice, type VoiceMode } from "@/lib/voice/useRoomVoice";

interface Props {
  lang: Lang;
  roomId: string;
  myUserId: string;
  /** Player mode only; null in listener mode. */
  peerUserId: string | null;
  mode: VoiceMode;
}

/**
 * In-room voice chat (WebRTC, audio only, peer-to-peer).
 * Player mode: the two match players talk to each other (+ optional
 * consent toggle letting spectators listen).
 * Listener mode: signed-in room members spectate by ear (no microphone).
 */
export function RoomVoice({ lang, roomId, myUserId, peerUserId, mode }: Props) {
  const s = STR[lang];
  const {
    status,
    joined,
    muted,
    error,
    join,
    leave,
    toggleMute,
    listenersAllowed,
    setListenersAllowed,
    listenerCount,
  } = useRoomVoice({ roomId, myUserId, peerUserId, mode });

  const statusText =
    status === "connecting"
      ? s.voiceConnecting
      : status === "waiting"
        ? mode === "listener"
          ? s.voiceListenWaiting
          : s.voiceWaiting
        : status === "connected"
          ? mode === "listener"
            ? s.voiceListenConnected
            : s.voiceConnected
          : null;

  return (
    <div className="cu-room-comments" style={{ marginTop: 12 }}>
      <h3 className="cu-history-section-title">
        <span>🎙️</span>
        <span>{s.voiceTitle}</span>
      </h3>
      {!joined && (
        <button type="button" className="cu-btn small" onClick={join}>
          {mode === "listener" ? s.voiceListen : s.voiceJoin}
        </button>
      )}
      {joined && statusText && <p className="cu-empty-note">{statusText}</p>}
      {joined && mode === "player" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <button type="button" className="cu-btn small" onClick={toggleMute}>
            {muted ? `🔇 ${s.voiceUnmute}` : `🎤 ${s.voiceMute}`}
          </button>
          <button type="button" className="cu-btn small" onClick={leave}>
            {s.voiceLeave}
          </button>
        </div>
      )}
      {joined && mode === "player" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <button
            type="button"
            className="cu-btn small"
            onClick={() => setListenersAllowed(!listenersAllowed)}
            aria-pressed={listenersAllowed}
          >
            {listenersAllowed ? `🔊 ${s.voiceAllowListeners} ✓` : `🔇 ${s.voiceAllowListeners}`}
          </button>
        </div>
      )}
      {mode === "player" && listenerCount > 0 && (
        <p className="cu-empty-note" style={{ marginTop: 4 }}>
          {s.voiceListenersPresent}
        </p>
      )}
      {joined && mode === "listener" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <button type="button" className="cu-btn small" onClick={leave}>
            {s.voiceLeave}
          </button>
        </div>
      )}
      {error && (
        <p
          className="cu-empty-note"
          role="alert"
          style={{ color: "var(--danger, #c0392b)" }}
        >
          ⚠️ {error === "mic" ? s.voiceMicError : s.voiceError}
        </p>
      )}
    </div>
  );
}
