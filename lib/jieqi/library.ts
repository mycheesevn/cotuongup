// Thư viện bí kíp — interactive playbook library.
// Every line below was machine-verified (scripts/verify-library.ts):
// opening lines are fully legal, trap/mating lines end in checkmate,
// endgame lines produce the claimed result.

export interface LText {
  vi: string;
  en: string;
}

export type QuizKind = "exact" | "mate";

export interface LibraryStep {
  /** Coordinate move "x1,y1>x2,y2". Absent = no move (explore/observe step). */
  move?: string;
  /** Explanation or prompt shown for this step. */
  text: LText;
  /** If set, the user must find and play the move to advance. */
  quiz?: QuizKind;
  /** Quiz prompt (defaults to text when absent). */
  quizPrompt?: LText;
  /** Free exploration at the current position, then continue. */
  explore?: boolean;
  /** "x,y" square to preselect when an explore step opens. */
  exploreFocus?: string;
}

export interface LibraryLesson {
  id: string;
  title: LText;
  intro: LText;
  /** FEN of the starting position (uppercase = red). */
  startFen: string;
  startTurn: "red" | "black";
  steps: LibraryStep[];
  outro: LText;
}

export interface LibraryChapter {
  id: string;
  icon: string;
  title: LText;
  subtitle: LText;
  lessons: LibraryLesson[];
}

// FENs are FULL Jieqi FENs (core parseFen). The deal lesson uses the
// fixed seed-11 deal so every flip outcome quoted in the text is exact.
// Every step below is replay-verified by scripts/verify-library.ts.

const DEAL =
  "xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1 carnpnpbrbcpppaBNPNPBPRAACPCPR";

export const LIBRARY: LibraryChapter[] = [
  {
    id: "bat-dau",
    icon: "🃏",
    title: { vi: "Bắt đầu với Cờ Úp", en: "Getting started with Cờ Úp" },
    subtitle: {
      vi: "Đi theo vị trí, lật để lộ bài — hai ý tưởng làm nên ván cờ.",
      en: "Move by the square, flip to reveal — the two ideas that make the game.",
    },
    lessons: [
      {
        id: "di-theo-vi-tri",
        title: { vi: "Nước đầu đi theo vị trí", en: "The first move follows the square" },
        intro: {
          vi: "Mỗi quân úp đi nước đầu tiên đúng theo quân của ô xuất phát, đi xong mới lật ngửa. Ván dưới đây là một ván chia bài thật — hãy tự tay lật những quân đầu tiên!",
          en: "A face-down piece makes its first move exactly as the piece whose starting square it sits on — then it flips face-up. The position below is a real deal — flip the first pieces yourself!",
        },
        startFen: DEAL,
        startTurn: "red",
        steps: [
          {
            move: "0,6>0,5",
            quiz: "exact",
            quizPrompt: {
              vi: "🎯 Quân úp ở ô Tốt bìa trái: nó chỉ được tiến 1 ô như Tốt. Hãy đi nó!",
              en: "🎯 The covered piece on the edge Pawn square: it may only step forward like a Pawn. Play it!",
            },
            text: {
              vi: "Lật ra là Tượng! Quân ở ô Tốt vừa lật thành Tượng — từ nước sau nó sẽ đi theo luật Tượng (và Tượng đã lật còn được qua sông).",
              en: "It flips into an Elephant! The piece on the Pawn square is really an Elephant — from now on it moves as one (and a revealed Elephant may cross the river).",
            },
          },
          {
            move: "0,0>0,2",
            text: {
              vi: "Đen đáp: quân úp ở ô Xe đi như Xe xuống 2 ô… và lật ra là Pháo! Nước đầu luôn mượn luật của vị trí, bất kể quân thật là gì.",
              en: "Black answers: the covered piece on the Chariot square glides down two squares like a Chariot… and flips into a Cannon! The first move always borrows the square's rules, whatever the real piece is.",
            },
          },
          {
            move: "6,6>6,5",
            quiz: "exact",
            quizPrompt: {
              vi: "🎯 Tới lượt bạn: tiến quân úp ở ô Tốt thứ tư (cột 6) lên 1 ô.",
              en: "🎯 Your turn: push the covered piece on the fourth Pawn square (file 6) forward one.",
            },
            text: {
              vi: "Lật ra là Mã! Ba quân úp, ba danh tính khác nhau — không ai biết trước quân nào là quân gì, kể cả chủ nhân của nó.",
              en: "It flips into a Horse! Three covered pieces, three different identities — nobody knows what any of them is in advance, not even their owner.",
            },
          },
        ],
        outro: {
          vi: "Quy tắc vàng: quân úp đi theo vị trí ở nước đầu, lật ngửa ngay sau nước đi, rồi chơi theo danh tính thật. Thuộc được điều này là bạn đã hiểu 80% Cờ Úp!",
          en: "The golden rule: a covered piece moves by its square on its first move, flips immediately after, then plays as its true identity. Know this and you understand 80% of Cờ Úp!",
        },
      },
      {
        id: "lat-ra-chieu-het",
        title: { vi: "Lật quân chiếu hết", en: "Flip to deliver checkmate" },
        intro: {
          vi: "Thế cờ: Đỏ có 2 Xe đã lật giữ hai cánh, Tướng đen bị kẹp giữa cung. Nhưng đòn kết liễu lại nằm ở quân úp ô Tốt ở trung lộ — nó chưa từng di chuyển. Bạn có tìm ra không?",
          en: "Position: Red's two revealed Chariots hold the wings and Black's King is boxed in its palace. But the killing blow hides in the covered Pawn-square piece on the central file — it has never moved. Can you find it?",
        },
        startFen:
          "4k4/9/3R1R3/9/9/9/4X4/9/9/3K5 w - - 0 1 R",
        startTurn: "red",
        steps: [
          {
            move: "4,6>4,5",
            quiz: "mate",
            quizPrompt: {
              vi: "🎯 Chiếu hết trong 1 nước! Hãy tìm nước đi kết liễu — gợi ý: đừng chỉ nhìn các quân đã lật.",
              en: "🎯 Checkmate in 1! Find the killing move — hint: don't only look at the revealed pieces.",
            },
            text: {
              vi: "Quân úp tiến lên và lật ra là XE ngay trên cột Tướng: chiếu hết! Hai Xe cánh đã bịt mọi ô thoát (3,0), (5,0) và (4,1). Đây là đòn đặc sản của Cờ Úp: đòn chí mạng đến từ quân chưa ai biết là gì.",
              en: "The covered piece steps up and flips into a CHARIOT right on the King's file: checkmate! The wing Chariots already cover every escape — (3,0), (5,0) and (4,1). This is Cờ Úp's signature blow: the killer strike comes from a piece nobody knew.",
            },
          },
        ],
        outro: {
          vi: "Khi tính đòn kết liễu, luôn đếm cả các quân úp gần Tướng địch: mỗi quân úp là một ẩn số có thể lật thành quân chiếu hết.",
          en: "When calculating a finish, always count the covered pieces near the enemy King: every one is an unknown that could flip into the mating piece.",
        },
      },
    ],
  },
  {
    id: "chien-thuat-up",
    icon: "🎴",
    title: { vi: "Chiến thuật Cờ Úp", en: "Cờ Úp tactics" },
    subtitle: {
      vi: "Sĩ chiến, Tượng chiến và nghệ thuật đọc bộ bài còn úp.",
      en: "Battle Advisors, battle Elephants, and reading the remaining dark pieces.",
    },
    lessons: [
      {
        id: "si-chien-tuong-chien",
        title: { vi: "Sĩ chiến & Tượng chiến", en: "Battle Advisors & Elephants" },
        intro: {
          vi: "Khác cờ tướng: Sĩ và Tượng SAU KHI LẬT không còn bị nhốt — Sĩ được ra khỏi cung đi khắp bàn, Tượng được qua sông sang đất địch. Hãy xem chúng thoát khỏi 'ao nhà' như thế nào.",
          en: "Unlike xiangqi: once REVEALED, Advisors and Elephants are unchained — the Advisor may leave the palace and roam the board, the Elephant may cross the river into enemy land. Watch them escape the home pond.",
        },
        startFen: "5k3/9/9/p8/9/9/9/3A5/9/2B1K4 w - - 0 1",
        startTurn: "red",
        steps: [
          {
            move: "3,7>2,6",
            text: {
              vi: "Sĩ đỏ bước chéo ra KHỎI cung — nước đi phạm luật trong cờ tướng, nhưng hoàn toàn hợp lệ với Sĩ đã lật trong Cờ Úp ('Sĩ chiến').",
              en: "Red's Advisor steps diagonally OUT of the palace — illegal in xiangqi, perfectly legal for a revealed Advisor in Cờ Úp (a 'battle Advisor').",
            },
          },
          {
            move: "0,3>0,4",
            text: { vi: "Đen tiến Tốt bìa.", en: "Black pushes the edge Pawn." },
          },
          {
            move: "2,9>4,7",
            text: {
              vi: "Tượng đỏ lên điểm giữa như thường lệ — từ đây nó có thể tiếp tục qua sông.",
              en: "Red's Elephant takes its usual central point — from here it can keep going across the river.",
            },
          },
          {
            move: "0,4>0,5",
            text: { vi: "Tốt đen qua sông.", en: "Black's Pawn crosses the river." },
          },
          {
            move: "4,7>6,5",
            text: {
              vi: "Tượng tiến tới bờ sông. Trong cờ tướng nó phải dừng ở đây mãi mãi…",
              en: "The Elephant reaches the river bank. In xiangqi it would be stuck here forever…",
            },
          },
          {
            move: "0,5>1,5",
            text: {
              vi: "Tốt đen đã qua sông nên được đi ngang — luật này giữ nguyên như cờ tướng.",
              en: "Black's Pawn has crossed, so it may step sideways — that rule is unchanged from xiangqi.",
            },
          },
          {
            move: "6,5>4,3",
            text: {
              vi: "Tượng QUA SÔNG sang đất địch ('Tượng chiến')! Một quân phòng thủ bỗng thành quân tấn công — thế trận mở ra hẳn.",
              en: "The Elephant CROSSES THE RIVER into enemy land (a 'battle Elephant')! A defensive piece suddenly becomes an attacker — the position opens right up.",
            },
          },
        ],
        outro: {
          vi: "Nhớ kỹ: Sĩ/Tượng chưa lật bị giới hạn như quân của vị trí; chỉ sau khi lật chúng mới được tự do. Đừng phí một con Tượng chiến để chặn đòn vặt ở sân nhà!",
          en: "Remember: unrevealed Advisors/Elephants are bound by their square's rules; freedom comes only after the flip. Don't waste a battle Elephant blocking trifles at home!",
        },
      },
      {
        id: "doc-bo-bai-con-up",
        title: { vi: "Đọc bộ bài còn úp", en: "Reading the remaining dark pieces" },
        intro: {
          vi: "Thông tin trong Cờ Úp là công khai một nửa: bạn luôn biết MỖI BÊN còn úp những quân gì (bộ chuẩn trừ đi quân đã lộ và đã bị ăn) — bảng 'Bộ bài còn úp' dưới bàn cờ liệt kê chính xác điều đó. Hãy làm quen với cách đọc nó.",
          en: "Information in Cờ Úp is half public: you always know WHICH identities each side still has face-down (the standard set minus revealed and captured) — the 'Still face-down' panel under the board lists exactly that. Get used to reading it.",
        },
        startFen: DEAL,
        startTurn: "red",
        steps: [
          {
            explore: true,
            exploreFocus: "1,7",
            text: {
              vi: "🔍 Nhìn quân úp ở ô Pháo (đang được chọn): trước khi lật, xác suất nó là Xe, Pháo, Mã, Tượng, Sĩ hay Tốt tỉ lệ đúng với số quân mỗi loại còn trong bộ úp của Đỏ (2-2-2-2-2-5). Tự do chạm vào các quân khác để xem chúng đi được những đâu theo vị trí.",
              en: "🔍 Look at the covered piece on the Cannon square (selected): before it flips, the odds it is a Chariot, Cannon, Horse, Elephant, Advisor or Pawn are exactly the counts of each type left in Red's dark set (2-2-2-2-2-5). Feel free to tap other pieces to see how they move by their squares.",
            },
          },
          {
            move: "1,7>4,7",
            text: {
              vi: "Pháo úp ra trung lộ (đi như Pháo ở nước đầu) và lật ra là Tượng. Từ giờ, bộ úp của Đỏ mất 1 Tượng: xác suất các quân úp còn lại là Tượng giảm xuống — bảng còn úp cập nhật ngay. Người chơi giỏi luôn tính lại xác suất sau mỗi lần lật.",
              en: "The covered Cannon-square piece comes to the center file (moving as a Cannon on its first move) and flips into an Elephant. From now on Red's dark set has one fewer Elephant: the odds for the remaining covered pieces shift — and the panel updates instantly. Strong players recalculate after every flip.",
            },
          },
        ],
        outro: {
          vi: "Ba thói quen của kỳ thủ Cờ Úp: (1) trước khi lật một quân, nhìn bảng còn úp của chính mình; (2) sau mỗi lần đối thủ lật, cập nhật xác suất; (3) cuối ván, khi bộ úp đã lộ gần hết, hãy chơi như cờ tướng thông thường.",
          en: "Three habits of strong Cờ Úp players: (1) before flipping a piece, check your own remaining-dark panel; (2) after every enemy flip, update the odds; (3) in the endgame, when almost everything is revealed, play it like ordinary xiangqi.",
        },
      },
    ],
  },
];

export const TOTAL_LESSONS = LIBRARY.reduce((n, c) => n + c.lessons.length, 0);

/** Ordered list of all lesson ids (for unlock logic). */
export function allLessonIds(): string[] {
  return LIBRARY.flatMap((c) => c.lessons.map((l) => l.id));
}

/** Is the lesson unlocked given the set of completed lesson ids? */
export function isLessonUnlocked(lessonId: string, done: Set<string>): boolean {
  const ids = allLessonIds();
  const i = ids.indexOf(lessonId);
  if (i <= 0) return true;
  return done.has(ids[i - 1]);
}

/** Is the chapter unlocked? (First chapter always; others need previous chapter complete.) */
export function isChapterUnlocked(chapterId: string, done: Set<string>): boolean {
  const ci = LIBRARY.findIndex((c) => c.id === chapterId);
  if (ci <= 0) return true;
  const prev = LIBRARY[ci - 1];
  return prev.lessons.every((l) => done.has(l.id));
}

export function findLesson(lessonId: string): LibraryLesson | null {
  for (const c of LIBRARY) {
    const l = c.lessons.find((x) => x.id === lessonId);
    if (l) return l;
  }
  return null;
}

export function nextLessonId(lessonId: string): string | null {
  const ids = allLessonIds();
  const i = ids.indexOf(lessonId);
  return i >= 0 && i + 1 < ids.length ? ids[i + 1] : null;
}
