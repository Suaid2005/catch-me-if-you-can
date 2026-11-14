/**
 * lib/practiceAi.ts
 * ──────────────────
 * Autonomous AI Decision Engine, Clue Evaluation, and Vote Tallying
 * for Practice Mode vs Neural AI Bots.
 *
 * Design Guarantees:
 * 1. Strict Role-Based Information Isolation:
 *    - Innocent agents access the secret word, category, hints, and public clues.
 *    - The AI Impostor receives ONLY category and public clues (strictly NO secret word or secret metrics).
 * 2. Deterministic Multi-Signal Heuristic Clue Evaluator:
 *    - Normalized word-boundary exact leak detection.
 *    - Subword n-gram lexical overlap.
 *    - Category term compatibility.
 *    - Curated vocabulary hint matching.
 *    - Vagueness and generic evasion pattern matching.
 *    - Cross-round consistency.
 *    - Skipped, empty, or nonsense penalties.
 * 3. Independent Persona-Based Voting:
 *    - Agent Cyber: Analytical divergence from secret word.
 *    - Agent Neon: Aggressive penalty for generic evasion/vagueness.
 *    - Agent Shadow: Quiet observation of cross-round contradictions.
 *    - AI Impostor: Surface ambiguity deflection (never votes for itself).
 * 4. Strict Ballot Validation:
 *    - Exactly 4 active players, exactly 4 unique valid ballots.
 *    - Rejects self-votes, duplicate voters, unknown voters, and invalid targets.
 * 5. Deterministic Vote Tally & Suspicion Tie-Breaking:
 *    - Unambiguous highest vote count (unanimous, majority, plurality) eliminates cleanly without suspicion.
 *    - Genuine ties tie-break using innocent suspicion scores with epsilon = 1e-4 tolerance.
 *    - Missing, non-finite, or out-of-bounds (<0 or >1) suspicion scores force deadlock.
 * 6. Production Submission Controller & Atomic Reward Guard:
 *    - Synchronous mutex lock preventing rapid concurrent submissions.
 *    - Gated by match phase (rejects submissions outside "voting").
 *    - Discards corrupted ballot sets on failure and requires fresh human selection.
 *    - Commits rewards exactly once via AtomicRewardGuard synchronously.
 */

// ── Types & Interfaces ──────────────────────────────────────────────

export interface PublicClue {
  playerId: string;
  playerName: string;
  avatar: string;
  clueText: string;
  round: number;
}

export interface PlayerSummary {
  id: string;
  name: string;
  avatar: string;
  persona: string;
}

export interface InnocentAgentContext {
  role: "innocent";
  secretWord: string;
  category: string;
  hints: string[];
  allClues: PublicClue[];
  opponents: PlayerSummary[];
}

export interface ImpostorAgentContext {
  role: "impostor";
  category: string;
  allClues: PublicClue[];
  opponents: PlayerSummary[];
}

export interface BotVoteDecision {
  voterId: string;
  voterName: string;
  voterAvatar: string;
  targetId: string;
  targetName: string;
  targetAvatar: string;
  evidenceExplanation: string;
}

export interface ClueEvaluation {
  similarity: number;
  vaguenessScore: number;
  isLeak: boolean;
  hintHits: number;
  categoryHits: number;
  suspicionScore: number; // [0.0, 1.0]
  verdict: "SUSPICIOUS" | "VAGUE" | "BALANCED" | "TOO_OBVIOUS";
}

export interface BallotValidationResult {
  isValid: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface VoteTallyResult {
  success: boolean;
  errorCode: string | null;
  eliminatedId: string | null;
  eliminatedPlayer: PlayerSummary | null;
  wasImpostor: boolean;
  winner: "innocents" | "impostor" | "inconclusive";
  winReason: string;
  isTie: boolean;
  counts: Record<string, number>;
  ballots: BotVoteDecision[];
}

export type PracticePhase = "setup" | "reveal" | "clues" | "discussion" | "voting" | "results";

export interface PracticeSubmissionResult {
  status: "SUCCESS" | "VALIDATION_FAILED" | "INVALID_SELECTION" | "REJECTED_PHASE" | "REJECTED_IN_FLIGHT" | "ERROR";
  errorMessage: string | null;
  tallyResult: VoteTallyResult | null;
}

// ── Generic Evasion Patterns ─────────────────────────────────────────

const GENERIC_EVASION_PATTERNS = [
  /\b(something|anything)\b/i,
  /\b(commonly|often|usually|typically|frequently)\s+(encountered|found|used|seen|experienced)\b/i,
  /\beveryday\s+(situations?|life|use|objects?|things?|routines?)\b/i,
  /\b(practical|useful|general)\s+(functions?|purposes?|uses?|values?)\b/i,
  /\bpeople\s+(?:would|might|can|often|usually|frequently)?\s*(use|interact|see|recognize|appreciate|know|find|enjoy|encounter)\b/i,
  /\b(recognizable|certain|particular)\s+(?:its\s+)?(shape|value|form|size|quality)\b/i,
  /\b(familiar|essential|important)\s+(and|to|for|in)\b/i,
  /\bimportant\s+role\b/i,
  /\bmany\s+places\b/i,
  /\bdaily\s+(life|routine|activity)\b/i,
  /\byou(?:'ll| will| can| might)?\s+see\s+people\b/i,
  /\b(it is|it's|they are)\s+(just\s+)?(something|an? object|a thing)\b/i,
  /\bmost\s+people\s+(?:would|might|can|will)?\s*(recognize|know|agree)\b/i,
];

/**
 * Category Boilerplate Patterns: Detects abstract meta-statements that describe
 * the general category context without specifying any concrete, discriminating attributes.
 * Clues relying solely on these phrases are penalized for lack of informativeness.
 */
const CATEGORY_BOILERPLATE_PATTERNS = [
  /\b(?:natural|wild)\s+(?:habitat|behaviors?|ecosystems?)\b/i,
  /\b(?:wildlife|nature)\s+(?:documentaries|reserves?|surroundings?)\b/i,
  /\b(?:survival|suited for survival)\s+(?:in nature|in the wild)\b/i,
  /\bimportant\s+role\s+(?:in|within)\b/i,
  /\b(?:distinctive|certain)\s+physical\s+traits\b/i,
  /\b(?:electronic|digital)\s+(?:device|interface|engineering)\b/i,
  /\b(?:daily|routine)\s+(?:tasks?|activities|routines?|use)\b/i,
  /\bmodern\s+(?:engineering|workplaces?|technology)\b/i,
  /\belectrical\s+power\b/i,
  /\bessential\s+tool\b/i,
  /\bdistinct\s+flavor\b/i,
  /\bprepared\s+in\s+kitchens?\b/i,
  /\bserv(?:ed|es)\s+fresh\b/i,
  /\bpopular\s+choice\b/i,
  /\bconsume\s+(?:during|at)\b/i,
  /\bpractical\s+item\b/i,
  /\beveryday\s+(?:function|use|item|object)\b/i,
  /\bconvenient\s+and\s+reliable\b/i,
  /\bwithin\s+easy\s+reach\b/i,
  /\b(?:great\s+)?recreation\s+and\s+excitement\b/i,
  /\bspectators?\s+and\s+players?\b/i,
  /\bpopular\s+pastime\b/i,
  /\bcoordinated\s+movements\b/i,
  /\bnotable\s+destination\b/i,
  /\bmeaningful\s+time\b/i,
  /\bspecific\s+experience\b/i,
  /\bdistinct\s+architecture\b/i,
  /\bmarked\s+on\s+maps\b/i,
  /\bfrequented\s+by\s+travel(?:l)?ers\b/i,
];

// Concrete Property Tokens: Physical, sensory, anatomical, or functional attributes.
const CONCRETE_PROPERTY_TOKENS = new Set([
  "stripes", "striped", "paws", "claws", "fur", "tail", "wings", "feathers", "beak", "ears", "eyes",
  "trunk", "tusks", "teeth", "whiskers", "cub", "roar", "hunt", "hunter", "predator", "carnivore",
  "herbivore", "mammal", "feline", "cat", "bird", "fish", "fin", "blowhole", "ocean", "swim", "swimming",
  "screen", "keyboard", "battery", "metal", "audio", "cable", "lens", "gears", "wheels", "pedals",
  "cheese", "crust", "sauce", "oven", "dough", "baked", "coffee", "caffeine", "roasted", "mug", "beans",
  "ice", "cone", "frozen", "cocoa", "chocolate", "citrus", "lemon", "sugar", "sour", "sweet",
  "zipper", "strap", "canopy", "waterproof", "shades", "tinted", "clock", "tick", "ticking",
  "hoop", "court", "popcorn", "movie", "tracks", "loop", "board", "knights", "pawns", "checkmate",
  "books", "shelves", "runway", "planes", "sand", "waves", "towers", "moat", "castle",
  "orange", "yellow", "black", "white", "red", "green", "blue", "gray", "brown", "bengal", "siberian"
]);

// ── Rich Semantic Lexicons & Word Associations ────────────────────────

const CATEGORY_LEXICON: Record<string, string[]> = {
  Technology: [
    "screen", "device", "battery", "wireless", "power", "digital", "electronic",
    "keyboard", "apps", "lens", "metal", "audio", "cable", "software", "hardware",
    "smart", "internet", "machine", "data", "compute", "gadget", "charger",
    "monitor", "cellular", "automated", "sensors", "tech", "wifi", "portable",
  ],
  "Food & Drinks": [
    "crust", "cheese", "oven", "slice", "roasted", "cup", "caffeine", "sweet",
    "cocoa", "citrus", "sour", "cold", "frozen", "drink", "food", "eat", "meal",
    "flavor", "dough", "baked", "recipe", "snack", "savory", "delicious", "taste",
    "ingredient", "kitchen", "breakfast", "lunch", "dinner", "refreshing", "ice",
    "chocolate", "beverage", "dairy", "sauce", "treat", "barista", "restaurant",
    "hot", "dish", "italian", "order", "warm", "spicy", "cooked", "pie",
  ],
  Animals: [
    "creature", "animal", "ocean", "swim", "wings", "feathers", "trunk", "tusks",
    "stripes", "paws", "predator", "ice", "jungle", "safari", "wild", "feline",
    "bird", "mammal", "species", "fur", "claws", "tail", "habitat", "carnivore",
    "herbivore", "prey", "hunt", "sea", "wildlife", "nature", "roar", "flight",
  ],
  "Everyday Objects": [
    "straps", "zippers", "carrying", "rain", "folding", "waterproof", "sun", "tinted",
    "strap", "time", "clock", "pedals", "wheels", "household", "item", "pocket",
    "wear", "daily", "handle", "frame", "bag", "useful", "tool", "portable",
    "object", "canvas", "accessories", "gear", "store", "protect", "convenience",
  ],
  "Sports & Entertainment": [
    "hoop", "ball", "court", "movie", "cinema", "screen", "tracks", "loop", "board",
    "pawns", "pieces", "amusement", "game", "ride", "match", "play", "fun", "strategy",
    "spectator", "team", "score", "theater", "thrill", "watch", "compete", "audience",
    "popcorn", "park", "points", "dunk", "checkmate", "fast", "adrenalin",
  ],
  Places: [
    "books", "quiet", "reading", "planes", "runway", "terminal", "sand", "waves",
    "ocean", "stone", "towers", "medieval", "kingdom", "travel", "destination",
    "building", "location", "visit", "shore", "castle", "airport", "library",
    "beach", "public", "site", "monument", "historic", "scenery", "tourist",
  ],
};

const WORD_ASSOCIATIONS: Record<string, string[]> = {
  // Technology
  SMARTPHONE: ["screen", "pocket", "battery", "wireless", "apps", "phone", "call", "text", "message", "touchscreen", "notifications", "internet", "camera", "mobile", "glass", "charger", "cellular", "ring", "vibrate", "smart"],
  TELESCOPE: ["stars", "lenses", "night sky", "distance", "astronomy", "planets", "galaxies", "zoom", "space", "optics", "magnify", "stargazing", "cosmos", "celestial", "observatory", "tripod", "moon", "orbit"],
  LAPTOP: ["keyboard", "portable", "screen", "charger", "trackpad", "computer", "notebook", "hinge", "fold", "processor", "battery", "desk", "work", "typing", "mouse", "monitor", "programming"],
  HEADPHONES: ["ears", "music", "audio", "wireless", "cables", "sound", "volume", "listen", "cushion", "headband", "noise", "beats", "podcast", "speakers", "jack", "plug", "bass"],
  ROBOT: ["metal", "sensors", "automated", "gears", "battery", "mechanical", "android", "machine", "wires", "circuits", "artificial", "intelligence", "robotic", "arms", "programmable", "automation", "iron"],

  // Food & Drinks
  PIZZA: ["crust", "cheese", "oven", "slices", "toppings", "dough", "sauce", "tomato", "baked", "pepperoni", "mozzarella", "italian", "delivery", "box", "takeaway", "round", "triangular", "pie", "savory", "wood-fired"],
  COFFEE: ["morning", "caffeine", "roasted", "mug", "aroma", "beans", "brewed", "espresso", "latte", "hot", "cup", "steam", "dark", "energy", "breakfast", "barista", "filter", "roast"],
  "ICE CREAM": ["cone", "frozen", "sweet", "vanilla", "summer", "scoop", "cold", "dairy", "chocolate", "dessert", "melting", "creamy", "tub", "sundae", "parlor", "treat", "bowl", "soft-serve"],
  CHOCOLATE: ["cocoa", "sweet", "bar", "melting", "treat", "candy", "dark", "milk", "wrapper", "dessert", "snack", "brown", "cacao", "truffle", "confectionery", "rich", "confection"],
  LEMONADE: ["citrus", "sour", "ice", "summer", "yellow", "lemon", "sugar", "sweet", "refreshing", "glass", "pitcher", "straw", "tart", "squeezed", "cold", "fresh"],

  // Animals
  DOLPHIN: ["ocean", "intelligent", "swim", "pod", "playful", "fin", "blowhole", "mammal", "sea", "marine", "clicks", "leaping", "waves", "aquatic", "dorsal", "bottle-nosed"],
  EAGLE: ["feathers", "talons", "sky", "predator", "vision", "wings", "soar", "beak", "nest", "bird", "sharp", "mountain", "fly", "flight", "majestic", "prey", "hunting", "raptor"],
  ELEPHANT: ["trunk", "tusks", "giant", "ears", "safari", "mammal", "gray", "heavy", "huge", "africa", "india", "herbivore", "ivory", "stomp", "memory", "herd"],
  PENGUIN: ["antarctica", "waddle", "tuxedo", "ice", "flightless", "cold", "bird", "snow", "flippers", "swim", "polar", "colony", "black and white", "fish", "emperor", "sliding"],
  TIGER: ["stripes", "paws", "predator", "roar", "jungle", "feline", "orange", "claws", "cat", "carnivore", "hunt", "fur", "fierce", "stealth", "stalking", "bengal", "siberian", "apex", "hunter", "whiskers", "cub", "teeth", "tail", "striped"],

  // Everyday Objects
  BACKPACK: ["zippers", "straps", "carrying", "school", "travel", "bag", "shoulders", "pockets", "hiking", "books", "pack", "compartment", "wear", "canvas", "nylon", "gear", "rucksack"],
  UMBRELLA: ["rain", "folding", "canopy", "shelter", "waterproof", "wet", "handle", "storm", "drops", "open", "shield", "weather", "portable", "puddle", "dry", "fabric", "monsoon"],
  SUNGLASSES: ["shades", "tinted", "summer", "glare", "eyes", "uv", "lenses", "frames", "sun", "bright", "protection", "wear", "face", "dark", "glasses", "stylish", "polarized"],
  WRISTWATCH: ["clock", "strap", "time", "ticking", "wrist", "hands", "dial", "hours", "minutes", "seconds", "watch", "battery", "tick", "analog", "digital", "band", "arm", "chronometer"],
  BICYCLE: ["pedals", "handlebars", "two wheels", "chain", "helmet", "bike", "ride", "gears", "spokes", "brakes", "seat", "saddle", "cycling", "cycle", "tires", "road", "spoke"],

  // Sports & Entertainment
  BASKETBALL: ["hoop", "orange ball", "dribble", "court", "sneakers", "net", "slam", "dunk", "shoot", "nba", "points", "bounce", "backboard", "jersey", "rebound", "three-pointer", "pass"],
  CINEMA: ["popcorn", "movie", "big screen", "seats", "dark room", "theater", "film", "projector", "tickets", "hollywood", "show", "auditorium", "premiere", "watch", "sound", "cinema"],
  ROLLERCOASTER: ["tracks", "loop", "amusement park", "screaming", "fast", "ride", "thrill", "rails", "drops", "coaster", "speed", "heights", "cart", "theme park", "adrenalin", "inversions"],
  CHESS: ["checkmate", "knights", "pawns", "black and white", "board", "king", "queen", "bishops", "rooks", "strategy", "pieces", "64 squares", "mind game", "grandmaster", "move", "opening"],

  // Places
  LIBRARY: ["books", "quiet", "shelves", "reading", "study", "librarian", "borrow", "silence", "novels", "pages", "checkout", "knowledge", "research", "tables", "aisles", "volumes"],
  AIRPORT: ["planes", "runway", "luggage", "boarding", "terminal", "flight", "security", "gate", "departure", "arrival", "passports", "airline", "hangar", "baggage", "takeoff", "jet"],
  BEACH: ["sand", "waves", "sun", "seashells", "ocean", "shore", "towel", "coast", "swimming", "surf", "seaside", "sunbathing", "warm", "breeze", "umbrella", "tide", "coastline"],
  CASTLE: ["stone walls", "towers", "medieval", "kingdom", "moat", "fortress", "knights", "royalty", "king", "queen", "drawbridge", "dungeon", "battlements", "ancient", "palace", "rampart"],
};

// ── Utility: Stemming & Normalization ────────────────────────────────

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeToken(raw: string): string {
  let w = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Comprehensive English stemming for plurals, tenses, and suffixes
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("es") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) w = w.slice(0, -1);
  else if (w.endsWith("ing") && w.length > 5) {
    w = w.slice(0, -3);
    // Double consonant rollback (e.g. running -> run, swimming -> swim)
    if (w.length > 3 && w[w.length - 1] === w[w.length - 2]) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && w.length > 4) {
    w = w.slice(0, -2);
    if (w.length > 3 && w[w.length - 1] === w[w.length - 2]) w = w.slice(0, -1);
  } else if (w.endsWith("er") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("est") && w.length > 5) w = w.slice(0, -3);
  return w;
}

/**
 * Detects whether two clues given by the same player contain mutually exclusive
 * or contradictory factual claims.
 * Different properties (e.g. "has stripes" and "hunts in jungle") are complementary
 * and NOT contradictory.
 */
export function detectIncompatibleEvidence(
  clue1: string,
  clue2: string,
  category: string
): { hasContradiction: boolean; reason: string | null } {
  const c1 = clue1.toLowerCase();
  const c2 = clue2.toLowerCase();

  // 1. Animals Mutually Exclusive Pairs
  if (category === "Animals") {
    // Aquatic vs strictly Terrestrial (excluding polar/amphibious)
    const isAquatic1 = /\b(ocean|sea|marine|deep water|gills|whale|dolphin|aquatic)\b/i.test(c1);
    const isAquatic2 = /\b(ocean|sea|marine|deep water|gills|whale|dolphin|aquatic)\b/i.test(c2);
    const isTerrestrial1 = /\b(jungle|savannah|desert|dry land|treetops?|feline|canine)\b/i.test(c1);
    const isTerrestrial2 = /\b(jungle|savannah|desert|dry land|treetops?|feline|canine)\b/i.test(c2);

    if ((isAquatic1 && isTerrestrial2) || (isTerrestrial1 && isAquatic2)) {
      return {
        hasContradiction: true,
        reason: `Contradictory habitats claimed: aquatic vs terrestrial`,
      };
    }

    // Flying bird vs Quadruped
    const isFlying1 = /\b(soar(?:ing)? in the sky|flying high|wings and feathers)\b/i.test(c1);
    const isFlying2 = /\b(soar(?:ing)? in the sky|flying high|wings and feathers)\b/i.test(c2);
    const isQuadruped1 = /\b(four legs|four-legged|paws on ground|feline hunter|heavy trunk)\b/i.test(c1);
    const isQuadruped2 = /\b(four legs|four-legged|paws on ground|feline hunter|heavy trunk)\b/i.test(c2);

    if ((isFlying1 && isQuadruped2) || (isQuadruped1 && isFlying2)) {
      return {
        hasContradiction: true,
        reason: `Contradictory anatomy claimed: winged flight vs four-legged quadruped`,
      };
    }
  }

  // 2. Food & Drinks Mutually Exclusive Pairs
  if (category === "Food & Drinks") {
    const isHot1 = /\b(piping hot|steaming hot|boiling|freshly brewed)\b/i.test(c1);
    const isHot2 = /\b(piping hot|steaming hot|boiling|freshly brewed)\b/i.test(c2);
    const isFrozen1 = /\b(freezing cold|frozen ice|gelato scoop|ice cream)\b/i.test(c1);
    const isFrozen2 = /\b(freezing cold|frozen ice|gelato scoop|ice cream)\b/i.test(c2);

    if ((isHot1 && isFrozen2) || (isFrozen1 && isHot2)) {
      return {
        hasContradiction: true,
        reason: `Contradictory temperature claimed: piping hot vs freezing cold`,
      };
    }
  }

  // 3. Cross-Category Contradiction (e.g. clue 1 belongs to Technology while clue 2 belongs to Animals)
  const allCategories = Object.keys(CATEGORY_LEXICON);
  let dominantCat1: string | null = null;
  let dominantCat2: string | null = null;

  for (const cat of allCategories) {
    const terms = CATEGORY_LEXICON[cat] || [];
    const hits1 = terms.filter((t) => c1.includes(t.toLowerCase())).length;
    const hits2 = terms.filter((t) => c2.includes(t.toLowerCase())).length;
    if (hits1 >= 2) dominantCat1 = cat;
    if (hits2 >= 2) dominantCat2 = cat;
  }

  if (dominantCat1 && dominantCat2 && dominantCat1 !== dominantCat2) {
    return {
      hasContradiction: true,
      reason: `Claimed traits from two incompatible categories: ${dominantCat1} vs ${dominantCat2}`,
    };
  }

  return { hasContradiction: false, reason: null };
}

// ── Deterministic Semantic Clue Evaluation ────────────────────────────

/**
 * Deterministic multi-signal clue evaluator based on semantic relevance,
 * category alignment, specificity, and evasion detection.
 * Strictly used by Innocent agents who know the secret word.
 */
export function evaluateClue(
  clueText: string,
  secretWord: string,
  category: string,
  hints: string[] = []
): ClueEvaluation {
  const cleanClue = clueText.trim();
  const lowerClue = cleanClue.toLowerCase();
  const cleanWord = secretWord.trim().toLowerCase();

  // 1. Check for skipped or empty clues
  if (!cleanClue || cleanClue === "[Time Expired - Skipped]") {
    return {
      similarity: 0.0,
      vaguenessScore: 1.0,
      isLeak: false,
      hintHits: 0,
      categoryHits: 0,
      suspicionScore: 1.0,
      verdict: "SUSPICIOUS",
    };
  }

  // 2. Exact word boundary leak detection (leak penalty)
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegExp(cleanWord)}\\b`, "i");
  const isLeak = wordBoundaryRegex.test(lowerClue);

  if (isLeak) {
    return {
      similarity: 1.0,
      vaguenessScore: 0.0,
      isLeak: true,
      hintHits: 0,
      categoryHits: 0,
      suspicionScore: 0.95,
      verdict: "TOO_OBVIOUS",
    };
  }

  // 3. Extract and normalize clue tokens
  const rawTokens = cleanClue.split(/\s+/).filter(Boolean);
  const normalizedTokens = rawTokens.map(normalizeToken).filter((t) => t.length > 1);

  // 4. Semantic Concept Relevance (Secret Word Knowledge Assessment)
  // Combines official hints with rich synonym/property associations
  const wordKey = cleanWord.toUpperCase();
  const knownAssociations = WORD_ASSOCIATIONS[wordKey] || [];
  const allWordTargetTerms = [...new Set([...hints.map((h) => h.toLowerCase()), ...knownAssociations])];

  let conceptHits = 0;
  for (const term of allWordTargetTerms) {
    const termTokens = term.toLowerCase().split(/\s+/);
    if (termTokens.length === 1) {
      const targetStem = normalizeToken(termTokens[0]);
      if (
        normalizedTokens.includes(targetStem) ||
        lowerClue.includes(term.toLowerCase()) ||
        normalizedTokens.some((t) => (t.length > 3 && targetStem.includes(t)) || (targetStem.length > 3 && t.includes(targetStem)))
      ) {
        conceptHits++;
      }
    } else {
      // Multi-word term (e.g. "wood-fired", "dark room", "black and white")
      if (lowerClue.includes(term.toLowerCase())) {
        conceptHits += 2;
      }
    }
  }

  // Score concept relevance: 2+ hits = 1.0 (strong proof), 1 hit = 0.85 (solid valid clue)
  let conceptScore = 0.0;
  if (conceptHits >= 2) conceptScore = 1.0;
  else if (conceptHits === 1) conceptScore = 0.85;

  // 5. Category Relevance (Does the clue fit the declared theme?)
  const catTerms = CATEGORY_LEXICON[category] || [];
  let categoryHits = 0;
  for (const term of catTerms) {
    const termStem = normalizeToken(term);
    if (
      normalizedTokens.includes(termStem) ||
      lowerClue.includes(term.toLowerCase()) ||
      normalizedTokens.some((t) => (t.length > 3 && termStem.includes(t)) || (termStem.length > 3 && t.includes(termStem)))
    ) {
      categoryHits++;
    }
  }

  let catScore = 0.30; // baseline for ambiguous phrasing
  if (categoryHits >= 2) catScore = 1.0;
  else if (categoryHits === 1) catScore = 0.75;
  if (conceptScore > 0) catScore = 0.95; // If concept is hit, category is inherently satisfied

  // 6. Specificity & Generic Evasion/Boilerplate Detection
  let evasionCount = 0;
  for (const pat of GENERIC_EVASION_PATTERNS) {
    if (pat.test(lowerClue)) evasionCount++;
  }

  let boilerplateCount = 0;
  for (const pat of CATEGORY_BOILERPLATE_PATTERNS) {
    if (pat.test(lowerClue)) boilerplateCount++;
  }

  // Count concrete property tokens present in the clue
  const concreteHits = normalizedTokens.filter((t) => CONCRETE_PROPERTY_TOKENS.has(t)).length;

  // Penalize uninformative boilerplate when no concept properties are hit
  let boilerplatePenalty = 0.0;
  if (conceptHits === 0 && boilerplateCount > 0) {
    boilerplatePenalty = Math.min(0.60, 0.35 + boilerplateCount * 0.15);
  }

  // If concrete properties are given and evasion patterns are absent, vagueness is 0.0
  let vaguenessScore = Math.min(1.0, evasionCount * 0.35 + boilerplatePenalty);
  if (concreteHits > 0 && evasionCount === 0 && boilerplateCount === 0) {
    vaguenessScore = 0.0;
  }
  // Shortness is NEVER penalized: short clues with concrete properties have 100% signal!

  // 7. Nonsense / Gibberish detection
  const isRepeated = /(.)\1{3,}/.test(lowerClue);
  const consonants = lowerClue.replace(/[^bcdfghjklmnpqrstvwxyz]/gi, "");
  const hasNoVowels = rawTokens.length > 0 && !/[aeiou]/i.test(lowerClue);
  const isNonsense =
    isRepeated ||
    (hasNoVowels && cleanClue.length > 3) ||
    (consonants.length > 10 && consonants.length / Math.max(1, lowerClue.length) > 0.85);

  // 8. Fair Composite Suspicion Score [0.0, 1.0]
  // Clues with clear concept knowledge receive ultra-low suspicion regardless of wording variations.
  // Bluffs with zero concept knowledge and evasive language receive high suspicion.
  let rawSuspicion =
    0.45 * (1.0 - conceptScore) +
    0.25 * (1.0 - catScore) +
    0.30 * vaguenessScore;

  if (isNonsense) rawSuspicion += 0.60;

  const suspicionScore = Math.max(0.0, Math.min(1.0, Math.round(rawSuspicion * 1000) / 1000));

  let verdict: ClueEvaluation["verdict"] = "BALANCED";
  if (suspicionScore > 0.50) verdict = "SUSPICIOUS";
  else if (vaguenessScore > 0.45) verdict = "VAGUE";

  return {
    similarity: Math.round(conceptScore * 100) / 100,
    vaguenessScore: Math.round(vaguenessScore * 100) / 100,
    isLeak: false,
    hintHits: conceptHits,
    categoryHits,
    suspicionScore,
    verdict,
  };
}

// ── Deterministic Neutral Tie Resolver ────────────────────────────────

/**
 * Breaks ties deterministically among candidates with near-equal scores
 * without bias toward the first array element (which was historically the human player).
 */
function pickNeutralCandidate<T extends { player: PlayerSummary }>(
  candidates: T[],
  voterId: string,
  getScore: (item: T) => number
): T {
  if (candidates.length === 0) {
    throw new Error("Cannot pick from empty candidates list.");
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  // Find maximum score
  let maxScore = -Infinity;
  for (const c of candidates) {
    const s = getScore(c);
    if (s > maxScore) maxScore = s;
  }

  // Collect tied candidates within tolerance
  const topTier = candidates.filter((c) => Math.abs(getScore(c) - maxScore) < 0.02);
  if (topTier.length === 1) {
    return topTier[0];
  }

  // Deterministic voter-based hash offset (never defaults to index 0)
  const voterHash = voterId
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const chosenIndex = Math.abs(voterHash) % topTier.length;
  return topTier[chosenIndex];
}

// ── Persona-Weighted Independent Bot Decisions ───────────────────────

/**
 * Innocent AI Agent Decision: Evaluates clues against known secret word and hints.
 * Pure function: Deterministic, no shared state, never votes for itself.
 */
export function decideInnocentBotVote(
  bot: PlayerSummary,
  ctx: InnocentAgentContext
): BotVoteDecision {
  const eligibleOpponents = ctx.opponents.filter((p) => p.id !== bot.id);
  if (eligibleOpponents.length === 0) {
    throw new Error(`Innocent bot ${bot.name} has no eligible opponents to vote for.`);
  }

  // Calculate detailed suspicion metrics per opponent
  const opponentScores: Array<{
    player: PlayerSummary;
    avgSuspicion: number;
    maxVagueness: number;
    conceptDivergence: number;
    hasContradiction: boolean;
    clueCount: number;
    sampleClue: string;
    clue1: string;
    clue2: string;
    contradictionDetail: string | null;
  }> = [];

  for (const opp of eligibleOpponents) {
    const oppClues = ctx.allClues.filter((c) => c.playerId === opp.id);
    if (oppClues.length === 0) {
      opponentScores.push({
        player: opp,
        avgSuspicion: 1.0,
        maxVagueness: 1.0,
        conceptDivergence: 1.0,
        hasContradiction: false,
        clueCount: 0,
        sampleClue: "",
        clue1: "",
        clue2: "",
        contradictionDetail: null,
      });
      continue;
    }

    let sumSuspicion = 0;
    let maxVagueness = 0;
    let sumConceptSim = 0;

    for (const c of oppClues) {
      const evalRes = evaluateClue(c.clueText, ctx.secretWord, ctx.category, ctx.hints);
      sumSuspicion += evalRes.suspicionScore;
      sumConceptSim += evalRes.similarity;
      if (evalRes.vaguenessScore > maxVagueness) maxVagueness = evalRes.vaguenessScore;
    }

    // Check cross-round consistency using real incompatible evidence
    let hasContradiction = false;
    let contradictionDetail: string | null = null;
    if (oppClues.length >= 2) {
      const check = detectIncompatibleEvidence(oppClues[0].clueText, oppClues[1].clueText, ctx.category);
      hasContradiction = check.hasContradiction;
      contradictionDetail = check.reason;
    }

    opponentScores.push({
      player: opp,
      avgSuspicion: sumSuspicion / oppClues.length,
      maxVagueness,
      conceptDivergence: Math.max(0.0, Math.min(1.0, 1.0 - (sumConceptSim / oppClues.length))),
      hasContradiction,
      clueCount: oppClues.length,
      sampleClue: oppClues[0]?.clueText || "",
      clue1: oppClues[0]?.clueText || "",
      clue2: oppClues[1]?.clueText || "",
      contradictionDetail,
    });
  }

  // Apply Persona Decision Matrix with Neutral Tie-Breaking
  let selected = opponentScores[0];
  let explanation = "";

  if (bot.persona.includes("Analytical")) {
    // Agent Cyber: Mathematical divergence from secret word & hint properties
    selected = pickNeutralCandidate(opponentScores, bot.id, (c) =>
      Math.max(0.0, Math.min(1.0, c.conceptDivergence * 0.50 + c.avgSuspicion * 0.50))
    );
    const excerpt = selected.sampleClue.length > 55 ? selected.sampleClue.slice(0, 52) + "..." : selected.sampleClue;
    explanation = `Analyzed clues ("${excerpt}") showed high lexical divergence and conceptual distance from secret word properties.`;
  } else if (bot.persona.includes("Bold")) {
    // Agent Neon: Aggressive against generic evasion patterns & filler words
    selected = pickNeutralCandidate(opponentScores, bot.id, (c) =>
      Math.max(0.0, Math.min(1.0, c.maxVagueness * 0.50 + c.avgSuspicion * 0.50))
    );
    const excerpt = selected.sampleClue.length > 55 ? selected.sampleClue.slice(0, 52) + "..." : selected.sampleClue;
    explanation = `Clue ("${excerpt}") relied on generic evasion patterns and avoided naming concrete properties.`;
  } else {
    // Agent Shadow: Quiet observation of cross-round contradictions and reticence
    selected = pickNeutralCandidate(opponentScores, bot.id, (c) =>
      Math.max(0.0, Math.min(1.0, c.avgSuspicion * 0.70 + (c.hasContradiction ? 0.30 : 0.0)))
    );
    const excerpt = selected.sampleClue.length > 55 ? selected.sampleClue.slice(0, 52) + "..." : selected.sampleClue;
    if (selected.hasContradiction) {
      explanation = `Noticed a suspicious lack of consistency across clue rounds: ${selected.contradictionDetail || "contradictory statements"}.`;
    } else {
      explanation = `Their hesitant descriptions ("${excerpt}") seemed evasive compared to the group.`;
    }
  }

  return {
    voterId: bot.id,
    voterName: bot.name,
    voterAvatar: bot.avatar,
    targetId: selected.player.id,
    targetName: selected.player.name,
    targetAvatar: selected.player.avatar,
    evidenceExplanation: explanation,
  };
}

/**
 * Impostor AI Agent Decision: Operates strictly WITHOUT secret word or hints.
 * Evaluates surface clue ambiguity and brevity to deflect suspicion onto an innocent target.
 * Never votes for itself.
 */
export function decideImpostorBotVote(
  bot: PlayerSummary,
  ctx: ImpostorAgentContext
): BotVoteDecision {
  const eligibleOpponents = ctx.opponents.filter((p) => p.id !== bot.id);
  if (eligibleOpponents.length === 0) {
    throw new Error(`Impostor bot ${bot.name} has no eligible opponents to vote for.`);
  }

  // Analyze public features: category alignment, generic evasion, concrete tokens
  const opponentScores: Array<{
    player: PlayerSummary;
    publicSuspicion: number;
    sampleClue: string;
  }> = [];

  for (const opp of eligibleOpponents) {
    const oppClues = ctx.allClues.filter((c) => c.playerId === opp.id);
    if (oppClues.length === 0) {
      opponentScores.push({ player: opp, publicSuspicion: 1.0, sampleClue: "" });
      continue;
    }

    let sumVagueness = 0;
    let sumCategoryFit = 0;

    for (const c of oppClues) {
      const lower = c.clueText.toLowerCase();
      let evasionHits = 0;
      for (const pat of GENERIC_EVASION_PATTERNS) {
        if (pat.test(lower)) evasionHits++;
      }
      for (const pat of CATEGORY_BOILERPLATE_PATTERNS) {
        if (pat.test(lower)) evasionHits++;
      }

      // Check for concrete property tokens
      const words = lower.split(/\s+/).map(normalizeToken).filter(Boolean);
      const concreteHits = words.filter((w) => CONCRETE_PROPERTY_TOKENS.has(w)).length;

      let vagueness = Math.min(1.0, evasionHits * 0.35);
      if (concreteHits > 0 && evasionHits === 0) {
        vagueness = 0.0;
      }
      // Clue length is NEVER penalized
      sumVagueness += vagueness;

      // Category fit
      const catTerms = CATEGORY_LEXICON[ctx.category] || [];
      const hasCatTerm = catTerms.some((t) => lower.includes(t.toLowerCase()));
      sumCategoryFit += hasCatTerm || concreteHits > 0 ? 1.0 : 0.40;
    }

    const avgVagueness = sumVagueness / oppClues.length;
    const avgCatFit = sumCategoryFit / oppClues.length;
    const hasContradiction = oppClues.length >= 2
      ? detectIncompatibleEvidence(oppClues[0].clueText, oppClues[1].clueText, ctx.category).hasContradiction
      : false;

    // Fully normalized [0.0, 1.0] public evidence suspicion
    const publicSuspicion = Math.max(0.0, Math.min(1.0,
      0.50 * avgVagueness +
      0.30 * (1.0 - avgCatFit) +
      0.20 * (hasContradiction ? 1.0 : 0.0)
    ));

    opponentScores.push({
      player: opp,
      publicSuspicion,
      sampleClue: oppClues[0]?.clueText || "",
    });
  }

  // Deflect onto the opponent who appears most ambiguous or hesitant, with neutral tie-breaking
  const selected = pickNeutralCandidate(opponentScores, bot.id, (c) => c.publicSuspicion);
  const excerpt = selected.sampleClue.length > 55 ? selected.sampleClue.slice(0, 52) + "..." : selected.sampleClue;

  return {
    voterId: bot.id,
    voterName: bot.name,
    voterAvatar: bot.avatar,
    targetId: selected.player.id,
    targetName: selected.player.name,
    targetAvatar: selected.player.avatar,
    evidenceExplanation: `Their description ("${excerpt}") seemed uncertain and lacked concrete details within the ${ctx.category} category.`,
  };
}

// ── Strict Ballot Validation ─────────────────────────────────────────

export function validatePracticeBallots(
  ballots: BotVoteDecision[],
  activePlayers: PlayerSummary[]
): BallotValidationResult {
  // 1. Roster size invariant: Exactly four active players
  if (!activePlayers || activePlayers.length !== 4) {
    return {
      isValid: false,
      errorCode: "ACTIVE_PLAYERS_COUNT_INVALID",
      errorMessage: `Practice voting requires exactly 4 active players. Found: ${activePlayers?.length ?? 0}.`,
    };
  }

  // 2. Ballot count invariant: Exactly four submitted ballots
  if (!ballots || ballots.length !== 4) {
    return {
      isValid: false,
      errorCode: "BALLOT_COUNT_MISMATCH",
      errorMessage: `Expected exactly 4 ballots. Received: ${ballots?.length ?? 0}.`,
    };
  }

  const expectedVoterIds = new Set(activePlayers.map((p) => p.id));
  const validTargetIds = new Set(activePlayers.map((p) => p.id));
  const seenVoterIds = new Set<string>();

  for (const ballot of ballots) {
    // 3. Reject unknown voter IDs
    if (!expectedVoterIds.has(ballot.voterId)) {
      return {
        isValid: false,
        errorCode: "UNKNOWN_VOTER",
        errorMessage: `Ballot submitted by unknown voter ID: ${ballot.voterId}.`,
      };
    }

    // 4. Reject duplicate submissions (DO NOT silently overwrite!)
    if (seenVoterIds.has(ballot.voterId)) {
      return {
        isValid: false,
        errorCode: "DUPLICATE_BALLOT",
        errorMessage: `Duplicate ballot detected for voter: ${ballot.voterName} (${ballot.voterId}).`,
      };
    }
    seenVoterIds.add(ballot.voterId);

    // 5. Reject self-voting
    if (ballot.targetId === ballot.voterId) {
      return {
        isValid: false,
        errorCode: "SELF_VOTE_REJECTED",
        errorMessage: `Player ${ballot.voterName} attempted to vote for themselves.`,
      };
    }

    // 6. Reject invalid or inactive targets
    if (!validTargetIds.has(ballot.targetId)) {
      return {
        isValid: false,
        errorCode: "INVALID_TARGET",
        errorMessage: `Ballot targeted an unknown or inactive player ID: ${ballot.targetId}.`,
      };
    }
  }

  // 7. Completeness check
  if (seenVoterIds.size !== 4) {
    return {
      isValid: false,
      errorCode: "INCOMPLETE_BALLOTS",
      errorMessage: "Not all active players submitted a ballot.",
    };
  }

  return { isValid: true, errorCode: null, errorMessage: null };
}

// ── Deterministic Vote Tallying & Tie Resolution ─────────────────────

const TIE_TOLERANCE_EPSILON = 1e-4; // 0.0001

export function tallyPracticeVotes(
  ballots: BotVoteDecision[],
  impostorId: string,
  allPlayers: PlayerSummary[],
  innocentSuspicionMap: Map<string, number>
): VoteTallyResult {
  // 1. Ballot validation (must pass all 4 ballots first)
  const validation = validatePracticeBallots(ballots, allPlayers);
  if (!validation.isValid) {
    return {
      success: false,
      errorCode: validation.errorCode,
      eliminatedId: null,
      eliminatedPlayer: null,
      wasImpostor: false,
      winner: "inconclusive",
      winReason: `Voting could not be concluded: ${validation.errorMessage}`,
      isTie: false,
      counts: {},
      ballots,
    };
  }

  // 2. Count votes per candidate
  const counts: Record<string, number> = {};
  for (const p of allPlayers) counts[p.id] = 0;
  for (const b of ballots) counts[b.targetId]++;

  // 3. Find candidate(s) with maximal votes
  const maxVotes = Math.max(...Object.values(counts));
  const topCandidates = Object.keys(counts).filter((id) => counts[id] === maxVotes);

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 1: UNAMBIGUOUS HIGHEST VOTE COUNT (Unanimous, Majority, or Plurality)
  // Suspicion evidence is NOT needed and NOT evaluated.
  // ─────────────────────────────────────────────────────────────────────────
  if (topCandidates.length === 1) {
    const eliminatedId = topCandidates[0];
    const wasImpostor = eliminatedId === impostorId;
    return {
      success: true,
      errorCode: null,
      eliminatedId,
      eliminatedPlayer: allPlayers.find((p) => p.id === eliminatedId) ?? null,
      wasImpostor,
      winner: wasImpostor ? "innocents" : "impostor",
      winReason: wasImpostor
        ? "The Impostor was identified and eliminated by vote!"
        : "An innocent citizen was wrongfully eliminated by vote!",
      isTie: false,
      counts,
      ballots,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 2: GENUINE VOTE TIE (topCandidates.length >= 2)
  // Every tied candidate must have complete, valid, finite suspicion in [0.0, 1.0].
  // ─────────────────────────────────────────────────────────────────────────
  let evidenceInvalid = false;
  const tiedSuspicionScores = new Map<string, number>();

  for (const cid of topCandidates) {
    if (!innocentSuspicionMap || !innocentSuspicionMap.has(cid)) {
      evidenceInvalid = true;
      break;
    }
    const score = innocentSuspicionMap.get(cid);
    // Strict bounds check: must be a finite number in [0.0, 1.0]
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0.0 || score > 1.0) {
      evidenceInvalid = true;
      break;
    }
    tiedSuspicionScores.set(cid, score);
  }

  // Subcase 2A: Evidence Missing, Corrupted, or Out of Bounds
  if (evidenceInvalid) {
    return {
      success: true,
      errorCode: null,
      eliminatedId: null,
      eliminatedPlayer: null,
      wasImpostor: false,
      winner: "impostor",
      winReason: "The vote resulted in an unbroken tie due to incomplete or out-of-bounds clue evidence; the Impostor escaped undetected!",
      isTie: true,
      counts,
      ballots,
    };
  }

  // Subcase 2B: Global Maximum Comparison with Tolerance Epsilon
  let rawMaxSuspicion = -1;
  for (const cid of topCandidates) {
    const sus = tiedSuspicionScores.get(cid)!;
    if (sus > rawMaxSuspicion) {
      rawMaxSuspicion = sus;
    }
  }

  // Collect all tied candidates within EPSILON of the maximum score
  const candidatesNearMax: string[] = [];
  for (const cid of topCandidates) {
    const sus = tiedSuspicionScores.get(cid)!;
    if (rawMaxSuspicion - sus < TIE_TOLERANCE_EPSILON) {
      candidatesNearMax.push(cid);
    }
  }

  // If exactly ONE candidate has suspicion strictly greater than all others by >= EPSILON
  if (candidatesNearMax.length === 1) {
    const candidateToEliminate = candidatesNearMax[0];
    const wasImpostor = candidateToEliminate === impostorId;
    return {
      success: true,
      errorCode: null,
      eliminatedId: candidateToEliminate,
      eliminatedPlayer: allPlayers.find((p) => p.id === candidateToEliminate) ?? null,
      wasImpostor,
      winner: wasImpostor ? "innocents" : "impostor",
      winReason: wasImpostor
        ? "The Impostor was eliminated after a vote tie was broken by clue evidence!"
        : "An innocent was eliminated after a vote tie was broken by suspicion!",
      isTie: true,
      counts,
      ballots,
    };
  }

  // Subcase 2C: Deadlock (Two, three, or more tied candidates within EPSILON)
  // Evidence cannot distinguish between tied candidates -> No elimination, Impostor escapes
  return {
    success: true,
    errorCode: null,
    eliminatedId: null,
    eliminatedPlayer: null,
    wasImpostor: false,
    winner: "impostor",
    winReason: "The vote resulted in an unbroken tie; the Impostor escaped undetected!",
    isTie: true,
    counts,
    ballots,
  };
}

// ── Synchronous Atomic Reward Guard ──────────────────────────────────

export class AtomicRewardGuard {
  private rewarded = false;

  /**
   * Synchronously sets the guard flag BEFORE invoking the callback.
   * Returns true if execution succeeded, false if already rewarded.
   */
  public executeOnce(callback: () => void): boolean {
    if (this.rewarded) {
      return false;
    }
    this.rewarded = true; // Set synchronously before callback invocation
    callback();
    return true;
  }

  public isRewarded(): boolean {
    return this.rewarded;
  }

  public resetForNewMatch(): void {
    this.rewarded = false;
  }
}

// ── Shared Production Submission Controller ──────────────────────────

export class PracticeSubmissionController {
  private isSubmitting = false;
  private currentPhase: PracticePhase = "voting";
  public readonly rewardGuard = new AtomicRewardGuard();

  constructor(initialPhase: PracticePhase = "voting") {
    this.currentPhase = initialPhase;
  }

  public setPhase(phase: PracticePhase): void {
    this.currentPhase = phase;
  }

  public getPhase(): PracticePhase {
    return this.currentPhase;
  }

  public isLocked(): boolean {
    return this.isSubmitting;
  }

  public resetForNewMatch(): void {
    this.isSubmitting = false;
    this.currentPhase = "setup";
    this.rewardGuard.resetForNewMatch();
  }

  public submitVote(params: {
    selectedSuspect: string | null;
    humanVoter: PlayerSummary;
    botProfiles: PlayerSummary[];
    impostorId: string;
    secretWord: string;
    category: string;
    hints: string[];
    allClues: PublicClue[];
    allPlayers: PlayerSummary[];
    innocentSuspicionMap: Map<string, number>;
    onReward: (xp: number, coins: number) => void;
    innocentDecisionFn?: typeof decideInnocentBotVote;
    impostorDecisionFn?: typeof decideImpostorBotVote;
    tallyFn?: typeof tallyPracticeVotes;
  }): PracticeSubmissionResult {
    // 1. Strict Phase Protection (Synchronous guard against stale handlers)
    if (this.currentPhase !== "voting") {
      return {
        status: "REJECTED_PHASE",
        errorMessage: `Cannot submit vote while in ${this.currentPhase} phase.`,
        tallyResult: null,
      };
    }

    // 2. Synchronous In-Flight Mutex (Blocks rapid concurrent clicks immediately)
    if (this.isSubmitting) {
      return {
        status: "REJECTED_IN_FLIGHT",
        errorMessage: "A vote submission is already in progress.",
        tallyResult: null,
      };
    }

    // Synchronously acquire lock BEFORE any processing
    this.isSubmitting = true;

    try {
      // 3. Human Selection Validation
      if (!params.selectedSuspect) {
        this.isSubmitting = false; // Release lock for user to select
        return {
          status: "INVALID_SELECTION",
          errorMessage: "Please select a suspect before confirming your vote.",
          tallyResult: null,
        };
      }

      // 4. Generate All 4 Ballots Fresh (1 Human + 3 Bots)
      const ballots: BotVoteDecision[] = [];
      const humanTarget = params.allPlayers.find((p) => p.id === params.selectedSuspect);
      ballots.push({
        voterId: params.humanVoter.id,
        voterName: params.humanVoter.name,
        voterAvatar: params.humanVoter.avatar,
        targetId: params.selectedSuspect,
        targetName: humanTarget?.name ?? "Unknown",
        targetAvatar: humanTarget?.avatar ?? "❓",
        evidenceExplanation: "Your secret ballot selection.",
      });

      const innocentFn = params.innocentDecisionFn ?? decideInnocentBotVote;
      const impostorFn = params.impostorDecisionFn ?? decideImpostorBotVote;

      for (const bot of params.botProfiles) {
        const opponents = params.allPlayers.filter((p) => p.id !== bot.id);
        if (bot.id === params.impostorId) {
          ballots.push(impostorFn(bot, {
            role: "impostor",
            category: params.category,
            allClues: params.allClues,
            opponents,
          }));
        } else {
          ballots.push(innocentFn(bot, {
            role: "innocent",
            secretWord: params.secretWord,
            category: params.category,
            hints: params.hints,
            allClues: params.allClues,
            opponents,
          }));
        }
      }

      // 5. Four-Ballot Validation
      const validation = validatePracticeBallots(ballots, params.allPlayers);

      // Branch A: Validation Failed
      if (!validation.isValid) {
        // Discard all ballots, release lock so user can retry, zero rewards
        this.isSubmitting = false;
        return {
          status: "VALIDATION_FAILED",
          errorMessage: validation.errorMessage ?? "Invalid ballot set detected.",
          tallyResult: {
            success: false,
            errorCode: validation.errorCode,
            eliminatedId: null,
            eliminatedPlayer: null,
            wasImpostor: false,
            winner: "inconclusive",
            winReason: validation.errorMessage ?? "Ballot validation failed.",
            isTie: false,
            counts: {},
            ballots: [], // Completely discarded!
          },
        };
      }

      // 6. Execute vote tally (using injectable seam for testing, defaulting to tallyPracticeVotes)
      const tallyExecutor = params.tallyFn ?? tallyPracticeVotes;
      const tally = tallyExecutor(
        ballots,
        params.impostorId,
        params.allPlayers,
        params.innocentSuspicionMap
      );

      // ─────────────────────────────────────────────────────────────────────
      // POST-VALIDATION TALLY SAFEGUARD
      // ─────────────────────────────────────────────────────────────────────
      if (!tally.success || tally.winner === "inconclusive") {
        this.isSubmitting = false; // Lock released for retry
        return {
          status: "ERROR",
          errorMessage: tally.winReason ?? "Tally calculation could not determine an outcome.",
          tallyResult: tally,
        };
      }

      // ─────────────────────────────────────────────────────────────────────
      // LEGITIMATE CONCLUSION PATH (Strictly when tally.success === true)
      // ─────────────────────────────────────────────────────────────────────
      this.currentPhase = "results";
      this.isSubmitting = true; // Retain lock permanently for this match

      // Reward Commitment through Atomic Guard
      const isHumanImpostor = params.humanVoter.id === params.impostorId;
      const humanWon =
        (isHumanImpostor && tally.winner === "impostor") ||
        (!isHumanImpostor && tally.winner === "innocents");
      const correctVote = !isHumanImpostor && params.selectedSuspect === params.impostorId;

      let xp = 75;
      let coins = 25;
      if (humanWon) {
        xp += 100;
        coins += 35;
        if (isHumanImpostor) {
          xp += 50;
          coins += 20;
        }
      }
      if (correctVote) {
        xp += 25;
        coins += 10;
      }

      this.rewardGuard.executeOnce(() => {
        try {
          params.onReward(xp, coins);
        } catch (e) {
          console.error("[PracticeReward] Callback exception:", e);
        }
      });

      return {
        status: "SUCCESS",
        errorMessage: null,
        tallyResult: tally,
      };
    } catch (err) {
      if (this.currentPhase === "voting") {
        this.isSubmitting = false;
      }
      return {
        status: "ERROR",
        errorMessage: err instanceof Error ? err.message : "Unexpected voting error.",
        tallyResult: null,
      };
    }
  }
}
