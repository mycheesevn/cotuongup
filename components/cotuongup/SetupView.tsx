"use client";

import { useEffect, useMemo, useState } from "react";
import { Board } from "./Board";
import { PuzzleMode } from "./PuzzleMode";
import { Pagination, usePagination } from "./Pagination";
import {
  gameStatus,
  hostTypeAt,
  initialState,
  parseFen,
  toFen,
} from "@/lib/jieqi/engine";
import { LEVELS } from "@/lib/jieqi/ai";
import {
  buildSetupState,
  emptyBoard,
  hasCovered,
  setupBoardFromState,
  validateSetup,
  type SetupBoard,
  type SetupError,
  type SetupPiece,
} from "@/lib/jieqi/setup";
import { PUZZLES } from "@/lib/jieqi/puzzles";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  deleteSetup,
  listSavedSetups,
  saveSetup,
  type SavedSetup,
} from "@/lib/jieqi/savedSetups";
import {
  fetchFeaturedPuzzles,
  publishCommunityPuzzle,
  type CommunityPuzzleCard,
} from "@/lib/supabase/community";
import {
  Color,
  JieqiState,
  Level,
  PieceType,
  PIECE_CHARS,
  ViewBoard,
  opposite,
} from "@/lib/jieqi/types";

interface Props {
  lang: Lang;
  onPlay: (state: JieqiState, playerColor: Color) => void;
  /** Computer-vs-computer from this position (both engines, setup level). */
  onCvc?: (state: JieqiState) => void;
  /** The game's shared play-config difficulty (owned by CotuongupGame) —
   * the setup form edits it directly, so the game starts at this level. */
  level: Level;
  onLevelChange: (level: Level) => void;
  /** Which tab opens first ("play" in the Setup drawer, "create" from Community). */
  initialTab?: "play" | "create";
  /** Preload the editor: a sample from the library or a community remix. */
  seed?: { fen: string; title: string };
  /** Called after a puzzle is published (e.g. navigate to the community list). */
  onPublished?: (puzzleId: string) => void;
  onBack?: () => void;
}

type Tool =
  | { kind: "move" }
  | { kind: "erase" }
  | { kind: "place"; color: Color; type: PieceType };

const ORDER: PieceType[] = ["K", "R", "N", "C", "B", "A", "P"];

const ERR_KEY: Partial<Record<Exclude<SetupError, null>, string>> = {
  kings: "setupErrKings",
  palace: "setupErrPalace",
  facing: "setupErrFacing",
};

const LIB_PAGE_SIZE = 8;

/** Render model for the editor board (covered pieces show brass backs). */
function editorView(board: SetupBoard): ViewBoard {
  return board.map((row, y) =>
    row.map((p, x) =>
      p
        ? {
            id: y * 9 + x,
            color: p.color,
            faceType: p.covered ? p.fakeType : p.trueType,
            covered: p.covered,
            hostType: p.fakeType,
          }
        : null
    )
  );
}

export function SetupView({ lang, onPlay, onCvc, level, onLevelChange, initialTab = "play", seed, onPublished, onBack }: Props) {
  const s = STR[lang] as Record<string, any>;
  const { user } = useAuth();
  const [tab, setTab] = useState<"play" | "create">(initialTab);
  const [stage, setStage] = useState<"edit" | "verify" | "done">("edit");
  const [board, setBoard] = useState<SetupBoard>(() => {
    if (seed?.fen) {
      try {
        return setupBoardFromState(parseFen(seed.fen));
      } catch {
        /* fall through to a fresh deal */
      }
    }
    return setupBoardFromState(initialState());
  });
  const [movesToMate, setMovesToMate] = useState(2);
  const [puzzleTitle, setPuzzleTitle] = useState(seed?.title ?? "");
  const [libOpen, setLibOpen] = useState(false);
  const [featured, setFeatured] = useState<CommunityPuzzleCard[]>([]);
  const libPagination = usePagination(PUZZLES, LIB_PAGE_SIZE);

  // Load community-curated samples when the library opens.
  useEffect(() => {
    if (!libOpen) return;
    let cancelled = false;
    fetchFeaturedPuzzles(20).then((list) => {
      if (!cancelled) setFeatured(list);
    });
    return () => {
      cancelled = true;
    };
  }, [libOpen]);
  const [tool, setTool] = useState<Tool>({ kind: "move" });
  /** Palette mode: place face-down pieces (the picked type becomes the
   *  piece's HIDDEN identity, chosen from the side's remaining multiset). */
  const [coveredMode, setCoveredMode] = useState(false);
  const [lifted, setLifted] = useState<{ x: number; y: number } | null>(null);
  const [playerColor, setPlayerColor] = useState<Color>("red");
  const [turn, setTurn] = useState<Color>("red");
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const view = useMemo(() => editorView(board), [board]);

  const errorText = (err: Exclude<SetupError, null>): string => {
    const key = ERR_KEY[err];
    if (key) return s[key] as string;
    if (err === "composition")
      return lang === "vi"
        ? "Số quân vượt quá bộ cờ chuẩn (mỗi bên: 1 Tướng, 2 Sĩ/Tượng/Mã/Xe/Pháo, 5 Tốt)."
        : "Piece count exceeds the standard set (per side: 1 King, 2 each of Advisor/Elephant/Horse/Chariot/Cannon, 5 Pawns).";
    return lang === "vi"
      ? "Quân úp chỉ đặt được trên ô xuất phát của chính bên đó."
      : "A face-down piece can only sit on one of its own side's starting squares.";
  };

  const setCell = (x: number, y: number, p: SetupPiece | null) => {
    setBoard((prev) => {
      const nb = prev.map((row) => row.slice()) as SetupBoard;
      nb[y][x] = p;
      return nb;
    });
  };

  const onSquareClick = (x: number, y: number) => {
    setError(null);
    if (tool.kind === "place") {
      if (coveredMode) {
        const host = hostTypeAt(tool.color, x, y);
        if (host === null) {
          setError(errorText("coveredHome"));
          return;
        }
        if (tool.type === "K") {
          setError(errorText("kings"));
          return;
        }
        setCell(x, y, {
          color: tool.color,
          trueType: tool.type,
          covered: true,
          fakeType: host,
        });
      } else {
        setCell(x, y, {
          color: tool.color,
          trueType: tool.type,
          covered: false,
          fakeType: hostTypeAt(tool.color, x, y) ?? tool.type,
        });
      }
      setLifted(null);
    } else if (tool.kind === "erase") {
      setCell(x, y, null);
      setLifted(null);
    } else {
      // move tool: lift a piece, then drop it elsewhere
      if (lifted) {
        if (lifted.x === x && lifted.y === y) {
          setLifted(null);
          return;
        }
        setBoard((prev) => {
          const nb = prev.map((row) => row.slice()) as SetupBoard;
          nb[y][x] = nb[lifted.y][lifted.x];
          nb[lifted.y][lifted.x] = null;
          return nb;
        });
        setLifted(null);
      } else if (board[y][x]) {
        setLifted({ x, y });
      }
    }
  };

  const buildOrError = (): JieqiState | null => {
    const err = validateSetup(board);
    if (err) {
      setError(errorText(err));
      return null;
    }
    setError(null);
    return buildSetupState(board, turn);
  };

  const onPlayClick = () => {
    const state = buildOrError();
    if (state) onPlay(state, playerColor);
  };

  const onCvcClick = () => {
    const state = buildOrError();
    if (state) onCvc?.(state);
  };

  /* ------------------------- saved setups ------------------------- */
  const [savedList, setSavedList] = useState<SavedSetup[]>([]);
  const [savedName, setSavedName] = useState("");
  const [savedPage, setSavedPage] = useState(0);

  useEffect(() => {
    let live = true;
    listSavedSetups(user?.id ?? null)
      .then((rows) => {
        if (live) setSavedList(rows);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user?.id]);

  const onSaveSetup = async () => {
    const name =
      savedName.trim() ||
      `${s.setupsUnnamed} ${new Date().toLocaleDateString(
        lang === "vi" ? "vi-VN" : "en-US"
      )}`;
    try {
      const state = buildSetupState(board, turn);
      const row = await saveSetup(user?.id ?? null, name, toFen(state), turn);
      setSavedList((prev) => [row, ...prev]);
      setSavedName("");
      setSavedPage(0);
      setError(null);
    } catch {
      setError(s.setupsSaveFailed as string);
    }
  };

  const onLoadSetup = (row: SavedSetup) => {
    try {
      const state = parseFen(row.fen);
      setBoard(setupBoardFromState(state));
      setTurn(state.turn);
      setLifted(null);
      setError(null);
    } catch {
      /* a corrupt saved row — ignore */
    }
  };

  const onDeleteSetup = async (row: SavedSetup) => {
    try {
      await deleteSetup(user?.id ?? null, row.id);
      setSavedList((prev) => prev.filter((x) => x.id !== row.id));
    } catch {
      /* best-effort */
    }
  };

  /** Create tab: validate, then the creator must demonstrate the mate.
   *  Community puzzles are FULLY-REVEALED positions only. */
  const onVerifyClick = () => {
    if (hasCovered(board)) {
      setError(
        lang === "vi"
          ? "Câu đố cộng đồng chỉ nhận thế cờ đã lật hết — hãy lật ngửa mọi quân úp trước."
          : "Community puzzles must be fully revealed — flip every face-down piece face-up first."
      );
      return;
    }
    const state = buildOrError();
    if (!state) return;
    if (
      gameStatus(state).over ||
      gameStatus(buildSetupState(board, opposite(turn))).over
    ) {
      setError(s.cpBadStart as string);
      return;
    }
    setError(null);
    setStage("verify");
  };

  /** Verify succeeded — publish the demonstrated puzzle. */
  const onVerified = async (moveCodes: string[]) => {
    if (publishing) return;
    setPublishing(true);
    try {
      const id = await publishCommunityPuzzle({
        title: puzzleTitle.trim() || (s.cpUntitled as string),
        fen: toFen(buildSetupState(board, turn)),
        movesToMate,
        solution: moveCodes.join(","),
      });
      if (id) setStage("done");
    } finally {
      setPublishing(false);
    }
  };

  const requireLogin = () => {
    window.dispatchEvent(new CustomEvent("xq:open-auth"));
  };

  /** Load a verified sample puzzle as the starting point for a remix. */
  const useSample = (fen: string, sampleMovesToMate: number) => {
    try {
      setBoard(setupBoardFromState(parseFen(fen)));
    } catch {
      return;
    }
    setMovesToMate(sampleMovesToMate);
    setLifted(null);
    setError(null);
    setLibOpen(false);
  };

  const toolActive = (t: Tool) =>
    tool.kind === t.kind &&
    (t.kind !== "place" ||
      (tool.kind === "place" && tool.color === t.color && tool.type === t.type));

  const renderPieceBtn = (color: Color, type: PieceType) => {
    const t: Tool = { kind: "place", color, type };
    return (
      <button
        key={`${color}-${type}`}
        type="button"
        className={`cu-palbtn ${toolActive(t) ? "active" : ""} ${color}`}
        onClick={() => {
          setTool(t);
          setLifted(null);
        }}
        title={type}
      >
        {PIECE_CHARS[color][type]}
      </button>
    );
  };

  /* ------------------------- verify stage ------------------------- */
  if (stage === "verify") {
    return (
      <>
        <div className="cu-community-head">
          <button
            type="button"
            className="cu-btn small"
            onClick={() => setStage("edit")}
          >
            ‹ {s.cpBackToEdit}
          </button>
          <div className="cu-community-title">
            <strong>{s.cpVerifyTitle}</strong>
            <span className="cu-muted">{s.cpVerifyHint}</span>
          </div>
        </div>
        <PuzzleMode
          lang={lang}
          key={`verify-${movesToMate}`}
          custom={{
            fen: toFen(buildSetupState(board, turn)),
            movesToMate,
            label: s.cpVerifyTitle,
            hideMeta: true,
            onSolved: (_movesUsed, moveCodes) => onVerified(moveCodes),
          }}
        />
      </>
    );
  }

  /* --------------------------- done stage --------------------------- */
  if (stage === "done") {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <div className="cu-room-home">
            <h2>🎉 {s.cpPublished}</h2>
            <p className="cu-empty-note">{s.cpDoneHint}</p>
            <div className="cu-buttons">
              {onPublished && (
                <button
                  type="button"
                  className="cu-btn primary"
                  onClick={() => onPublished("")}
                >
                  🧩 {s.cpViewCommunity}
                </button>
              )}
              <button
                type="button"
                className="cu-btn"
                onClick={() => {
                  setStage("edit");
                  setTab("create");
                  setPuzzleTitle("");
                }}
              >
                ＋ {s.cpCreateAnother}
              </button>
              {onBack && (
                <button type="button" className="cu-btn" onClick={onBack}>
                  {s.cpBack}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ---------------------------- edit stage ---------------------------- */
  return (
    <main className="cu-layout">
      <div className="cu-board-area">
        <div className="cu-board-fit">
          <Board
            board={view}
            flipped={false}
            selected={lifted}
            targets={[]}
            lastMove={null}
            checkAt={null}
            interactive={true}
            anim={null}
            onSquareClick={onSquareClick}
          />
        </div>
      </div>

      <aside className="cu-panel">
        <section>
          <h2>{s.setupPieces}</h2>
          <div className="cu-palette">
            <button
              type="button"
              className={`cu-palbtn tool ${tool.kind === "move" ? "active" : ""}`}
              onClick={() => {
                setTool({ kind: "move" });
                setLifted(null);
              }}
              title={s.setupMove}
            >
              ✥
            </button>
            <button
              type="button"
              className={`cu-palbtn tool ${tool.kind === "erase" ? "active" : ""}`}
              onClick={() => {
                setTool({ kind: "erase" });
                setLifted(null);
              }}
              title={s.setupErase}
            >
              🧽
            </button>
            <button
              type="button"
              className={`cu-palbtn tool ${coveredMode ? "active" : ""}`}
              onClick={() => setCoveredMode((v) => !v)}
              title={s.coveredPiece}
              aria-pressed={coveredMode}
            >
              🃏
            </button>
          </div>
          <div className="cu-palette">
            {ORDER.map((t) => renderPieceBtn("red", t))}
          </div>
          <div className="cu-palette">
            {ORDER.map((t) => renderPieceBtn("black", t))}
          </div>
          <p className="cu-hint">
            {coveredMode
              ? lang === "vi"
                ? "🃏 Đang đặt quân ÚP: loại quân bạn chọn là danh tính ẩn của quân úp (chỉ đặt được trên ô xuất phát của bên đó)."
                : "🃏 Placing FACE-DOWN pieces: the type you pick becomes the piece's hidden identity (own starting squares only)."
              : s.setupHint}
          </p>
        </section>

        <section>
          <h2>{s.setupIntent}</h2>
          <div className="cu-seg" role="tablist" aria-label={s.setupIntent}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "play"}
              className={tab === "play" ? "active" : ""}
              onClick={() => setTab("play")}
            >
              {s.setupPlayTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "create"}
              className={tab === "create" ? "active" : ""}
              onClick={() => setTab("create")}
            >
              {s.cpCreateTab}
            </button>
          </div>

          {tab === "play" ? (
            <>
              <label className="cu-field">
                <span>{s.level}</span>
                <select
                  value={level}
                  onChange={(e) => onLevelChange(Number(e.target.value))}
                  className="cu-select"
                >
                  {LEVELS.map((l) => (
                    <option key={l.level} value={l.level}>
                      {fmt(s.levelLabel, { n: l.level })} — {s.levelDesc[l.level - 1]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cu-field">
                <span>{s.youPlay}</span>
                <select
                  value={playerColor}
                  onChange={(e) => setPlayerColor(e.target.value as Color)}
                  className="cu-select"
                >
                  <option value="red">{s.redName}</option>
                  <option value="black">{s.blackName}</option>
                </select>
              </label>
              <label className="cu-field">
                <span>{s.setupTurn}</span>
                <select
                  value={turn}
                  onChange={(e) => setTurn(e.target.value as Color)}
                  className="cu-select"
                >
                  <option value="red">{s.redName}</option>
                  <option value="black">{s.blackName}</option>
                </select>
              </label>
            </>
          ) : !user ? (
            <div className="cu-guest-teaser">
              <p>{s.cpLoginRequired}</p>
              <button
                type="button"
                className="cu-btn primary"
                onClick={requireLogin}
              >
                🔑 {s.authLogin}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="cu-btn"
                onClick={() => setLibOpen(true)}
              >
                {s.cpLibraryBtn}
              </button>
              <label className="cu-field">
                <span>{s.cpTitleLabel}</span>
                <input
                  className="cu-input"
                  value={puzzleTitle}
                  maxLength={60}
                  onChange={(e) => setPuzzleTitle(e.target.value)}
                  placeholder={s.cpTitlePh}
                />
              </label>
              <label className="cu-field">
                <span>{s.cpMovesLabel}</span>
                <select
                  value={movesToMate}
                  onChange={(e) => setMovesToMate(Number(e.target.value))}
                  className="cu-select"
                >
                  <option value={1}>{fmt(s.cpMateIn, { n: 1 })}</option>
                  <option value={2}>{fmt(s.cpMateIn, { n: 2 })}</option>
                  <option value={3}>{fmt(s.cpMateIn, { n: 3 })}</option>
                </select>
              </label>
              <p className="cu-hint">{s.cpVerifyHint}</p>
            </>
          )}
          {error && <p className="cu-error">{error}</p>}
          <div className="cu-buttons">
            {tab === "play" ? (
              <>
                <button
                  type="button"
                  className="cu-btn primary"
                  onClick={onPlayClick}
                >
                  {s.setupStart}
                </button>
                {onCvc && (
                  <button type="button" className="cu-btn" onClick={onCvcClick}>
                    {s.setupCvc}
                  </button>
                )}
              </>
            ) : (
              user && (
                <button
                  type="button"
                  className="cu-btn primary"
                  onClick={onVerifyClick}
                >
                  {s.cpVerifyBtn}
                </button>
              )
            )}
            {onBack && (
              <button type="button" className="cu-btn" onClick={onBack}>
                {s.cpBack}
              </button>
            )}
          </div>
          <div className="cu-buttons">
            <button
              type="button"
              className="cu-btn"
              onClick={() => {
                setBoard(setupBoardFromState(initialState()));
                setLifted(null);
                setError(null);
              }}
            >
              {s.setupReset}
            </button>
            <button
              type="button"
              className="cu-btn"
              onClick={() => {
                setBoard(emptyBoard());
                setLifted(null);
                setError(null);
              }}
            >
              {s.setupClear}
            </button>
          </div>
        </section>

        <section>
          <h2>{s.setupsTitle}</h2>
          <label className="cu-field">
            <input
              className="cu-input"
              type="text"
              value={savedName}
              maxLength={60}
              placeholder={s.setupsNamePh as string}
              onChange={(e) => setSavedName(e.target.value)}
            />
          </label>
          <div className="cu-buttons">
            <button type="button" className="cu-btn" onClick={onSaveSetup}>
              💾 {s.setupsSave}
            </button>
          </div>
          {savedList.length === 0 ? (
            <p className="cu-hint">{s.setupsEmpty}</p>
          ) : (
            <>
              <ul className="cu-history-list">
                {savedList
                  .slice(savedPage * 5, savedPage * 5 + 5)
                  .map((row) => (
                    <li key={row.id} className="cu-history-item">
                      <span className="cu-history-main">
                        <strong>{row.name}</strong>
                        <span className="cu-history-sub">
                          {new Date(row.created_at).toLocaleDateString(
                            lang === "vi" ? "vi-VN" : "en-US"
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="cu-btn small"
                        onClick={() => onLoadSetup(row)}
                      >
                        {s.setupsLoad}
                      </button>
                      <button
                        type="button"
                        className="cu-btn small danger"
                        aria-label="✕"
                        onClick={() => onDeleteSetup(row)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
              </ul>
              <Pagination
                page={savedPage}
                pageCount={Math.max(1, Math.ceil(savedList.length / 5))}
                onPage={setSavedPage}
              />
            </>
          )}
        </section>
      </aside>

      {libOpen && (
        <div className="cu-modal-backdrop" onClick={() => setLibOpen(false)}>
          <div
            className="cu-modal cu-lib-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{s.cpLibraryTitle}</h2>
            <p className="cu-hint">{s.cpLibraryHint}</p>
            {featured.length > 0 && (
              <>
                <h3 className="cu-lib-section">⭐ {s.cpFeaturedSection}</h3>
                <ul className="cu-lib-list">
                  {featured.map((p) => (
                    <li key={p.id}>
                      <span>
                        ⭐ {p.title || s.cpUntitled} · {fmt(s.cpBy, { name: p.creator_name })} ·{" "}
                        {fmt(s.mateIn, { n: p.moves_to_mate })}
                      </span>
                      <button
                        type="button"
                        className="cu-btn small primary"
                        onClick={() => useSample(p.fen, p.moves_to_mate)}
                      >
                        {s.cpUseSample}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="cu-lib-section">{s.cpClassicSection}</h3>
            <ul className="cu-lib-list">
              {libPagination.pageItems.map((p) => (
                <li key={p.id}>
                  <span>
                    {fmt(s.cpSampleLabel, { id: p.id })} · {fmt(s.mateIn, { n: p.movesToMate })}
                  </span>
                  <button
                    type="button"
                    className="cu-btn small primary"
                    onClick={() => useSample(p.fen, p.movesToMate)}
                  >
                    {s.cpUseSample}
                  </button>
                </li>
              ))}
            </ul>
            <Pagination
              page={libPagination.page}
              pageCount={libPagination.pageCount}
              onPage={libPagination.setPage}
            />
            <div className="cu-buttons">
              <button
                type="button"
                className="cu-btn"
                onClick={() => setLibOpen(false)}
              >
                {s.cpBack}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
