"use client";

import { useCallback, useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  deleteCommunityPuzzle,
  fetchCommunityPuzzle,
  fetchCommunityPuzzles,
  renameCommunityPuzzle,
  solveCommunityPuzzle,
  toggleCommunityLike,
  type CommunityPuzzleCard,
  type CommunitySort,
} from "@/lib/supabase/community";
import { parseFen, viewBoard } from "@/lib/jieqi/engine";
import type { Color, JieqiState, Level } from "@/lib/jieqi/types";
import { Pagination, usePagination } from "./Pagination";
import { PuzzleMode } from "./PuzzleMode";
import { SetupView } from "./SetupView";
import { canvasToPngFile, renderShareCard } from "@/lib/jieqi/shareCard";
import { shareLink, shareResultCard } from "@/lib/jieqi/share";

type View =
  | { name: "list" }
  | { name: "create"; seed?: { fen: string; title: string } }
  | { name: "solve"; puzzle: CommunityPuzzleCard };

const SORTS: CommunitySort[] = ["new", "popular", "weekly", "mine"];
const PAGE_SIZE = 10;
const FETCH_LIMIT = 100;

interface Props {
  lang: Lang;
  initialPuzzleId?: string | null;
  onInitialConsumed?: () => void;
  /** Play a custom position vs computer (shared editor's "play" tab). */
  onPlayCustom?: (state: JieqiState, playerColor: Color) => void;
  /** Shared play-config difficulty, threaded to the setup editor. */
  level: Level;
  onLevelChange: (level: Level) => void;
}

export function CommunityView({
  lang,
  initialPuzzleId,
  onInitialConsumed,
  onPlayCustom,
  level,
  onLevelChange,
}: Props) {
  const s = STR[lang];
  const { user } = useAuth();
  const [view, setView] = useState<View>({ name: "list" });
  const [sort, setSort] = useState<CommunitySort>("popular");
  const [cards, setCards] = useState<CommunityPuzzleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<CommunityPuzzleCard | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const openRename = (p: CommunityPuzzleCard) => {
    setRenameTitle(p.title);
    setRenaming(p);
  };

  const saveRename = async () => {
    if (!renaming) return;
    const title = renameTitle.trim();
    if (!title) return;
    const ok = await renameCommunityPuzzle(renaming.id, title);
    if (ok) {
      if (view.name === "solve") {
        const fresh = await fetchCommunityPuzzle(renaming.id);
        if (fresh) setView({ name: "solve", puzzle: fresh });
      } else {
        reload();
      }
      showToast(s.cpRenamed);
    }
    setRenaming(null);
  };

  const showToast = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4000);
  };

  const pagination = usePagination<CommunityPuzzleCard>(cards, PAGE_SIZE);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCommunityPuzzles(sort, FETCH_LIMIT, 0);
      setCards(list);
      pagination.setPage(0);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  useEffect(() => {
    if (view.name === "list") reload();
  }, [view.name, reload]);

  // Deep link ?cpuzzle=<id>.
  useEffect(() => {
    if (!initialPuzzleId) return;
    fetchCommunityPuzzle(initialPuzzleId).then((p) => {
      onInitialConsumed?.();
      if (p) setView({ name: "solve", puzzle: p });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPuzzleId]);

  const requireLogin = () => {
    window.dispatchEvent(new CustomEvent("xq:open-auth"));
  };

  const onSolvedCommunity = async (puzzle: CommunityPuzzleCard) => {
    const xp = await solveCommunityPuzzle(puzzle.id);
    if (xp > 0) {
      showToast(`🎉 +${xp} XP`);
      window.dispatchEvent(new CustomEvent("xq:profile-refresh"));
    } else {
      showToast(s.cpSolved);
    }
    // Refresh the card (solves count, solved state).
    const fresh = await fetchCommunityPuzzle(puzzle.id);
    if (fresh) setView({ name: "solve", puzzle: fresh });
  };

  const toggleLike = async (puzzle: CommunityPuzzleCard) => {
    if (!user) {
      requireLogin();
      return;
    }
    const res = await toggleCommunityLike(puzzle.id);
    if (res && view.name === "solve") {
      setView({
        name: "solve",
        puzzle: { ...puzzle, liked_by_me: res.liked, likes: res.likes },
      });
    }
  };

  const sharePuzzle = async (puzzle: CommunityPuzzleCard) => {
    if (sharingId) return;
    setSharingId(puzzle.id);
    try {
      const link = await shareLink(`/?cpuzzle=${puzzle.id}`);
      const title = puzzle.title || s.cpUntitled;
      const canvas = renderShareCard({
        board: viewBoard(parseFen(puzzle.fen)),
        title,
        subtitle: `${s.mateIn(puzzle.moves_to_mate)} · ${s.cpBy(puzzle.creator_name)}`,
        footer: s.shareFooter,
      });
      const file = await canvasToPngFile(canvas, "co-up-cong-dong.png");
      const outcome = await shareResultCard({
        file,
        fileName: "co-up-cong-dong.png",
        title,
        text: `${title}\n${s.mateIn(puzzle.moves_to_mate)}`,
        url: link,
      });
      showToast(outcome === "shared" ? s.shareDone : s.shareDownloaded);
    } catch {
      /* ignore */
    } finally {
      setSharingId(null);
    }
  };

  const removePuzzle = async (puzzle: CommunityPuzzleCard) => {
    if (!window.confirm(s.cpDeleteConfirm)) return;
    const ok = await deleteCommunityPuzzle(puzzle.id);
    if (ok) {
      if (view.name === "solve") setView({ name: "list" });
      else reload();
    }
  };

  /* ------------------------------ solve view ------------------------------ */
  if (view.name === "solve") {
    const p = view.puzzle;
    const isMine = user?.id === p.creator_id;
    return (
      <>
      <main className="cu-layout">
        <div className="cu-community-head">
          <button
            type="button"
            className="cu-btn small"
            onClick={() => setView({ name: "list" })}
          >
            ‹ {s.cpBackToList}
          </button>
          <div className="cu-community-title">
            <strong>
              {p.is_featured ? "⭐ " : ""}
              {p.title || s.cpUntitled}
            </strong>
            <span className="cu-muted">
              {s.cpBy(p.creator_name)} · ✅ {p.solves} · ❤️ {p.likes}
              {p.solved_by_me ? ` · ✓ ${s.cpSolved}` : ""}
            </span>
          </div>
          <div className="cu-community-actions">
            <button
              type="button"
              className="cu-btn small"
              onClick={() => toggleLike(p)}
              aria-pressed={p.liked_by_me}
            >
              {p.liked_by_me ? "❤️" : "🤍"} {p.likes}
            </button>
            <button
              type="button"
              className="cu-btn small"
              disabled={sharingId === p.id}
              onClick={() => sharePuzzle(p)}
            >
              📤
            </button>
            <button
              type="button"
              className="cu-btn small"
              title={s.cpRemix}
              onClick={() =>
                setView({
                  name: "create",
                  seed: {
                    fen: p.fen,
                    title: s.cpRemixTitle(p.title || s.cpUntitled),
                  },
                })
              }
            >
              🔀
            </button>
            {isMine && (
              <>
                <button
                  type="button"
                  className="cu-btn small"
                  title={s.cpRename}
                  onClick={() => openRename(p)}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="cu-btn small danger"
                  onClick={() => removePuzzle(p)}
                >
                  🗑
                </button>
              </>
            )}
          </div>
        </div>
        <PuzzleMode
          lang={lang}
          key={p.id}
          custom={{
            fen: p.fen,
            movesToMate: p.moves_to_mate,
            label: p.title || s.cpUntitled,
            hideMeta: true,
            onSolved: () => onSolvedCommunity(p),
          }}
        />
        {toast && <div className="cu-toast">{toast}</div>}
      </main>
      {renaming && (
        <div className="cu-modal-backdrop" onClick={() => setRenaming(null)}>
          <div className="cu-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{s.cpRenameTitle}</h2>
            <label className="cu-field">
              <input
                className="cu-input"
                value={renameTitle}
                maxLength={60}
                autoFocus
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename();
                }}
              />
            </label>
            <div className="cu-buttons">
              <button
                type="button"
                className="cu-btn primary"
                disabled={!renameTitle.trim()}
                onClick={saveRename}
              >
                {s.cpSave}
              </button>
              <button
                type="button"
                className="cu-btn"
                onClick={() => setRenaming(null)}
              >
                {s.cpBack}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  /* ------------------------------ create view ----------------------------- */
  /* One shared board editor: arrange pieces, then either play vs computer
     or create a community puzzle. Guests can browse; login is asked inline
     on the create tab. */
  if (view.name === "create") {
    return (
      <SetupView
        lang={lang}
        key={view.seed?.fen ?? "blank"}
        initialTab="create"
        seed={view.seed}
        onPlay={(state, playerColor) => onPlayCustom?.(state, playerColor)}
        level={level}
        onLevelChange={onLevelChange}
        onBack={() => setView({ name: "list" })}
        onPublished={() => {
          window.dispatchEvent(new CustomEvent("xq:profile-refresh"));
          setSort("mine");
          setView({ name: "list" });
        }}
      />
    );
  }

  /* --------------------------------- list --------------------------------- */
  const pageCards = pagination.pageItems;
  return (
    <>
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div className="cu-community-list">
          <div className="cu-community-toolbar">
            <div className="cu-community-sorts" role="tablist">
              {SORTS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={sort === k}
                  className={`cu-btn small${sort === k ? " primary" : ""}`}
                  onClick={() => setSort(k)}
                >
                  {s.cpSort[k]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="cu-btn primary"
              onClick={() => setView({ name: "create" })}
            >
              ＋ {s.cpCreate}
            </button>
          </div>

          {loading ? (
            <p className="cu-empty-note">{s.loading}</p>
          ) : cards.length === 0 ? (
            <div className="cu-room-home">
              <p className="cu-empty-note">{s.cpEmpty}</p>
              <button
                type="button"
                className="cu-btn"
                onClick={() => setView({ name: "create" })}
              >
                ＋ {s.cpCreateFirst}
              </button>
            </div>
          ) : (
            <>
              <ul className="cu-community-cards">
                {pageCards.map((p) => (
                  <li key={p.id} className="cu-room-card">
                    <div className="cu-community-card-head">
                      <strong>
                        {p.is_featured ? "⭐ " : ""}
                        {p.title || s.cpUntitled}
                      </strong>
                      <span className="cu-tag">{s.mateIn(p.moves_to_mate)}</span>
                    </div>
                    <div className="cu-community-card-meta">
                      <span>
                        {s.cpBy(p.creator_name)} · ✅ {p.solves} · ❤️ {p.likes}
                      </span>
                      {p.solved_by_me && (
                        <span className="cu-quest-claimed">✓ {s.cpSolved}</span>
                      )}
                    </div>
                    <div className="cu-buttons">
                      <button
                        type="button"
                        className="cu-btn small primary"
                        onClick={() => setView({ name: "solve", puzzle: p })}
                      >
                        ▶ {s.cpPlay}
                      </button>
                      <button
                        type="button"
                        className="cu-btn small"
                        disabled={sharingId === p.id}
                        onClick={() => sharePuzzle(p)}
                      >
                        📤
                      </button>
                      {user?.id === p.creator_id && (
                        <>
                          <button
                            type="button"
                            className="cu-btn small"
                            title={s.cpRename}
                            onClick={() => openRename(p)}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="cu-btn small danger"
                            onClick={() => removePuzzle(p)}
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination
                page={pagination.page}
                pageCount={pagination.pageCount}
                onPage={pagination.setPage}
              />
            </>
          )}
        </div>
      </div>
      {toast && <div className="cu-toast">{toast}</div>}
    </main>
      {renaming && (
        <div className="cu-modal-backdrop" onClick={() => setRenaming(null)}>
          <div className="cu-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{s.cpRenameTitle}</h2>
            <label className="cu-field">
              <input
                className="cu-input"
                value={renameTitle}
                maxLength={60}
                autoFocus
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename();
                }}
              />
            </label>
            <div className="cu-buttons">
              <button
                type="button"
                className="cu-btn primary"
                disabled={!renameTitle.trim()}
                onClick={saveRename}
              >
                {s.cpSave}
              </button>
              <button
                type="button"
                className="cu-btn"
                onClick={() => setRenaming(null)}
              >
                {s.cpBack}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
