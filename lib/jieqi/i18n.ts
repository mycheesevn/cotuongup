// Bilingual UI strings (English / Vietnamese).

export type Lang = "en" | "vi";

export interface Strings {
  title: string;
  subtitle: string;
  copyright: string;
  footerBrand: string;
  footerTerms: string;
  footerPrivacy: string;
  footerContact: string;
  footerRights: string;
  footerAllGames: string;
  level: string;
  youPlay: string;
  redFirst: string;
  blackSecond: string;
  undo: string;
  newGame: string;
  switchSides: string;
  redName: string;
  blackName: string;
  toMove: (colorName: string, check: boolean) => string;
  checkmate: (winnerName: string) => string;
  stalemate: (winnerName: string) => string;
  thinking: string;
  thinkMeta: (levelLabel: string, depth: number) => string;
  computer: string;
  strength: string;
  lastSearch: string;
  searchStats: (depth: number, nodes: string, secs: string) => string;
  captured: string;
  youTook: string;
  computerTook: string;
  moves: string;
  noMoves: string;
  howToPlay: string;
  helpBullets: string[];
  boardLabel: string;
  levelLabel: (n: number) => string;
  levelDesc: string[];
  soundOn: string;
  soundOff: string;
  modePlay: string;
  modePuzzle: string;
  modeLibrary: string;
  libTagline: string;
  libProgress: (done: number, total: number) => string;
  libLessons: (done: number, total: number) => string;
  libUnlockHint: (title: string) => string;
  libBack: string;
  libStep: (cur: number, total: number) => string;
  libShowMove: string;
  libExploreDone: string;
  libFindMove: string;
  libTryAgain: string;
  libDone: string;
  libCompleteLesson: string;
  libCelebration: string;
  libNextLesson: string;
  libBackToLibrary: string;
  puzzleToday: string;
  puzzleNum: (n: number) => string;
  mateIn: (n: number) => string;
  moveCount: (used: number, total: number) => string;
  youAreRed: string;
  streak: (n: number) => string;
  noStreak: string;
  alreadySolved: string;
  hintBtn: string;
  hintThinking: string;
  retryBtn: string;
  solvedMsg: string;
  failedWrong: string;
  failedOut: string;
  puzzleHelpBullets: string[];
  timeControl: string;
  unlimited: string;
  minutes: (n: number) => string;
  clock: string;
  you: string;
  timeout: (winnerName: string) => string;
  opening: string;
  modeAnalysis: string;
  evaluation: string;
  noGameToAnalyze: string;
  analyzing: string;
  analyzeAll: string;
  stopAnalysis: string;
  bestMoveLabel: string;
  navFirst: string;
  navPrev: string;
  navNext: string;
  navLast: string;
  moveClass: {
    best: string;
    good: string;
    inaccuracy: string;
    mistake: string;
    blunder: string;
  };
  commentary: string;
  commentaryStart: string;
  autoPlay: string;
  autoPause: string;
  playSpeed: string;
  playSpeedSec: (n: number) => string;
  modeSetup: string;
  modeHistory: string;
  modeLeaderboard: string;
  modeRoom: string;
  modeFriends: string;
  modeCorr: string;
  modeCheckin: string;
  modeNotifications: string;
  notifTitle: string;
  notifMarkAllRead: string;
  notifEmpty: string;
  notifLoadMore: string;
  checkinTitle: string;
  checkinStreak: (n: number) => string;
  checkinClaim: string;
  checkinDone: string;
  checkinClaimed: (streak: number, xp: number) => string;
  checkinError: string;
  checkinHint: string;
  checkinGuest: string;
  friendsTitle: string;
  friendsEmpty: string;
  friendsChallenge: string;
  friendsWatch: string;
  friendsUnfriend: string;
  friendsAdd: string;
  friendsFollowing: string;
  friendsOnline: string;
  friendsInMatch: string;
  friendsChallengeIncoming: string;
  challengeFrom: (name: string) => string;
  challengeAccept: string;
  challengeDecline: string;
  challengeDeclined: (name: string) => string;
  hubChallengeTitle: (name: string) => string;
  hubChallengeSend: string;
  hubChallengeLater: string;
  hubChallengeError: string;
  hubChallengeNotFound: string;
  ssoError: string;
  sessionExpired: string;
  roomLoginRequired: string;
  roomCreate: string;
  roomJoin: string;
  roomName: string;
  roomNamePh: string;
  roomMaxPlayers: string;
  roomMyRooms: string;
  roomBackToRoom: string;
  roomNoRooms: string;
  roomCode: string;
  roomEnterCode: string;
  roomEnterCodePh: string;
  roomCopyCode: string;
  roomCopyLink: string;
  roomPromote: string;
  roomPromoMembers: (n: number) => string;
  roomCopied: string;
  roomMembers: string;
  roomTurnOrder: string;
  roomTurnOrderHint: string;
  roomStartMatch: string;
  roomNeedTwoPlayers: string;
  roomNotFound: string;
  roomFull: string;
  roomClosed: string;
  roomNotLeader: string;
  roomGenericError: string;
  roomNextMatch: string;
  roomPastMatches: string;
  roomNoMatches: string;
  roomLeader: string;
  roomPlayer: string;
  roomSpectator: string;
  roomMakePlayer: string;
  roomMakeSpectator: string;
  roomKick: string;
  roomLeave: string;
  roomClose: string;
  roomCloseConfirm: string;
  roomDelete: string;
  roomDeleteConfirm: string;
  roomDeleteBlocked: string;
  roomDeleteError: string;
  roomDeletedNotice: string;
  roomYourTurn: string;
  roomTurnOf: (name: string) => string;
  roomSpectating: string;
  liveTitle: string;
  liveMenu: string;
  liveIntro: string;
  liveYoutubeKey: string;
  liveFacebookKey: string;
  liveKeyPh: string;
  liveKeyNote: string;
  liveSaveKeys: string;
  liveNeedKey: string;
  liveStart: string;
  liveStop: string;
  liveStarting: string;
  liveOnAir: string;
  livePickTab: string;
  liveUnsupported: string;
  liveNeedLogin: string;
  liveLoginBtn: string;
  liveNotConfigured: string;
  liveFailed: string;
  liveCaptureDenied: string;
  liveShareEnded: string;
  liveTagline: string;
  liveOutroTitle: string;
  roomReact: string;
  roomWaiting: string;
  roomResign: string;
  roomResignConfirm: string;
  roomCancelMatch: string;
  roomComments: string;
  roomWriteComment: string;
  roomSend: string;
  roomNoComments: string;
  roomChat: string;
  roomChatPlaceholder: string;
  roomNoMessages: string;
  roomLoadMore: string;
  voiceTitle: string;
  voiceJoin: string;
  voiceLeave: string;
  voiceMute: string;
  voiceUnmute: string;
  voiceConnecting: string;
  voiceWaiting: string;
  voiceConnected: string;
  voiceMicError: string;
  voiceError: string;
  voiceListen: string;
  voiceListenWaiting: string;
  voiceListenConnected: string;
  voiceAllowListeners: string;
  voiceListenersPresent: string;
  roomMoveBadge: (n: number) => string;
  roomRedWins: string;
  roomBlackWins: string;
  roomDraw: string;
  roomReasonCheckmate: string;
  roomReasonStalemate: string;
  roomReasonResign: string;
  roomMatchCancelled: string;
  roomMatchInProgress: string;
  roomKicked: string;
  roomVs: string;
  roomWatchers: (n: number) => string;
  roomPlaying: string;
  roomLobby: string;
  roomPublic: string;
  roomPublicHint: string;
  roomRules: string;
  roomRulesHint: string;
  roomRulesPlaceholder: string;
  roomSaveRules: string;
  roomRulesSaved: string;
  roomPublicLobby: string;
  roomNoPublicRooms: string;
  roomHotRooms: string;
  roomMatches7d: string;
  roomXpEarned: (n: number) => string;
  roomCreateTournament: string;
  roomTournamentName: string;
  roomTournamentNamePh: string;
  roomTournament: string;
  roomTournamentNext: string;
  roomCancelTournament: string;
  roomTournamentFinished: string;
  roomTournamentInProgress: string;
  roomNeedThreePlayers: string;
  roomStandings: string;
  roomPoints: string;
  roomShare: string;
  roomRematch: string;
  roomShared: string;
  roomNoTournament: string;
  roomOpenTournament: string;
  inviteTitle: string;
  inviteJoin: string;
  back: string;
  publicLobby: string;
  guestSpectateBanner: string;
  guestJoinTeaser: string;
  guestReactTeaser: string;
  guestCommentTeaser: string;
  guestNoMatch: string;
  guestNoRooms: string;
  guestLive: string;
  inviteMembers: (n: number) => string;
  inviteInvalid: string;
  guestTeaserGames: (n: number) => string;
  guestTeaserPuzzles: (n: number) => string;
  guestTeaserCta: string;
  victoryNudgeTitle: string;
  victoryNudgeText: (games: number) => string;
  puzzleNudgeTitle: string;
  puzzleNudgeText: (puzzles: number) => string;
  nudgeSignup: string;
  nudgeLater: string;
  refBannerText: string;
  welcomeBonus: string;
  questTitle: string;
  questFirstGame: string;
  questFirstPuzzle: string;
  questFirstRoom: string;
  questClaim: string;
  questClaimed: string;
  questReward: string;
  shareBrag: string;
  analyzeGame: string;
  checkBanner: string;
  checkmateBanner: string;
  replaySiteCta: string;
  brilliantMove: string;
  videoExport: string;
  videoTitle: string;
  videoDesc: string;
  videoMoves: (n: number) => string;
  videoStart: string;
  videoRecording: string;
  videoCancel: string;
  videoShare: string;
  videoDownload: string;
  videoClose: string;
  videoDone: string;
  videoError: string;
  videoSpeed: string;
  videoSpeedSlow: string;
  videoSpeedNormal: string;
  videoSpeedFast: string;
  videoMic: string;
  videoMicDenied: string;
  shareWinTitle: (level: string) => string;
  shareDrawTitle: string;
  shareLossTitle: string;
  shareGameSubtitle: (moves: number, opening: string | null) => string;
  shareFooter: string;
  shareDone: string;
  shareDownloaded: string;
  sharePuzzleTitle: string;
  sharePuzzleSubtitle: (moves: number) => string;
  sharedGameTitle: (level: number | null) => string;
  achShare: string;
  achStreakTitle: (days: number) => string;
  streakShareBtn: (days: number) => string;
  achRankTitle: (rank: number) => string;
  achProfileTitle: string;
  achProfileLine: (title: string, rating: number, level: number) => string;
  achCta: string;
  blogLink: string;
  installApp: string;
  installTitle: string;
  installIosStep1: string;
  installIosStep2: string;
  installIosStep3: string;
  installClose: string;
  bigCheckBanner: string;
  pushTitle: string;
  pushOn: string;
  pushOff: string;
  pushDenied: string;
  pushIosInstall: string;
  pushUnsupported: string;
  pushTest: string;
  pushNudgeTitle: string;
  pushNudgeText: string;
  pushNudgeOn: string;
  pushNudgeLater: string;
  rushTab: string;
  rushMateIn: (n: number) => string;
  rushWrong: () => string;
  rushOver: (score: number, best: number) => string;
  rushRetry: string;
  rushBack: string;
  rushLives: string;
  rushNewBest: string;
  rushShareTitle: (score: number) => string;
  rushShareSubtitle: (score: number, best: number) => string;
  corrTitle: string;
  corrNew: string;
  corrLogin: string;
  corrEmpty: string;
  corrPickFriend: string;
  corrNoFriends: string;
  corrYourTurn: string;
  corrWaiting: string;
  corrBack: string;
  corrYourMove: string;
  corrOppTurn: (name: string) => string;
  corrHint: string;
  ambStats: (invites: number, xp: number) => string;
  referralTitle: string;
  referralDesc: string;
  referralCopy: string;
  referralCopied: string;
  referralShare: string;
  modeCommunity: string;
  cpCreateTitle: string;
  cpTitleLabel: string;
  cpTitlePh: string;
  cpMovesLabel: string;
  cpMateIn: (n: number) => string;
  cpVerifyHint: string;
  cpVerifyBtn: string;
  cpBack: string;
  cpCreate: string;
  cpCreateFirst: string;
  cpEmpty: string;
  cpLoginRequired: string;
  cpPublished: string;
  cpUntitled: string;
  cpBy: (name: string) => string;
  cpPlay: string;
  cpSolved: string;
  cpBackToList: string;
  cpBackToEdit: string;
  cpVerifyTitle: string;
  cpDeleteConfirm: string;
  cpBadStart: string;
  setupIntent: string;
  setupPlayTab: string;
  cpCreateTab: string;
  cpDoneHint: string;
  cpViewCommunity: string;
  cpCreateAnother: string;
  cpLibraryBtn: string;
  cpLibraryTitle: string;
  cpLibraryHint: string;
  cpUseSample: string;
  cpSampleLabel: (id: number) => string;
  cpRemix: string;
  cpRemixTitle: (name: string) => string;
  cpRename: string;
  cpRenameTitle: string;
  cpRenamed: string;
  cpSave: string;
  cpFeaturedSection: string;
  cpClassicSection: string;
  cpSort: Record<string, string>;
  leaderboard: string;
  leaderboardLogin: string;
  leaderboardEmpty: string;
  topPlayers: string;
  peakRating: string;
  winRate: string;
  dayStreak: string;
  editName: string;
  profile: string;
  profileFullName: string;
  profileBirthDate: string;
  profileAvatar: string;
  profileChangeAvatar: string;
  profileCity: string;
  profileCountry: string;
  profileUsername: string;
  profileEmail: string;
  profileSave: string;
  profileSaved: string;
  profileUploading: string;
  changePassword: string;
  newPassword: string;
  confirmPassword: string;
  passwordChanged: string;
  passwordMismatch: string;
  passwordTooShort: string;
  stats: string;
  statsTotalPlays: string;
  statsGuests: string;
  statsFinished: string;
  statsAbandoned: string;
  statsMembers: string;
  statsNewMembers: string;
  statsToday: string;
  statsThisWeek: string;
  statsThisMonth: string;
  statsPlays: string;
  statsByDay: string;
  statsByWeek: string;
  statsByMonth: string;
  statsByYear: string;
  resumedGame: string;
  hintDepth: string;
  xpToNext: (xp: number, lvl: number) => string;
  authDisplayName: string;
  authDisplayNamePh: string;
  ratingProgress: string;
  noName: string;
  mode: string;
  menu: string;
  settings: string;
  language: string;
  sound: string;
  authLogin: string;
  authContinueWith: string;
  authOr: string;
  termsOfService: string;
  privacyPolicy: string;
  dataDeletion: string;
  authAgreeTerms: string;
  authAnd: string;
  authSignup: string;
  authLogout: string;
  authPassword: string;
  authClose: string;
  authInvalid: string;
  authCheckEmail: string;
  authNoAccount: string;
  authHaveAccount: string;
  historyLogin: string;
  historyNotConfigured: string;
  historyEmpty: string;
  historyReplay: string;
  historyDelete: string;
  puzzleHistory: string;
  roomMatchHistory: string;
  roomMatchHistoryEmpty: string;
  puzzleHistoryEmpty: string;
  puzzleSolved: string;
  puzzleFailed: string;
  wins: string;
  losses: string;
  draws: string;
  loading: string;
  movesCount: string;
  replayBack: string;
  resultText: (r: "win" | "loss" | "draw") => string;
  setupPieces: string;
  setupMove: string;
  setupErase: string;
  setupHint: string;
  setupPlay: string;
  setupTurn: string;
  setupStart: string;
  setupCvc: string;
  cvcTitle: string;
  cvcHint: string;
  cvcThinking: string;
  cvcTurn: string;
  cvcPlay: string;
  cvcPause: string;
  cvcRestart: string;
  cvcBackToSetup: string;
  cvcSpeed: string;
  cvcRedWon: string;
  cvcBlackWon: string;
  cvcDrawn: string;
  cvcReasonMate: string;
  cvcReasonStalemate: string;
  cvcReasonCap: string;
  setupsTitle: string;
  setupsSave: string;
  setupsNamePh: string;
  setupsLoad: string;
  setupsEmpty: string;
  setupsUnnamed: string;
  setupsSaveFailed: string;
  setupReset: string;
  setupClear: string;
  setupErrKings: string;
  setupErrPalace: string;
  setupErrFacing: string;
  coachReview: string;
  coachTitle: string;
  coachBack: string;
  coachAnalyzing: string;
  coachAnalyzed: (done: number, total: number) => string;
  coachAccuracy: string;
  coachTopMistakes: string;
  coachNoMistakes: string;
  coachStrength: string;
  coachStrengthBrilliant: (move: string, gain: string) => string;
  coachStrengthStreak: (n: number, from: number, to: number) => string;
  coachStrengthBestRate: (rate: number) => string;
  coachStrengthStrongFinish: (before: number, after: number) => string;
  coachStrengthSolidPhase: (phase: string) => string;
  coachPhaseOpening: string;
  coachPhaseMiddlegame: string;
  coachPhaseEndgame: string;
  coachBetter: string;
  coachYouPlayed: string;
  coachMoveNum: (n: number) => string;
  coachShareCard: string;
  coachNoData: string;
  coachCardAccuracy: (n: number) => string;
  // --- Cờ Úp (Jieqi) specific — appended; keep VI/EN key sets identical ---
  coveredPiece: string;
  flipReveal: string;
  flippedTo: (pieceName: string) => string;
  coveredCapturedReveal: string;
  remainingDarkTitle: string;
  remainingDarkEmpty: string;
  roomServerValidated: string;
  revealAll: string;
  commitmentVerified: string;
  draw120: string;
  // --- Room/corr strings lifted from RoomMatchView/CorrView (Agent F) ---
  roomDrawOffer: string;
  roomDrawAccept: string;
  roomDrawDecline: string;
  roomDrawOfferedBy: (name: string) => string;
  roomDrawOffered: string;
  roomDrawWaiting: string;
  roomDealVerified: string;
  roomDealVerifyFailed: string;
  roomRevealedTitle: string;
  roomFlipped: (pieceName: string) => string;
  roomCapturedDark: (pieceName: string) => string;
  roomSendingMove: string;
  roomReasonDraw120: string;
  roomCoveredSuffix: string;
}

export const STR: Record<Lang, Strings> = {
  en: {
    title: "Jieqi · Dark Xiangqi",
    subtitle: "Play against the computer",
    copyright: "Copyright by SynerWork Inc. All rights reserved.",
    footerBrand: "SynerWorlds - One account, every world.",
    footerTerms: "Terms of Service",
    footerPrivacy: "Privacy Policy",
    footerContact: "Contact",
    footerRights: "© SynerWork Inc. All rights reserved.",
    footerAllGames: "All games",
    level: "Level",
    youPlay: "You play",
    redFirst: "Red (first)",
    blackSecond: "Black (second)",
    undo: "Undo",
    newGame: "New game",
    switchSides: "🔄 Switch sides",
    redName: "Red",
    blackName: "Black",
    toMove: (c, check) => `${c} to move${check ? " — check!" : ""}`,
    checkmate: (w) => `Checkmate — ${w} wins!`,
    stalemate: (w) => `Stalemate — ${w} wins!`,
    thinking: "Computer is thinking",
    thinkMeta: (lvl, d) => `· ${lvl} · depth ${d}`,
    computer: "Computer",
    strength: "Strength",
    lastSearch: "Last search",
    searchStats: (d, n, s) => `depth ${d} · ${n} nodes · ${s}s`,
    captured: "Captured",
    youTook: "You took",
    computerTook: "Computer took",
    moves: "Moves",
    noMoves: "No moves yet.",
    howToPlay: "How to play",
    helpBullets: [
      "Click one of your pieces, then a highlighted square to move. Red moves first.",
      "Every piece except the Generals starts face-down, shuffled. A covered piece moves — and captures — exactly like the piece whose home square it sits on.",
      "The first time a covered piece moves, it flips face-up and plays as its true piece for the rest of the game.",
      "A flipped Advisor or Elephant is no longer bound by the palace or the river — it fights on as a free 'chiến' (battle) piece.",
      "A covered piece that gets captured is revealed to everyone immediately.",
      "Checkmate — or stalemate — wins. 120 plies without a capture or a flip is a draw.",
      "Generals may not face each other across an open file.",
    ],
    boardLabel: "Jieqi board",
    levelLabel: (n) => `Level ${n}`,
    levelDesc: [
      "Absolute beginner",
      "Beginner",
      "Casual",
      "Improving",
      "Club player",
      "Strong club player",
      "Expert",
      "Candidate master",
      "Master",
      "Grandmaster",
      "Relentless",
      "Nightmare",
    ],
    soundOn: "Turn sound on",
    soundOff: "Turn sound off",
    modePlay: "Vs computer",
    modePuzzle: "Daily puzzle",
    modeLibrary: "📚 Playbook",
    libTagline: "An interactive journey: openings, traps, mating art and endgames. Complete lessons to unlock the next chapter.",
    libProgress: (d, t) => `${d} / ${t} lessons completed`,
    libLessons: (d, t) => `${d} / ${t} lessons`,
    libUnlockHint: (title) => `Complete “${title}” to unlock`,
    libBack: "‹ Library",
    libStep: (c, t) => `Step ${c} / ${t}`,
    libShowMove: "Show move ›",
    libExploreDone: "Done exploring ›",
    libFindMove: "Find the move!",
    libTryAgain: "Not quite — try again!",
    libDone: "Completed",
    libCompleteLesson: "Complete lesson",
    libCelebration: "Lesson complete! The next chapter is one step closer.",
    libNextLesson: "Next lesson ›",
    libBackToLibrary: "Back to library",
    puzzleToday: "Today's puzzle",
    puzzleNum: (n) => `Puzzle #${n}`,
    mateIn: (n) => `Mate in ${n}`,
    moveCount: (u, n) => `Move ${u} / ${n}`,
    youAreRed: "You are Red, to move",
    streak: (n) => `🔥 ${n}-day streak`,
    noStreak: "Solve daily to build a streak!",
    alreadySolved: "Already solved today — nice!",
    hintBtn: "💡 Hint",
    hintThinking: "Finding hint…",
    retryBtn: "↻ Retry",
    solvedMsg: "🎉 Brilliant — puzzle solved!",
    failedWrong: "That breaks the mate — try again!",
    failedOut: "Out of moves — try again!",
    puzzleHelpBullets: [
      "Daily puzzles are fully revealed positions — pure mate-in-N tactics.",
      "You are Red and move first.",
      "Force checkmate within the given number of moves.",
      "Black defends with the computer's best moves.",
      "Stuck? Use the hint button to reveal a winning move.",
    ],
    timeControl: "Time",
    unlimited: "Unlimited",
    minutes: (n) => `${n} min`,
    clock: "Clock",
    you: "You",
    timeout: (w) => `Time out — ${w} wins!`,
    opening: "Opening",
    modeAnalysis: "Analysis",
    evaluation: "Evaluation",
    noGameToAnalyze: "No game to analyze yet — play a game vs the computer first!",
    analyzing: "Analyzing…",
    analyzeAll: "🔍 Analyze all",
    stopAnalysis: "Stop",
    bestMoveLabel: "Best move",
    navFirst: "First position",
    navPrev: "Previous move",
    navNext: "Next move",
    navLast: "Final position",
    moveClass: {
      best: "Best move!",
      good: "Good",
      inaccuracy: "Inaccuracy",
      mistake: "Mistake",
      blunder: "Blunder",
    },
    commentary: "Commentary",
    commentaryStart: "Starting position — press ▶ to step through the moves.",
    autoPlay: "Auto-play",
    autoPause: "Pause",
    playSpeed: "Replay speed",
    playSpeedSec: (n) => `${n}s / move`,
    modeSetup: "Setup",
    setupPieces: "Pieces",
    setupMove: "Move pieces",
    setupErase: "Erase",
    setupHint: "Pick a piece, then tap a square to place it. Use ✥ to rearrange placed pieces.",
    setupPlay: "Play from here",
    setupTurn: "Side to move",
    setupStart: "▶ Play",
    setupCvc: "🤖 Computer vs Computer",
    cvcTitle: "Computer vs Computer",
    cvcHint: "Both engines play this position at the chosen level — watch them solve it.",
    cvcThinking: "Engine is thinking…",
    cvcTurn: "To move",
    cvcPlay: "▶ Play",
    cvcPause: "⏸ Pause",
    cvcRestart: "↻ Restart",
    cvcBackToSetup: "← Back to setup",
    cvcSpeed: "Speed",
    cvcRedWon: "🏆 Red wins!",
    cvcBlackWon: "🏆 Black wins!",
    cvcDrawn: "🤝 Draw",
    cvcReasonMate: "Checkmate",
    cvcReasonStalemate: "No legal moves",
    cvcReasonCap: "Move cap reached",
    setupsTitle: "💾 Saved setups",
    setupsSave: "Save this position",
    setupsNamePh: "Name this setup…",
    setupsLoad: "Load",
    setupsEmpty: "No saved setups yet.",
    setupsUnnamed: "Setup",
    setupsSaveFailed: "Couldn't save the setup.",
    setupReset: "Standard",
    setupClear: "Clear all",
    setupErrKings: "Each side needs exactly one King.",
    setupErrPalace: "Kings must stay inside the palace.",
    setupErrFacing: "Kings must not face each other.",
    modeHistory: "History",
    modeLeaderboard: "Leaderboard",
    modeRoom: "👥 Rooms",
    modeFriends: "👤 Friends",
    modeCorr: "✉️ Correspondence",
    modeCheckin: "📅 Check-in",
    modeNotifications: "🔔 Notifications",
    notifTitle: "Notifications",
    notifMarkAllRead: "Mark all read",
    notifEmpty: "No notifications yet.",
    notifLoadMore: "Load more",
    checkinTitle: "Daily check-in",
    checkinStreak: (n) => `🔥 ${n}-day streak!`,
    checkinClaim: "Check in today",
    checkinDone: "Already checked in today",
    checkinClaimed: (streak, xp) => `Checked in! ${streak}-day streak, +${xp} XP.`,
    checkinError: "Check-in failed, please try again.",
    checkinHint: "Check in every day to grow your streak — more consecutive days, more XP (up to +40).",
    checkinGuest: "Log in to check in daily and earn streak XP!",
    friendsTitle: "Friends",
    friendsEmpty: "No friends yet. Add friends from the leaderboard or inside a room!",
    friendsChallenge: "⚔️ Challenge",
    friendsWatch: "👁 Watch",
    friendsUnfriend: "Remove",
    friendsAdd: "＋ Add",
    friendsFollowing: "✓ Friends",
    friendsOnline: "online",
    friendsInMatch: "in a match",
    friendsChallengeIncoming: "⚔️ Challenges",
    challengeFrom: (name: string) => `⚔️ ${name} challenges you!`,
    challengeAccept: "Accept",
    challengeDecline: "Decline",
    challengeDeclined: (name: string) => `${name} declined your challenge.`,
    hubChallengeTitle: (name: string) => `Challenge ${name}?`,
    hubChallengeSend: "⚔️ Challenge",
    hubChallengeLater: "Later",
    hubChallengeError: "Could not send the challenge. Please try again.",
    hubChallengeNotFound: "That player could not be found.",
    ssoError: "Couldn't sign you in from the SynerWorlds link — please sign in manually.",
    sessionExpired: "Your session expired — please sign in again to keep recording results.",
    roomLoginRequired: "Log in to create or join a room.",
    roomCreate: "Create room",
    roomJoin: "Join",
    roomName: "Room name",
    roomNamePh: "E.g. Friday club",
    roomMaxPlayers: "Max players",
    roomMyRooms: "My rooms",
    roomBackToRoom: "Back to room",
    roomNoRooms: "You haven't joined any room yet.",
    roomCode: "Room code",
    roomEnterCode: "Enter room code",
    roomEnterCodePh: "ABC123",
    roomCopyCode: "Copy code",
    roomCopyLink: "Copy invite link",
    roomPromote: "Promote",
    roomPromoMembers: (n) => `${n} member${n === 1 ? "" : "s"} in room`,
    roomCopied: "Copied!",
    roomMembers: "Members",
    roomTurnOrder: "Match order",
    roomTurnOrderHint: "The first two play the next match.",
    roomStartMatch: "▶ Start match",
    roomNeedTwoPlayers: "Need at least 2 players to start.",
    roomNotFound: "Room not found — check the code.",
    roomFull: "This room is full.",
    roomClosed: "This room has been closed.",
    roomNotLeader: "Only the room leader can do that.",
    roomGenericError: "Something went wrong. Please try again.",
    roomNextMatch: "▶ Next match",
    roomPastMatches: "Past matches",
    roomNoMatches: "No matches yet.",
    roomLeader: "Leader",
    roomPlayer: "Player",
    roomSpectator: "Spectator",
    roomMakePlayer: "Make player",
    roomMakeSpectator: "Make spectator",
    roomKick: "Kick",
    roomLeave: "Leave room",
    roomClose: "Close room",
    roomCloseConfirm: "Close this room for everyone?",
    roomDelete: "Delete room",
    roomDeleteConfirm:
      "Delete this room permanently? All members will be removed and the room will disappear for everyone.",
    roomDeleteBlocked:
      "A match is in progress — finish or cancel the match before deleting the room.",
    roomDeleteError: "Could not delete the room. Please try again.",
    roomDeletedNotice: "This room was deleted by its owner.",
    roomYourTurn: "Your turn!",
    roomTurnOf: (name: string) => `${name} to move`,
    roomSpectating: "You are spectating this match",
    roomReact: "React",
    roomWaiting: "Waiting for your turn…",
    roomResign: "Resign",
    roomResignConfirm: "Resign this match?",
    roomCancelMatch: "Cancel match",
    roomComments: "Comments",
    roomWriteComment: "Comment on the move…",
    roomSend: "Send",
    roomNoComments: "No comments yet — be the first!",
    roomChat: "✉️ Room chat",
    roomChatPlaceholder: "Message everyone in the room…",
    roomNoMessages: "No messages yet — say hi!",
    roomLoadMore: "Load more",
    voiceTitle: "🎙️ Voice chat",
    voiceJoin: "Join voice",
    voiceLeave: "Leave voice",
    voiceMute: "Mute",
    voiceUnmute: "Unmute",
    voiceConnecting: "Connecting…",
    voiceWaiting: "Waiting for your opponent to join voice…",
    voiceConnected: "Connected — you can talk",
    voiceMicError: "Microphone unavailable. Check the browser's microphone permission.",
    voiceError: "Voice connection failed. Please try again.",
    voiceListen: "🔊 Listen",
    voiceListenWaiting: "Waiting for the players to allow listening…",
    voiceListenConnected: "Listening to the players",
    voiceAllowListeners: "Let spectators listen",
    voiceListenersPresent: "👂 Spectators are listening",
    roomMoveBadge: (n: number) => `Move ${n}`,
    roomRedWins: "🔴 Red wins",
    roomBlackWins: "⚫ Black wins",
    roomDraw: "Draw",
    roomReasonCheckmate: "checkmate",
    roomReasonStalemate: "stalemate",
    roomReasonResign: "resignation",
    roomMatchCancelled: "Match cancelled",
    roomMatchInProgress: "A match is already in progress.",
    roomKicked: "You were removed from the room.",
    roomVs: "vs",
    roomWatchers: (n) => `${n} watching`,
    roomPlaying: "Playing",
    roomLobby: "Lobby",
    roomPublic: "Public room",
    roomPublicHint: "Listed in the public lobby — anyone can join",
    roomRules: "Room rules",
    roomRulesHint: "Set by the room owner — members who break them may be removed.",
    roomRulesPlaceholder: "E.g. No leaving mid-game, respect your opponent…",
    roomSaveRules: "Save rules",
    roomRulesSaved: "Rules saved ✓",
    roomPublicLobby: "Public lobby",
    roomNoPublicRooms: "No public rooms yet — create the first one!",
    roomHotRooms: "Hot rooms",
    roomMatches7d: "matches/7d",
    roomXpEarned: (n: number) => `+${n} XP`,
    roomCreateTournament: "Create tournament",
    roomTournamentName: "Tournament name",
    roomTournamentNamePh: "E.g. Autumn cup",
    roomTournament: "Tournament",
    roomTournamentNext: "▶ Next tournament match",
    roomCancelTournament: "End tournament",
    roomTournamentFinished: "Tournament finished",
    roomTournamentInProgress: "A tournament is running — play its matches.",
    roomNeedThreePlayers: "Tournaments need at least 3 players.",
    roomStandings: "Standings",
    roomPoints: "pts",
    roomShare: "Share",
    roomRematch: "Rematch",
    roomShared: "Result copied!",
    roomNoTournament: "No tournaments yet.",
    roomOpenTournament: "Ongoing",
    inviteTitle: "You've been invited to a room",
    inviteJoin: "Log in to join",
    back: "Back",
    publicLobby: "Public lobby",
    guestSpectateBanner: "You are spectating as a guest. Log in to join, react and comment!",
    guestJoinTeaser: "Join the fun",
    guestReactTeaser: "Log in to react",
    guestCommentTeaser: "Log in to comment",
    guestNoMatch: "No live match right now — check back soon.",
    guestNoRooms: "No public rooms yet. Be the first to create one after logging in!",
    guestLive: "live",
    inviteMembers: (n: number) => `${n} members`,
    inviteInvalid: "This invite link is invalid or expired.",
    guestTeaserGames: (n: number) => `You've played ${n} games as a guest`,
    guestTeaserPuzzles: (n: number) => `solved ${n} puzzles as a guest`,
    guestTeaserCta: "Log in free to save your progress and play with friends!",
    victoryNudgeTitle: "\uD83C\uDF89 Brilliant win!",
    victoryNudgeText: (games: number) =>
      `Create a free account to save this victory to your profile — and keep the ${games} game${games === 1 ? "" : "s"} you've played on this device. Plus +50 XP welcome bonus!`,
    puzzleNudgeTitle: "\uD83E\uDDE9 Nicely solved!",
    puzzleNudgeText: (puzzles: number) =>
      `Create a free account to save your streak — and keep the ${puzzles} puzzle${puzzles === 1 ? "" : "s"} you've solved on this device. Plus +50 XP welcome bonus!`,
    nudgeSignup: "Sign up free",
    nudgeLater: "Later",
    refBannerText: "\uD83C\uDF81 You've been invited by a friend — sign up and you both get +20 XP!",
    welcomeBonus: "🎉 Welcome! Here's +50 XP to start",
    questTitle: "🌱 Newbie quests",
    questFirstGame: "Play 1 game",
    questFirstPuzzle: "Solve 1 daily puzzle",
    questFirstRoom: "Join 1 room",
    questClaim: "Claim",
    questClaimed: "Claimed",
    questReward: "+20 XP",
    shareBrag: "\uD83D\uDCE4 Brag",
    analyzeGame: "Analyze this game",
    checkBanner: "Check!",
    checkmateBanner: "Checkmate!",
    replaySiteCta: "👉 Play free at cotuongup.synerworlds.com",
    brilliantMove: "✨ Brilliant move!",
    videoExport: "Export video",
    videoTitle: "Export game video",
    videoDesc: "Record the whole game as a video clip with sound to share.",
    videoMoves: (n: number) => `Game has ${n} moves`,
    videoStart: "Start recording",
    videoRecording: "Recording\u2026 keep the screen on.",
    videoCancel: "Cancel",
    videoShare: "Share",
    videoDownload: "Download",
    videoClose: "Close",
    videoDone: "Done! Your video is ready.",
    videoError: "Couldn\u2019t record video on this device.",
    videoSpeed: "Speed",
    videoSpeedSlow: "Slow",
    videoSpeedNormal: "Normal",
    videoSpeedFast: "Fast",
    videoMic: "🎤 Record voice commentary",
    videoMicDenied: "Couldn\u2019t access the microphone.",
    shareWinTitle: (level: string) => `I beat the computer ${level}! \uD83C\uDFC6`,
    shareDrawTitle: "It's a draw! \uD83E\uDD1D",
    shareLossTitle: "Lost a good game! \uD83D\uDCAA",
    shareGameSubtitle: (moves: number, opening: string | null) => `${moves} moves${opening ? ` \u00B7 ${opening}` : ""}`,
    shareFooter: "\uD83D\uDC49 Challenge me at cotuongup.synerworlds.com",
    shareDone: "Shared! \uD83C\uDF89",
    shareDownloaded: "Image saved + link copied \uD83D\uDCCB",
    sharePuzzleTitle: "I solved today's puzzle! \uD83E\uDDE9",
    sharePuzzleSubtitle: (moves: number) => `Mate in ${moves} moves`,
    sharedGameTitle: (level: number | null) => `Shared game${level ? ` \u00B7 Computer Lv${level}` : ""}`,
    achShare: "\uD83D\uDCE4 Brag",
    achStreakTitle: (days: number) => `\uD83D\uDD25 ${days}-day puzzle streak!`,
    streakShareBtn: (days) => `🔥 Share ${days}-day streak`,
    achRankTitle: (rank: number) => `\uD83C\uDFC6 Ranked #${rank} on the leaderboard!`,
    achProfileTitle: "My Dark Xiangqi achievements",
    achProfileLine: (title: string, rating: number, level: number) => `${title} \u00B7 ${rating} Elo \u00B7 Level ${level}`,
    achCta: "\uD83D\uDC49 Play free at cotuongup.synerworlds.com",
    blogLink: "\uD83D\uDCD6 Guides",
    installApp: "\uD83D\uDCF2 Install app",
    installTitle: "Install the app",
    installIosStep1: "1. Open this page in Safari",
    installIosStep2: "2. Tap the Share button (square with arrow)",
    installIosStep3: "3. Choose \u201cAdd to Home Screen\u201d",
    installClose: "Close",
    bigCheckBanner: "Show big \u201cCheck!\u201d banner in the middle",
    pushTitle: "Notifications",
    pushOn: "Turn on push notifications",
    pushOff: "Turn off push notifications",
    pushDenied: "Notifications are blocked in your browser settings.",
    pushIosInstall: "On iPhone, install the app to your Home Screen first, then enable notifications.",
    pushUnsupported: "Push notifications are not supported on this device.",
    pushTest: "Send test notification",
    pushNudgeTitle: "Never miss a challenge",
    pushNudgeText: "Get notified when a friend challenges you or it\u2019s your move.",
    pushNudgeOn: "Turn on",
    pushNudgeLater: "Later",
    rushTab: "⚡ Puzzle Rush",
    rushMateIn: (n) => `Mate in ${n} — go!`,
    rushWrong: () => "Wrong move! Watch the answer…",
    rushOver: (score, best) => `Time! You solved ${score} (best ${best}).`,
    rushRetry: "Play again",
    rushBack: "Puzzles",
    rushLives: "Lives",
    rushNewBest: "New personal best!",
    rushShareTitle: (score) => `I solved ${score} puzzles in Puzzle Rush!`,
    rushShareSubtitle: (score, best) => `${score} solved · personal best ${best}`,
    corrTitle: "Correspondence",
    corrNew: "New game",
    corrLogin: "Log in to play correspondence chess.",
    corrEmpty: "No correspondence games yet — start one with a friend!",
    corrPickFriend: "Choose a friend to play",
    corrNoFriends: "Follow some friends first (\uD83D\uDC64 Friends tab).",
    corrYourTurn: "Your move",
    corrWaiting: "Waiting",
    corrBack: "My games",
    corrYourMove: "Your move — take your time.",
    corrOppTurn: (name) => `Waiting for ${name}…`,
    corrHint: "Play one move whenever you like. Your opponent gets a push notification.",
    ambStats: (invites: number, xp: number) =>
      `\uD83C\uDF81 Ambassador: invited ${invites} ${invites === 1 ? "person" : "people"} \u00B7 +${xp} XP earned`,
    referralTitle: "\uD83C\uDF81 Invite friends",
    referralDesc: "Send your link to friends \u2014 when they log in and play 1 game, you both get +20 XP!",
    referralCopy: "Copy invite link",
    referralCopied: "Invite link copied! \uD83D\uDCCB",
    referralShare: "Share",
    modeCommunity: "\uD83E\uDDE9 Community",
    cpCreateTitle: "Create a puzzle",
    cpTitleLabel: "Puzzle name",
    cpTitlePh: "E.g. Double chariot storm",
    cpMovesLabel: "Mate in",
    cpMateIn: (n: number) => `${n} move${n > 1 ? "s" : ""}`,
    cpVerifyHint: "Set up Red to force mate in the chosen moves. You must beat the engine yourself to prove the puzzle is sound.",
    cpVerifyBtn: "Verify \u2192",
    cpBack: "Back",
    cpCreate: "Create puzzle",
    cpCreateFirst: "Create the first puzzle",
    cpEmpty: "No community puzzles yet \u2014 be the first to create one!",
    cpLoginRequired: "Log in to create puzzles.",
    cpPublished: "Puzzle published! \uD83C\uDF89",
    cpUntitled: "Untitled puzzle",
    cpBy: (name: string) => `by ${name}`,
    cpPlay: "Play",
    cpSolved: "Solved",
    cpBackToList: "List",
    cpBackToEdit: "Edit position",
    cpVerifyTitle: "Verify puzzle",
    cpDeleteConfirm: "Delete this puzzle?",
    cpBadStart: "Black is already checkmated or stalemated \u2014 adjust the position.",
    setupIntent: "Position arranged \u2014 now what?",
    setupPlayTab: "\u25B6 Play vs computer",
    cpCreateTab: "\uD83E\uDDE9 Challenge everyone",
    cpDoneHint: "Your puzzle is live. Share it with friends to solve!",
    cpViewCommunity: "View in Community",
    cpCreateAnother: "Create another",
    cpLibraryBtn: "\uD83D\uDCCB Sample puzzles",
    cpLibraryTitle: "Sample puzzle library",
    cpLibraryHint: "60 verified classics. Community puzzles with 8+ likes or 20+ solves are auto-picked into \u2B50 above \u2014 pick any as a starting point, remix it, publish.",
    cpUseSample: "Use",
    cpSampleLabel: (id: number) => `Puzzle #${id}`,
    cpRemix: "\uD83D\uDD00 Remix this puzzle",
    cpRemixTitle: (name: string) => `Remix: ${name}`,
    cpRename: "Rename",
    cpRenameTitle: "Rename puzzle",
    cpRenamed: "Renamed!",
    cpSave: "Save",
    cpFeaturedSection: "Community picks",
    cpClassicSection: "Classics",
    cpSort: { new: "New", popular: "Top", weekly: "Weekly", mine: "Mine" },
    leaderboard: "Leaderboard",
    leaderboardLogin: "Log in to see the leaderboard.",
    leaderboardEmpty: "No players yet — be the first!",
    topPlayers: "Top players",
    peakRating: "peak",
    winRate: "win rate",
    dayStreak: "day streak",
    editName: "Change display name",
    profile: "Profile",
    profileFullName: "Full name",
    profileBirthDate: "Date of birth",
    profileAvatar: "Avatar",
    profileChangeAvatar: "Change photo",
    profileCity: "City",
    profileCountry: "Country",
    profileUsername: "Leaderboard name",
    profileEmail: "Email",
    profileSave: "Save",
    profileSaved: "Profile saved ✓",
    profileUploading: "Uploading…",
    changePassword: "Change password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    passwordChanged: "Password changed ✓",
    passwordMismatch: "Passwords don't match",
    passwordTooShort: "Password must be at least 6 characters",
    stats: "Statistics",
    statsTotalPlays: "Total plays",
    statsGuests: "Guests",
    statsFinished: "Finished",
    statsAbandoned: "abandoned",
    statsMembers: "Members",
    statsNewMembers: "New members",
    statsToday: "Today",
    statsThisWeek: "This week",
    statsThisMonth: "This month",
    statsPlays: "Plays",
    statsByDay: "Day",
    statsByWeek: "Week",
    statsByMonth: "Month",
    statsByYear: "Year",
    resumedGame: "Resumed your unfinished game",
    hintDepth: "depth",
    xpToNext: (xp, lvl) => `${xp} XP to Lv ${lvl}`,
    authDisplayName: "Display name (optional)",
    authDisplayNamePh: "Your name on the leaderboard",
    ratingProgress: "Rating progress",
    noName: "Unnamed",
    mode: "Mode",
    menu: "Menu",
    authContinueWith: "Continue with",
    authOr: "or",
    termsOfService: "Terms of Service",
    privacyPolicy: "Privacy Policy",
    dataDeletion: "Data Deletion",
    authAgreeTerms: "By signing up, you agree to our",
    authAnd: "and",
    settings: "Settings",
    language: "Language",
    sound: "Sound",
    authLogin: "Log in",
    authSignup: "Sign up",
    authLogout: "Log out",
    authPassword: "Password",
    authClose: "Close",
    authInvalid: "Enter a valid email and a password of 6+ characters.",
    authCheckEmail: "Account created! Check your email to confirm, then log in.",
    authNoAccount: "New here?",
    authHaveAccount: "Have an account?",
    historyLogin: "Log in to see your saved games and stats.",
    historyNotConfigured: "Cloud saves are not configured yet.",
    historyEmpty: "No saved games yet — finish a game vs the computer!",
    historyReplay: "Replay",
    historyDelete: "Delete game",
    puzzleHistory: "Puzzle history",
    roomMatchHistory: "Room matches",
    roomMatchHistoryEmpty: "No room matches yet — join a room and play!",
    puzzleHistoryEmpty: "No puzzle attempts yet — try today's puzzle!",
    puzzleSolved: "Solved",
    puzzleFailed: "Failed",
    wins: "wins",
    losses: "losses",
    draws: "draws",
    loading: "Loading…",
    movesCount: "moves",
    replayBack: "Current game",
    resultText: (r) =>
      r === "win" ? "You won" : r === "loss" ? "You lost" : "Draw",
    coachReview: "🎓 Coach review",
    coachTitle: "Coach review",
    coachBack: "← Back",
    coachAnalyzing: "Analyzing your moves…",
    coachAnalyzed: (d, t) => `${d}/${t} positions`,
    coachAccuracy: "Accuracy",
    coachTopMistakes: "Costliest mistakes",
    coachNoMistakes: "No significant mistakes — a clean game!",
    coachStrength: "Bright spot",
    coachStrengthBrilliant: (move, gain) => `Brilliant move: ${move} (${gain})`,
    coachStrengthStreak: (n, from, to) =>
      `${n} engine-level moves in a row (moves ${from}–${to})`,
    coachStrengthBestRate: (rate) =>
      `${rate}% of your moves matched the engine's best move`,
    coachStrengthStrongFinish: (before, after) =>
      `Strong finish: second half ${after} vs first half ${before}`,
    coachStrengthSolidPhase: (phase) => `Most solid in the ${phase}`,
    coachPhaseOpening: "opening",
    coachPhaseMiddlegame: "middlegame",
    coachPhaseEndgame: "endgame",
    coachBetter: "Better",
    coachYouPlayed: "You played",
    coachMoveNum: (n) => `Move ${n}`,
    coachShareCard: "📤 Share result card",
    coachNoData: "Not enough of your moves to review — play a longer game!",
    coachCardAccuracy: (n) => `Accuracy: ${n}/100`,
    liveTitle: "📡 Go Live",
    liveMenu: "📡 Go Live",
    liveIntro:
      "Stream this game tab live to your own YouTube and/or Facebook channel. Create the live stream there first, then paste its stream key here.",
    liveYoutubeKey: "YouTube stream key",
    liveFacebookKey: "Facebook stream key",
    liveKeyPh: "Paste stream key",
    liveKeyNote:
      "Keys are kept only on this device. A key is sent to the streaming relay solely to push your broadcast — never stored on our servers.",
    liveSaveKeys: "Remember keys on this device",
    liveNeedKey: "Enter at least one stream key.",
    liveStart: "🔴 Start streaming",
    liveStop: "⏹ Stop",
    liveStarting: "Starting…",
    liveOnAir: "You are LIVE",
    livePickTab: "Your browser will ask which tab to share — pick this game's tab.",
    liveUnsupported:
      "This browser can't capture a tab for streaming. Use Chrome or Edge on a computer.",
    liveNeedLogin: "Sign in to stream your games live.",
    liveLoginBtn: "Sign in",
    liveNotConfigured: "Live streaming is not enabled on the server yet.",
    liveFailed:
      "Could not start the stream. Check your stream key and that the live stream is created on YouTube/Facebook, then try again.",
    liveCaptureDenied:
      "Could not open the screen-sharing dialog. If no tab picker appeared, allow screen sharing for this site in your browser, then try again.",
    liveShareEnded: "Tab sharing ended, so the stream stopped.",
    liveTagline: "Play Dark Xiangqi (Jieqi) online — free, no install needed",
    liveOutroTitle: "Thanks for watching!",
    coveredPiece: "Face-down piece",
    flipReveal: "Flip & reveal",
    flippedTo: (name: string) => `Flips to ${name}`,
    coveredCapturedReveal:
      "A captured face-down piece is revealed to everyone at once.",
    remainingDarkTitle: "Still face-down",
    remainingDarkEmpty: "Every piece has been revealed.",
    roomServerValidated:
      "Room moves are validated by the server — nobody can peek at face-down pieces.",
    revealAll: "Reveal all pieces",
    commitmentVerified: "✓ Deal commitment verified",
    draw120: "Draw — 120 plies with no capture or flip",
    roomDrawOffer: "🤝 Offer draw",
    roomDrawAccept: "✓ Accept draw",
    roomDrawDecline: "✗ Decline",
    roomDrawOfferedBy: (n: string) => `${n} offers a draw`,
    roomDrawOffered: "Your opponent offers a draw",
    roomDrawWaiting: "Draw offer sent…",
    roomDealVerified: "✓ Deal verified (commitment matches)",
    roomDealVerifyFailed: "✗ Deal commitment MISMATCH!",
    roomRevealedTitle: "🃏 The true layout",
    roomFlipped: (t: string) => `Flipped: ${t}`,
    roomCapturedDark: (t: string) =>
      `Captured a covered piece — it was: ${t}`,
    roomSendingMove: "Sending move…",
    roomReasonDraw120: "120-ply draw",
    roomCoveredSuffix: " (face-down)",
  },
  vi: {
    title: "Cờ Úp · Cờ tướng úp",
    subtitle: "Chơi với máy tính",
    copyright: "Bản quyền thuộc về SynerWork Inc. Mọi quyền được bảo lưu.",
    footerBrand: "SynerWorlds - Một tài khoản, mọi bàn cờ.",
    footerTerms: "Điều khoản dịch vụ",
    footerPrivacy: "Chính sách bảo mật",
    footerContact: "Liên hệ",
    footerRights: "© SynerWork Inc. Bảo lưu mọi quyền.",
    footerAllGames: "Tất cả trò chơi",
    level: "Cấp độ",
    youPlay: "Bạn cầm",
    redFirst: "Đỏ (đi trước)",
    blackSecond: "Đen (đi sau)",
    undo: "Đi lại",
    newGame: "Ván mới",
    switchSides: "🔄 Đổi bên",
    redName: "Đỏ",
    blackName: "Đen",
    toMove: (c, check) => `${c} đi${check ? " — chiếu!" : ""}`,
    checkmate: (w) => `Chiếu hết — ${w} thắng!`,
    stalemate: (w) => `Hết nước đi — ${w} thắng!`,
    thinking: "Máy đang nghĩ",
    thinkMeta: (lvl, d) => `· ${lvl} · sâu ${d}`,
    computer: "Máy tính",
    strength: "Trình độ",
    lastSearch: "Lần tính cuối",
    searchStats: (d, n, s) => `sâu ${d} · ${n} nút · ${s} giây`,
    captured: "Quân bị ăn",
    youTook: "Bạn ăn",
    computerTook: "Máy ăn",
    moves: "Nước đi",
    noMoves: "Chưa có nước đi.",
    howToPlay: "Cách chơi",
    helpBullets: [
      "Nhấn vào một quân cờ của bạn, sau đó nhấn vào ô được đánh dấu để đi. Đỏ đi trước.",
      "Trừ hai Tướng, mọi quân đều úp và được xáo trộn khi chia bài. Quân đang úp đi — và ăn — đúng theo quân ở vị trí xuất phát mà nó đang đứng (quân chủ tọa).",
      "Lần đầu tiên quân úp di chuyển, nó được lật ngửa và từ đó chơi theo đúng thân phận thật của mình.",
      "Sĩ và Tượng sau khi lật không còn bị giới hạn cung hay sông — chúng trở thành quân “chiến” và chiến đấu tự do hơn.",
      "Quân úp bị ăn sẽ được lật ngửa công khai ngay lập tức.",
      "Chiếu hết — hoặc làm đối phương hết nước đi — là thắng. 120 nước không ăn quân và không lật quân thì hòa.",
      "Hai Tướng không được nhìn thẳng nhau trên cùng một cột mà không có quân cản.",
    ],
    boardLabel: "Bàn cờ úp",
    levelLabel: (n) => `Cấp ${n}`,
    levelDesc: [
      "Mới bắt đầu",
      "Người mới chơi",
      "Chơi giải trí",
      "Đang tiến bộ",
      "Trình độ câu lạc bộ",
      "Câu lạc bộ khá",
      "Trình độ chuyên gia",
      "Chuẩn kiện tướng",
      "Trình độ kiện tướng",
      "Trình độ đại kiện tướng",
      "Cực kỳ khó",
      "Ác mộng",
    ],
    soundOn: "Bật âm thanh",
    soundOff: "Tắt âm thanh",
    modePlay: "Đánh với máy",
    modePuzzle: "Thế cờ hằng ngày",
    modeLibrary: "📚 Bí kíp",
    libTagline: "Một cuộc hành trình tương tác: khai cuộc, bẫy cờ, sát pháp và tàn cuộc. Hoàn thành bài học để mở khóa chương tiếp theo.",
    libProgress: (d, t) => `Đã hoàn thành ${d} / ${t} bài`,
    libLessons: (d, t) => `${d} / ${t} bài`,
    libUnlockHint: (title) => `Hoàn thành “${title}” để mở khóa`,
    libBack: "‹ Thư viện",
    libStep: (c, t) => `Bước ${c} / ${t}`,
    libShowMove: "Xem nước đi ›",
    libExploreDone: "Tôi đã thử ›",
    libFindMove: "Tìm nước đi!",
    libTryAgain: "Chưa đúng — thử lại nhé!",
    libDone: "Đã hoàn thành",
    libCompleteLesson: "Hoàn thành bài học",
    libCelebration: "Xong một bài! Chương tiếp theo đã gần hơn một bước.",
    libNextLesson: "Bài tiếp theo ›",
    libBackToLibrary: "Về thư viện",
    puzzleToday: "Thế cờ hôm nay",
    puzzleNum: (n) => `Thế cờ #${n}`,
    mateIn: (n) => `Chiếu hết trong ${n} nước`,
    moveCount: (u, n) => `Nước ${u} / ${n}`,
    youAreRed: "Bạn cầm Đỏ, đi trước",
    streak: (n) => `🔥 Chuỗi ${n} ngày`,
    noStreak: "Giải thế cờ mỗi ngày để giữ lửa!",
    alreadySolved: "Hôm nay giải xong rồi — giỏi lắm!",
    hintBtn: "💡 Gợi ý",
    hintThinking: "Đang tìm gợi ý…",
    retryBtn: "↻ Thử lại",
    solvedMsg: "🎉 Tuyệt vời — giải được rồi!",
    failedWrong: "Nước này làm mất thế chiếu hết — thử lại nhé!",
    failedOut: "Hết số nước rồi — thử lại nhé!",
    puzzleHelpBullets: [
      "Thế cờ hằng ngày là thế đã lật ngửa toàn bộ — thuần túy chiếu hết trong N nước.",
      "Bạn cầm Đỏ và đi trước.",
      "Ép đối phương chiếu hết trong số nước quy định.",
      "Đen sẽ chống đỡ bằng nước đi tốt nhất của máy.",
      "Bí quá? Dùng nút gợi ý để xem nước đi đúng.",
    ],
    timeControl: "Thời gian",
    unlimited: "Không giới hạn",
    minutes: (n) => `${n} phút`,
    clock: "Đồng hồ",
    you: "Bạn",
    timeout: (w) => `Hết giờ — ${w} thắng!`,
    opening: "Khai cuộc",
    modeAnalysis: "Phân tích",
    evaluation: "Đánh giá thế cờ",
    noGameToAnalyze: "Chưa có ván cờ nào để phân tích — hãy đánh với máy một ván trước nhé!",
    analyzing: "Đang phân tích…",
    analyzeAll: "🔍 Phân tích tất cả",
    stopAnalysis: "Dừng",
    bestMoveLabel: "Nước hay nhất",
    navFirst: "Về đầu ván",
    navPrev: "Nước trước",
    navNext: "Nước tiếp",
    navLast: "Về cuối ván",
    moveClass: {
      best: "Nước hay nhất!",
      good: "Tốt",
      inaccuracy: "Chưa chuẩn",
      mistake: "Sai lầm",
      blunder: "Sai lầm nghiêm trọng",
    },
    commentary: "Bình luận",
    commentaryStart: "Vị trí ban đầu — bấm ▶ để xem từng nước đi.",
    autoPlay: "Tự động chạy",
    autoPause: "Tạm dừng",
    playSpeed: "Tốc độ chiếu lại",
    playSpeedSec: (n) => `${n} giây / nước`,
    modeSetup: "Sắp xếp",
    setupPieces: "Quân cờ",
    setupMove: "Di chuyển quân",
    setupErase: "Xóa quân",
    setupHint: "Chọn một quân rồi chạm vào ô để đặt. Dùng ✥ để di chuyển quân đã đặt.",
    setupPlay: "Chơi từ thế cờ này",
    setupTurn: "Lượt đi",
    setupStart: "▶ Chơi",
    setupCvc: "🤖 Máy đấu với máy",
    cvcTitle: "Máy đấu với máy",
    cvcHint: "Hai máy cùng cấp độ tự đấu để giải thế cờ này.",
    cvcThinking: "Máy đang nghĩ…",
    cvcTurn: "Lượt đi",
    cvcPlay: "▶ Chạy",
    cvcPause: "⏸ Tạm dừng",
    cvcRestart: "↻ Chơi lại",
    cvcBackToSetup: "← Về sắp xếp",
    cvcSpeed: "Tốc độ",
    cvcRedWon: "🏆 Đỏ thắng!",
    cvcBlackWon: "🏆 Đen thắng!",
    cvcDrawn: "🤝 Hòa",
    cvcReasonMate: "Chiếu hết",
    cvcReasonStalemate: "Hết nước đi",
    cvcReasonCap: "Đạt giới hạn số nước",
    setupsTitle: "💾 Thế cờ đã lưu",
    setupsSave: "Lưu thế này",
    setupsNamePh: "Đặt tên cho thế cờ…",
    setupsLoad: "Nạp",
    setupsEmpty: "Chưa lưu thế cờ nào.",
    setupsUnnamed: "Thế cờ",
    setupsSaveFailed: "Không lưu được thế cờ.",
    setupReset: "Ván chuẩn",
    setupClear: "Xóa hết",
    setupErrKings: "Mỗi bên cần đúng 1 Tướng.",
    setupErrPalace: "Tướng phải nằm trong cung.",
    setupErrFacing: "Hai Tướng không được nhìn nhau.",
    modeHistory: "Lịch sử",
    modeLeaderboard: "Xếp hạng",
    modeRoom: "👥 Phòng chơi",
    modeFriends: "👤 Bạn bè",
    modeCorr: "✉️ Cờ thư",
    modeCheckin: "📅 Điểm danh",
    modeNotifications: "🔔 Thông báo",
    notifTitle: "Thông báo",
    notifMarkAllRead: "Đánh dấu đã đọc",
    notifEmpty: "Chưa có thông báo nào.",
    notifLoadMore: "Xem thêm",
    checkinTitle: "Điểm danh hàng ngày",
    checkinStreak: (n) => `🔥 Chuỗi ${n} ngày!`,
    checkinClaim: "Điểm danh hôm nay",
    checkinDone: "Hôm nay đã điểm danh rồi",
    checkinClaimed: (streak, xp) => `Điểm danh thành công! Chuỗi ${streak} ngày, +${xp} XP.`,
    checkinError: "Điểm danh thất bại, thử lại nhé.",
    checkinHint: "Điểm danh mỗi ngày để nuôi chuỗi — càng liên tiếp càng nhiều XP (tối đa +40).",
    checkinGuest: "Đăng nhập để điểm danh mỗi ngày và nhận XP chuỗi!",
    friendsTitle: "Bạn bè",
    friendsEmpty: "Chưa có bạn bè. Kết bạn từ bảng xếp hạng hoặc trong phòng chơi nhé!",
    friendsChallenge: "⚔️ Thách đấu",
    friendsWatch: "👁 Xem",
    friendsUnfriend: "Xóa",
    friendsAdd: "＋ Kết bạn",
    friendsFollowing: "✓ Bạn bè",
    friendsOnline: "đang online",
    friendsInMatch: "đang đấu",
    friendsChallengeIncoming: "⚔️ Lời thách đấu",
    challengeFrom: (name: string) => `⚔️ ${name} thách đấu bạn!`,
    challengeAccept: "Vào đấu",
    challengeDecline: "Từ chối",
    challengeDeclined: (name: string) => `${name} đã từ chối lời thách đấu.`,
    hubChallengeTitle: (name: string) => `Thách đấu ${name}?`,
    hubChallengeSend: "⚔️ Thách đấu",
    hubChallengeLater: "Để sau",
    hubChallengeError: "Không gửi được lời thách đấu. Vui lòng thử lại.",
    hubChallengeNotFound: "Không tìm thấy người chơi này.",
    ssoError: "Không đăng nhập được bằng liên kết từ SynerWorlds — vui lòng đăng nhập thủ công.",
    sessionExpired: "Phiên đăng nhập đã hết hạn — hãy đăng nhập lại để tiếp tục ghi kết quả.",
    roomLoginRequired: "Đăng nhập để tạo hoặc tham gia phòng chơi.",
    roomCreate: "Tạo phòng",
    roomJoin: "Tham gia",
    roomName: "Tên phòng",
    roomNamePh: "VD: Cà phê chiều",
    roomMaxPlayers: "Số người tối đa",
    roomMyRooms: "Phòng của tôi",
    roomBackToRoom: "Về phòng",
    roomNoRooms: "Bạn chưa tham gia phòng nào.",
    roomCode: "Mã phòng",
    roomEnterCode: "Nhập mã phòng",
    roomEnterCodePh: "ABC123",
    roomCopyCode: "Chép mã",
    roomCopyLink: "Chép link mời",
    roomPromote: "Quảng bá",
    roomPromoMembers: (n) => `Phòng có ${n} thành viên`,
    roomCopied: "Đã chép!",
    roomMembers: "Thành viên",
    roomTurnOrder: "Thứ tự thi đấu",
    roomTurnOrderHint: "2 người đầu sẽ đấu trận tiếp theo.",
    roomStartMatch: "▶ Bắt đầu trận",
    roomNeedTwoPlayers: "Cần ít nhất 2 người chơi để bắt đầu.",
    roomNotFound: "Không tìm thấy phòng — kiểm tra lại mã.",
    roomFull: "Phòng đã đầy.",
    roomClosed: "Phòng đã bị giải tán.",
    roomNotLeader: "Chỉ chủ phòng mới làm được điều này.",
    roomGenericError: "Có lỗi xảy ra. Vui lòng thử lại.",
    roomNextMatch: "▶ Trận tiếp theo",
    roomPastMatches: "Các trận đã đấu",
    roomNoMatches: "Chưa có trận nào.",
    roomLeader: "Chủ phòng",
    roomPlayer: "Người chơi",
    roomSpectator: "Khán giả",
    roomMakePlayer: "Cho vào thi đấu",
    roomMakeSpectator: "Chuyển làm khán giả",
    roomKick: "Mời ra",
    roomLeave: "Rời phòng",
    roomClose: "Giải tán phòng",
    roomCloseConfirm: "Giải tán phòng này?",
    roomDelete: "Xoá phòng",
    roomDeleteConfirm:
      "Xoá vĩnh viễn phòng này? Mọi thành viên sẽ bị loại và phòng sẽ biến mất với tất cả mọi người.",
    roomDeleteBlocked:
      "Đang có trận đấu diễn ra — hãy kết thúc hoặc huỷ trận đấu trước khi xoá phòng.",
    roomDeleteError: "Không xoá được phòng. Vui lòng thử lại.",
    roomDeletedNotice: "Phòng đã bị chủ phòng xoá.",
    roomYourTurn: "Đến lượt bạn!",
    roomTurnOf: (name: string) => `Lượt của ${name}`,
    roomSpectating: "Bạn đang xem trận này",
    roomReact: "Thả cảm xúc",
    roomWaiting: "Đang chờ đến lượt bạn…",
    roomResign: "Đầu hàng",
    roomResignConfirm: "Bạn chắc chắn muốn đầu hàng?",
    roomCancelMatch: "Hủy trận",
    roomComments: "Bình luận",
    roomWriteComment: "Bình luận về nước đi…",
    roomSend: "Gửi",
    roomNoComments: "Chưa có bình luận — hãy là người đầu tiên!",
    roomChat: "✉️ Chat phòng",
    roomChatPlaceholder: "Nhắn tin cho mọi người trong phòng…",
    roomNoMessages: "Chưa có tin nhắn nào — chào mọi người đi!",
    roomLoadMore: "Xem thêm",
    voiceTitle: "🎙️ Trò chuyện thoại",
    voiceJoin: "Vào voice",
    voiceLeave: "Rời voice",
    voiceMute: "Tắt mic",
    voiceUnmute: "Bật mic",
    voiceConnecting: "Đang kết nối…",
    voiceWaiting: "Đang chờ đối thủ vào voice…",
    voiceConnected: "Đã kết nối — đang nói chuyện",
    voiceMicError: "Không dùng được micro. Hãy kiểm tra quyền micro của trình duyệt.",
    voiceError: "Không kết nối được voice. Hãy thử lại.",
    voiceListen: "🔊 Nghe voice",
    voiceListenWaiting: "Đang chờ người chơi cho phép nghe…",
    voiceListenConnected: "Đang nghe người chơi trò chuyện",
    voiceAllowListeners: "Cho khán giả nghe",
    voiceListenersPresent: "👂 Đang có khán giả nghe",
    roomMoveBadge: (n: number) => `Nước ${n}`,
    roomRedWins: "🔴 Đỏ thắng",
    roomBlackWins: "⚫ Đen thắng",
    roomDraw: "Hòa",
    roomReasonCheckmate: "chiếu hết",
    roomReasonStalemate: "hết nước đi",
    roomReasonResign: "đầu hàng",
    roomMatchCancelled: "Trận đấu đã bị hủy",
    roomMatchInProgress: "Đang có trận đấu diễn ra.",
    roomKicked: "Bạn đã bị mời ra khỏi phòng.",
    roomVs: "gặp",
    roomWatchers: (n) => `${n} \u0111ang xem`,
    roomPlaying: "Đang đấu",
    roomLobby: "Đang chờ",
    roomPublic: "Phòng công khai",
    roomPublicHint: "Hiện trong sảnh chung — ai cũng có thể tham gia",
    roomRules: "Nội quy phòng",
    roomRulesHint: "Do chủ phòng đặt ra — thành viên vi phạm có thể bị mời ra.",
    roomRulesPlaceholder: "VD: Không bỏ ván giữa chừng, tôn trọng đối thủ…",
    roomSaveRules: "Lưu nội quy",
    roomRulesSaved: "Đã lưu nội quy ✓",
    roomPublicLobby: "Sảnh chung",
    roomNoPublicRooms: "Chưa có phòng công khai nào — hãy tạo phòng đầu tiên!",
    roomHotRooms: "Phòng sôi động",
    roomMatches7d: "trận/7 ngày",
    roomXpEarned: (n: number) => `+${n} XP`,
    roomCreateTournament: "Tạo giải đấu",
    roomTournamentName: "Tên giải",
    roomTournamentNamePh: "VD: Giải mùa thu",
    roomTournament: "Giải đấu",
    roomTournamentNext: "▶ Trận tiếp theo của giải",
    roomCancelTournament: "Kết thúc giải",
    roomTournamentFinished: "Giải đấu đã kết thúc",
    roomTournamentInProgress: "Đang có giải đấu — hãy đấu các trận của giải.",
    roomNeedThreePlayers: "Giải đấu cần ít nhất 3 người chơi.",
    roomStandings: "Bảng xếp hạng",
    roomPoints: "điểm",
    roomShare: "Chia sẻ",
    roomRematch: "Đấu lại",
    roomShared: "Đã chép kết quả!",
    roomNoTournament: "Chưa có giải đấu nào.",
    roomOpenTournament: "Đang diễn ra",
    inviteTitle: "Bạn được mời vào phòng",
    inviteJoin: "Đăng nhập để tham gia",
    back: "Quay lại",
    publicLobby: "Sảnh chung",
    guestSpectateBanner: "Bạn đang xem với tư cách khách. Đăng nhập để tham gia, vỗ tay và bình luận!",
    guestJoinTeaser: "Tham gia ngay",
    guestReactTeaser: "Đăng nhập để vỗ tay",
    guestCommentTeaser: "Đăng nhập để bình luận",
    guestNoMatch: "Chưa có trận nào đang đánh — quay lại sau nhé.",
    guestNoRooms: "Chưa có phòng công khai nào. Đăng nhập để tạo phòng đầu tiên!",
    guestLive: "đang đánh",
    inviteMembers: (n: number) => `${n} thành viên`,
    inviteInvalid: "Link mời không hợp lệ hoặc đã hết hạn.",
    guestTeaserGames: (n: number) => `Bạn đã chơi ${n} ván với tư cách khách`,
    guestTeaserPuzzles: (n: number) => `giải ${n} thế cờ với tư cách khách`,
    guestTeaserCta: "Đăng nhập miễn phí để lưu tiến trình và chơi cùng bạn bè!",
    victoryNudgeTitle: "\uD83C\uDF89 Thắng tuyệt vời!",
    victoryNudgeText: (games: number) =>
      `Tạo tài khoản miễn phí để lưu chiến thắng này vào hồ sơ — và giữ lại ${games} ván bạn đã chơi trên máy này. Tặng ngay +50 XP chào mừng!`,
    puzzleNudgeTitle: "\uD83E\uDDE9 Giải hay lắm!",
    puzzleNudgeText: (puzzles: number) =>
      `Tạo tài khoản miễn phí để lưu chuỗi giải đố — và giữ lại ${puzzles} thế cờ bạn đã giải trên máy này. Tặng ngay +50 XP chào mừng!`,
    nudgeSignup: "Đăng ký miễn phí",
    nudgeLater: "Để sau",
    refBannerText: "\uD83C\uDF81 Bạn được một người bạn mời — đăng ký để cả hai cùng nhận +20 XP!",
    welcomeBonus: "🎉 Chào mừng! Tặng bạn +50 XP",
    questTitle: "🌱 Nhiệm vụ tân thủ",
    questFirstGame: "Chơi 1 ván cờ",
    questFirstPuzzle: "Giải 1 thế cờ hằng ngày",
    questFirstRoom: "Tham gia 1 phòng chơi",
    questClaim: "Nhận",
    questClaimed: "Đã nhận",
    questReward: "+20 XP",
    shareBrag: "\uD83D\uDCE4 Khoe",
    analyzeGame: "Phân tích ván này",
    checkBanner: "Chiếu tướng!",
    checkmateBanner: "Chiếu hết!",
    replaySiteCta: "👉 Chơi miễn phí tại cotuongup.synerworlds.com",
    brilliantMove: "✨ Nước đi thiên tài!",
    videoExport: "Xuất video",
    videoTitle: "Xuất video ván cờ",
    videoDesc: "Ghi lại toàn bộ ván cờ thành video clip có âm thanh để chia sẻ.",
    videoMoves: (n: number) => `Ván cờ có ${n} nước đi`,
    videoStart: "Bắt đầu ghi",
    videoRecording: "Đang ghi hình\u2026 giữ màn hình sáng.",
    videoCancel: "Hủy",
    videoShare: "Chia sẻ",
    videoDownload: "Tải xuống",
    videoClose: "Đóng",
    videoDone: "Xong! Video đã sẵn sàng.",
    videoError: "Không ghi được video trên thiết bị này.",
    videoSpeed: "Tốc độ",
    videoSpeedSlow: "Chậm",
    videoSpeedNormal: "Thường",
    videoSpeedFast: "Nhanh",
    videoMic: "🎤 Thu giọng bình luận",
    videoMicDenied: "Không truy cập được micro.",
    shareWinTitle: (level: string) => `Tôi đã thắng máy ${level}! \uD83C\uDFC6`,
    shareDrawTitle: "Ván cờ hòa! \uD83E\uDD1D",
    shareLossTitle: "Thua một ván hay! \uD83D\uDCAA",
    shareGameSubtitle: (moves: number, opening: string | null) => `${moves} nước đi${opening ? ` \u00B7 ${opening}` : ""}`,
    shareFooter: "\uD83D\uDC49 Thách đấu ngay tại cotuongup.synerworlds.com",
    shareDone: "Đã chia sẻ! \uD83C\uDF89",
    shareDownloaded: "Đã tải ảnh + chép link \uD83D\uDCCB",
    sharePuzzleTitle: "Tôi đã giải thế cờ hôm nay! \uD83E\uDDE9",
    sharePuzzleSubtitle: (moves: number) => `Chiếu hết trong ${moves} nước`,
    sharedGameTitle: (level: number | null) => `Ván cờ được chia sẻ${level ? ` \u00B7 Máy cấp ${level}` : ""}`,
    achShare: "\uD83D\uDCE4 Khoe",
    achStreakTitle: (days: number) => `\uD83D\uDD25 ${days} ngày giải đố liên tiếp!`,
    streakShareBtn: (days) => `🔥 Khoe streak ${days} ngày`,
    achRankTitle: (rank: number) => `\uD83C\uDFC6 Hạng #${rank} bảng xếp hạng!`,
    achProfileTitle: "Thành tích cờ úp của tôi",
    achProfileLine: (title: string, rating: number, level: number) => `${title} \u00B7 ${rating} Elo \u00B7 Cấp ${level}`,
    achCta: "\uD83D\uDC49 Chơi miễn phí tại cotuongup.synerworlds.com",
    blogLink: "\uD83D\uDCD6 Hướng dẫn",
    installApp: "📲 Cài đặt ứng dụng",
    installTitle: "Cài đặt ứng dụng",
    installIosStep1: "1. Mở trang này bằng Safari",
    installIosStep2: "2. Nhấn nút Chia sẻ (hình vuông có mũi tên)",
    installIosStep3: "3. Chọn “Thêm vào MH chính”",
    installClose: "Đóng",
    bigCheckBanner: "Hiện chữ “Chiếu tướng!” to ở giữa màn hình",
    pushTitle: "Th\u00f4ng b\u00e1o \u0111\u1ea9y",
    pushOn: "B\u1eadt th\u00f4ng b\u00e1o \u0111\u1ea9y",
    pushOff: "T\u1eaft th\u00f4ng b\u00e1o \u0111\u1ea9y",
    pushDenied: "\u0110\u00e3 ch\u1eb7n th\u00f4ng b\u00e1o trong c\u00e0i \u0111\u1eb7t tr\u00ecnh duy\u1ec7t.",
    pushIosInstall: "Tr\u00ean iPhone, c\u00e0i app ra m\u00e0n h\u00ecnh ch\u00ednh tr\u01b0\u1edbc r\u1ed3i m\u1edbi b\u1eadt \u0111\u01b0\u1ee3c th\u00f4ng b\u00e1o.",
    pushUnsupported: "Thi\u1ebft b\u1ecb n\u00e0y kh\u00f4ng h\u1ed7 tr\u1ee3 th\u00f4ng b\u00e1o \u0111\u1ea9y.",
    pushTest: "G\u1eedi th\u00f4ng b\u00e1o th\u1eed",
    pushNudgeTitle: "\u0110\u1eebng b\u1ecf l\u1ee1 l\u1eddi th\u00e1ch \u0111\u1ea5u",
    pushNudgeText: "Nh\u1eadn th\u00f4ng b\u00e1o khi b\u1ea1n b\u00e8 th\u00e1ch \u0111\u1ea5u ho\u1eb7c \u0111\u1ebfn l\u01b0\u1ee3t b\u1ea1n \u0111i.",
    pushNudgeOn: "B\u1eadt",
    pushNudgeLater: "\u0110\u1ec3 sau",
    rushTab: "⚡ Puzzle Rush",
    rushMateIn: (n) => `Chi\u1ebfu h\u1ebft trong ${n} n\u01b0\u1edbc \u2014 nhanh l\u00ean!`,
    rushWrong: () => "Sai r\u1ed3i! Xem \u0111\u00e1p \u00e1n\u2026",
    rushOver: (score, best) => `H\u1ebft gi\u1edd! B\u1ea1n gi\u1ea3i \u0111\u01b0\u1ee3c ${score} (k\u1ef7 l\u1ee5c ${best}).`,
    rushRetry: "Ch\u01a1i l\u1ea1i",
    rushBack: "Th\u1ebf c\u1edd",
    rushLives: "M\u1ea1ng",
    rushNewBest: "K\u1ef7 l\u1ee5c m\u1edbi!",
    rushShareTitle: (score) => `T\u00f4i \u0111\u00e3 gi\u1ea3i ${score} th\u1ebf c\u1edd trong Puzzle Rush!`,
    rushShareSubtitle: (score, best) => `${score} th\u1ebf c\u1edd \u00b7 k\u1ef7 l\u1ee5c ${best}`,
    corrTitle: "C\u1edd th\u01b0",
    corrNew: "V\u00e1n m\u1edbi",
    corrLogin: "\u0110\u0103ng nh\u1eadp \u0111\u1ec3 ch\u01a1i c\u1edd th\u01b0.",
    corrEmpty: "Ch\u01b0a c\u00f3 v\u00e1n c\u1edd th\u01b0 n\u00e0o \u2014 m\u1eddi b\u1ea1n b\u00e8 ch\u01a1i \u0111i!",
    corrPickFriend: "Ch\u1ecdn b\u1ea1n \u0111\u1ec3 ch\u01a1i",
    corrNoFriends: "H\u00e3y k\u1ebft b\u1ea1n tr\u01b0\u1edbc (tab \uD83D\uDC64 B\u1ea1n b\u00e8).",
    corrYourTurn: "\u0110\u1ebfn l\u01b0\u1ee3t b\u1ea1n",
    corrWaiting: "\u0110ang \u0111\u1ee3i",
    corrBack: "V\u00e1n c\u1ee7a t\u00f4i",
    corrYourMove: "\u0110\u1ebfn l\u01b0\u1ee3t b\u1ea1n \u2014 c\u1ee9 thong th\u1ea3.",
    corrOppTurn: (name) => `\u0110ang \u0111\u1ee3i ${name}\u2026`,
    corrHint: "M\u1ed7i l\u00fac r\u1ea3nh \u0111i m\u1ed9t n\u01b0\u1edbc. \u0110\u1ed1i th\u1ee7 s\u1ebd nh\u1eadn th\u00f4ng b\u00e1o \u0111\u1ea9y.",
    ambStats: (invites: number, xp: number) =>
      `\uD83C\uDF81 Đại sứ: đã mời ${invites} người \u00B7 kiếm được +${xp} XP`,
    referralTitle: "\uD83C\uDF81 Mời bạn bè",
    referralDesc: "Gửi link cho bạn bè \u2014 khi bạn đăng nhập và chơi 1 ván, cả hai cùng +20 XP!",
    referralCopy: "Chép link mời",
    referralCopied: "Đã chép link mời! \uD83D\uDCCB",
    referralShare: "Chia sẻ",
    modeCommunity: "\uD83E\uDDE9 C\u1ED9ng \u0111\u1ED3ng",
    cpCreateTitle: "T\u1EA1o th\u1EBF c\u1EDD",
    cpTitleLabel: "T\u00EAn th\u1EBF c\u1EDD",
    cpTitlePh: "VD: Song xe ph\u00E1 s\u0129",
    cpMovesLabel: "Chi\u1EBFu h\u1EBFt trong",
    cpMateIn: (n: number) => `${n} n\u01B0\u1EDBc`,
    cpVerifyHint: "X\u1EBFp qu\u00E2n \u0110\u1ECF chi\u1EBFu h\u1EBFt trong s\u1ED1 n\u01B0\u1EDBc \u0111\u00E3 ch\u1ECDn. B\u1EA1n ph\u1EA3i t\u1EF1 \u0111\u00E1nh th\u1EAFng m\u00E1y \u0111\u1EC3 ch\u1EE9ng minh th\u1EBF c\u1EDD h\u1EE3p l\u1EC7.",
    cpVerifyBtn: "Ki\u1EC3m ch\u1EE9ng \u2192",
    cpBack: "Quay l\u1EA1i",
    cpCreate: "T\u1EA1o th\u1EBF c\u1EDD",
    cpCreateFirst: "T\u1EA1o th\u1EBF c\u1EDD \u0111\u1EA7u ti\u00EAn",
    cpEmpty: "Ch\u01B0a c\u00F3 th\u1EBF c\u1EDD c\u1ED9ng \u0111\u1ED3ng n\u00E0o \u2014 h\u00E3y l\u00E0 ng\u01B0\u1EDDi \u0111\u1EA7u ti\u00EAn!",
    cpLoginRequired: "\u0110\u0103ng nh\u1EADp \u0111\u1EC3 t\u1EA1o th\u1EBF c\u1EDD.",
    cpPublished: "\u0110\u00E3 \u0111\u0103ng th\u1EBF c\u1EDD! \uD83C\uDF89",
    cpUntitled: "Th\u1EBF c\u1EDD kh\u00F4ng t\u00EAn",
    cpBy: (name: string) => `c\u1EE7a ${name}`,
    cpPlay: "Ch\u01A1i",
    cpSolved: "\u0110\u00E3 gi\u1EA3i",
    cpBackToList: "Danh s\u00E1ch",
    cpBackToEdit: "S\u1EEDa th\u1EBF c\u1EDD",
    cpVerifyTitle: "Ki\u1EC3m ch\u1EE9ng th\u1EBF c\u1EDD",
    cpDeleteConfirm: "X\u00F3a th\u1EBF c\u1EDD n\u00E0y?",
    cpBadStart: "\u0110en \u0111\u00E3 b\u1ECB chi\u1EBFu h\u1EBFt ho\u1EB7c h\u1EBFt n\u01B0\u1EDBc \u0111i t\u1EEB \u0111\u1EA7u \u2014 h\u00E3y ch\u1EC9nh l\u1EA1i th\u1EBF c\u1EDD.",
    setupIntent: "X\u1EBFp xong \u2014 b\u1EA1n mu\u1ED1n \u0111\u00E1nh v\u1EDBi m\u00E1y hay \u0111\u1ED1 m\u1ECDi ng\u01B0\u1EDDi?",
    setupPlayTab: "\u25B6 Ch\u01A1i v\u1EDBi m\u00E1y",
    cpCreateTab: "\uD83E\uDDE9 \u0110\u1ED1 m\u1ECDi ng\u01B0\u1EDDi",
    cpDoneHint: "Th\u1EBF c\u1EDD c\u1EE7a b\u1EA1n \u0111\u00E3 l\u00EAn s\u00F3ng. Chia s\u1EBB cho b\u1EA1n b\u00E8 c\u00F9ng gi\u1EA3i!",
    cpViewCommunity: "Xem trong C\u1ED9ng \u0111\u1ED3ng",
    cpCreateAnother: "T\u1EA1o th\u1EBF kh\u00E1c",
    cpLibraryBtn: "\uD83D\uDCCB Th\u1EBF c\u1EDD m\u1EABu",
    cpLibraryTitle: "Th\u01B0 vi\u1EC7n th\u1EBF c\u1EDD m\u1EAB u",
    cpLibraryHint: "60 th\u1EBF kinh \u0111i\u1EC3n \u0111\u00E3 ki\u1EC3m ch\u1EE9ng. Th\u1EBF c\u1EDD c\u1ED9ng \u0111\u1ED3ng \u0111\u1EA1t 8+ \u2764\uFE0F ho\u1EB7c 20+ \u2705 s\u1EBD t\u1EF1 \u0111\u1ED9ng \u0111\u01B0\u1EE3c tuy\u1EC3n ch\u1ECDn v\u00E0o \u2B50 b\u00EAn tr\u00EAn \u2014 ch\u1ECDn b\u1EA5t k\u1EF3 th\u1EBF n\u00E0o l\u00E0m \u0111i\u1EC3m xu\u1EA5t ph\u00E1t, bi\u1EBFn t\u1EA5u r\u1ED3i \u0111\u0103ng.",
    cpUseSample: "D\u00F9ng",
    cpSampleLabel: (id: number) => `Th\u1EBF #${id}`,
    cpRemix: "\uD83D\uDD00 Bi\u1EBFn t\u1EA5u th\u1EBF n\u00E0y",
    cpRemixTitle: (name: string) => `Bi\u1EBFn t\u1EA5u: ${name}`,
    cpRename: "\u0110\u1ED5i t\u00EAn",
    cpRenameTitle: "\u0110\u1ED5i t\u00EAn th\u1EBF c\u1EDD",
    cpRenamed: "\u0110\u00E3 \u0111\u1ED5i t\u00EAn!",
    cpSave: "L\u01B0u",
    cpFeaturedSection: "C\u1ED9ng \u0111\u1ED3ng tuy\u1EC3n ch\u1ECDn",
    cpClassicSection: "Kinh \u0111i\u1EC3n",
    cpSort: { new: "M\u1EDBi nh\u1EA5t", popular: "Hay nh\u1EA5t", weekly: "Top tu\u1EA7n", mine: "C\u1EE7a t\u00F4i" },
    leaderboard: "Bảng xếp hạng",
    leaderboardLogin: "Đăng nhập để xem bảng xếp hạng.",
    leaderboardEmpty: "Chưa có người chơi nào — hãy là người đầu tiên!",
    topPlayers: "Top kỳ thủ",
    peakRating: "cao nhất",
    winRate: "tỉ lệ thắng",
    dayStreak: "ngày liên tiếp",
    editName: "Đổi tên hiển thị",
    profile: "Hồ sơ",
    profileFullName: "Họ tên",
    profileBirthDate: "Ngày sinh",
    profileAvatar: "Ảnh đại diện",
    profileChangeAvatar: "Đổi ảnh",
    profileCity: "Thành phố",
    profileCountry: "Quốc gia",
    profileUsername: "Tên trên bảng xếp hạng",
    profileEmail: "Email",
    profileSave: "Lưu",
    profileSaved: "Đã lưu hồ sơ ✓",
    profileUploading: "Đang tải ảnh…",
    changePassword: "Đổi mật khẩu",
    newPassword: "Mật khẩu mới",
    confirmPassword: "Nhập lại mật khẩu mới",
    passwordChanged: "Đã đổi mật khẩu ✓",
    passwordMismatch: "Mật khẩu nhập lại không khớp",
    passwordTooShort: "Mật khẩu phải có ít nhất 6 ký tự",
    stats: "Thống kê",
    statsTotalPlays: "Tổng lượt chơi",
    statsGuests: "Khách",
    statsFinished: "Chơi đến cùng",
    statsAbandoned: "bỏ cuộc",
    statsMembers: "Thành viên",
    statsNewMembers: "Thành viên mới",
    statsToday: "Hôm nay",
    statsThisWeek: "Tuần này",
    statsThisMonth: "Tháng này",
    statsPlays: "Lượt chơi",
    statsByDay: "Ngày",
    statsByWeek: "Tuần",
    statsByMonth: "Tháng",
    statsByYear: "Năm",
    resumedGame: "Đã khôi phục ván đang chơi dở",
    hintDepth: "độ sâu",
    xpToNext: (xp, lvl) => `còn ${xp} XP lên Lv ${lvl}`,
    authDisplayName: "Tên hiển thị (tùy chọn)",
    authDisplayNamePh: "Tên của bạn trên bảng xếp hạng",
    ratingProgress: "Tiến bộ rating",
    noName: "Chưa đặt tên",
    mode: "Chế độ",
    menu: "Menu",
    authContinueWith: "Tiếp tục với",
    authOr: "hoặc",
    termsOfService: "Điều khoản sử dụng",
    privacyPolicy: "Chính sách bảo mật",
    dataDeletion: "Xóa dữ liệu",
    authAgreeTerms: "Khi đăng ký, bạn đồng ý với",
    authAnd: "và",
    settings: "Cài đặt",
    language: "Ngôn ngữ",
    sound: "Âm thanh",
    authLogin: "Đăng nhập",
    authSignup: "Đăng ký",
    authLogout: "Đăng xuất",
    authPassword: "Mật khẩu",
    authClose: "Đóng",
    authInvalid: "Nhập email hợp lệ và mật khẩu từ 6 ký tự.",
    authCheckEmail: "Đã tạo tài khoản! Kiểm tra email để xác nhận rồi đăng nhập.",
    authNoAccount: "Chưa có tài khoản?",
    authHaveAccount: "Đã có tài khoản?",
    historyLogin: "Đăng nhập để xem ván đã lưu và thống kê.",
    historyNotConfigured: "Chưa cấu hình lưu trữ đám mây.",
    historyEmpty: "Chưa có ván nào — đánh xong một ván với máy nhé!",
    puzzleHistory: "Lịch sử thế cờ",
    roomMatchHistory: "Ván đấu trong phòng",
    roomMatchHistoryEmpty: "Chưa có ván nào trong phòng — vào phòng chơi nhé!",
    puzzleHistoryEmpty: "Chưa có lượt giải nào — thử thế cờ hôm nay!",
    puzzleSolved: "Đã giải được",
    puzzleFailed: "Chưa giải được",
    historyReplay: "Xem lại",
    historyDelete: "Xóa ván",
    wins: "thắng",
    losses: "thua",
    draws: "hòa",
    loading: "Đang tải…",
    movesCount: "nước",
    replayBack: "Ván hiện tại",
    resultText: (r) =>
      r === "win" ? "Bạn thắng" : r === "loss" ? "Bạn thua" : "Hòa",
    coachReview: "🎓 Xem lại với HLV",
    coachTitle: "HLV xem lại ván đấu",
    coachBack: "← Trở lại",
    coachAnalyzing: "Đang phân tích các nước đi của bạn…",
    coachAnalyzed: (d, t) => `${d}/${t} thế cờ`,
    coachAccuracy: "Độ chính xác",
    coachTopMistakes: "Những nước đi tốn kém nhất",
    coachNoMistakes: "Không có sai lầm đáng kể — ván đấu sạch!",
    coachStrength: "Điểm sáng",
    coachStrengthBrilliant: (move, gain) => `Nước tỏa sáng: ${move} (${gain})`,
    coachStrengthStreak: (n, from, to) =>
      `${n} nước liên tiếp đạt chuẩn máy (nước ${from}–${to})`,
    coachStrengthBestRate: (rate) =>
      `${rate}% số nước của bạn trùng với nước hay nhất của máy`,
    coachStrengthStrongFinish: (before, after) =>
      `Càng về cuối càng hay: hiệp 2 đạt ${after}, hiệp 1 đạt ${before}`,
    coachStrengthSolidPhase: (phase) => `Chơi chắc chắn nhất ở ${phase}`,
    coachPhaseOpening: "khai cuộc",
    coachPhaseMiddlegame: "trung cuộc",
    coachPhaseEndgame: "tàn cuộc",
    coachBetter: "Tốt hơn",
    coachYouPlayed: "Bạn đã đi",
    coachMoveNum: (n) => `Nước ${n}`,
    coachShareCard: "📤 Chia sẻ thẻ kết quả",
    coachNoData: "Chưa đủ nước đi của bạn để xem lại — đánh ván dài hơn nhé!",
    coachCardAccuracy: (n) => `Độ chính xác: ${n}/100`,
    liveTitle: "📡 Phát trực tiếp",
    liveMenu: "📡 Phát trực tiếp",
    liveIntro:
      "Phát trực tiếp thẻ game này lên kênh YouTube và/hoặc Facebook của bạn. Hãy tạo buổi phát trên YouTube/Facebook trước, rồi dán stream key của nó vào đây.",
    liveYoutubeKey: "Stream key YouTube",
    liveFacebookKey: "Stream key Facebook",
    liveKeyPh: "Dán stream key",
    liveKeyNote:
      "Key chỉ lưu trên máy này. Key được gửi tới máy chủ trung chuyển duy nhất để đẩy tín hiệu phát sóng — không lưu trên server của chúng tôi.",
    liveSaveKeys: "Lưu key trên máy này",
    liveNeedKey: "Hãy nhập ít nhất một stream key.",
    liveStart: "🔴 Bắt đầu phát",
    liveStop: "⏹ Dừng phát",
    liveStarting: "Đang bắt đầu…",
    liveOnAir: "Đang PHÁT TRỰC TIẾP",
    livePickTab: "Trình duyệt sẽ hỏi bạn muốn chia sẻ thẻ nào — hãy chọn thẻ của game này.",
    liveUnsupported:
      "Trình duyệt này không quay được thẻ để phát trực tiếp. Hãy dùng Chrome hoặc Edge trên máy tính.",
    liveNeedLogin: "Đăng nhập để phát trực tiếp ván cờ của bạn.",
    liveLoginBtn: "Đăng nhập",
    liveNotConfigured: "Tính năng phát trực tiếp chưa được bật trên máy chủ.",
    liveFailed:
      "Không bắt đầu phát được. Kiểm tra lại stream key và chắc chắn buổi phát đã được tạo trên YouTube/Facebook, rồi thử lại.",
    liveCaptureDenied:
      "Không mở được hộp thoại chọn thẻ chia sẻ. Nếu bạn không thấy hộp thoại nào hiện lên, hãy cấp quyền chia sẻ màn hình cho trang này trong trình duyệt rồi thử lại.",
    liveShareEnded: "Bạn đã ngừng chia sẻ thẻ nên buổi phát đã dừng.",
    liveTagline: "Chơi cờ úp (cờ tướng úp) miễn phí — không cần cài đặt",
    liveOutroTitle: "Cảm ơn bạn đã xem!",
    coveredPiece: "Quân úp",
    flipReveal: "Lật ngửa",
    flippedTo: (name: string) => `Lật thành ${name}`,
    coveredCapturedReveal:
      "Quân úp bị ăn sẽ được lật ngửa công khai ngay lập tức.",
    remainingDarkTitle: "Bộ bài còn úp",
    remainingDarkEmpty: "Đã lật ngửa hết mọi quân.",
    roomServerValidated:
      "Mọi nước đi trong phòng đều được máy chủ kiểm chứng — không ai xem trộm được quân úp.",
    revealAll: "Lật tất cả quân úp",
    commitmentVerified: "✓ Đã kiểm chứng cam kết chia bài",
    draw120: "Hòa — 120 nước không ăn quân, không lật quân",
    roomDrawOffer: "🤝 Cầu hòa",
    roomDrawAccept: "✓ Chấp nhận hòa",
    roomDrawDecline: "✗ Từ chối",
    roomDrawOfferedBy: (n: string) => `${n} đề nghị hòa`,
    roomDrawOffered: "Đối thủ đề nghị hòa",
    roomDrawWaiting: "Đã gửi đề nghị hòa…",
    roomDealVerified: "✓ Đã kiểm chứng phép xáo (hash khớp)",
    roomDealVerifyFailed: "✗ Hash phép xáo KHÔNG khớp!",
    roomRevealedTitle: "🃏 Bài thật của ván đấu",
    roomFlipped: (t: string) => `Lật ra: ${t}`,
    roomCapturedDark: (t: string) => `Ăn quân úp — lật ra: ${t}`,
    roomSendingMove: "Đang gửi nước đi…",
    roomReasonDraw120: "Hòa 120 nước",
    roomCoveredSuffix: " (úp)",
  },
};

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("cu-lang");
    if (saved === "vi" || saved === "en") return saved;
  } catch {
    /* storage unavailable */
  }
  // Default to Vietnamese; the user can switch to English (saved on change).
  return "vi";
}
