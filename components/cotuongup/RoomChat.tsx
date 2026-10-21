"use client";

import { useEffect, useRef, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import {
  memberName,
  postRoomMessage,
  type RoomMessage,
} from "@/lib/supabase/rooms";

interface Props {
  lang: Lang;
  roomId: string;
  messages: RoomMessage[];
  onPosted: (m: RoomMessage) => void;
  /** Load older messages (paged backwards from the oldest visible). */
  onLoadMore?: () => void;
  /** True when older messages may still exist on the server. */
  hasMore?: boolean;
  disabled?: boolean;
}

/**
 * Room-scoped private chat: only room members can read or post
 * (players AND spectators). Parallel to RoomComments, but the stream
 * lives for the room — not tied to a match or move number.
 */
export function RoomChat({
  lang,
  roomId,
  messages,
  onPosted,
  onLoadMore,
  hasMore,
  disabled,
}: Props) {
  const s = STR[lang];
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Auto-scroll to the newest message while the user stays near the bottom.
  useEffect(() => {
    const el = feedRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setError(null);
    try {
      const m = await postRoomMessage(roomId, body);
      onPosted(m);
      setText("");
    } catch (e) {
      // Family rule: never swallow a send failure — keep the text and
      // show the reason so the user can retry.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="cu-room-comments" style={{ marginTop: 12 }}>
      <h3 className="cu-history-section-title">
        ✉️ {s.roomChat} ({messages.length})
      </h3>
      <div ref={feedRef} className="cu-room-feed" onScroll={onScroll}>
        {messages.length === 0 ? (
          <p className="cu-empty-note">{s.roomNoMessages}</p>
        ) : (
          <>
            {hasMore && onLoadMore && (
              <button
                type="button"
                className="cu-btn small"
                onClick={onLoadMore}
                style={{ alignSelf: "center" }}
              >
                {s.roomLoadMore}
              </button>
            )}
            {messages.map((m) => (
              <div key={m.id} className="cu-room-comment">
                <span className="cu-room-avatar">
                  {m.profile?.avatar_url ? (
                    <img
                      src={m.profile.avatar_url}
                      alt=""
                      className="cu-room-avatar-img"
                    />
                  ) : (
                    memberName(m.profile, "?").slice(0, 1).toUpperCase()
                  )}
                </span>
                <div className="cu-room-comment-body">
                  <div className="cu-room-comment-head">
                    <strong>{memberName(m.profile, "?")}</strong>
                    <span className="cu-room-comment-time">
                      {new Date(m.created_at).toLocaleTimeString(
                        lang === "vi" ? "vi-VN" : "en-US",
                        { hour: "2-digit", minute: "2-digit" }
                      )}
                    </span>
                  </div>
                  <p>{m.body}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      {error && (
        <p className="cu-empty-note" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
          ⚠️ {error}
        </p>
      )}
      <div className="cu-room-comment-input">
        <input
          type="text"
          value={text}
          maxLength={500}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={s.roomChatPlaceholder}
          disabled={disabled || sending}
          aria-label={s.roomChat}
        />
        <button
          type="button"
          className="cu-btn small"
          onClick={send}
          disabled={!text.trim() || sending || disabled}
        >
          {s.roomSend}
        </button>
      </div>
    </div>
  );
}
