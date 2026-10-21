"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Board, type MoveAnim } from "./Board";
import SiteFooter from "./SiteFooter";
import { PuzzleMode } from "./PuzzleMode";
import { LibraryView } from "./LibraryView";
import { AnalysisView } from "./AnalysisView";
import { CoachReview } from "./CoachReview";
import { SetupView } from "./SetupView";
import { CvCView } from "./CvCView";
import { HistoryView } from "./HistoryView";
import { VideoExportModal, type VideoGame } from "./VideoExportModal";
import { LeaderboardView } from "./LeaderboardView";
import { RoomView } from "./RoomView";
import { FriendsView } from "./FriendsView";
import {
  acceptChallenge,
  displayNameOf,
  fetchPendingChallenges,
  sendChallenge,
  startPresence,
  subscribeChallenges,
  type ChallengeNotice,
} from "@/lib/supabase/friends";
import { usePwaInstall } from "@/lib/pwa-install";
import { CommunityView } from "./CommunityView";
import { AuthModal } from "./AuthModal";
import dynamic from "next/dynamic";
import { LiveOverlay, type LivePhase } from "./LiveOverlay";
import type { LiveBroadcaster, LiveDestination } from "@/lib/live/client";

// Lazy: pulls in livekit-client only when the user opens Go Live, keeping
// the main bundle lean for everyone who never streams.
const LiveStreamModal = dynamic(
  () => import("./LiveStreamModal").then((m) => m.LiveStreamModal),
  { ssr: false }
);
import { SignupNudge } from "./SignupNudge";
import { EvalBar } from "./EvalBar";
import { requestLiveEval } from "@/lib/jieqi/liveEval";
import { VALUES } from "@/lib/jieqi/ai";
import { burstConfetti } from "@/lib/jieqi/confetti";
import { ProfileView } from "./ProfileView";
import { QuestCard } from "./QuestCard";
import { PushNudge, PushSettings } from "./PushSettings";
import { CorrView } from "./CorrView";
import { CheckinView } from "./CheckinView";
import { NotificationsView } from "./NotificationsView";
import { fetchNotifications } from "@/lib/supabase/notifications";
import { fetchProfile, type UserProfile } from "@/lib/supabase/profile";
import { bumpGuestStat, loadGuestStats } from "@/lib/guestStats";
import { recordGameEvent } from "@/lib/supabase/stats";
import { moveEntryText } from "@/lib/jieqi/notation";
import {
  saveInProgress,
  loadInProgress,
  clearInProgress,
  resumeState,
  startState,
  type PersistedPlay,
} from "@/lib/supabase/inProgress";
import { useAuth } from "@/lib/supabase/AuthContext";
import { getSupabase } from "@/lib/supabase/client";
import {
  decodeGame,
  fetchSharedGame,
  saveGame,
} from "@/lib/supabase/games";
import {
  applyReferral,
  claimReferralReward,
  stashReferralCode,
  takeReferralCode,
} from "@/lib/supabase/referral";
import { canvasToPngFile, renderShareCard } from "@/lib/jieqi/shareCard";
import { shareLink, shareResultCard } from "@/lib/jieqi/share";
import { syncRewards } from "@/lib/supabase/rewards";
import {
  levelForXp,
  levelProgress,
  xpForLevel,
  START_RATING,
} from "@/lib/jieqi/rating";
import { findBestMove, getLevelConfig, LEVELS, type SearchStats } from "@/lib/jieqi/ai";
import {
  applyMove,
  capturedLists,
  effectiveType,
  findKing,
  gameStatus,
  initialState,
  legalMovesForSquare,
  moveToUci,
  parseUci,
  remainingDark,
  toFen,
  viewBoard,
  type GameStatus,
} from "@/lib/jieqi/engine";
import { detectLang, STR, type Lang } from "@/lib/jieqi/i18n";
import { detectOpening } from "@/lib/jieqi/openings";
import {
  isMuted,
  playBrilliant,
  playCapture,
  playCheck,
  playCheckmateFanfare,
  playHint,
  playLose,
  playMove,
  playMoveStart,
  playSadTrombone,
  playSelect,
  playWin,
  setMuted,
} from "@/lib/jieqi/sound";
import {
  Color,
  JieqiState,
  Level,
  Move,
  PIECE_CHARS,
  PieceType,
  ViewPiece,
  opposite,
} from "@/lib/jieqi/types";

type GameOverReason = "checkmate" | "stalemate" | "timeout" | "draw-120";

interface Snapshot {
  state: JieqiState;
  lastMove: Move | null;
  logLength: number;
  moveCodes: string[];
  clocks: { red: number; black: number } | null;
}

interface GameState {
  /** Current position (true state — local play only). */
  state: JieqiState;
  lastMove: Move | null;
  log: string[];
  moveCodes: string[];
  /** State at ply 0 (the deal, or a custom setup position). */
  startState: JieqiState;
  /** Undo stack of prior states — popping naturally re-covers flips. */
  history: Snapshot[];
  selected: { x: number; y: number } | null;
  inCheck: boolean;
  gameOver: { winner: Color | null; reason: GameOverReason } | null;
  /** Piece id that flipped face-up on the last move (Board animation). */
  flippingId: number | null;
}

function freshState(): GameState {
  const start = initialState();
  return {
    state: start,
    lastMove: null,
    log: [],
    moveCodes: [],
    startState: start,
    history: [],
    selected: null,
    inCheck: false,
    gameOver: null,
    flippingId: null,
  };
}

function formatNodes(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CotuongupGame() {
  const [state, setState] = useState<GameState>(freshState);
  const [playerColor, setPlayerColor] = useState<Color>("red");
  const [level, setLevel] = useState<Level>(5);
  const [thinking, setThinking] = useState(false);
  const [aiStats, setAiStats] = useState<SearchStats | null>(null);
  const [lang, setLang] = useState<Lang>(detectLang);
  const [anim, setAnim] = useState<MoveAnim | null>(null);
  const [shakeId, setShakeId] = useState(0);
  const [muted, setMutedState] = useState(isMuted());
  const [mode, setMode] = useState<
    | "play"
    | "puzzle"
    | "analysis"
    | "coach"
    | "setup"
    | "cvc"
    | "history"
    | "leaderboard"
    | "library"
    | "room"
    | "community"
    | "friends"
    | "corr"
    | "checkin"
    | "notifications"
  >("play");
  /** Incremented each time a move gives check — drives the check banner. */
  const [checkBannerKey, setCheckBannerKey] = useState(0);
  const prevInCheckRef = useRef(false);

  /**
   * Big "Chiếu tướng! / Check!" overlay banner. Off by default (less
   * distracting for serious players) — check is still shown in normal size
   * in the status panel. Persisted in localStorage.
   */
  const [bigCheckBanner, setBigCheckBanner] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cu-big-check-banner") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("cu-big-check-banner", bigCheckBanner ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [bigCheckBanner]);

  // Flash a big "Chiếu tướng! / Check!" banner for 1s whenever a move
  // gives check (not on checkmate — the result fanfare covers that).
  useEffect(() => {
    const now = mode === "play" && state.inCheck && !state.gameOver;
    if (now && !prevInCheckRef.current && state.moveCodes.length > 0) {
      setCheckBannerKey((k) => k + 1);
    }
    prevInCheckRef.current = now;
  }, [mode, state.inCheck, state.gameOver, state.moveCodes.length]);

  /** Incremented when a game ends by checkmate — drives the mate banner. */
  const [mateBannerKey, setMateBannerKey] = useState(0);

  // Flash a big "Chiếu hết! / Checkmate!" banner for 1s on checkmate.
  useEffect(() => {
    if (
      mode === "play" &&
      state.gameOver?.reason === "checkmate" &&
      state.moveCodes.length > 0
    ) {
      setMateBannerKey((k) => k + 1);
    }
  }, [mode, state.gameOver]);
  /** Refresh header profile (e.g. after earning room XP elsewhere). */
  useEffect(() => {
    const bump = () => setProfileTick((t) => t + 1);
    window.addEventListener("xq:profile-refresh", bump);
    return () => window.removeEventListener("xq:profile-refresh", bump);
  }, []);

  /** Open the auth modal from anywhere (guest teasers, invite cards). */
  useEffect(() => {
    const open = () => {
      setAuthMode("in");
      setAuthOpen(true);
    };
    window.addEventListener("xq:open-auth", open);
    return () => window.removeEventListener("xq:open-auth", open);
  }, []);

  /** Invite code from a shared room link (?room=CODE). */
  const [cvcStart, setCvcStart] = useState<{
    state: JieqiState;
    nonce: number;
  } | null>(null);
  const startCvc = useCallback((startState: JieqiState) => {
    setCvcStart({ state: startState, nonce: Date.now() });
    setMode("cvc");
  }, []);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  /** Incoming 1:1 challenge (realtime) shown as a modal. */
  const [incomingChallenge, setIncomingChallenge] =
    useState<ChallengeNotice | null>(null);
  const [declinedToast, setDeclinedToast] = useState<string | null>(null);

  /** PWA install helper (native prompt on Android/desktop, manual steps on iOS). */
  const pwa = usePwaInstall();
  const [installHelpOpen, setInstallHelpOpen] = useState(false);

  const onInstallClick = async () => {
    if (pwa.canPrompt) {
      const done = await pwa.promptInstall();
      if (done) setMenuOpen(false);
    } else {
      // iOS or no native prompt: show manual instructions.
      setInstallHelpOpen(true);
    }
  };
  /** Shared puzzle date from a ?puzzle=YYYY-MM-DD link. */
  const [sharedPuzzleDate, setSharedPuzzleDate] = useState<string | null>(null);
  /** Deep-link state: set after async fetch of a shared game. */
  const [deepLinkGame, setDeepLinkGame] = useState<string | null>(null);
  /** Shared community puzzle id from a ?cpuzzle=<uuid> link. */
  const [sharedCommunityId, setSharedCommunityId] = useState<string | null>(null);
  const [deepLinkCorrId, setDeepLinkCorrId] = useState<string | null>(null);
  const [deepLinkChallengeId, setDeepLinkChallengeId] = useState<string | null>(null);
  /** Hub deep link: ?challenge=<handle> — an OUTGOING challenge to that
   *  player (the UUID form above is an INCOMING challenge id). */
  const [hubChallengeHandle, setHubChallengeHandle] = useState<string | null>(null);
  const [hubChallengeTarget, setHubChallengeTarget] = useState<{ id: string; name: string } | null>(null);
  const [hubChallengeBusy, setHubChallengeBusy] = useState(false);
  const [hubChallengeMsg, setHubChallengeMsg] = useState("");
  /** SynerWorlds one-tap login hand-off: ?sso=<magic-link token hash>. */
  const [ssoToken, setSsoToken] = useState<string | null>(null);

  // Parse deep-link params (?room=, ?corr=, ?challenge=, etc.).
  // Runs on mount AND on window focus, because tapping a push notification
  // while the app is already open navigates the existing tab via the service
  // worker — the mount-only effect would miss it.
  const parseDeepLink = useCallback(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const code = q.get("room");
      const puzzle = q.get("puzzle");
      const game = q.get("game");
      const cpuzzle = q.get("cpuzzle");
      const corr = q.get("corr");
      const challenge = q.get("challenge");
      const sso = q.get("sso");
      const ref = q.get("ref");
      let consumed = false;
      if (code) {
        setInviteCode(code.toUpperCase().replace(/[^A-Z0-9]/g, ""));
        setMode("room");
        consumed = true;
      } else if (puzzle && /^\d{4}-\d{2}-\d{2}$/.test(puzzle)) {
        setSharedPuzzleDate(puzzle);
        setMode("puzzle");
        consumed = true;
      } else if (cpuzzle && /^[0-9a-f-]{36}$/i.test(cpuzzle)) {
        setSharedCommunityId(cpuzzle);
        setMode("community");
        consumed = true;
      } else if (corr && /^[0-9a-f-]{36}$/i.test(corr)) {
        setDeepLinkCorrId(corr);
        setMode("corr");
        consumed = true;
      } else if (challenge && /^[0-9a-f-]{36}$/i.test(challenge)) {
        setDeepLinkChallengeId(challenge);
        setMode("friends");
        consumed = true;
      } else if (challenge) {
        // From the SynerWorlds hub (profile page / Tìm đối thủ board):
        // ?challenge=<handle> asks to challenge that player.
        setHubChallengeHandle(challenge.toLowerCase());
        consumed = true;
      } else if (game && /^[0-9a-f-]{36}$/i.test(game)) {
        setDeepLinkGame(game);
        consumed = true;
      }
      if (sso) {
        // One-tap login hand-off from the SynerWorlds hub; independent of
        // the deep-link chain above (it can arrive together with ?room=).
        setSsoToken(sso);
        consumed = true;
      }
      if (ref) {
        stashReferralCode(ref);
        setRefBanner(ref);
        consumed = true;
      }
      if (consumed) window.history.replaceState({}, "", window.location.pathname);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    parseDeepLink();
  }, [parseDeepLink]);

  // Re-parse when the window regains focus (e.g. user tapped a notification
  // that navigated the already-open app to a deep link).
  useEffect(() => {
    const onFocus = () => parseDeepLink();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [parseDeepLink]);

  // Load a shared game (?game=<id>) into the analysis replay view.
  useEffect(() => {
    if (!deepLinkGame) return;
    let cancelled = false;
    (async () => {
      const g = await fetchSharedGame(deepLinkGame);
      if (cancelled) return;
      setDeepLinkGame(null);
      if (!g) return;
      const decoded = decodeGame(g);
      setReplay({
        state: decoded.state,
        moves: decoded.moves,
        title: s.sharedGameTitle(g.ai_level),
      });
      setMode("analysis");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkGame]);
  const { user: authUser, configured: authConfigured, signOut, sessionExpired, dismissSessionExpired } = useAuth();
  const [expiredMsg, setExpiredMsg] = useState<string | null>(null);

  // Hub challenge deep link: prompt login first if needed, resolve the
  // handle to a player, then ask for confirmation before sending.
  useEffect(() => {
    if (!hubChallengeHandle) return;
    if (!authConfigured) return;
    if (!authUser) {
      setAuthOpen(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb
        .from("profiles")
        .select("id, full_name, username")
        .eq("handle", hubChallengeHandle)
        .maybeSingle();
      if (cancelled) return;
      setHubChallengeHandle(null);
      if (!data) {
        setHubChallengeMsg(s.hubChallengeNotFound);
        return;
      }
      const row = data as { id: string; full_name: string | null; username: string | null };
      if (row.id === authUser.id) return;
      setHubChallengeTarget({ id: row.id, name: displayNameOf(row) });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubChallengeHandle, authUser, authConfigured]);

  const doHubChallenge = async () => {
    if (!hubChallengeTarget || hubChallengeBusy) return;
    setHubChallengeBusy(true);
    setHubChallengeMsg("");
    try {
      const { room_code } = await sendChallenge(
        hubChallengeTarget.id,
        hubChallengeTarget.name,
      );
      setHubChallengeTarget(null);
      if (room_code) {
        setInviteCode(room_code);
        setMode("room");
      }
    } catch {
      setHubChallengeMsg(s.hubChallengeError);
    } finally {
      setHubChallengeBusy(false);
    }
  };

  // Auto-clear the hub challenge message toast.
  useEffect(() => {
    if (!hubChallengeMsg) return;
    const t = setTimeout(() => setHubChallengeMsg(""), 4500);
    return () => clearTimeout(t);
  }, [hubChallengeMsg]);

  // Session ended on its own (expired / refresh failed): say so.
  useEffect(() => {
    if (!sessionExpired) return;
    setExpiredMsg(s.sessionExpired);
    const t = setTimeout(() => {
      setExpiredMsg(null);
      dismissSessionExpired();
    }, 7000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExpired]);

  // Hub one-tap login: redeem the one-time token; the auth listener picks
  // the session up from there. Failures are said out loud (toast), never
  // swallowed — the player can still sign in manually.
  useEffect(() => {
    if (!ssoToken) return;
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      if (!sb) {
        setSsoToken(null);
        return;
      }
      const { error } = await sb.auth.verifyOtp({
        token_hash: ssoToken,
        type: "magiclink",
      });
      if (cancelled) return;
      setSsoToken(null);
      if (error) setHubChallengeMsg(s.ssoError);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssoToken]);
  /** Unread notification count for the header bell badge. */
  const [unreadCount, setUnreadCount] = useState(0);
  const refreshUnread = useCallback(async () => {
    if (!authUser) {
      setUnreadCount(0);
      return;
    }
    try {
      const { unread } = await fetchNotifications();
      setUnreadCount(unread);
    } catch {
      /* badge is best-effort */
    }
  }, [authUser]);
  useEffect(() => {
    refreshUnread();
    const t = window.setInterval(refreshUnread, 60 * 1000);
    return () => window.clearInterval(t);
  }, [refreshUnread]);

  // Online presence + challenge notifications while logged in.
  useEffect(() => {
    if (!authUser) return;
    const stopPresence = startPresence(authUser.id);
    fetchPendingChallenges().then((cs) => {
      if (cs[0]) setIncomingChallenge(cs[0]);
    });
    const unsub = subscribeChallenges(
      authUser.id,
      (c) => setIncomingChallenge(c),
      (name) => {
        setDeclinedToast(s.challengeDeclined(name));
        window.setTimeout(() => setDeclinedToast(null), 4000);
      }
    );
    return () => {
      stopPresence();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);
  const [authOpen, setAuthOpen] = useState(false);
  // 📡 Go Live — stream the game tab to the player's own YouTube/Facebook
  // via a LiveKit relay. The broadcaster lives here (not in the modal) so
  // the stream survives the modal closing and the page can switch into
  // stream mode (LiveOverlay brand bar + intro/outro cards).
  const [liveOpen, setLiveOpen] = useState(false);
  const [livePhase, setLivePhase] = useState<LivePhase | null>(null);
  const [liveStartedAt, setLiveStartedAt] = useState(0);
  const liveBcRef = useRef<LiveBroadcaster | null>(null);
  const liveTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const liveClearTimers = () => {
    liveTimersRef.current.forEach(clearTimeout);
    liveTimersRef.current = [];
  };

  const endLiveNow = async (fromShareEnd: boolean) => {
    liveClearTimers();
    const bc = liveBcRef.current;
    liveBcRef.current = null;
    setLivePhase(null);
    if (bc) await bc.stop();
    if (fromShareEnd) setShareToast(STR[lang].liveShareEnded);
  };

  const handleLiveStart = async (destinations: LiveDestination[]) => {
    if (liveBcRef.current) return;
    const { LiveBroadcaster } = await import("@/lib/live/client");
    const bc = new LiveBroadcaster();
    liveBcRef.current = bc;
    bc.onShareEnded = () => {
      void endLiveNow(true);
    };
    try {
      await bc.start(destinations);
    } catch (e) {
      liveBcRef.current = null;
      throw e;
    }
    setLiveStartedAt(Date.now());
    setLivePhase("intro");
    setLiveOpen(false);
    liveTimersRef.current.push(
      setTimeout(() => {
        setLivePhase((p) => (p === "intro" ? "live" : p));
      }, 2000)
    );
  };

  const handleLiveStop = () => {
    if (!liveBcRef.current) return;
    liveClearTimers();
    setLivePhase("outro");
    liveTimersRef.current.push(
      setTimeout(() => {
        void endLiveNow(false);
      }, 2000)
    );
  };

  useEffect(
    () => () => {
      liveClearTimers();
      void liveBcRef.current?.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [victoryNudge, setVictoryNudge] = useState(true); // session-scoped
  const [refBanner, setRefBanner] = useState<string | null>(null);
  const [refDismissed, setRefDismissed] = useState(false);
  // Live eval bar (win probability) + brilliant-move celebration.
  const [evalInfo, setEvalInfo] = useState({
    winProbRed: 0.5,
    cpRed: 0,
    mate: false,
  });
  const [brilliantKey, setBrilliantKey] = useState(0);
  const evalCancelRef = useRef<(() => void) | null>(null);
  const brilliantGenRef = useRef(0);
  const brilliantTimer = useRef<number | null>(null);
  // Checkmate drama: big board shake + gold flash + confetti on win.
  const [bigShakeId, setBigShakeId] = useState(0);
  const [mateFxKey, setMateFxKey] = useState(0);
  const mateFxTimer = useRef<number | null>(null);
  const [authMode, setAuthMode] = useState<"in" | "up">("in");
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [headerProfile, setHeaderProfile] = useState<UserProfile | null>(null);
  const [profileTick, setProfileTick] = useState(0);
  const [replay, setReplay] = useState<{
    state: JieqiState;
    moves: string[];
    title: string;
  } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [resumedMsg, setResumedMsg] = useState(false);
  /** Saved game id of the last finished vs-computer game (for sharing). */
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [videoGame, setVideoGame] = useState<VideoGame | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timeControl, setTimeControl] = useState<number | null>(null);
  const [clocks, setClocks] = useState<{ red: number; black: number } | null>(null);
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [hintThinking, setHintThinking] = useState(false);
  const [hintDepth, setHintDepth] = useState(0);
  const [hintToast, setHintToast] = useState<string | null>(null);
  const hintToastTimer = useRef<number | null>(null);
  const hintWorkerRef = useRef<Worker | null>(null);
  const hintGenRef = useRef(0);

  /** Stop any running hint search (new move / new game / unmount). */
  const cancelHintSearch = useCallback(() => {
    hintGenRef.current += 1;
    if (hintWorkerRef.current) {
      hintWorkerRef.current.terminate();
      hintWorkerRef.current = null;
    }
    setHintThinking(false);
    setHintDepth(0);
  }, []);

  useEffect(() => cancelHintSearch, [cancelHintSearch]);

  /** Material (centipawns) of one side's REVEALED pieces. Covered pieces
   *  are excluded — their identities are unknown even to the owner, so a
   *  "sacrifice" is judged on public material only. */
  const materialOf = (st: JieqiState, color: Color): number => {
    let m = 0;
    for (const row of st.board)
      for (const p of row)
        if (p && p.color === color && !p.covered) m += VALUES[p.trueType];
    return m;
  };

  /**
   * Brilliant-move check: after the PLAYER's move, search the pre-move
   * position in the background. If the engine's best move matches what the
   * player played AND it was a genuine sacrifice (or a mating move),
   * celebrate with the brilliant banner + fanfare.
   */
  const checkBrilliant = useCallback(
    (stateBefore: JieqiState, move: Move, stateAfter: JieqiState, st: GameStatus) => {
      const gen = ++brilliantGenRef.current;
      const mover = playerColorRef.current;
      requestLiveEval(
        stateBefore,
        (u) => {
          if (gen !== brilliantGenRef.current || !u.done || !u.bestMove) return;
          const bm = u.bestMove;
          const isBest =
            bm.fromX === move.fromX &&
            bm.fromY === move.fromY &&
            bm.toX === move.toX &&
            bm.toY === move.toY;
          if (!isBest) return;
          const mated =
            st.over && st.reason === "checkmate" && st.winner === mover;
          // A mating move gets the full checkmate celebration (banner +
          // shake + flash + confetti) — the brilliant banner would overlap
          // it, so skip.
          if (mated) return;
          const sacrificed =
            materialOf(stateAfter, mover) <
            materialOf(stateBefore, mover) - 150;
          if (sacrificed) {
            playBrilliant();
            setBrilliantKey((k) => k + 1);
            if (brilliantTimer.current)
              window.clearTimeout(brilliantTimer.current);
            brilliantTimer.current = window.setTimeout(
              () => setBrilliantKey(0),
              2300
            );
          }
        },
        { maxDepth: 4, timeCapMs: 1500 }
      );
    },
    []
  );

  // Live eval bar: re-evaluate after every board change in vs-computer games.
  // Progress messages stream per depth, so the bar swings live as search deepens.
  useEffect(() => {
    if (mode !== "play") return;
    if (evalCancelRef.current) evalCancelRef.current();
    const cancel = requestLiveEval(state.state, (u) => {
      setEvalInfo({ winProbRed: u.winProbRed, cpRed: u.cpRed, mate: u.mate });
    });
    evalCancelRef.current = cancel;
    return () => {
      cancel();
      if (evalCancelRef.current === cancel) evalCancelRef.current = null;
    };
  }, [state.state, mode]);

  const s = STR[lang];
  const num = (v: string) => (lang === "vi" ? v.replace(".", ",") : v);
  const aiColor = opposite(playerColor);
  const levelCfg = getLevelConfig(level);

  const stateRef = useRef(state);
  stateRef.current = state;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const levelRef = useRef(level);
  levelRef.current = level;
  // Game-event tracking (site stats, members + guests).
  const gameStartedRef = useRef(false);
  const finishRecordedRef = useRef<string | null>(null);
  const eventMeta = useCallback(
    () => ({
      level: levelRef.current,
      playerColor: playerColorRef.current,
      timeControl: timeControlRef.current,
    }),
    []
  );
  const animId = useRef(0);
  const animTimer = useRef<number | null>(null);
  const clocksRef = useRef<{ red: number; black: number } | null>(null);
  const timeControlRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("cu-lang", lang);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    return () => {
      if (animTimer.current) window.clearTimeout(animTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const toggleMute = useCallback(() => {
    setMuted(!muted);
    setMutedState(!muted);
  }, [muted]);

  const resetClocks = useCallback((tc: number | null) => {
    const v = tc === null ? null : { red: tc * 1000, black: tc * 1000 };
    clocksRef.current = v;
    setClocks(v);
  }, []);

  const onTimeout = useCallback((loser: Color) => {    const s = stateRef.current;
    if (s.gameOver) return;
    const winner = opposite(loser);
    setState({ ...s, selected: null, gameOver: { winner, reason: "timeout" } });
    if (winner === playerColorRef.current) playWin();
    else playLose();
  }, []);

  const commitMove = useCallback(
    (move: Move) => {
      const prev = stateRef.current;
      if (prev.gameOver) return;
      // First move of the game = a real play (members and guests alike).
      if (prev.history.length === 0 && !gameStartedRef.current) {
        gameStartedRef.current = true;
        recordGameEvent("start", eventMeta());
      }
      const piece = prev.state.board[move.fromY][move.fromX];
      if (!piece) return;
      const capturedTrue = prev.state.board[move.toY][move.toX];

      const { state: ns, record } = applyMove(prev.state, move);
      const st = gameStatus(ns);
      const entry = moveEntryText(
        piece.color,
        effectiveType(piece),
        move,
        lang,
        record
      );
      // Animation models: the mover as it lands (face-up if it flipped),
      // and the captured piece REVEALED (ruling 3) if it was covered.
      const moverView: ViewPiece = {
        id: piece.id,
        color: piece.color,
        faceType: piece.trueType,
        covered: false,
        hostType: piece.fakeType,
      };
      const capturedView: ViewPiece | null = capturedTrue
        ? {
            id: capturedTrue.id,
            color: capturedTrue.color,
            faceType: capturedTrue.trueType,
            covered: false,
            hostType: capturedTrue.fakeType,
          }
        : null;

      setState({
        state: ns,
        lastMove: move,
        log: [...prev.log, entry],
        moveCodes: [...prev.moveCodes, moveToUci(move, record.revealedType)],
        startState: prev.startState,
        history: [
          ...prev.history,
          {
            state: prev.state,
            lastMove: prev.lastMove,
            logLength: prev.log.length,
            moveCodes: prev.moveCodes,
            clocks: clocksRef.current,
          },
        ],
        selected: null,
        inCheck: st.inCheck,
        gameOver: st.over
          ? {
              winner: st.winner,
              reason: st.reason as "checkmate" | "stalemate" | "draw-120",
            }
          : null,
        flippingId: record.flipped ? piece.id : null,
      });
      cancelHintSearch();
      setHintMove(null);
      if (hintToastTimer.current) window.clearTimeout(hintToastTimer.current);
      setHintToast(null);

      // Brilliant-move check for the player's own moves (vs computer).
      if (prev.state.turn === playerColorRef.current) {
        checkBrilliant(prev.state, move, ns, st);
      }

      // Choreograph the move animation + sounds.
      // Every move glides a little slower (0.9s) with a turquoise trail
      // (see Board), so sounds and the overlay clear a bit later.
      animId.current += 1;
      setAnim({ id: animId.current, move, piece: moverView, captured: capturedView });
      playMoveStart();
      if (animTimer.current) window.clearTimeout(animTimer.current);
      if (capturedView) {
        setShakeId((i) => i + 1);
        window.setTimeout(() => playCapture(), 480);
        if (st.inCheck && !st.over) window.setTimeout(() => playCheck(), 900);
        animTimer.current = window.setTimeout(() => setAnim(null), 1200);
      } else {
        window.setTimeout(() => playMove(), 560);
        if (st.inCheck && !st.over) window.setTimeout(() => playCheck(), 820);
        animTimer.current = window.setTimeout(() => setAnim(null), 1000);
      }
      if (st.over) {
        const won = st.winner === playerColorRef.current;
        if (st.reason === "checkmate") {
          // Checkmate drama: big board shake + gold flash, right away.
          setBigShakeId((i) => i + 1);
          setMateFxKey((k) => k + 1);
          if (mateFxTimer.current) window.clearTimeout(mateFxTimer.current);
          mateFxTimer.current = window.setTimeout(() => setMateFxKey(0), 1300);
        }
        window.setTimeout(
          () => {
            if (st.reason === "checkmate") {
              // Fun jingle for checkmate: fanfare + confetti when you win,
              // sad trombone when you lose.
              if (won) {
                playCheckmateFanfare();
                burstConfetti();
              } else playSadTrombone();
            } else {
              if (won) playWin();
              else playLose();
            }
          },
          capturedView ? 750 : 500
        );
      }
    },
    [eventMeta, lang, cancelHintSearch]
  );

  // Computer move (waits for any move animation to finish first).
  // Paused while the puzzle tab is open; the vs-computer clock pauses too.
  useEffect(() => {
    if (mode !== "play" || state.gameOver || state.state.turn !== aiColor || anim) return;
    setThinking(true);
    const t = window.setTimeout(() => {
      // Repetition steering (ruling 7 addendum): occurrence counts of
      // every MASKED position this game has reached, from the state's
      // own history (findBestMove/steerMoves consumes masked keys).
      const seen = new Map<string, number>();
      for (const k of state.state.maskedKeyHistory) {
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      const { move, stats } = findBestMove(state.state, level, seen);
      setAiStats(stats);
      // Charge the computer's clock for its thinking time (the main thread
      // is blocked during search, so the interval timer can't tick).
      if (clocksRef.current && timeControlRef.current !== null) {
        const left = clocksRef.current[aiColor] - stats.timeMs;
        if (left <= 0) {
          clocksRef.current = { ...clocksRef.current, [aiColor]: 0 };
          setClocks(clocksRef.current);
          setThinking(false);
          onTimeout(aiColor);
          return;
        }
        clocksRef.current = { ...clocksRef.current, [aiColor]: left };
        setClocks(clocksRef.current);
      }
      setThinking(false);
      if (move) commitMove(move);
    }, 150);
    return () => window.clearTimeout(t);
  }, [mode, state.state, state.gameOver, aiColor, level, anim, commitMove, onTimeout]);

  // Blitz clock: ticks down the side to move, 5 times a second.
  useEffect(() => {
    if (timeControl === null || mode !== "play" || state.gameOver) return;
    const id = window.setInterval(() => {
      const s = stateRef.current;
      if (s.gameOver) return;
      const prev = clocksRef.current;
      if (!prev) return;
      const t = s.state.turn;
      const left = prev[t] - 200;
      if (left <= 0) {
        clocksRef.current = { ...prev, [t]: 0 };
        setClocks(clocksRef.current);
        onTimeout(t);
      } else {
        clocksRef.current = { ...prev, [t]: left };
        setClocks(clocksRef.current);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [timeControl, mode, state.gameOver, onTimeout]);

  // Auto-save finished games to the cloud when logged in.
  const savedGameRef = useRef<string | null>(null);
  useEffect(() => {
    const go = state.gameOver;
    if (!go || mode !== "play") return;
    // Finish counts for members and guests alike.
    // Result from the player's perspective. A null winner is a draw
    // (draw-120 or timeout of neither side); stalemate/checkmate carry a
    // real winner under Jieqi rules (the stalemated side loses).
    const result: "win" | "loss" | "draw" =
      go.winner === null
        ? "draw"
        : go.winner === playerColorRef.current
          ? "win"
          : "loss";
    const fkey = `${state.moveCodes.join(",")}#${go.winner}${go.reason}`;
    if (gameStartedRef.current && finishRecordedRef.current !== fkey) {
      finishRecordedRef.current = fkey;
      recordGameEvent("finish", { ...eventMeta(), result });
    }
    if (!authUser) {
      bumpGuestStat("games");
      return;
    }
    // The game is over: discard any saved in-progress snapshot.
    clearInProgress();
    const key = `${state.moveCodes.join(",")}#${go.winner}${go.reason}`;
    if (savedGameRef.current === key) return;
    savedGameRef.current = key;
    const s = stateRef.current;
    saveGame({
      moveCodes: s.moveCodes,
      startState: s.startState,
      result,
      level,
      playerColor: playerColorRef.current,
    }).then(({ error: err }) => {
      setSaveMsg(err ? `⚠️ ${err}` : null);
      if (!err) {
        window.setTimeout(() => setSaveMsg(null), 4000);
        syncRewards().then(() => refreshMyStats());
        window.dispatchEvent(new CustomEvent("xq:quest-refresh"));
        // Referral reward for both sides once the referred user plays.
        claimReferralReward().then((xp) => {
          if (xp > 0) {
            setShareToast(`🎉 ${STR[lang].roomXpEarned(xp)}`);
            window.setTimeout(() => setShareToast(null), 4000);
            setProfileTick((t) => t + 1);
          }
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.gameOver, authUser, mode, level, timeControl]);

  // Persist the unfinished game for logged-in users (resume on reopen).
  const moveCount = state.moveCodes.length;
  useEffect(() => {
    if (!authUser || moveCount === 0) return;
    const s = stateRef.current;
    if (s.gameOver) return;
    const payload: PersistedPlay = {
      version: 2,
      savedAt: new Date().toISOString(),
      playerColor: playerColorRef.current,
      level: levelRef.current,
      timeControl: timeControlRef.current,
      clocks: clocksRef.current,
      fen: toFen(s.state),
      startFen: toFen(s.startState),
      moveCodes: s.moveCodes,
      log: s.log,
      inCheck: s.inCheck,
      gameOver: null,
    };
    saveInProgress(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveCount, authUser]);

  // Restore the unfinished game on login / reopen.
  const restoreForUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authUser || restoreForUserRef.current === authUser.id) return;
    restoreForUserRef.current = authUser.id;
    loadInProgress().then((saved) => {
      if (!saved || saved.gameOver) {
        if (saved?.gameOver) clearInProgress();
        return;
      }
      const resumed = resumeState(saved);
      const start = startState(saved);
      if (!resumed || !start) {
        clearInProgress();
        return;
      }
      gameStartedRef.current = true;
      setPlayerColor(saved.playerColor);
      setLevel(saved.level);
      setTimeControl(saved.timeControl);
      timeControlRef.current = saved.timeControl;
      if (saved.clocks) {
        clocksRef.current = { ...saved.clocks };
        setClocks({ ...saved.clocks });
      } else {
        resetClocks(saved.timeControl);
      }
      // Rebuild the undo stack by replaying the move codes from the
      // start state (each snapshot is the state BEFORE that ply).
      const history: Snapshot[] = [];
      let cur = start;
      let lastMove: Move | null = null;
      for (let i = 0; i < saved.moveCodes.length; i++) {
        const mv = parseUci(saved.moveCodes[i]).move;
        history.push({
          state: cur,
          lastMove,
          logLength: i,
          moveCodes: saved.moveCodes.slice(0, i),
          clocks: saved.clocks ? { ...saved.clocks } : null,
        });
        cur = applyMove(cur, mv).state;
        lastMove = mv;
      }
      setState({
        state: resumed,
        lastMove,
        log: [...saved.log],
        moveCodes: [...saved.moveCodes],
        startState: start,
        history,
        selected: null,
        inCheck: saved.inCheck,
        gameOver: null,
        flippingId: null,
      });
      setResumedMsg(true);
      window.setTimeout(() => setResumedMsg(false), 5000);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  // Backfill / catch-up rewards on login.
  useEffect(() => {
    if (authUser) syncRewards().then(() => refreshMyStats());
    else setMyStats(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  // Compact rating display in the header.
  const [myStats, setMyStats] = useState<{ rating: number; xp: number } | null>(
    null
  );
  const refreshMyStats = useCallback(async () => {
    if (!authUser) {
      setMyStats(null);
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb
      .from("profiles")
      .select("rating,xp")
      .eq("id", authUser.id)
      .maybeSingle();
    if (data)
      setMyStats({ rating: data.rating ?? START_RATING, xp: data.xp ?? 0 });
  }, [authUser]);

  // Header identity (avatar + display name), refreshed after profile edits.
  useEffect(() => {
    if (!authUser) {
      setHeaderProfile(null);
      return;
    }
    fetchProfile().then(setHeaderProfile);
  }, [authUser, profileTick]);

  // Welcome bonus for brand-new accounts (+50 XP granted by the DB trigger).
  const [welcomeToast, setWelcomeToast] = useState(false);
  useEffect(() => {
    if (!authUser) return;
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from("profiles")
        .select("welcome_bonus_seen")
        .eq("id", authUser.id)
        .maybeSingle();
      // Referral attribution (from a ?ref= link), before the bonus toast.
      const refCode = takeReferralCode();
      if (refCode) await applyReferral(refCode);
      if (cancelled || !data || data.welcome_bonus_seen !== false) return;
      await sb
        .from("profiles")
        .update({ welcome_bonus_seen: true })
        .eq("id", authUser.id);
      if (cancelled) return;
      setWelcomeToast(true);
      setProfileTick((t) => t + 1);
      window.setTimeout(() => {
        if (!cancelled) setWelcomeToast(false);
      }, 6000);
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const headerName =
    headerProfile?.full_name?.trim() ||
    headerProfile?.username ||
    authUser?.email?.split("@")[0] ||
    "?";
  const headerAvatar = headerProfile?.avatar_url
    ? `${headerProfile.avatar_url}?v=${profileTick}`
    : null;

  const targets = useMemo(
    () =>
      state.selected
        ? legalMovesForSquare(state.state, state.selected.x, state.selected.y)
        : [],
    [state.state, state.selected]
  );

  const onSquareClick = useCallback(
    (x: number, y: number) => {
      if (thinking || anim || state.gameOver || state.state.turn !== playerColor) return;
      const hit = targets.find((t) => t.toX === x && t.toY === y);
      if (hit) {
        commitMove(hit);
        return;
      }
      const piece = state.state.board[y][x];
      if (piece && piece.color === playerColor) playSelect();
      setState((prev) => ({
        ...prev,
        selected:
          piece && piece.color === playerColor ? { x, y } : null,
      }));
    },
    [thinking, anim, state.gameOver, state.state, playerColor, targets, commitMove]
  );

  const undo = useCallback(() => {
    if (thinking || anim) return;
    if (animTimer.current) window.clearTimeout(animTimer.current);
    setAnim(null);
    setHintMove(null);
    brilliantGenRef.current += 1;
    setBrilliantKey(0);
    const prev = stateRef.current;
    const h = [...prev.history];
    if (h.length === 0) return;
    let snap = h.pop()!;
    if (snap.state.turn !== playerColor && h.length > 0) snap = h.pop()!;
    const st = gameStatus(snap.state);
    clocksRef.current = snap.clocks;
    setClocks(snap.clocks);
    setState({
      ...prev,
      state: snap.state,
      lastMove: snap.lastMove,
      log: prev.log.slice(0, snap.logLength),
      moveCodes: snap.moveCodes,
      history: h,
      selected: null,
      inCheck: st.inCheck,
      gameOver: null,
      flippingId: null,
    });
  }, [thinking, anim, playerColor]);

  /** Swap sides with the computer mid-game: player takes the AI's position
   * and vice versa. Useful for learning — hand the AI your losing position
   * and watch how it defends, or take over its winning side. */
  const switchSides = useCallback(() => {
    if (thinking || anim || state.gameOver) return;
    setPlayerColor((c) => opposite(c));
  }, [thinking, anim, state.gameOver]);

  const newGame = useCallback((color: Color) => {
    if (animTimer.current) window.clearTimeout(animTimer.current);
    // Leaving a started but unfinished game = abandoned.
    const s = stateRef.current;
    if (gameStartedRef.current && !s.gameOver) {
      recordGameEvent("abandon", eventMeta());
    }
    gameStartedRef.current = false;
    finishRecordedRef.current = null;
    cancelHintSearch();
    brilliantGenRef.current += 1;
    setBrilliantKey(0);
    setBigShakeId(0);
    setMateFxKey(0);
    // Explicit new game: discard any saved in-progress snapshot.
    clearInProgress();
    setPlayerColor(color);
    setThinking(false);
    setAiStats(null);
    setAnim(null);
    setHintMove(null);
    setHintThinking(false);
    resetClocks(timeControlRef.current);
    setState(freshState());
  }, [resetClocks, eventMeta, cancelHintSearch]);

  const changeTimeControl = useCallback((tc: number | null) => {
    setTimeControl(tc);
    timeControlRef.current = tc;
    newGame(playerColorRef.current);
  }, [newGame]);

  /** Start a vs-computer game from a user-arranged position. The setup
   *  state already carries the side to move. */
  const startCustomGame = useCallback(
    (startState: JieqiState, color: Color) => {
      if (animTimer.current) window.clearTimeout(animTimer.current);
      const s = stateRef.current;
      if (gameStartedRef.current && !s.gameOver) {
        recordGameEvent("abandon", eventMeta());
      }
      gameStartedRef.current = false;
      finishRecordedRef.current = null;
      cancelHintSearch();
      clearInProgress();
      setPlayerColor(color);
      setThinking(false);
      setAiStats(null);
      setAnim(null);
      setHintMove(null);
      setHintThinking(false);
      resetClocks(timeControlRef.current);
      const st = gameStatus(startState);
      setState({
        state: startState,
        lastMove: null,
        log: [],
        moveCodes: [],
        startState,
        history: [],
        selected: null,
        inCheck: st.inCheck,
        gameOver: null,
        flippingId: null,
      });
      setMode("play");
    },
    [resetClocks, eventMeta, cancelHintSearch]
  );

  const onHint = useCallback(() => {
    if (hintThinking || thinking || anim) return;
    const s = stateRef.current;
    if (s.gameOver || s.state.turn !== playerColorRef.current) return;

    const showHint = (move: Move | null) => {
      setHintMove(move);
      setHintThinking(false);
      setHintDepth(0);
      if (!move) return;
      playHint();
      const b = stateRef.current.state.board;
      const piece = b[move.fromY]?.[move.fromX];
      if (hintToastTimer.current) window.clearTimeout(hintToastTimer.current);
      setHintToast(
        piece
          ? `💡 ${moveEntryText(piece.color, effectiveType(piece), move, lang)}`
          : "💡"
      );
      hintToastTimer.current = window.setTimeout(() => setHintToast(null), 4500);
    };

    setHintThinking(true);
    setHintDepth(0);
    const gen = ++hintGenRef.current;
    // Deep search in a Web Worker: iterative deepening with quiescence,
    // stronger than level 10, without freezing the UI.
    try {
      const worker = new Worker(
        new URL("../../lib/jieqi/hint.worker.ts", import.meta.url)
      );
      hintWorkerRef.current = worker;
      worker.onmessage = (
        e: MessageEvent<import("@/lib/jieqi/hint.worker").HintProgress | import("@/lib/jieqi/hint.worker").HintDone>
      ) => {
        if (gen !== hintGenRef.current) return;
        const msg = e.data;
        if (msg.type === "progress") {
          setHintDepth(msg.depth);
        } else {
          if (hintWorkerRef.current) {
            hintWorkerRef.current.terminate();
            hintWorkerRef.current = null;
          }
          showHint(msg.move);
        }
      };
      worker.onerror = () => {
        if (gen !== hintGenRef.current) return;
        if (hintWorkerRef.current) {
          hintWorkerRef.current.terminate();
          hintWorkerRef.current = null;
        }
        // Fallback: quick synchronous search on the main thread.
        const { move } = findBestMove(stateRef.current.state, 7);
        showHint(move);
      };
      // Hint budget scales with the game level: always stronger than the
      // AI at that level, but quick at low levels.
      const lvl = Math.min(10, Math.max(1, Math.round(levelRef.current)));
      const budget =
        lvl <= 4
          ? { maxDepth: 3, timeCapMs: 3000 }
          : lvl <= 7
            ? { maxDepth: 5, timeCapMs: 8000 }
            : lvl <= 9
              ? { maxDepth: 6, timeCapMs: 12000 }
              : { maxDepth: 8, timeCapMs: 15000 };
      worker.postMessage({
        state: s.state,
        maxDepth: budget.maxDepth,
        timeCapMs: budget.timeCapMs,
      });
    } catch {
      const { move } = findBestMove(stateRef.current.state, 7);
      showHint(move);
    }
  }, [hintThinking, thinking, anim, lang]);

  /** Captured trays: pieces are listed under the color that LOST them;
   *  captured covered pieces display revealed (ruling 3). */
  const captured = useMemo(() => {
    const lists = capturedLists(state.state);
    return {
      byYou: lists[aiColor].map((c) => c.trueType),
      byComputer: lists[playerColor].map((c) => c.trueType),
    };
  }, [state.state, aiColor, playerColor]);

  /** "Bộ bài còn úp": identities that could still be hidden, per side. */
  const darkRemaining = useMemo(
    () => remainingDark(state.state),
    [state.state]
  );

  const checkAt = useMemo(
    () => (state.inCheck ? findKing(state.state.board, state.state.turn) : null),
    [state.state, state.inCheck]
  );

  /** Share the finished game as a result-card image (+ deep link for logged-in). */
  const shareGameResult = async () => {
    const st = stateRef.current;
    const go = st.gameOver;
    if (!go || sharing) return;
    setSharing(true);
    try {
      const link = await shareLink("/");
      const won = go.winner === playerColorRef.current;
      const title = won
        ? s.shareWinTitle(s.levelLabel(level))
        : go.winner === null
          ? s.shareDrawTitle
          : s.shareLossTitle;
      // The card shows the final position AS THE PLAYER SAW IT: pieces
      // still covered stay covered (brass backs) — a finished local game
      // could reveal them, but the as-seen board is the honest story of
      // the game and never spoils a rematch screenshot.
      const canvas = renderShareCard({
        board: viewBoard(st.state),
        title,
        subtitle: s.shareGameSubtitle(st.moveCodes.length, openingName),
        footer: s.shareFooter,
      });
      const file = await canvasToPngFile(canvas, "co-up.png");
      const outcome = await shareResultCard({
        file,
        fileName: "co-up.png",
        title,
        text: `${title}\n${s.shareGameSubtitle(st.moveCodes.length, openingName)}`,
        url: link,
      });
      setShareToast(outcome === "shared" ? s.shareDone : s.shareDownloaded);
      window.setTimeout(() => setShareToast(null), 4000);
    } catch {
      /* ignore */
    } finally {
      setSharing(false);
    }
  };

  const winnerName = (w: Color) => (w === "red" ? s.redName : s.blackName);

  /** Open the video-export modal for the just-finished game. */
  const openVideoExport = async () => {
    const st = stateRef.current;
    const go = st.gameOver;
    if (!go || st.moveCodes.length === 0) return;
    const won = go.winner === playerColorRef.current;
    const title = won
      ? s.shareWinTitle(s.levelLabel(level))
      : go.winner === null
        ? s.shareDrawTitle
        : s.shareLossTitle;
    setVideoGame({
      state: st.startState,
      moves: st.moveCodes,
      title,
      subtitle: s.shareGameSubtitle(st.moveCodes.length, openingName),
      shareUrl: await shareLink("/"),
    });
  };
  const statusText = state.gameOver
    ? state.gameOver.reason === "draw-120"
      ? s.draw120
      : state.gameOver.winner === null
        ? s.shareDrawTitle
        : state.gameOver.reason === "timeout"
          ? s.timeout(winnerName(state.gameOver.winner))
          : state.gameOver.reason === "checkmate"
            ? s.checkmate(winnerName(state.gameOver.winner))
            : s.stalemate(winnerName(state.gameOver.winner))
    : s.toMove(
        state.state.turn === "red" ? s.redName : s.blackName,
        state.inCheck
      );

  const opening = useMemo(() => detectOpening(state.moveCodes), [state.moveCodes]);
  const openingName = opening
    ? lang === "vi"
      ? opening.name.vi
      : opening.name.en
    : null;

  const logPairs = useMemo(() => {
    const pairs: Array<[string, string?]> = [];
    for (let i = 0; i < state.log.length; i += 2)
      pairs.push([state.log[i], state.log[i + 1]]);
    return pairs;
  }, [state.log]);

  // Level progress ring around the header avatar.
  const myLevel = myStats ? levelForXp(myStats.xp) : 1;
  const myLevelProg = myStats ? levelProgress(myStats.xp) : 0;
  const myXpIntoLevel = myStats ? myStats.xp - xpForLevel(myLevel) : 0;
  const myXpForNext =
    myStats && xpForLevel(myLevel + 1) > xpForLevel(myLevel)
      ? xpForLevel(myLevel + 1) - xpForLevel(myLevel)
      : 1;

  return (
    <div className="cu-page">
      <PushNudge lang={lang} />
      <header className="cu-header">
        <div className="cu-topbar">
          <button
            type="button"
            className="cu-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label={s.menu}
            title={s.menu}
          >
            ☰
          </button>
          <div className="cu-brand">
            <h1 className="cu-title">{s.title}</h1>
          </div>
          <div className="cu-account">
            {authConfigured &&
              (authUser ? (
                <div className="cu-user" role="group" aria-label="Account">
                  {myStats && (
                    <button
                      type="button"
                      className="cu-rating-chip"
                      onClick={() => setMode("leaderboard")}
                      title={s.modeLeaderboard}
                    >
                      ⭐ {myStats.rating} · Lv {myLevel}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cu-account-btn"
                    onClick={() => setAccountMenuOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={accountMenuOpen}
                    title={headerName}
                    style={{ position: "relative" }}
                  >
                    {unreadCount > 0 && (
                      <span
                        aria-hidden="true"
                        title={s.modeNotifications}
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: "#fa5252",
                          border: "2px solid var(--cu-bg, #fff)",
                          zIndex: 1,
                        }}
                      />
                    )}
                    <span
                      className="cu-level-ring"
                      style={{ "--p": myLevelProg } as CSSProperties}
                      title={`Lv ${myLevel} · ${myXpIntoLevel}/${myXpForNext} XP`}
                    >
                      <span className="cu-account-avatar">
                        {headerAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={headerAvatar} alt="" />
                        ) : (
                          "👤"
                        )}
                      </span>
                    </span>
                    <span className="cu-account-name">{headerName}</span>
                    <span aria-hidden="true" className="cu-caret">
                      ▾
                    </span>
                  </button>
                  {accountMenuOpen && (
                    <>
                      <div
                        className="cu-menu-backdrop"
                        onClick={() => setAccountMenuOpen(false)}
                      />
                      <div className="cu-account-menu" role="menu">
                        <div className="cu-account-menu-head">
                          <span className="cu-account-avatar large">
                            {headerAvatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={headerAvatar} alt="" />
                            ) : (
                              "👤"
                            )}
                          </span>
                          <div className="cu-account-menu-id">
                            <strong>{headerName}</strong>
                            <span className="cu-muted">{authUser.email}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="menuitem"
                          className="cu-account-menu-item"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            setProfileOpen(true);
                          }}
                        >
                          👤 {s.profile}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="cu-account-menu-item"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            setMode("notifications");
                          }}
                        >
                          🔔 {s.modeNotifications}
                          {unreadCount > 0 && (
                            <span
                              aria-hidden="true"
                              style={{
                                marginLeft: 6,
                                minWidth: 18,
                                height: 18,
                                borderRadius: 9,
                                background: "#fa5252",
                                color: "#fff",
                                fontSize: 11,
                                lineHeight: "18px",
                                textAlign: "center",
                                padding: "0 5px",
                              }}
                            >
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="cu-account-menu-item"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            setMode("friends");
                          }}
                        >
                          {s.modeFriends}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="cu-account-menu-item"
                          aria-expanded={settingsExpanded}
                          onClick={() => setSettingsExpanded((v) => !v)}
                        >
                          ⚙️ {s.settings}
                          <span aria-hidden="true" className="cu-caret">
                            {settingsExpanded ? "▾" : "▸"}
                          </span>
                        </button>
                        {settingsExpanded && (
                          <div className="cu-account-menu-settings">
                            <div
                              className="cu-lang"
                              role="group"
                              aria-label="Language / Ngôn ngữ"
                            >
                              <button
                                type="button"
                                className={lang === "en" ? "active" : ""}
                                onClick={() => setLang("en")}
                              >
                                EN
                              </button>
                              <button
                                type="button"
                                className={lang === "vi" ? "active" : ""}
                                onClick={() => setLang("vi")}
                              >
                                VI
                              </button>
                            </div>
                            <button
                              type="button"
                              className="cu-btn small"
                              onClick={toggleMute}
                              aria-label={muted ? s.soundOn : s.soundOff}
                            >
                              {muted ? "🔇" : "🔊"}{" "}
                              {muted ? s.soundOn : s.soundOff}
                            </button>
                            <label className="cu-check-toggle">
                              <input
                                type="checkbox"
                                checked={bigCheckBanner}
                                onChange={(e) =>
                                  setBigCheckBanner(e.target.checked)
                                }
                              />
                              <span>{s.bigCheckBanner}</span>
                            </label>
                            <PushSettings lang={lang} />
                          </div>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          className="cu-account-menu-item"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            signOut();
                          }}
                        >
                          🚪 {s.authLogout}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="cu-user" role="group" aria-label="Account">
                  <button
                    type="button"
                    className="cu-account-btn"
                    onClick={() => setAccountMenuOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={accountMenuOpen}
                    title={s.settings}
                  >
                    <span className="cu-account-avatar">⚙️</span>
                  </button>
                  {accountMenuOpen && (
                    <>
                      <div
                        className="cu-menu-backdrop"
                        onClick={() => setAccountMenuOpen(false)}
                      />
                      <div className="cu-account-menu" role="menu">
                        <div className="cu-account-menu-settings">
                          <div
                            className="cu-lang"
                            role="group"
                            aria-label="Language / Ngôn ngữ"
                          >
                            <button
                              type="button"
                              className={lang === "en" ? "active" : ""}
                              onClick={() => setLang("en")}
                            >
                              EN
                            </button>
                            <button
                              type="button"
                              className={lang === "vi" ? "active" : ""}
                              onClick={() => setLang("vi")}
                            >
                              VI
                            </button>
                          </div>
                          <button
                            type="button"
                            className="cu-btn small"
                            onClick={toggleMute}
                            aria-label={muted ? s.soundOn : s.soundOff}
                          >
                            {muted ? "🔇" : "🔊"}{" "}
                            {muted ? s.soundOn : s.soundOff}
                          </button>
                          <label className="cu-check-toggle">
                            <input
                              type="checkbox"
                              checked={bigCheckBanner}
                              onChange={(e) =>
                                setBigCheckBanner(e.target.checked)
                              }
                            />
                            <span>{s.bigCheckBanner}</span>
                          </label>
                        </div>
                        <button
                          type="button"
                          role="menuitem"
                          className="cu-account-menu-item"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            setAuthMode("in");
                            setAuthOpen(true);
                          }}
                        >
                          🔑 {s.authLogin}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="cu-account-menu-item"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            setAuthMode("up");
                            setAuthOpen(true);
                          }}
                        >
                          📝 {s.authSignup}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>
        {mode === "play" && (
          <div className="cu-quick">
            <button
              type="button"
              className="cu-btn"
              onClick={undo}
              disabled={thinking || !!anim || state.history.length === 0}
            >
              ↩ {s.undo}
            </button>
            <button
              type="button"
              className="cu-btn"
              onClick={switchSides}
              disabled={thinking || !!anim || state.gameOver !== null}
              title={s.switchSides}
            >
              {s.switchSides}
            </button>
            <button
              type="button"
              className="cu-btn"
              onClick={onHint}
              disabled={
                hintThinking ||
                thinking ||
                !!anim ||
                state.gameOver !== null ||
                state.state.turn !== playerColor
              }
            >
              {hintThinking
                ? `${s.hintThinking}${hintDepth > 0 ? ` · ${s.hintDepth} ${hintDepth}` : ""}`
                : s.hintBtn}
            </button>
            <span className="cu-quick-spacer" />
            <button
              type="button"
              className="cu-btn cu-btn-primary"
              onClick={() => newGame(playerColor)}
            >
              ＋ {s.newGame}
            </button>
          </div>
        )}
      </header>

      {refBanner && !authUser && !refDismissed && (
        <div className="cu-ref-banner" role="note">
          <span>{s.refBannerText}</span>
          <button
            type="button"
            className="cu-btn cu-btn-primary small"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("xq:open-auth"))
            }
          >
            🔑 {s.nudgeSignup}
          </button>
          <button
            type="button"
            className="cu-btn-icon"
            onClick={() => setRefDismissed(true)}
            aria-label={s.nudgeLater}
          >
            ✕
          </button>
        </div>
      )}

      {menuOpen && (
        <div className="cu-drawer-root">
          <div
            className="cu-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="cu-drawer" role="dialog" aria-label={s.menu}>
            <div className="cu-drawer-head">
              <strong>{s.menu}</strong>
              <button
                type="button"
                className="cu-btn cu-btn-icon"
                onClick={() => setMenuOpen(false)}
                aria-label={s.authClose}
              >
                ✕
              </button>
            </div>
            <div className="cu-drawer-body">
              <section>
                <h2>{s.mode}</h2>
                <div className="cu-drawer-modes" role="tablist" aria-label="Mode">
                  {(
                    [
                      ["play", s.modePlay],
                      ["puzzle", s.modePuzzle],
                      ["library", s.modeLibrary],
                      ["setup", s.modeSetup],
                      ["history", s.modeHistory],
                      ["leaderboard", s.modeLeaderboard],
                      ["room", s.modeRoom],
                      ["corr", s.modeCorr],
                      ["checkin", s.modeCheckin],
                      ["community", s.modeCommunity],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      data-active={mode === m}
                      onClick={() => {
                        setMode(m);
                        setMenuOpen(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2>{s.blogLink}</h2>
                <div className="cu-drawer-modes">
                  <a href="https://synerworlds.com/blog?cat=co-up" className="cu-blog-drawer-link">
                    {s.blogLink}
                  </a>
                </div>
              </section>
              <section>
                <h2>{s.liveTitle}</h2>
                <div className="cu-drawer-modes">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setLiveOpen(true);
                    }}
                  >
                    {s.liveMenu}
                  </button>
                </div>
              </section>
              {pwa.showInstall && (
                <section>
                  <div className="cu-drawer-modes">
                    <button
                      type="button"
                      className="cu-btn cu-btn-primary"
                      onClick={onInstallClick}
                    >
                      {s.installApp}
                    </button>
                  </div>
                </section>
              )}
              {mode === "play" && (
                <section>
                  <h2>{s.settings}</h2>
                  <label className="cu-field">
                    <span>{s.level}</span>
                    <select
                      value={level}
                      onChange={(e) => setLevel(Number(e.target.value))}
                      className="cu-select"
                    >
                      {LEVELS.map((l) => (
                        <option key={l.level} value={l.level}>
                          {s.levelLabel(l.level)} — {s.levelDesc[l.level - 1]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cu-field">
                    <span>{s.youPlay}</span>
                    <select
                      value={playerColor}
                      onChange={(e) => newGame(e.target.value as Color)}
                      className="cu-select"
                    >
                      <option value="red">{s.redFirst}</option>
                      <option value="black">{s.blackSecond}</option>
                    </select>
                  </label>
                  <label className="cu-field">
                    <span>{s.timeControl}</span>
                    <select
                      value={timeControl === null ? "inf" : String(timeControl)}
                      onChange={(e) =>
                        changeTimeControl(
                          e.target.value === "inf" ? null : Number(e.target.value)
                        )
                      }
                      className="cu-select"
                    >
                      <option value="inf">{s.unlimited}</option>
                      <option value={60}>{s.minutes(1)}</option>
                      <option value={180}>{s.minutes(3)}</option>
                      <option value={300}>{s.minutes(5)}</option>
                      <option value={600}>{s.minutes(10)}</option>
                    </select>
                  </label>
                </section>
              )}
              <div className="cu-drawer-legal">
                <a href="/terms" target="_blank" rel="noreferrer">
                  {s.termsOfService}
                </a>
                <span>·</span>
                <a href="/privacy" target="_blank" rel="noreferrer">
                  {s.privacyPolicy}
                </a>
                <span>·</span>
                <a href="/data-deletion" target="_blank" rel="noreferrer">
                  {s.dataDeletion}
                </a>
              </div>
            </div>
          </aside>
        </div>
      )}

      {mode === "play" ? (
        <>
          <main className="cu-layout">
            <div className={`cu-board-area ${thinking ? "is-thinking" : ""}`}>
              <div className="cu-board-with-eval">
                <EvalBar
                  winProbRed={evalInfo.winProbRed}
                  cpRed={evalInfo.cpRed}
                  mate={evalInfo.mate}
                  flipped={playerColor === "black"}
                />
                <div
                  key={`${shakeId}-${bigShakeId}`}
                  className={`cu-board-fit ${shakeId > 0 ? "shake" : ""} ${
                    bigShakeId > 0 ? "shake-big" : ""
                  }`}
                >
                  <Board
                    board={viewBoard(state.state)}
                    flipped={playerColor === "black"}
                    selected={state.selected}
                    targets={targets}
                    lastMove={state.lastMove}
                    hintMove={hintMove}
                    checkAt={checkAt}
                    interactive={
                      !thinking && !anim && !state.gameOver && state.state.turn === playerColor
                    }
                    anim={anim}
                    animTrail
                    flippingId={state.flippingId}
                    onSquareClick={onSquareClick}
                  />
                  {checkBannerKey > 0 && bigCheckBanner && (
                    <div
                      key={checkBannerKey}
                      className="cu-check-banner"
                      onAnimationEnd={() => setCheckBannerKey(0)}
                    >
                      <span>⚔️ {s.checkBanner}</span>
                    </div>
                  )}
                  {mateBannerKey > 0 && (
                    <div
                      key={mateBannerKey}
                      className="cu-check-banner cu-mate-banner"
                      onAnimationEnd={() => setMateBannerKey(0)}
                    >
                      <span>♚ {s.checkmateBanner}</span>
                    </div>
                  )}
                  {brilliantKey > 0 && (
                    <div key={brilliantKey} className="cu-brilliant-banner">
                      <span>{s.brilliantMove}</span>
                    </div>
                  )}
                  {mateFxKey > 0 && (
                    <div key={mateFxKey} className="cu-mate-flash" />
                  )}
                {thinking && (
                  <div className="cu-think-overlay" aria-hidden="true">
                    <span className="cu-spinner cu-spinner-lg" />
                  </div>
                )}
                {hintThinking && (
                  <div className="cu-hint-overlay" aria-live="polite">
                    <span className="cu-hint-pill">
                      <span className="cu-spinner cu-spinner-gold" aria-hidden="true" />
                      <span>
                        💡 {s.hintThinking}
                        {hintDepth > 0 && (
                          <span className="cu-think-meta">
                            {" "}
                            · {s.hintDepth} {hintDepth}
                          </span>
                        )}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              </div>
            </div>

            <aside className="cu-panel">
              <QuestCard lang={lang} />
              <div
                className={`cu-status ${state.gameOver ? "cu-status-over" : ""} ${
                  thinking ? "cu-status-thinking" : ""
                }`}
                role="status"
                aria-live="polite"
              >
                {thinking ? (
                  <span className="cu-thinking">
                    <span className="cu-spinner" aria-hidden="true" />
                    <span>
                      {s.thinking}
                      <span className="cu-dots" aria-hidden="true">
                        <span>.</span>
                        <span>.</span>
                        <span>.</span>
                      </span>
                      <span className="cu-think-meta">
                        {s.thinkMeta(s.levelLabel(level), levelCfg.depth)}
                      </span>
                    </span>
                  </span>
                ) : (
                  statusText
                )}
              </div>
              {state.gameOver && (
                <div className="cu-share-row">
                  <button
                    type="button"
                    className="cu-btn"
                    disabled={sharing}
                    onClick={shareGameResult}
                  >
                    {s.shareBrag}
                  </button>
                  <button
                    type="button"
                    className="cu-btn"
                    onClick={() => setMode("analysis")}
                  >
                    🔍 {s.analyzeGame}
                  </button>
                  <button
                    type="button"
                    className="cu-btn"
                    onClick={openVideoExport}
                  >
                    🎬 {s.videoExport}
                  </button>
                  <button
                    type="button"
                    className="cu-btn"
                    data-testid="coach-open"
                    onClick={() => setMode("coach")}
                  >
                    {s.coachReview}
                  </button>
                </div>
              )}
              {state.gameOver &&
                victoryNudge &&
                !authUser &&
                mode === "play" &&
                state.gameOver.winner === playerColor && (
                  <SignupNudge
                    lang={lang}
                    title={s.victoryNudgeTitle}
                    text={s.victoryNudgeText(loadGuestStats().games)}
                    onDismiss={() => setVictoryNudge(false)}
                  />
                )}
              {shareToast && <div className="cu-toast">{shareToast}</div>}
              {clocks && (
                <section>
                  <h2>{s.clock}</h2>
                  <div className="cu-clock-row">
                    <div
                      className={`cu-clock ${
                        state.state.turn === playerColor && !state.gameOver ? "active" : ""
                      } ${clocks[playerColor] < 30000 ? "low" : ""}`}
                    >
                      <span className="cu-clock-label">{s.you}</span>
                      <span className="cu-clock-time">
                        {formatClock(clocks[playerColor])}
                      </span>
                    </div>
                    <div
                      className={`cu-clock ${
                        state.state.turn === aiColor && !state.gameOver ? "active" : ""
                      } ${clocks[aiColor] < 30000 ? "low" : ""}`}
                    >
                      <span className="cu-clock-label">{s.computer}</span>
                      <span className="cu-clock-time">
                        {formatClock(clocks[aiColor])}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <h2>{s.opening}</h2>
                <div className="cu-captured-row">
                  <span>{openingName ?? "—"}</span>
                </div>
              </section>

              <section>
                <h2>{s.computer}</h2>
                <div className="cu-captured-row">
                  <span className="cu-captured-label">{s.strength}</span>
                  <span>
                    {s.levelLabel(level)} · {s.levelDesc[level - 1]}
                  </span>
                </div>
                <div className="cu-captured-row">
                  <span className="cu-captured-label">{s.lastSearch}</span>
                  <span className="cu-stats">
                    {aiStats
                      ? s.searchStats(
                          aiStats.depth,
                          num(formatNodes(aiStats.nodes)),
                          num((aiStats.timeMs / 1000).toFixed(1))
                        )
                      : "—"}
                  </span>
                </div>
              </section>

              <section>
                <h2>{s.captured}</h2>
                <div className="cu-captured-row">
                  <span className="cu-captured-label">{s.youTook}</span>
                  <span className="cu-captured-pieces">
                    {captured.byYou.length === 0
                      ? "—"
                      : captured.byYou.map((t, i) => (
                          <span key={i} className="cu-cap black">
                            {PIECE_CHARS[aiColor][t]}
                          </span>
                        ))}
                  </span>
                </div>
                <div className="cu-captured-row">
                  <span className="cu-captured-label">{s.computerTook}</span>
                  <span className="cu-captured-pieces">
                    {captured.byComputer.length === 0
                      ? "—"
                      : captured.byComputer.map((t, i) => (
                          <span key={i} className="cu-cap red">
                            {PIECE_CHARS[playerColor][t]}
                          </span>
                        ))}
                  </span>
                </div>
              </section>

              <section>
                <h2>{s.remainingDarkTitle}</h2>
                {(["red", "black"] as Color[]).map((c) => {
                  const counts = darkRemaining[c];
                  const types = (Object.keys(counts) as PieceType[]).filter(
                    (t) => counts[t] > 0
                  );
                  return (
                    <div className="cu-captured-row" key={c}>
                      <span className="cu-captured-label">
                        {c === "red" ? s.redName : s.blackName}
                      </span>
                      <span className="cu-captured-pieces">
                        {types.length === 0
                          ? s.remainingDarkEmpty
                          : types.map((t) => (
                              <span key={t} className={`cu-cap ${c}`}>
                                {PIECE_CHARS[c][t]}×{counts[t]}
                              </span>
                            ))}
                      </span>
                    </div>
                  );
                })}
              </section>

              <section className="cu-moves">
                <h2>{s.moves}</h2>
                <ol className="cu-log">
                  {logPairs.length === 0 && (
                    <li className="cu-log-empty">{s.noMoves}</li>
                  )}
                  {logPairs.map(([a, b], i) => (
                    <li key={i}>
                      <span className="cu-log-num">{i + 1}.</span> {a}
                      {b ? <span> · {b}</span> : null}
                    </li>
                  ))}
                </ol>
              </section>

              <section className="cu-help">
                <h2>{s.howToPlay}</h2>
                <ul>
                  {s.helpBullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>
            </aside>
          </main>
        </>
      ) : mode === "puzzle" ? (
        <PuzzleMode
          lang={lang}
          initialDate={sharedPuzzleDate}
          key={sharedPuzzleDate ?? "daily"}
        />
      ) : mode === "library" ? (
        <LibraryView lang={lang} s={s} />
      ) : mode === "analysis" ? (
        <AnalysisView
          lang={lang}
          moveCodes={replay ? replay.moves : state.moveCodes}
          startState={replay ? replay.state : state.startState}
          replayTitle={replay ? replay.title : null}
          onClearReplay={
            replay ? () => setReplay(null) : undefined
          }
        />
      ) : mode === "coach" ? (
        <CoachReview
          lang={lang}
          moveCodes={state.moveCodes}
          startState={state.startState}
          humanColor={playerColor}
          result={
            state.gameOver
              ? state.gameOver.winner === playerColor
                ? "win"
                : "loss"
              : "draw"
          }
          levelLabel={s.levelLabel(level)}
          onBack={() => setMode("play")}
        />
      ) : mode === "setup" ? (
        <SetupView
          lang={lang}
          onPlay={startCustomGame}
          onCvc={startCvc}
          level={level}
          onLevelChange={setLevel}
          onPublished={() => setMode("community")}
        />
      ) : mode === "cvc" && cvcStart ? (
        <CvCView
          key={cvcStart.nonce}
          lang={lang}
          startState={cvcStart.state}
          level={level}
          onExit={() => setMode("setup")}
        />
      ) : mode === "leaderboard" ? (
        <LeaderboardView lang={lang} />
      ) : mode === "friends" ? (
        <FriendsView
          lang={lang}
          onOpenRoom={(code) => {
            setInviteCode(code);
            setMode("room");
          }}
          highlightChallengeId={deepLinkChallengeId}
          onHighlightConsumed={() => setDeepLinkChallengeId(null)}
        />
      ) : mode === "corr" ? (
        <CorrView
          lang={lang}
          initialGameId={deepLinkCorrId}
          onInitialConsumed={() => setDeepLinkCorrId(null)}
        />
      ) : mode === "checkin" ? (
        <CheckinView
          lang={lang}
          onRequireLogin={() => setAuthOpen(true)}
        />
      ) : mode === "notifications" ? (
        <NotificationsView lang={lang} onChanged={refreshUnread} />
      ) : mode === "room" ? (
        <RoomView
          lang={lang}
          inviteCode={inviteCode}
          onInviteConsumed={() => setInviteCode(null)}
          onRequireLogin={() => {
            setAuthMode("in");
            setAuthOpen(true);
          }}
        />
      ) : mode === "community" ? (
        <CommunityView
          lang={lang}
          initialPuzzleId={sharedCommunityId}
          onInitialConsumed={() => setSharedCommunityId(null)}
          onPlayCustom={startCustomGame}
          level={level}
          onLevelChange={setLevel}
        />
      ) : (
        <HistoryView
          lang={lang}
          onReplay={(g) => {
            setReplay(g);
            setMode("analysis");
          }}
          onExportVideo={(g) => setVideoGame(g)}
        />
      )}
      {authOpen && (
        <AuthModal
          key={authMode}
          lang={lang}
          initialMode={authMode}
          onClose={() => setAuthOpen(false)}
        />
      )}
      {liveOpen && (
        <LiveStreamModal
          lang={lang}
          onClose={() => setLiveOpen(false)}
          onRequireLogin={() => {
            setLiveOpen(false);
            setAuthOpen(true);
          }}
          onStart={handleLiveStart}
        />
      )}
      {livePhase && (
        <LiveOverlay
          lang={lang}
          phase={livePhase}
          startedAt={liveStartedAt}
          onStop={handleLiveStop}
        />
      )}
      {hubChallengeTarget && (
        <div className="cu-modal-backdrop" onClick={() => !hubChallengeBusy && setHubChallengeTarget(null)}>
          <div className="cu-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{s.hubChallengeTitle(hubChallengeTarget.name)}</h2>
            {hubChallengeMsg && (
              <p style={{ color: "var(--red, #d4382c)", margin: "0 0 8px" }} role="alert">
                {hubChallengeMsg}
              </p>
            )}
            <div className="cu-modal-actions">
              <button
                type="button"
                className="cu-btn cu-btn-primary"
                disabled={hubChallengeBusy}
                onClick={doHubChallenge}
              >
                {s.hubChallengeSend}
              </button>
              <button
                type="button"
                className="cu-btn"
                disabled={hubChallengeBusy}
                onClick={() => setHubChallengeTarget(null)}
              >
                {s.hubChallengeLater}
              </button>
            </div>
          </div>
        </div>
      )}
      {hubChallengeMsg && !hubChallengeTarget && (
        <div className="cu-toast">{hubChallengeMsg}</div>
      )}
      {expiredMsg && <div className="cu-toast">{expiredMsg}</div>}
      <VideoExportModal
        lang={lang}
        game={videoGame}
        onClose={() => setVideoGame(null)}
      />
      {profileOpen && (
        <ProfileView
          lang={lang}
          onClose={() => {
            setProfileOpen(false);
            setProfileTick((t) => t + 1);
          }}
        />
      )}
      {saveMsg && <div className="cu-toast">{saveMsg}</div>}
      {resumedMsg && <div className="cu-toast">↩️ {s.resumedGame}</div>}
      {hintToast && <div className="cu-toast cu-toast-hint">{hintToast}</div>}
      {declinedToast && <div className="cu-toast">{declinedToast}</div>}
      {welcomeToast && (
        <div className="cu-toast cu-toast-welcome">{s.welcomeBonus}</div>
      )}
      {incomingChallenge && (
        <div className="cu-modal-root" role="dialog" aria-modal="true">
          <div className="cu-modal cu-challenge-modal">
            <h3>{s.challengeFrom(incomingChallenge.challenger_name)}</h3>
            <div className="cu-modal-actions">
              <button
                type="button"
                className="cu-btn cu-btn-primary"
                onClick={async () => {
                  const code = await acceptChallenge(incomingChallenge);
                  setIncomingChallenge(null);
                  if (code) {
                    setInviteCode(code);
                    setMode("room");
                  }
                }}
              >
                ⚔️ {s.challengeAccept}
              </button>
              <button
                type="button"
                className="cu-btn"
                onClick={async () => {
                  const { declineChallenge } = await import(
                    "@/lib/supabase/friends"
                  );
                  await declineChallenge(incomingChallenge);
                  setIncomingChallenge(null);
                }}
              >
                {s.challengeDecline}
              </button>
            </div>
          </div>
        </div>
      )}
      {installHelpOpen && (
        <div
          className="cu-modal-root"
          role="dialog"
          aria-modal="true"
          onClick={() => setInstallHelpOpen(false)}
        >
          <div
            className="cu-modal cu-install-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{s.installTitle}</h3>
            <ol className="cu-install-steps">
              <li>{s.installIosStep1}</li>
              <li>{s.installIosStep2}</li>
              <li>{s.installIosStep3}</li>
            </ol>
            <div className="cu-modal-actions">
              <button
                type="button"
                className="cu-btn cu-btn-primary"
                onClick={() => setInstallHelpOpen(false)}
              >
                {s.installClose}
              </button>
            </div>
          </div>
        </div>
      )}
      <SiteFooter lang={lang} className="cu-footer" />
    </div>
  );
}
