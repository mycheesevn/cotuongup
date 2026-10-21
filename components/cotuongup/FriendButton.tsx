"use client";

import { useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import { followUser, unfollowUser } from "@/lib/supabase/friends";

interface Props {
  lang: Lang;
  userId: string;
  following: Set<string>;
  onChanged: (userId: string, nowFollowing: boolean) => void;
}

/** Compact ＋/✓ friend toggle for member lists and leaderboard rows. */
export function FriendButton({ lang, userId, following, onChanged }: Props) {
  const s = STR[lang];
  const [busy, setBusy] = useState(false);
  const isFollowing = following.has(userId);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isFollowing) {
        await unfollowUser(userId);
        onChanged(userId, false);
      } else {
        await followUser(userId);
        onChanged(userId, true);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`cu-btn small${isFollowing ? " cu-friend-on" : ""}`}
      disabled={busy}
      onClick={toggle}
      title={isFollowing ? s.friendsFollowing : s.friendsAdd}
      aria-label={isFollowing ? s.friendsFollowing : s.friendsAdd}
    >
      {isFollowing ? "✓" : "＋"}
    </button>
  );
}
