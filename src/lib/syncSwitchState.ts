/** Synchronization Switch — Firestore: gameData.syncSwitch */

export const INTRO_READ_MS = 10_000;
export const SILENT_MISS_ADVANCE_MS = 1_200;
export const NUDGE_SHOW_MS = 2_000;
export const VICTORY_PAUSE_MS = 3_000;
export const PRIVATE_WRITE_MS = 60_000;

export type SyncPhase =
  | "intro"
  | "round_active"
  | "round_reveal"
  | "breathing_pause"
  | "victory_pause"
  | "private_write"
  | "closing";

export type PickSide = "left" | "right";

export type PromptCategory = "directional" | "preference" | "absurd" | "final";

export type PromptDef = {
  id: string;
  category: PromptCategory;
  title: string;
  left: string;
  right: string;
};

export type MatchHistoryItem = { title: string; choice: string };

export type SyncSwitchV2 = {
  v: 2;
  phase: SyncPhase;
  introReady: { userA: boolean; userB: boolean };
  introReadyAfter: number;
  streak: number;
  consecutiveMisses: number;
  roundSeq: number;
  roundId: string;
  promptCategory: PromptCategory;
  title: string;
  optionLeft: string;
  optionRight: string;
  /**
   * Per-device button order (from server). When true, left tap = optionRight label.
   * Independent A/B so partners can't win by agreeing "always tap left" — they must match meaning.
   */
  swapOptionsUserA?: boolean;
  swapOptionsUserB?: boolean;
  /** @deprecated If per-user swaps are absent (old sessions), both players used this layout. */
  swapOptions?: boolean;
  windowMs: number;
  roundStartedAt: number;
  picks: { userA: PickSide | null; userB: PickSide | null };
  /** Set when entering round_reveal */
  revealMatch: boolean | null;
  revealPickA: PickSide | null;
  revealPickB: PickSide | null;
  showWarmNudge: boolean;
  revealAdvanceAt: number | null;
  matchHistory: MatchHistoryItem[];
  usedPromptIds: string[];
  breathingAck: { userA: boolean; userB: boolean };
  victoryStartedAt: number | null;
  insightLine: string;
  talkQuestion: string;
  privateQuestion: string;
  privateWriteEndsAt: number | null;
  privateAnswers: { userA: string | null; userB: string | null };
  /** Last matched absurd title for talk-about tailoring */
  lastAbsurdTitle: string | null;
};

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function P(
  category: PromptCategory,
  pid: string,
  title: string,
  left: string,
  right: string
): PromptDef {
  return { id: `${category}-${pid}`, category, title, left, right };
}

const DIR = (pid: string, title: string, l: string, r: string) => P("directional", pid, title, l, r);
const PR = (pid: string, title: string, l: string, r: string) => P("preference", pid, title, l, r);
const AB = (pid: string, title: string, l: string, r: string) => P("absurd", pid, title, l, r);
const FN = (pid: string, title: string, l: string, r: string) => P("final", pid, title, l, r);

/** Directional — baseline */
export const PROMPTS_DIRECTIONAL: PromptDef[] = [
  DIR("1", "Which way?", "Left", "Right"),
  DIR("2", "Which way?", "Up", "Down"),
  DIR("3", "Count it", "Odd", "Even"),
  DIR("4", "Compass", "North", "South"),
  DIR("5", "Compass", "East", "West"),
  DIR("6", "Weather vibe", "Sun", "Rain"),
  DIR("7", "In or out?", "Inside", "Outside"),
  DIR("8", "First or last?", "First", "Last"),
  DIR("9", "More or less?", "More", "Less"),
  DIR("10", "Start or end?", "Start", "Finish"),
  DIR("11", "High or low?", "High", "Low"),
  DIR("12", "Fast or slow?", "Fast", "Slow"),
  DIR("13", "Big or small?", "Big", "Small"),
  DIR("14", "Near or far?", "Near", "Far"),
  DIR("15", "Light or dark?", "Light", "Dark"),
  DIR("16", "Soft or hard?", "Soft", "Hard"),
  DIR("17", "Quiet or loud?", "Quiet", "Loud"),
  DIR("18", "Early or late?", "Early", "Late"),
  DIR("19", "Simple or complex?", "Simple", "Complex"),
  DIR("20", "Open or closed?", "Open", "Closed"),
  DIR("21", "Full or empty?", "Full", "Empty"),
  DIR("22", "Smooth or rough?", "Smooth", "Rough"),
  DIR("23", "Warm or cool?", "Warm", "Cool"),
  DIR("24", "Young or old?", "Young", "Old"),
  DIR("25", "Same or different?", "Same", "Different"),
  DIR("26", "Give or take?", "Give", "Take"),
  DIR("27", "Push or pull?", "Push", "Pull"),
  DIR("28", "Stop or go?", "Stop", "Go"),
  DIR("29", "Win or learn?", "Win", "Learn"),
  DIR("30", "Plan or improvise?", "Plan", "Improvise"),
  DIR("31", "Curve or straight?", "Curve", "Straight"),
  DIR("32", "Sharp or round?", "Sharp", "Round"),
  DIR("33", "Front or back?", "Front", "Back"),
  DIR("34", "Plus or minus?", "Plus", "Minus"),
  DIR("35", "Yes or no?", "Yes", "No"),
  DIR("36", "Inhale or exhale?", "Inhale", "Exhale"),
  DIR("37", "Step or jump?", "Step", "Jump"),
  DIR("38", "Loose or tight?", "Loose", "Tight"),
  DIR("39", "Wet or dry?", "Wet", "Dry"),
  DIR("40", "Smooth turn or hard stop?", "Smooth turn", "Hard stop"),
];

export const PROMPTS_PREFERENCE: PromptDef[] = [
  PR("1", "Daily ritual", "Coffee", "Tea"),
  PR("2", "Companions", "Cats", "Dogs"),
  PR("3", "Time of day", "Morning", "Night"),
  PR("4", "Wind down", "Book", "Movie"),
  PR("5", "Season", "Summer", "Winter"),
  PR("6", "Sweet or salty?", "Sweet", "Salty"),
  PR("7", "Text or call?", "Text", "Call"),
  PR("8", "Beach or pool?", "Beach", "Pool"),
  PR("9", "Cook or order in?", "Cook", "Order in"),
  PR("10", "Shower morning or night?", "Morning shower", "Night shower"),
  PR("11", "Planner or spontaneous?", "Planner", "Spontaneous"),
  PR("12", "Window or aisle?", "Window", "Aisle"),
  PR("13", "Pancakes or waffles?", "Pancakes", "Waffles"),
  PR("14", "Mountains or city?", "Mountains", "City"),
  PR("15", "Sneakers or boots?", "Sneakers", "Boots"),
  PR("16", "Sunrise or sunset?", "Sunrise", "Sunset"),
  PR("17", "Dance or watch?", "Dance", "Watch"),
  PR("18", "Fiction or nonfiction?", "Fiction", "Nonfiction"),
  PR("19", "Bath or shower?", "Bath", "Shower"),
  PR("20", "Starter or dessert?", "Starter", "Dessert"),
  PR("21", "Road trip or fly?", "Road trip", "Fly"),
  PR("22", "Talk it out or sleep on it?", "Talk now", "Sleep on it"),
  PR("23", "Big party or small hang?", "Big party", "Small hang"),
  PR("24", "Save or spend?", "Save", "Spend"),
  PR("25", "Digital notes or paper?", "Digital", "Paper"),
  PR("26", "Podcast or music?", "Podcast", "Music"),
  PR("27", "Early bird or night owl?", "Early bird", "Night owl"),
  PR("28", "Hot drink iced?", "Hot", "Iced"),
  PR("29", "Window seat cozy?", "Window seat", "Aisle seat"),
  PR("30", "Routine or novelty?", "Routine", "Novelty"),
  PR("31", "Socks or barefoot?", "Socks", "Barefoot"),
  PR("32", "Blanket or sheet?", "Blanket", "Sheet"),
  PR("33", "Toast or cereal?", "Toast", "Cereal"),
  PR("34", "Bike or walk?", "Bike", "Walk"),
  PR("35", "Photos or live in the moment?", "Photos", "Live in the moment"),
  PR("36", "Hot soup or cold salad?", "Hot soup", "Cold salad"),
  PR("37", "Playlist shuffle or pick each song?", "Shuffle", "Pick each song"),
  PR("38", "Voice memo or written note?", "Voice memo", "Written note"),
  PR("39", "Farmers market or grocery aisle?", "Farmers market", "Grocery aisle"),
  PR("40", "Hug hello or wave hello?", "Hug hello", "Wave hello"),
];

export const PROMPTS_ABSURD: PromptDef[] = [
  AB("1", "If you had to pick", "Aliens", "Ghosts"),
  AB("2", "Superpower", "Time travel", "Teleportation"),
  AB("3", "Battle of legends", "Pirates", "Ninjas"),
  AB("4", "Snack universe", "Tacos", "Sushi"),
  AB("5", "Myth mode", "Dragon", "Unicorn"),
  AB("6", "Secret base", "Moon base", "Underwater city"),
  AB("7", "Sidekick", "Robot", "Talking animal"),
  AB("8", "Vacation impossible", "Jungle", "Arctic"),
  AB("9", "Treasure", "Gold", "Ancient map"),
  AB("10", "Storm name", "Thunder", "Whisper"),
  AB("11", "Portal opens", "Past", "Future"),
  AB("12", "Tiny problem", "Giants", "Borrowers"),
  AB("13", "Music spell", "Jazz", "Electronic"),
  AB("14", "Spaceship snack", "Freeze-dried", "Mystery tube"),
  AB("15", "Haunted choice", "Friendly ghost", "Poltergeist with rules"),
  AB("16", "Ocean friend", "Dolphin", "Octopus"),
  AB("17", "Forest guide", "Owl", "Fox"),
  AB("18", "Desert ride", "Camel", "Hoverboard"),
  AB("19", "Castle job", "Wizard", "Chef"),
  AB("20", "Time loop lunch", "Same sandwich", "Surprise meal"),
  AB("21", "Parallel you", "Bolder", "Calmer"),
  AB("22", "Dream job absurd", "Cloud architect", "Professional napper"),
  AB("23", "Pet giant", "Hamster sized elephant", "Elephant sized hamster"),
  AB("24", "Weather machine", "Snow in July", "Sun in December"),
  AB("25", "Invention", "Self-tying shoes", "Mood socks"),
  AB("26", "Alien greeting", "Handshake", "Dance move"),
  AB("27", "Miniature world", "Train set", "Dollhouse"),
  AB("28", "Superhero flaw", "Always honest", "Always late"),
  AB("29", "Museum night", "Paintings walk", "Dinosaur bones hum"),
  AB("30", "Luck charm", "Four-leaf clover", "Lucky penny"),
  AB("31", "Moon cheese flavor", "Sharp cheddar", "Mystery sparkle"),
  AB("32", "Haunted house rule", "No running", "No screaming"),
  AB("33", "Time machine etiquette", "Knock first", "Surprise entrance"),
  AB("34", "Cloud storage literal", "Fluffy folder", "Storm backup"),
  AB("35", "Secret handshake upgrade", "Finger guns", "Wiggle eyebrows"),
  AB("36", "Pet dragon diet", "Spicy peppers", "Ice cream"),
  AB("37", "Underwater concert", "Bubble bass", "Whale chorus"),
  AB("38", "Shrink ray accident", "Teacup car", "Giant spoon"),
  AB("39", "Alien sport", "Zero-gravity tag", "Moon frisbee"),
  AB("40", "Parallel universe snack", "Glow chips", "Quiet popcorn"),
];

export const PROMPTS_FINAL: PromptDef[] = [
  FN("1", "The horizon", "Tomorrow", "Next Year"),
  FN("2", "When it matters", "Us", "Everything Else"),
  FN("3", "Forward", "Closer", "Further"),
  FN("4", "Together", "Side by side", "Back to back"),
];

/** Next round window from current streak (0 = baseline after miss). */
export function windowMsForStreak(streak: number): number {
  if (streak >= 4) return 2000;
  if (streak >= 3) return 1500;
  if (streak >= 1) return 1800;
  return 2000;
}

export function categoryForNextRound(streak: number): PromptCategory {
  if (streak >= 4) return "final";
  if (streak >= 3) return "absurd";
  if (streak >= 1) return "preference";
  return "directional";
}

export function pickPrompt(
  category: PromptCategory,
  used: Set<string>
): PromptDef | null {
  let pool: PromptDef[];
  switch (category) {
    case "directional":
      pool = PROMPTS_DIRECTIONAL;
      break;
    case "preference":
      pool = PROMPTS_PREFERENCE;
      break;
    case "absurd":
      pool = PROMPTS_ABSURD;
      break;
    case "final":
      pool = PROMPTS_FINAL;
      break;
    default:
      pool = PROMPTS_DIRECTIONAL;
  }
  const fresh = pool.filter((p) => !used.has(p.id));
  const pickFrom = fresh.length > 0 ? fresh : pool;
  return pickFrom[Math.floor(Math.random() * pickFrom.length)] ?? null;
}

/** Map a tap side to the semantic option label for the current layout. */
export function wordForPick(
  pick: PickSide | null,
  swapOptions: boolean,
  optionLeft: string,
  optionRight: string
): string {
  if (pick == null) return "";
  const leftLabel = swapOptions ? optionRight : optionLeft;
  const rightLabel = swapOptions ? optionLeft : optionRight;
  return pick === "left" ? leftLabel : rightLabel;
}

export function swapForUser(role: "userA" | "userB", ss: SyncSwitchV2): boolean {
  const a = ss.swapOptionsUserA;
  const b = ss.swapOptionsUserB;
  if (a !== undefined && b !== undefined) {
    return role === "userA" ? a : b;
  }
  return ss.swapOptions ?? false;
}

export function computeSemanticMatch(
  pickA: PickSide | null,
  pickB: PickSide | null,
  swapA: boolean,
  swapB: boolean,
  optionLeft: string,
  optionRight: string
): boolean {
  if (pickA == null || pickB == null) return false;
  const wa = wordForPick(pickA, swapA, optionLeft, optionRight);
  const wb = wordForPick(pickB, swapB, optionLeft, optionRight);
  return wa !== "" && wb !== "" && wa === wb;
}

export function startRoundPatch(
  streak: number,
  usedIds: string[],
  roundSeq: number
): Record<string, unknown> {
  const used = new Set(usedIds);
  const cat = categoryForNextRound(streak);
  const prompt = pickPrompt(cat, used);
  if (!prompt) return {};
  const nextUsed = used.has(prompt.id) ? usedIds : [...usedIds, prompt.id];
  const w = windowMsForStreak(streak);
  const now = Date.now();
  return {
    phase: "round_active",
    roundSeq: roundSeq + 1,
    roundId: id(),
    promptCategory: cat,
    title: prompt.title,
    optionLeft: prompt.left,
    optionRight: prompt.right,
    swapOptionsUserA: Math.random() < 0.5,
    swapOptionsUserB: Math.random() < 0.5,
    windowMs: w,
    roundStartedAt: now,
    picks: { userA: null, userB: null },
    revealMatch: null,
    revealPickA: null,
    revealPickB: null,
    showWarmNudge: false,
    revealAdvanceAt: null,
    usedPromptIds: nextUsed,
  };
}

export function closingInsight(
  lastTitle: string,
  lastLeft: string,
  lastRight: string,
  choice: string
): string {
  const pair = `${lastLeft} / ${lastRight}`;
  if (lastTitle.includes("Us") || lastLeft === "Us" || lastRight === "Us") {
    if (choice === "Us" || choice === lastLeft || choice === lastRight) {
      if (lastLeft === "Us" && choice === "Us") {
        return "When it came down to it, you both chose each other.";
      }
    }
  }
  if (lastLeft === "Tomorrow" || lastRight === "Next Year") {
    return "You lined up on what’s next — even in the same breath.";
  }
  return "You found each other’s rhythm — five times in a row.";
}

export function createInitialSyncSwitchState(): SyncSwitchV2 {
  const now = Date.now();
  return {
    v: 2,
    phase: "intro",
    introReady: { userA: false, userB: false },
    introReadyAfter: now + INTRO_READ_MS,
    streak: 0,
    consecutiveMisses: 0,
    roundSeq: 0,
    roundId: "",
    promptCategory: "directional",
    title: "",
    optionLeft: "",
    optionRight: "",
    swapOptionsUserA: false,
    swapOptionsUserB: false,
    windowMs: 2000,
    roundStartedAt: 0,
    picks: { userA: null, userB: null },
    revealMatch: null,
    revealPickA: null,
    revealPickB: null,
    showWarmNudge: false,
    revealAdvanceAt: null,
    matchHistory: [],
    usedPromptIds: [],
    breathingAck: { userA: false, userB: false },
    victoryStartedAt: null,
    insightLine: "",
    talkQuestion: "",
    privateQuestion:
      "Which one surprised you more — that you matched on something, or that you almost didn’t?",
    privateWriteEndsAt: null,
    privateAnswers: { userA: null, userB: null },
    lastAbsurdTitle: null,
  };
}
