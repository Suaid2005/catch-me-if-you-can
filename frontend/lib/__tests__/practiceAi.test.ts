/**
 * lib/__tests__/practiceAi.test.ts
 * ─────────────────────────────────
 * Comprehensive deterministic test suite for Practice Mode AI decision-making,
 * clue evaluation heuristics, ballot validation, suspicion-based tie-breaking,
 * atomic reward protection, and production submission orchestration.
 */

import { describe, test, expect } from "vitest";
import {
  evaluateClue,
  decideInnocentBotVote,
  decideImpostorBotVote,
  validatePracticeBallots,
  tallyPracticeVotes,
  AtomicRewardGuard,
  PracticeSubmissionController,
  type PlayerSummary,
  type PublicClue,
  type BotVoteDecision,
  type PracticeSubmissionResult,
} from "../practiceAi";

describe("Deterministic Clue Evaluation & Agent Strategies", () => {
  const secretWord = "PIZZA";
  const category = "Food & Drinks";
  const hints = ["cheese", "crust", "oven", "slice", "toppings"];

  test("Word boundary leak detection avoids false matches inside words", () => {
    // "car" is inside "scarf"
    const evalScarf = evaluateClue("A warm knitted scarf", "CAR", "Everyday Objects", ["wheels", "engine"]);
    expect(evalScarf.isLeak).toBe(false);

    // Exact word boundary match
    const evalCar = evaluateClue("A fast red car on the road", "CAR", "Everyday Objects", ["wheels", "engine"]);
    expect(evalCar.isLeak).toBe(true);
    expect(evalCar.verdict).toBe("TOO_OBVIOUS");
  });

  test("Skipped or empty clue receives maximum suspicion score", () => {
    const skipped = evaluateClue("[Time Expired - Skipped]", secretWord, category, hints);
    expect(skipped.suspicionScore).toBe(1.0);
    expect(skipped.verdict).toBe("SUSPICIOUS");

    const empty = evaluateClue("", secretWord, category, hints);
    expect(empty.suspicionScore).toBe(1.0);
  });

  test("Agent Cyber deterministically targets clue with highest lexical divergence from secret word", () => {
    const opponents: PlayerSummary[] = [
      { id: "cand_valid", name: "Alice", avatar: "👩", persona: "" },
      { id: "cand_divergent", name: "Bob", avatar: "👨", persona: "" },
    ];
    const clues: PublicClue[] = [
      { playerId: "cand_valid", playerName: "Alice", avatar: "👩", clueText: "Baked crust slice with cheese", round: 1 },
      { playerId: "cand_divergent", playerName: "Bob", avatar: "👨", clueText: "999 zzz qwerty 123", round: 1 },
    ];

    const decision = decideInnocentBotVote(
      { id: "bot_cyber", name: "Agent Cyber", avatar: "🤖", persona: "Analytical & precise" },
      { role: "innocent", secretWord, category, hints, allClues: clues, opponents }
    );

    expect(decision.targetId).toBe("cand_divergent");
    expect(decision.evidenceExplanation).toContain("lexical divergence");
  });

  test("Agent Neon deterministically targets clue with highest generic evasion and filler density", () => {
    const opponents: PlayerSummary[] = [
      { id: "cand_specific", name: "Alice", avatar: "👩", persona: "" },
      { id: "cand_filler", name: "Bob", avatar: "👨", persona: "" },
    ];
    const clues: PublicClue[] = [
      { playerId: "cand_specific", playerName: "Alice", avatar: "👩", clueText: "Melted mozzarella on flat dough", round: 1 },
      { playerId: "cand_filler", playerName: "Bob", avatar: "👨", clueText: "It is something commonly encountered in everyday situations with practical function", round: 1 },
    ];

    const decision = decideInnocentBotVote(
      { id: "bot_neon", name: "Agent Neon", avatar: "⚡", persona: "Bold & expressive" },
      { role: "innocent", secretWord, category, hints, allClues: clues, opponents }
    );

    expect(decision.targetId).toBe("cand_filler");
    expect(decision.evidenceExplanation).toContain("generic evasion");
  });

  test("Agent Shadow deterministically targets clue with cross-round contradiction", () => {
    const opponents: PlayerSummary[] = [
      { id: "cand_consistent", name: "Alice", avatar: "👩", persona: "" },
      { id: "cand_contradict", name: "Bob", avatar: "👨", persona: "" },
    ];
    const clues: PublicClue[] = [
      { playerId: "cand_consistent", playerName: "Alice", avatar: "👩", clueText: "Cheesy baked dough", round: 1 },
      { playerId: "cand_consistent", playerName: "Alice", avatar: "👩", clueText: "Hot oven triangle slice", round: 2 },
      { playerId: "cand_contradict", playerName: "Bob", avatar: "👨", clueText: "Digital electronic screen with wireless battery", round: 1 },
      { playerId: "cand_contradict", playerName: "Bob", avatar: "👨", clueText: "Wild animal swimming in the ocean", round: 2 },
    ];

    const decision = decideInnocentBotVote(
      { id: "bot_shadow", name: "Agent Shadow", avatar: "🕶️", persona: "Quiet & observant" },
      { role: "innocent", secretWord, category, hints, allClues: clues, opponents }
    );

    expect(decision.targetId).toBe("cand_contradict");
    expect(decision.evidenceExplanation).toContain("consistency across clue rounds");
  });

  test("AI Impostor votes without secret word, never self-votes, and targets ambiguous innocent", () => {
    const botSelf = { id: "bot_imp", name: "Agent Shadow", avatar: "🕶️", persona: "Quiet" };
    const opponents: PlayerSummary[] = [
      { id: "p1", name: "Alice", avatar: "👩", persona: "" },
      { id: "p2", name: "Bob", avatar: "👨", persona: "" },
      { id: "p3", name: "Charlie", avatar: "🧑", persona: "" },
    ];
    const clues: PublicClue[] = [
      { playerId: "p1", playerName: "Alice", avatar: "👩", clueText: "Hot cheesy slice from the oven", round: 1 },
      { playerId: "p2", playerName: "Bob", avatar: "👨", clueText: "maybe", round: 1 }, // brief/hesitant
      { playerId: "p3", playerName: "Charlie", avatar: "🧑", clueText: "Baked dough with crust and toppings", round: 1 },
    ];

    const decision = decideImpostorBotVote(botSelf, {
      role: "impostor",
      category: "Food & Drinks",
      allClues: clues,
      opponents,
    });

    expect(decision.targetId).toBe("p2");
    expect(decision.targetId).not.toBe(botSelf.id);
    expect(decision.evidenceExplanation).not.toContain("PIZZA");
  });
});

describe("Ballot Validation & Suspicion Tie-Breaking", () => {
  const players: PlayerSummary[] = [
    { id: "p1", name: "Alice", avatar: "👩", persona: "" },
    { id: "p2", name: "Bob", avatar: "👨", persona: "" },
    { id: "p3", name: "Charlie", avatar: "🧑", persona: "" },
    { id: "p4", name: "Diana", avatar: "👧", persona: "" },
  ];

  test("Validates roster and ballot constraints", () => {
    // Missing ballot (only 3)
    const fewBallots = [
      { voterId: "p1", targetId: "p2" },
      { voterId: "p2", targetId: "p3" },
      { voterId: "p3", targetId: "p4" },
    ] as any;
    expect(validatePracticeBallots(fewBallots, players).isValid).toBe(false);
    expect(validatePracticeBallots(fewBallots, players).errorCode).toBe("BALLOT_COUNT_MISMATCH");

    // Duplicate voter
    const dupBallots = [
      { voterId: "p1", targetId: "p2" },
      { voterId: "p1", targetId: "p3" },
      { voterId: "p2", targetId: "p3" },
      { voterId: "p3", targetId: "p4" },
    ] as any;
    expect(validatePracticeBallots(dupBallots, players).isValid).toBe(false);
    expect(validatePracticeBallots(dupBallots, players).errorCode).toBe("DUPLICATE_BALLOT");

    // Self vote
    const selfBallots = [
      { voterId: "p1", targetId: "p1" },
      { voterId: "p2", targetId: "p3" },
      { voterId: "p3", targetId: "p4" },
      { voterId: "p4", targetId: "p2" },
    ] as any;
    expect(validatePracticeBallots(selfBallots, players).isValid).toBe(false);
    expect(validatePracticeBallots(selfBallots, players).errorCode).toBe("SELF_VOTE_REJECTED");

    // Invalid target ID
    const badTargetBallots = [
      { voterId: "p1", targetId: "unknown_id" },
      { voterId: "p2", targetId: "p3" },
      { voterId: "p3", targetId: "p4" },
      { voterId: "p4", targetId: "p2" },
    ] as any;
    expect(validatePracticeBallots(badTargetBallots, players).isValid).toBe(false);
    expect(validatePracticeBallots(badTargetBallots, players).errorCode).toBe("INVALID_TARGET");
  });

  // Valid 2-2 tie fixture: p1->p3, p2->p4, p3->p4, p4->p3 (p3=2, p4=2, 0 self-votes)
  const validTieBallots: BotVoteDecision[] = [
    { voterId: "p1", voterName: "Alice", voterAvatar: "👩", targetId: "p3", targetName: "Charlie", targetAvatar: "🧑", evidenceExplanation: "" },
    { voterId: "p2", voterName: "Bob", voterAvatar: "👨", targetId: "p4", targetName: "Diana", targetAvatar: "👧", evidenceExplanation: "" },
    { voterId: "p3", voterName: "Charlie", voterAvatar: "🧑", targetId: "p4", targetName: "Diana", targetAvatar: "👧", evidenceExplanation: "" },
    { voterId: "p4", voterName: "Diana", voterAvatar: "👧", targetId: "p3", targetName: "Charlie", targetAvatar: "🧑", evidenceExplanation: "" },
  ];

  test("Valid tie fixture passes ballot validation", () => {
    const val = validatePracticeBallots(validTieBallots, players);
    expect(val.isValid).toBe(true);
    expect(val.errorCode).toBeNull();
  });

  test("Suspicion scores differing by 0.00005 (< 1e-4) are treated as equal -> Deadlock", () => {
    // p3: 0.50005, p4: 0.50000 -> difference is 0.00005 < 1e-4
    const nearTieMap = new Map<string, number>([
      ["p1", 0.1],
      ["p2", 0.1],
      ["p3", 0.50005],
      ["p4", 0.50000],
    ]);

    const result = tallyPracticeVotes(validTieBallots, "p3", players, nearTieMap);
    expect(result.success).toBe(true);
    expect(result.isTie).toBe(true);
    expect(result.eliminatedId).toBeNull(); // Tied in suspicion -> Deadlock!
    expect(result.winner).toBe("impostor");
  });

  test("Suspicion scores differing by 0.00020 (> 1e-4) decisively break tie", () => {
    // p3: 0.50020, p4: 0.50000 -> difference is 0.00020 > 1e-4
    const distinctTieMap = new Map<string, number>([
      ["p1", 0.1],
      ["p2", 0.1],
      ["p3", 0.50020],
      ["p4", 0.50000],
    ]);

    const result = tallyPracticeVotes(validTieBallots, "p3", players, distinctTieMap);
    expect(result.success).toBe(true);
    expect(result.isTie).toBe(true);
    expect(result.eliminatedId).toBe("p3"); // Decisively eliminated!
    expect(result.winner).toBe("innocents");
  });

  test("Three tied candidates with two sharing top score within 1e-4 -> Deadlock", () => {
    // 1-1-1 tie among p1, p2, p3
    const threeWayBallots: BotVoteDecision[] = [
      { voterId: "p1", voterName: "Alice", voterAvatar: "👩", targetId: "p2", targetName: "Bob", targetAvatar: "👨", evidenceExplanation: "" },
      { voterId: "p2", voterName: "Bob", voterAvatar: "👨", targetId: "p3", targetName: "Charlie", targetAvatar: "🧑", evidenceExplanation: "" },
      { voterId: "p3", voterName: "Charlie", voterAvatar: "🧑", targetId: "p1", targetName: "Alice", targetAvatar: "👩", evidenceExplanation: "" },
      { voterId: "p4", voterName: "Diana", voterAvatar: "👧", targetId: "p1", targetName: "Alice", targetAvatar: "👩", evidenceExplanation: "" },
    ];
    // p1 has 2 votes, but let's test a true 3-way tie (1-1-1)
    const trueThreeWayBallots: BotVoteDecision[] = [
      { voterId: "p1", voterName: "Alice", voterAvatar: "👩", targetId: "p2", targetName: "Bob", targetAvatar: "👨", evidenceExplanation: "" },
      { voterId: "p2", voterName: "Bob", voterAvatar: "👨", targetId: "p3", targetName: "Charlie", targetAvatar: "🧑", evidenceExplanation: "" },
      { voterId: "p3", voterName: "Charlie", voterAvatar: "🧑", targetId: "p4", targetName: "Diana", targetAvatar: "👧", evidenceExplanation: "" },
      { voterId: "p4", voterName: "Diana", voterAvatar: "👧", targetId: "p1", targetName: "Alice", targetAvatar: "👩", evidenceExplanation: "" },
    ]; // 1-1-1-1 tie

    // p1: 0.70003, p2: 0.70000 (diff 0.00003 < 1e-4), p3: 0.40000, p4: 0.10000
    const threeWayMap = new Map<string, number>([
      ["p1", 0.70003],
      ["p2", 0.70000],
      ["p3", 0.40000],
      ["p4", 0.10000],
    ]);

    const result = tallyPracticeVotes(trueThreeWayBallots, "p3", players, threeWayMap);
    expect(result.success).toBe(true);
    expect(result.isTie).toBe(true);
    expect(result.eliminatedId).toBeNull(); // 2 candidates share top score within EPSILON
    expect(result.winner).toBe("impostor");
  });

  test("Missing, NaN, or out-of-bounds suspicion scores in a tie cause deadlock", () => {
    // Missing score for tied candidate p3
    const missingMap = new Map<string, number>([
      ["p1", 0.1],
      ["p2", 0.1],
      ["p4", 0.5], // p3 missing!
    ]);
    const resMissing = tallyPracticeVotes(validTieBallots, "p3", players, missingMap);
    expect(resMissing.eliminatedId).toBeNull();
    expect(resMissing.winner).toBe("impostor");

    // NaN score
    const nanMap = new Map<string, number>([
      ["p1", 0.1],
      ["p2", 0.1],
      ["p3", NaN],
      ["p4", 0.5],
    ]);
    const resNaN = tallyPracticeVotes(validTieBallots, "p3", players, nanMap);
    expect(resNaN.eliminatedId).toBeNull();
    expect(resNaN.winner).toBe("impostor");

    // Out of bounds > 1.0
    const highMap = new Map<string, number>([
      ["p1", 0.1],
      ["p2", 0.1],
      ["p3", 1.25], // > 1.0!
      ["p4", 0.5],
    ]);
    const resHigh = tallyPracticeVotes(validTieBallots, "p3", players, highMap);
    expect(resHigh.eliminatedId).toBeNull();
    expect(resHigh.winner).toBe("impostor");

    // Out of bounds < 0.0
    const negMap = new Map<string, number>([
      ["p1", 0.1],
      ["p2", 0.1],
      ["p3", -0.2], // < 0.0!
      ["p4", 0.5],
    ]);
    const resNeg = tallyPracticeVotes(validTieBallots, "p3", players, negMap);
    expect(resNeg.eliminatedId).toBeNull();
    expect(resNeg.winner).toBe("impostor");
  });

  test("Unambiguous plurality eliminates candidate without needing suspicion", () => {
    // p1 receives 2 votes, p2 receives 1 vote, p3 receives 1 vote (p1 plurality)
    const pluralityBallots: BotVoteDecision[] = [
      { voterId: "p1", voterName: "Alice", voterAvatar: "👩", targetId: "p2", targetName: "Bob", targetAvatar: "👨", evidenceExplanation: "" },
      { voterId: "p2", voterName: "Bob", voterAvatar: "👨", targetId: "p1", targetName: "Alice", targetAvatar: "👩", evidenceExplanation: "" },
      { voterId: "p3", voterName: "Charlie", voterAvatar: "🧑", targetId: "p1", targetName: "Alice", targetAvatar: "👩", evidenceExplanation: "" },
      { voterId: "p4", voterName: "Diana", voterAvatar: "👧", targetId: "p3", targetName: "Charlie", targetAvatar: "🧑", evidenceExplanation: "" },
    ];

    // Completely empty suspicion map
    const result = tallyPracticeVotes(pluralityBallots, "p1", players, new Map());
    expect(result.success).toBe(true);
    expect(result.isTie).toBe(false);
    expect(result.eliminatedId).toBe("p1"); // Decisively eliminated!
    expect(result.winner).toBe("innocents");
  });
});

describe("AtomicRewardGuard & Production Submission Controller", () => {
  const players: PlayerSummary[] = [
    { id: "human", name: "Detective You", avatar: "🕵️", persona: "" },
    { id: "bot_1", name: "Agent Cyber", avatar: "🤖", persona: "Analytical & precise" },
    { id: "bot_2", name: "Agent Neon", avatar: "⚡", persona: "Bold & expressive" },
    { id: "bot_3", name: "Agent Shadow", avatar: "🕶️", persona: "Quiet & observant" },
  ];
  const botProfiles = players.slice(1);
  const secretWord = "PIZZA";
  const category = "Food & Drinks";
  const hints = ["cheese", "crust", "oven", "slice", "toppings"];
  const publicClues: PublicClue[] = [
    { playerId: "human", playerName: "Detective You", avatar: "🕵️", clueText: "Baked dough with cheese", round: 1 },
    { playerId: "bot_1", playerName: "Agent Cyber", avatar: "🤖", clueText: "Oven crust slice", round: 1 },
    { playerId: "bot_2", playerName: "Agent Neon", avatar: "⚡", clueText: "Hot melted slice", round: 1 },
    { playerId: "bot_3", playerName: "Agent Shadow", avatar: "🕶️", clueText: "Common everyday item", round: 1 },
  ];

  test("AtomicRewardGuard executes callback strictly once and resets on new match", () => {
    const guard = new AtomicRewardGuard();
    let counter = 0;

    expect(guard.isRewarded()).toBe(false);
    expect(guard.executeOnce(() => counter++)).toBe(true);
    expect(guard.isRewarded()).toBe(true);
    expect(counter).toBe(1);

    // Duplicate executions blocked
    expect(guard.executeOnce(() => counter++)).toBe(false);
    expect(guard.executeOnce(() => counter++)).toBe(false);
    expect(counter).toBe(1);

    // Reset strictly on new match
    guard.resetForNewMatch();
    expect(guard.isRewarded()).toBe(false);
    expect(guard.executeOnce(() => counter++)).toBe(true);
    expect(counter).toBe(2);
  });

  test("Reentrant submission from inside a bot decision is rejected without cascading AI calls, while outer submission completes", () => {
    const controller = new PracticeSubmissionController("voting");
    let rewardCount = 0;
    let nestedCallResult: PracticeSubmissionResult | null = null;

    let bot1Invocations = 0;
    let bot2Invocations = 0;
    let bot3Invocations = 0;

    const trackedInnocent: typeof decideInnocentBotVote = (bot, ctx) => {
      if (bot.id === "bot_1") {
        bot1Invocations++;
        // Bot 1 attempts nested reentrant submission while lock is actively held
        nestedCallResult = controller.submitVote({
          selectedSuspect: "bot_2",
          humanVoter: players[0],
          botProfiles,
          impostorId: "bot_3",
          secretWord,
          category,
          hints,
          allClues: publicClues,
          allPlayers: players,
          innocentSuspicionMap: new Map(),
          onReward: () => rewardCount++,
          innocentDecisionFn: trackedInnocent,
          impostorDecisionFn: trackedImpostor,
        });
      } else if (bot.id === "bot_2") {
        bot2Invocations++;
      }

      return {
        voterId: bot.id,
        voterName: bot.name,
        voterAvatar: bot.avatar,
        targetId: "bot_3",
        targetName: "Agent Shadow",
        targetAvatar: "🕶️",
        evidenceExplanation: "Innocent vote targeting impostor",
      };
    };

    const trackedImpostor: typeof decideImpostorBotVote = (bot, ctx) => {
      if (bot.id === "bot_3") {
        bot3Invocations++;
      }
      return {
        voterId: bot.id,
        voterName: bot.name,
        voterAvatar: bot.avatar,
        targetId: "bot_1",
        targetName: "Agent Cyber",
        targetAvatar: "🤖",
        evidenceExplanation: "Impostor deflection vote",
      };
    };

    const outerResult = controller.submitVote({
      selectedSuspect: "bot_3",
      humanVoter: players[0],
      botProfiles,
      impostorId: "bot_3",
      secretWord,
      category,
      hints,
      allClues: publicClues,
      allPlayers: players,
      innocentSuspicionMap: new Map([["bot_3", 0.9], ["bot_2", 0.1]]),
      onReward: () => rewardCount++,
      innocentDecisionFn: trackedInnocent,
      impostorDecisionFn: trackedImpostor,
    });

    // 1. Nested call was synchronously rejected
    expect(nestedCallResult).not.toBeNull();
    expect(nestedCallResult!.status).toBe("REJECTED_IN_FLIGHT");
    expect(nestedCallResult!.errorMessage).toContain("already in progress");

    // 2. Exactly three bot decisions occurred across the entire test
    expect(bot1Invocations).toBe(1);
    expect(bot2Invocations).toBe(1);
    expect(bot3Invocations).toBe(1);
    const totalBotInvocations = bot1Invocations + bot2Invocations + bot3Invocations;
    expect(totalBotInvocations).toBe(3); // Outer: 3. Nested: 0!

    // 3. Outer submission completed successfully
    expect(outerResult.status).toBe("SUCCESS");
    expect(outerResult.tallyResult?.eliminatedId).toBe("bot_3");
    expect(outerResult.tallyResult?.winner).toBe("innocents");

    // 4. Rewards committed exactly once
    expect(rewardCount).toBe(1);
    expect(controller.getPhase()).toBe("results");
    expect(controller.isLocked()).toBe(true);
  });

  test("Pre-tally ballot validation failure rejects with VALIDATION_FAILED, discards ballots, and releases lock", () => {
    const controller = new PracticeSubmissionController("voting");
    let rewardCount = 0;

    const corruptBotDecision: typeof decideInnocentBotVote = (bot, ctx) => ({
      voterId: bot.id,
      voterName: bot.name,
      voterAvatar: bot.avatar,
      targetId: "unregistered_target_id", // Fails pre-tally validation!
      targetName: "",
      targetAvatar: "",
      evidenceExplanation: "",
    });

    const result = controller.submitVote({
      selectedSuspect: "bot_3",
      humanVoter: players[0],
      botProfiles,
      impostorId: "bot_3",
      secretWord,
      category,
      hints,
      allClues: publicClues,
      allPlayers: players,
      innocentSuspicionMap: new Map(),
      onReward: () => rewardCount++,
      innocentDecisionFn: corruptBotDecision,
    });

    expect(result.status).toBe("VALIDATION_FAILED");
    expect(result.tallyResult?.winner).toBe("inconclusive");
    expect(controller.getPhase()).toBe("voting");
    expect(controller.isLocked()).toBe(false); // Lock released for retry
    expect(rewardCount).toBe(0);
  });

  test("Post-validation failed tally safeguard returns ERROR, remains in voting, releases lock, and produces zero rewards", () => {
    const controller = new PracticeSubmissionController("voting");
    let rewardCount = 0;

    // Injected tally function that simulates internal calculation failure on valid ballots
    const mockFailedTally: typeof tallyPracticeVotes = () => ({
      success: false,
      errorCode: "INTERNAL_TALLY_CALCULATION_ERROR",
      eliminatedId: null,
      eliminatedPlayer: null,
      wasImpostor: false,
      winner: "inconclusive",
      winReason: "Internal calculation anomaly.",
      isTie: false,
      counts: {},
      ballots: [],
    });

    const result = controller.submitVote({
      selectedSuspect: "bot_3",
      humanVoter: players[0],
      botProfiles,
      impostorId: "bot_3",
      secretWord,
      category,
      hints,
      allClues: publicClues,
      allPlayers: players,
      innocentSuspicionMap: new Map(),
      onReward: () => rewardCount++,
      tallyFn: mockFailedTally, // Injected test seam
    });

    expect(result.status).toBe("ERROR");
    expect(result.errorMessage).toBe("Internal calculation anomaly.");
    expect(result.tallyResult?.success).toBe(false);
    expect(result.tallyResult?.winner).toBe("inconclusive");

    // State invariants:
    expect(controller.getPhase()).toBe("voting"); // Must NOT transition to results!
    expect(controller.isLocked()).toBe(false); // Lock released for retry
    expect(rewardCount).toBe(0); // Reward callback NEVER called
    expect(controller.rewardGuard.isRewarded()).toBe(false); // Guard remains unused
  });

  test("Valid deadlock returns SUCCESS, transitions to results, and awards rewards exactly once", () => {
    const controller = new PracticeSubmissionController("voting");
    let rewardCount = 0;

    // Injected decisions producing valid 2-2 tie with equal suspicion
    const tiedInnocent: typeof decideInnocentBotVote = (bot, ctx) => ({
      voterId: bot.id,
      voterName: bot.name,
      voterAvatar: bot.avatar,
      targetId: bot.id === "bot_1" ? "bot_2" : "bot_3",
      targetName: "",
      targetAvatar: "",
      evidenceExplanation: "",
    });
    const tiedImpostor: typeof decideImpostorBotVote = (bot, ctx) => ({
      voterId: bot.id,
      voterName: bot.name,
      voterAvatar: bot.avatar,
      targetId: "bot_2",
      targetName: "",
      targetAvatar: "",
      evidenceExplanation: "",
    });

    const result = controller.submitVote({
      selectedSuspect: "bot_3",
      humanVoter: players[0],
      botProfiles,
      impostorId: "bot_3",
      secretWord,
      category,
      hints,
      allClues: publicClues,
      allPlayers: players,
      innocentSuspicionMap: new Map([["bot_2", 0.50], ["bot_3", 0.50]]), // Identical suspicion
      onReward: () => rewardCount++,
      innocentDecisionFn: tiedInnocent,
      impostorDecisionFn: tiedImpostor,
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.tallyResult?.success).toBe(true); // VALID TALLY
    expect(result.tallyResult?.isTie).toBe(true);
    expect(result.tallyResult?.eliminatedId).toBeNull();
    expect(result.tallyResult?.winner).toBe("impostor"); // Legitimate game conclusion!

    // State invariants:
    expect(controller.getPhase()).toBe("results"); // Transitions to results
    expect(controller.isLocked()).toBe(true); // Retained lock
    expect(rewardCount).toBe(1); // Rewards awarded exactly once
    expect(controller.rewardGuard.isRewarded()).toBe(true);
  });

  test("Full controller retry lifecycle: invalid attempt, fresh AI regeneration, results transition, and post-results rejection", () => {
    const controller = new PracticeSubmissionController("setup");
    let rewardCallbackCount = 0;
    const onReward = () => rewardCallbackCount++;

    let bot1Invocations = 0;
    let bot2Invocations = 0;
    let bot3Invocations = 0;
    let shouldInjectBug = true; // Injects self-vote on attempt 1

    const trackedInnocent: typeof decideInnocentBotVote = (bot, ctx) => {
      if (bot.id === "bot_1") bot1Invocations++;
      if (bot.id === "bot_2") bot2Invocations++;

      if (shouldInjectBug && bot.id === "bot_1") {
        return {
          voterId: bot.id,
          voterName: bot.name,
          voterAvatar: bot.avatar,
          targetId: bot.id, // Self-vote!
          targetName: bot.name,
          targetAvatar: bot.avatar,
          evidenceExplanation: "Buggy self vote",
        };
      }
      return {
        voterId: bot.id,
        voterName: bot.name,
        voterAvatar: bot.avatar,
        targetId: "bot_3",
        targetName: "Agent Shadow",
        targetAvatar: "🕶️",
        evidenceExplanation: "Valid innocent vote",
      };
    };

    const trackedImpostor: typeof decideImpostorBotVote = (bot, ctx) => {
      if (bot.id === "bot_3") bot3Invocations++;
      return {
        voterId: bot.id,
        voterName: bot.name,
        voterAvatar: bot.avatar,
        targetId: "bot_1",
        targetName: "Agent Cyber",
        targetAvatar: "🤖",
        evidenceExplanation: "Valid impostor vote",
      };
    };

    const baseParams = {
      humanVoter: players[0],
      botProfiles,
      impostorId: "bot_3",
      secretWord,
      category,
      hints,
      allClues: publicClues,
      allPlayers: players,
      innocentSuspicionMap: new Map([["bot_3", 0.8], ["bot_2", 0.2], ["bot_1", 0.2], ["human", 0.2]]),
      onReward,
      innocentDecisionFn: trackedInnocent,
      impostorDecisionFn: trackedImpostor,
    };

    // 1. Rejected outside voting phase
    controller.setPhase("clues");
    const prePhaseResult = controller.submitVote({ ...baseParams, selectedSuspect: "bot_3" });
    expect(prePhaseResult.status).toBe("REJECTED_PHASE");
    expect(bot1Invocations).toBe(0);

    // Transition to voting
    controller.setPhase("voting");

    // 2. First invalid attempt discards ballots and releases lock
    const attempt1 = controller.submitVote({ ...baseParams, selectedSuspect: "bot_3" });
    expect(attempt1.status).toBe("VALIDATION_FAILED");
    expect(attempt1.tallyResult?.errorCode).toBe("SELF_VOTE_REJECTED");
    expect(attempt1.tallyResult?.ballots).toHaveLength(0); // Discarded
    expect(controller.isLocked()).toBe(false); // Released
    expect(controller.getPhase()).toBe("voting"); // Stays in voting
    expect(rewardCallbackCount).toBe(0);

    expect(bot1Invocations).toBe(1);
    expect(bot2Invocations).toBe(1);
    expect(bot3Invocations).toBe(1);

    // 3. User makes fresh selection and submits again -> regenerates all 3 bot votes
    shouldInjectBug = false; // Bug resolved
    const attempt2 = controller.submitVote({ ...baseParams, selectedSuspect: "bot_3" });
    expect(attempt2.status).toBe("SUCCESS");
    expect(attempt2.tallyResult?.eliminatedId).toBe("bot_3");
    expect(attempt2.tallyResult?.winner).toBe("innocents");
    expect(controller.getPhase()).toBe("results");
    expect(controller.isLocked()).toBe(true);

    // Each bot ran again (total 2 per bot, 6 total)
    expect(bot1Invocations).toBe(2);
    expect(bot2Invocations).toBe(2);
    expect(bot3Invocations).toBe(2);
    expect(rewardCallbackCount).toBe(1); // Exactly once!

    // 4. Submission after results cannot generate additional AI votes
    const postResultsAttempt = controller.submitVote({ ...baseParams, selectedSuspect: "bot_3" });
    expect(postResultsAttempt.status).toBe("REJECTED_PHASE");
    expect(bot1Invocations).toBe(2); // Invocations do not increase
    expect(rewardCallbackCount).toBe(1);
  });
});

