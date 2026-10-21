"use client";

import { useEffect, useRef, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import {
  memberName,
  postComment,
  type RoomComment,
} from "@/lib/supabase/rooms";

interface Props {
  lang: Lang;
  roomId: string;
  matchId: string;
  moveNumber: number;
  comments: RoomComment[];
  onPosted: (c: RoomComment) => void;
  disabled?: boolean;
}

/** Per-move comment feed: players and spectators chatting together. */
export function RoomComments({
  lang,
  roomId,
  matchId,
  moveNumber,
  comments,
  onPosted,
  disabled,
}: Props) {
  const s = STR[lang];
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Auto-scroll to the newest comment while the user stays near the bottom.
  useEffect(() => {
    const el = feedRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    try {
      const c = await postComment(roomId, matchId, moveNumber, body);
      onPosted(c);
      setText("");
    } catch {
      /* realtime echo or error: keep the text so it isn't lost */
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="cu-room-comments">
      <h3 className="cu-history-section-title">
        💬 {s.roomComments} ({comments.length})
      </h3>
      <div ref={feedRef} className="cu-room-feed" onScroll={onScroll}>
        {comments.length === 0 ? (
          <p className="cu-empty-note">{s.roomNoComments}</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="cu-room-comment">
              <span className="cu-room-avatar">
                {c.profile?.avatar_url ? (
                  <img
                    src={c.profile.avatar_url}
                    alt=""
                    className="cu-room-avatar-img"
                  />
                ) : (
                  memberName(c.profile, "?").slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="cu-room-comment-body">
                <div className="cu-room-comment-head">
                  <strong>{memberName(c.profile, "?")}</strong>
                  <span className="cu-room-move-badge">
                    {s.roomMoveBadge(c.move_number)}
                  </span>
                  <span className="cu-room-comment-time">
                    {new Date(c.created_at).toLocaleTimeString(
                      lang === "vi" ? "vi-VN" : "en-US",
                      { hour: "2-digit", minute: "2-digit" }
                    )}
                  </span>
                </div>
                <p>{c.body}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="cu-room-comment-input">
        <input
          type="text"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={s.roomWriteComment}
          disabled={disabled || sending}
          aria-label={s.roomComments}
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
