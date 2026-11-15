// Move classification, Estimated Game Elo calculation, Side-by-Side Player
// Comparison, Opening identification, UCI/PV conversion, PGN parsing, and
// Interactive Opening Trainer & Strategy Coach curriculum.

export const CLASSIFICATION_META = {
  brilliant: {
    tag: "brilliant",
    label: "Brilliant",
    glyph: "!!",
    color: "#42d5a0",
    bg: "rgba(66, 213, 160, 0.16)",
    order: 1,
  },
  great: {
    tag: "great",
    label: "Great move",
    glyph: "!",
    color: "#6db1ff",
    bg: "rgba(109, 177, 255, 0.16)",
    order: 2,
  },
  best: {
    tag: "best",
    label: "Best move",
    glyph: "★",
    color: "#3ecf8e",
    bg: "rgba(62, 207, 142, 0.16)",
    order: 3,
  },
  excellent: {
    tag: "excellent",
    label: "Excellent",
    glyph: "✓",
    color: "#57c48f",
    bg: "rgba(87, 196, 143, 0.15)",
    order: 4,
  },
  good: {
    tag: "good",
    label: "Good",
    glyph: "✓",
    color: "#9bc48f",
    bg: "rgba(155, 196, 143, 0.14)",
    order: 5,
  },
  book: {
    tag: "book",
    label: "Book",
    glyph: "Bk",
    color: "#c9a24a",
    bg: "rgba(201, 162, 74, 0.16)",
    order: 6,
  },
  forced: {
    tag: "forced",
    label: "Forced",
    glyph: "=",
    color: "#9aa39d",
    bg: "rgba(154, 163, 157, 0.16)",
    order: 7,
  },
  inaccuracy: {
    tag: "inaccuracy",
    label: "Inaccuracy",
    glyph: "?!",
    color: "#f2b04a",
    bg: "rgba(242, 176, 74, 0.18)",
    order: 8,
  },
  mistake: {
    tag: "mistake",
    label: "Mistake",
    glyph: "?",
    color: "#ff9454",
    bg: "rgba(255, 148, 84, 0.18)",
    order: 9,
  },
  blunder: {
    tag: "blunder",
    label: "Blunder",
    glyph: "??",
    color: "#ff6a5a",
    bg: "rgba(255, 106, 90, 0.20)",
    order: 10,
  },
};

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function materialBalance(chessInstance, color) {
  const board = chessInstance.board();
  let myMat = 0;
  let oppMat = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] || 0;
      if (sq.color === color) myMat += val;
      else oppMat += val;
    }
  }
  return myMat - oppMat;
}

export function classifyMove(
  cpLossForMover,
  {
    wasOnlyLegalMove = false,
    matchedBestMove = false,
    isBookMove = false,
    isSacrifice = false,
    isGreatCandidate = false,
    winDrop = null,
    cpBeforeForMover = null,
    cpAfterForMover = null,
    missedMate = false,
  } = {}
) {
  const loss = Math.max(0, Number(cpLossForMover) || 0);

  if (wasOnlyLegalMove) {
    return { ...CLASSIFICATION_META.forced };
  }

  if (isBookMove && loss < 30) {
    return { ...CLASSIFICATION_META.book };
  }

  if (
    isSacrifice &&
    (matchedBestMove || loss <= 15) &&
    (cpAfterForMover === null || cpAfterForMover >= -40)
  ) {
    return { ...CLASSIFICATION_META.brilliant };
  }

  if (
    isGreatCandidate &&
    (matchedBestMove || loss <= 5) &&
    (cpAfterForMover === null || cpAfterForMover >= -60)
  ) {
    return { ...CLASSIFICATION_META.great };
  }

  if (matchedBestMove || loss <= 3) {
    return { ...CLASSIFICATION_META.best };
  }

  if (missedMate && loss >= 120) {
    return { ...CLASSIFICATION_META.blunder };
  }

  if (winDrop !== null && cpBeforeForMover !== null && Math.abs(cpBeforeForMover) > 500) {
    if (winDrop < 2 && loss < 80) return { ...CLASSIFICATION_META.excellent };
    if (winDrop < 5 && loss < 150) return { ...CLASSIFICATION_META.good };
    if (winDrop < 10) return { ...CLASSIFICATION_META.inaccuracy };
    if (winDrop < 20) return { ...CLASSIFICATION_META.mistake };
    return { ...CLASSIFICATION_META.blunder };
  }

  if (loss < 12) return { ...CLASSIFICATION_META.excellent };
  if (loss < 30) return { ...CLASSIFICATION_META.good };
  if (loss < 65) return { ...CLASSIFICATION_META.inaccuracy };
  if (loss < 160) return { ...CLASSIFICATION_META.mistake };
  return { ...CLASSIFICATION_META.blunder };
}

// ---------- Estimated Game Rating (Elo) & Side-by-Side Comparison ----------

export function getEloTierLabel(elo) {
  if (elo >= 2400) return "Grandmaster Level";
  if (elo >= 2100) return "Master Level";
  if (elo >= 1800) return "Expert";
  if (elo >= 1500) return "Advanced";
  if (elo >= 1200) return "Intermediate";
  if (elo >= 850) return "Club Player";
  if (elo >= 500) return "Novice";
  return "Beginner";
}

// Computes Chess.com-style single-game Estimated Rating (Elo), Accuracy, ACPL,
// and move classification counts for one player's move records.
export function calculateEstimatedElo(moveRecords, baseRating = null) {
  const counts = {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    forced: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };

  if (!Array.isArray(moveRecords) || moveRecords.length === 0) {
    const fallbackElo = Number(baseRating) > 100 ? Math.round(Number(baseRating) / 50) * 50 : 1200;
    return {
      estimatedElo: fallbackElo,
      accuracy: 0,
      accuracyExact: 0,
      acpl: 0,
      tier: getEloTierLabel(fallbackElo),
      counts,
      totalMoves: 0,
    };
  }

  let accSum = 0;
  let cpLossSum = 0;
  let nonBookCount = 0;

  for (const r of moveRecords) {
    if (counts[r.tag] !== undefined) counts[r.tag]++;
    accSum += Number(r.moveAccuracy ?? 100);
    if (r.tag !== "book") {
      // Cap single-move cpLoss at 300cp so one mate-in-1 drop doesn't skew ACPL
      cpLossSum += Math.min(300, Math.max(0, Number(r.cpLoss) || 0));
      nonBookCount++;
    }
  }

  const totalMoves = moveRecords.length;
  const accuracyExact = accSum / totalMoves;
  const accuracy = Math.round(accuracyExact);
  const acpl = nonBookCount > 0 ? Math.round(cpLossSum / nonBookCount) : 0;

  // Empirical mapping from Accuracy & ACPL to intrinsic playing strength (100..3100)
  const normAcc = Math.max(0, Math.min(1, (accuracyExact - 15) / 84));
  const eloFromAccuracy = 350 + Math.pow(normAcc, 1.55) * 2450;
  const eloFromAcpl = 2750 * Math.exp(-0.0195 * acpl) + 250;

  const qualityAdjust =
    counts.brilliant * 45 +
    counts.great * 22 +
    (counts.best / totalMoves) * 90 -
    counts.blunder * 65 -
    counts.mistake * 25 -
    counts.inaccuracy * 8;

  let rawElo = 0.55 * eloFromAccuracy + 0.45 * eloFromAcpl + qualityAdjust;

  // Confidence factor ramps from 0.25 on move 1 to 1.0 after 8 non-book moves
  const sampleConfidence = Math.min(1, Math.max(0.2, (nonBookCount + 1) / 8));
  const parsedBase = parseInt(baseRating, 10);
  const hasBase = !Number.isNaN(parsedBase) && parsedBase >= 100 && parsedBase <= 3500;
  const anchorElo = hasBase ? parsedBase : 1200;

  if (hasBase) {
    const perfDelta = (rawElo - parsedBase) * 0.55 * sampleConfidence;
    rawElo = parsedBase + Math.max(-650, Math.min(650, perfDelta));
  } else {
    rawElo = anchorElo + (rawElo - anchorElo) * sampleConfidence;
  }

  const clamped = Math.max(100, Math.min(3200, rawElo));
  // Round to nearest 50 (Chess.com Game Review style: 1450, 1500, 1550...)
  const estimatedElo = Math.round(clamped / 50) * 50;

  return {
    estimatedElo,
    accuracy,
    accuracyExact: Number(accuracyExact.toFixed(1)),
    acpl,
    tier: getEloTierLabel(estimatedElo),
    counts,
    totalMoves,
  };
}

function computePhaseAccuracy(playerRecords) {
  const openingRecs = playerRecords.filter((r) => r.moveNumber <= 10);
  const middleRecs = playerRecords.filter((r) => r.moveNumber > 10 && r.moveNumber <= 25);
  const endgameRecs = playerRecords.filter((r) => r.moveNumber > 25);

  const avg = (arr) =>
    arr.length
      ? Math.round(arr.reduce((s, r) => s + (r.moveAccuracy ?? 100), 0) / arr.length)
      : null;

  return {
    opening: avg(openingRecs),
    middlegame: avg(middleRecs),
    endgame: avg(endgameRecs),
  };
}

// Builds a complete side-by-side comparison of White vs Black (and You vs Opponent)
export function buildPlayerComparison(
  allRecords,
  {
    whiteName = "White",
    blackName = "Black",
    whiteRating = null,
    blackRating = null,
    myColor = "w",
  } = {}
) {
  const analyzed = (allRecords || []).filter((r) => r.analyzed !== false);
  const whiteRecords = analyzed.filter((r) => r.color === "w");
  const blackRecords = analyzed.filter((r) => r.color === "b");

  const wStats = calculateEstimatedElo(whiteRecords, whiteRating);
  const bStats = calculateEstimatedElo(blackRecords, blackRating);

  const wStyle = summarizePlaystyle(whiteRecords);
  const bStyle = summarizePlaystyle(blackRecords);

  const wPhase = computePhaseAccuracy(whiteRecords);
  const bPhase = computePhaseAccuracy(blackRecords);

  const buildIndividualFeedback = (name, stats, phase, style) => {
    if (stats.totalMoves === 0) return `Waiting for moves from ${name}…`;
    const parts = [];
    parts.push(
      `${name} played at an estimated **${stats.estimatedElo} Elo** (${stats.tier}) with **${stats.accuracyExact}%** accuracy (${stats.acpl} ACPL).`
    );
    const strongCount =
      stats.counts.brilliant +
      stats.counts.great +
      stats.counts.best +
      stats.counts.excellent +
      stats.counts.book;
    const errCount = stats.counts.blunder + stats.counts.mistake;
    if (errCount === 0) {
      parts.push(
        `Flawless tactical discipline with 0 mistakes or blunders and ${strongCount} top-tier moves.`
      );
    } else {
      parts.push(
        `Found ${strongCount} strong moves (${stats.counts.best} Best, ${stats.counts.great} Great, ${stats.counts.brilliant} Brilliant), but committed ${stats.counts.mistake} mistake${stats.counts.mistake === 1 ? "" : "s"} and ${stats.counts.blunder} blunder${stats.counts.blunder === 1 ? "" : "s"}.`
      );
    }

    // Identify weakest phase
    const phases = [
      { name: "Opening", val: phase.opening },
      { name: "Middlegame", val: phase.middlegame },
      { name: "Endgame", val: phase.endgame },
    ].filter((p) => p.val !== null);
    if (phases.length >= 2) {
      phases.sort((a, b) => a.val - b.val);
      if (phases[0].val < 82) {
        parts.push(`Lowest accuracy was in the ${phases[0].name} (${phases[0].val}%).`);
      } else {
        parts.push(`Strongest phase was the ${phases[phases.length - 1].name} (${phases[phases.length - 1].val}%).`);
      }
    }
    return parts.join(" ");
  };

  const whiteObj = {
    color: "w",
    name: whiteName,
    rating: whiteRating,
    isMe: myColor === "w",
    ...wStats,
    phaseAcc: wPhase,
    notes: wStyle.notes,
    coachFeedback: buildIndividualFeedback(whiteName, wStats, wPhase, wStyle),
  };

  const blackObj = {
    color: "b",
    name: blackName,
    rating: blackRating,
    isMe: myColor === "b",
    ...bStats,
    phaseAcc: bPhase,
    notes: bStyle.notes,
    coachFeedback: buildIndividualFeedback(blackName, bStats, bPhase, bStyle),
  };

  const me = myColor === "b" ? blackObj : whiteObj;
  const opponent = myColor === "b" ? whiteObj : blackObj;

  const accDiff = Number((me.accuracyExact - opponent.accuracyExact).toFixed(1));
  const eloDiff = me.estimatedElo - opponent.estimatedElo;
  const myErrors = me.counts.blunder + me.counts.mistake;
  const oppErrors = opponent.counts.blunder + opponent.counts.mistake;

  let headToHeadVerdict = "";
  if (analyzed.length === 0) {
    headToHeadVerdict = "Load or analyze a game to compare your performance against your opponent.";
  } else if (accDiff >= 3) {
    headToHeadVerdict = `You outplayed ${opponent.name} by +${accDiff}% accuracy (${me.accuracyExact}% vs ${opponent.accuracyExact}%) and +${Math.max(0, eloDiff)} Est. Elo (${me.estimatedElo} vs ${opponent.estimatedElo}). You made ${myErrors} critical error${myErrors === 1 ? "" : "s"} compared to ${opponent.name}'s ${oppErrors}.`;
  } else if (accDiff <= -3) {
    headToHeadVerdict = `${opponent.name} had the precision edge this game by ${Math.abs(accDiff)}% accuracy (${opponent.accuracyExact}% vs ${me.accuracyExact}%, Est. Elo ${opponent.estimatedElo} vs ${me.estimatedElo}). Reviewing your ${myErrors} mistake/blunder move${myErrors === 1 ? "" : "s"} below will show where the evaluation swung.`;
  } else {
    headToHeadVerdict = `Closely contested match! Your accuracy (${me.accuracyExact}%, Est. Elo ${me.estimatedElo}) was neck-and-neck with ${opponent.name} (${opponent.accuracyExact}%, Est. Elo ${opponent.estimatedElo}).`;
  }

  return {
    white: whiteObj,
    black: blackObj,
    me,
    opponent,
    accDiff,
    eloDiff,
    headToHeadVerdict,
  };
}

let openingsCache = null;
export async function loadOpenings(url) {
  if (openingsCache) return openingsCache;
  let resolvedUrl = url || "lib/openings.json";
  if (
    typeof globalThis.chrome !== "undefined" &&
    globalThis.chrome?.runtime &&
    typeof globalThis.chrome.runtime.getURL === "function" &&
    !String(resolvedUrl).startsWith("chrome-extension://") &&
    !String(resolvedUrl).startsWith("http") &&
    !String(resolvedUrl).startsWith("blob:")
  ) {
    const clean = String(resolvedUrl)
      .replace(/^(\.\.?\/)+/, "")
      .replace(/^\//, "");
    resolvedUrl = globalThis.chrome.runtime.getURL(clean || "lib/openings.json");
  }
  const res = await fetch(resolvedUrl);
  openingsCache = await res.json();
  openingsCache.sort((a, b) => b.moves.split(" ").length - a.moves.split(" ").length);
  return openingsCache;
}

export function identifyOpening(openings, sanMoves) {
  if (!Array.isArray(openings) || !Array.isArray(sanMoves) || sanMoves.length === 0) {
    return null;
  }
  const played = sanMoves.join(" ");
  let match = null;
  for (const book of openings) {
    if (played === book.moves || played.startsWith(book.moves + " ")) {
      if (!match || book.moves.length > match.moves.length) match = book;
    }
  }
  return match ? { eco: match.eco, name: match.name, moves: match.moves } : null;
}

export function isMoveInOpeningBook(openings, sanMovesUpToPly) {
  if (!Array.isArray(openings) || !Array.isArray(sanMovesUpToPly) || sanMovesUpToPly.length === 0) {
    return false;
  }
  if (sanMovesUpToPly.length > 16) return false;
  const played = sanMovesUpToPly.join(" ");
  return openings.some(
    (book) => book.moves === played || book.moves.startsWith(played + " ")
  );
}

export function uciToSanMove(ChessClass, fen, uci) {
  if (!ChessClass || !fen || !uci || uci.length < 4) return null;
  try {
    const clean = uci.trim().toLowerCase();
    const from = clean.slice(0, 2);
    const to = clean.slice(2, 4);
    const promotion = clean.length >= 5 ? clean[4] : undefined;
    const temp = new ChessClass(fen);
    const moveObj = temp.move({ from, to, promotion: promotion || "q" });
    if (!moveObj) return null;
    return {
      san: moveObj.san,
      uci: moveObj.lan || `${from}${to}${promotion || ""}`,
      from: moveObj.from,
      to: moveObj.to,
      promotion: moveObj.promotion,
      afterFen: temp.fen(),
      color: moveObj.color,
      piece: moveObj.piece,
      captured: moveObj.captured,
    };
  } catch (_) {
    return null;
  }
}

export function buildPvSteps(ChessClass, startFen, pvUciList, maxPlies = 10) {
  if (!ChessClass || !startFen || !Array.isArray(pvUciList) || pvUciList.length === 0) {
    return [];
  }
  const steps = [];
  try {
    const temp = new ChessClass(startFen);
    const limit = Math.min(pvUciList.length, maxPlies);
    for (let i = 0; i < limit; i++) {
      const uci = pvUciList[i];
      if (!uci || uci.length < 4) break;
      const from = uci.slice(0, 2).toLowerCase();
      const to = uci.slice(2, 4).toLowerCase();
      const promotion = uci.length >= 5 ? uci[4].toLowerCase() : undefined;
      const beforeFen = temp.fen();
      const moveNum = temp.moveNumber();
      const turn = temp.turn();
      const moveObj = temp.move({ from, to, promotion });
      if (!moveObj) break;
      steps.push({
        stepIndex: i,
        moveNumber: moveNum,
        color: turn,
        san: moveObj.san,
        uci: moveObj.lan || `${from}${to}${promotion || ""}`,
        from: moveObj.from,
        to: moveObj.to,
        promotion: moveObj.promotion,
        beforeFen,
        afterFen: temp.fen(),
      });
    }
  } catch (_) {}
  return steps;
}

export function explainMove(record) {
  if (!record) return "";
  const bestAlt = record.bestMoveSan || record.bestMoveUci || null;
  const better = bestAlt && bestAlt !== record.san ? bestAlt : null;

  // One short coaching line per grade. Evals, win probability and the best
  // move already live in the strip above, so the text never repeats them.
  switch (record.tag) {
    case "brilliant":
      return "Sacrifices material for a winning attack — trust it.";
    case "great":
      return "The critical resource — the only move that keeps the edge.";
    case "book":
      return `Standard theory${record.openingName ? ` in the ${record.openingName}` : ""}.`;
    case "forced":
      return "The only legal move.";
    case "best":
      return "Matches the engine's top choice.";
    case "excellent":
      return "Practically as strong as the engine's choice.";
    case "good":
      return better
        ? `Playable, though ${better} was a touch sharper.`
        : "A solid, playable choice.";
    case "inaccuracy":
      return better
        ? `Lets an edge slip — ${better} kept more.`
        : "Lets a little advantage slip.";
    case "mistake":
      return better
        ? `Hands over the initiative — ${better} was stronger.`
        : "Hands the initiative to the opponent.";
    case "blunder":
      return better
        ? `Costs decisive ground — ${better} was necessary.`
        : "Costs decisive material or king safety.";
    default:
      return "";
  }
}

export function summarizePlaystyle(moveRecords) {
  const counts = {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    forced: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
  let captures = 0;
  let checks = 0;
  let castled = false;

  for (const m of moveRecords || []) {
    counts[m.tag] = (counts[m.tag] || 0) + 1;
    if (m.san && m.san.includes("x")) captures++;
    if (m.san && (m.san.includes("+") || m.san.includes("#"))) checks++;
    if (m.san === "O-O" || m.san === "O-O-O") castled = true;
  }

  const total = (moveRecords && moveRecords.length) || 1;
  const sharpness = (captures + checks) / total;
  const positiveCount =
    counts.brilliant +
    counts.great +
    counts.best +
    counts.excellent +
    counts.good +
    counts.book +
    counts.forced;
  const solidity = positiveCount / total;

  const notes = [];
  if (!castled && total >= 10) {
    notes.push("didn't castle — king safety is worth prioritizing");
  }
  if (counts.brilliant > 0) {
    notes.push(`found ${counts.brilliant} brilliant tactical sacrifice${counts.brilliant > 1 ? "s" : ""}`);
  }
  if (sharpness > 0.35) {
    notes.push("tactical, high-contact style (frequent captures and checks)");
  } else {
    notes.push("positional, maneuvering style");
  }
  if (solidity > 0.78) {
    notes.push("very consistent move quality throughout the game");
  } else if (counts.blunder + counts.mistake > total * 0.15) {
    notes.push("accuracy dipped at critical moments — click the highlighted mistakes and blunders to practice the engine's recommended continuations");
  }

  return { counts, notes };
}

export function safeParsePgn(ChessClass, rawPgn) {
  if (!rawPgn || typeof rawPgn !== "string" || !rawPgn.trim()) {
    return {
      ok: false,
      error: "Missing or empty PGN data for this game.",
      headers: {},
      initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      moves: [],
    };
  }

  const headers = {};
  const headerRe = /^\s*\[([A-Za-z0-9_]+)\s+"([^"]*)"\]\s*$/gm;
  let m;
  while ((m = headerRe.exec(rawPgn)) !== null) {
    headers[m[1]] = m[2];
  }

  const startFen =
    headers.SetUp === "1" && headers.FEN
      ? headers.FEN
      : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  try {
    const pgnChess = new ChessClass();
    pgnChess.loadPgn(rawPgn, { strict: false });
    const verboseMoves = pgnChess.history({ verbose: true });
    if (verboseMoves.length > 0) {
      const initialFen = verboseMoves[0].before || startFen;
      return {
        ok: true,
        error: null,
        headers: { ...pgnChess.header(), ...headers },
        initialFen,
        moves: verboseMoves,
      };
    }
  } catch (_) {}

  try {
    const chess = new ChessClass(startFen);
    let body = rawPgn.replace(/^\s*\[[^\]]*\]\s*$/gm, " ");
    body = body.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
    let prev = "";
    while (prev !== body) {
      prev = body;
      body = body.replace(/\([^()]*\)/g, " ");
    }
    body = body
      .replace(/\$\d+/g, " ")
      .replace(/\b\d+\.(\.\.)?/g, " ")
      .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\s*$/g, " ");

    const tokens = body
      .split(/\s+/)
      .map((t) => t.trim().replace(/[!?]+$/, ""))
      .filter(Boolean);

    for (const tok of tokens) {
      if (tok === "1-0" || tok === "0-1" || tok === "1/2-1/2" || tok === "*") {
        break;
      }
      try {
        const moved = chess.move(tok, { strict: false });
        if (!moved) break;
      } catch (_) {
        break;
      }
    }

    const verboseMoves = chess.history({ verbose: true });
    return {
      ok: verboseMoves.length > 0,
      error: verboseMoves.length > 0 ? null : "Could not parse any valid chess moves from PGN.",
      headers,
      initialFen: verboseMoves.length > 0 ? verboseMoves[0].before : startFen,
      moves: verboseMoves,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Malformed PGN data: ${err?.message || String(err)}`,
      headers,
      initialFen: startFen,
      moves: [],
    };
  }
}

// ---------- Opening Trainer & Strategy Coach Curriculum ----------

export const OPENING_LESSONS = [
  {
    id: "italian-giuoco-piano",
    eco: "C53",
    name: "Italian Game: Giuoco Piano",
    side: "w",
    category: "White Repertoire",
    style: "Classical & Tactical",
    difficulty: "Intermediate",
    summary:
      "Rapid kingside development targeting f7 while preparing a powerful central pawn break with c3 and d4.",
    howToPlay: [
      "Place your light-squared bishop on c4 aiming directly at Black's weakest square (f7).",
      "Use c3 to build a launchpad for the d4 central break, gaining space and opening lines for your pieces.",
      "Castle kingside early (O-O) so your rook can support the e-file with Re1.",
    ],
    howToTackle: [
      "As Black, meet 3. Bc4 calmly with 3... Bc5 or 3... Nf6 (Two Knights Defense).",
      "When White plays c3 and d4, counter-strike in the center with ...d5! after ...exd4 cxd4 Bb4+.",
      "Avoid passive moves like ...h6?! before castling, which let White seize complete central control.",
    ],
    steps: [
      { san: "e4", comment: "Claim central space and open diagonals for the Queen and light-squared Bishop." },
      { san: "e5", comment: "Black mirrors central control and prevents White from playing d4 unchallenged." },
      { san: "Nf3", comment: "Develop the kingside knight with tempo, attacking Black's e5 pawn." },
      { san: "Nc6", comment: "Black defends e5 while developing a minor piece toward the center." },
      { san: "Bc4", comment: "The signature Italian move: eyes the vulnerable f7 pawn and prepares kingside castling." },
      { san: "Bc5", comment: "Giuoco Piano ('Quiet Game'): Black develops actively and eyes White's f2 square." },
      { san: "c3", comment: "Prepares the central d2-d4 pawn break to challenge Black's bishop on c5." },
      { san: "Nf6", comment: "Black develops with counter-pressure against White's e4 pawn." },
      { san: "d4", comment: "Strike the center! White opens lines and forces Black's bishop to react." },
      { san: "exd4", comment: "Black releases central tension before White can push d5." },
      { san: "cxd4", comment: "White recaptures, forming an ideal e4+d4 central pawn duo with tempo on c5." },
      { san: "Bb4+", comment: "Black checks to disrupt White's coordination before counter-striking with ...d5." },
    ],
  },
  {
    id: "ruy-lopez-morphy",
    eco: "C78",
    name: "Ruy Lopez: Morphy Defense",
    side: "w",
    category: "White Repertoire",
    style: "Positional & Strategic",
    difficulty: "Intermediate",
    summary:
      "The gold-standard classical 1. e4 opening: pressure the defender of e5, castle quickly, and build a long-term central advantage.",
    howToPlay: [
      "Pin/pressure the c6 knight with 3. Bb5, indirectly pressuring Black's e5 pawn.",
      "When kicked by ...a6 and ...b5, retreat the bishop to a4 and b3 where it eyes f7 safely.",
      "Play Re1, c3, h3, and d4, then maneuver Nbd2-Nf1-Ng3 for a strong kingside build-up.",
    ],
    howToTackle: [
      "As Black, play 3... a6 (Morphy Defense) to gain the option of breaking the pin with ...b5 at any moment.",
      "Develop ...Nf6 and ...Be7 (Closed Ruy Lopez) or ...Bc5 (Arkhangelsk) to stay solid and counter-attack e4.",
      "Look for the freeing ...d5 break once your king is safely castled.",
    ],
    steps: [
      { san: "e4", comment: "Control e4/d5 and open lines for rapid kingside development." },
      { san: "e5", comment: "Black stakes an equal claim in the center." },
      { san: "Nf3", comment: "Attack e5 and prepare kingside castling." },
      { san: "Nc6", comment: "Defend the e5 pawn naturally." },
      { san: "Bb5", comment: "The Ruy Lopez! Pressures the knight that defends Black's e5 pawn." },
      { san: "a6", comment: "Morphy's Defense: immediately asks the bishop's intentions." },
      { san: "Ba4", comment: "Maintain the pressure while staying flexible against ...b5." },
      { san: "Nf6", comment: "Black develops and counter-attacks White's e4 pawn." },
      { san: "O-O", comment: "Castle early! If Black takes 5... Nxe4, White recovers the pawn favorably with d4 or Re1." },
      { san: "Be7", comment: "Closed Ruy Lopez: Black prepares to castle and shields the e-file." },
      { san: "Re1", comment: "Directly protect e4 — now White threatens Bxc6 and Nxe5!" },
      { san: "b5", comment: "Black breaks the pin just in time before White can win the e5 pawn." },
      { san: "Bb3", comment: "The Spanish bishop drops back to a commanding diagonal eyeing f7." },
      { san: "d6", comment: "Black fortifies e5 and prepares to castle kingside." },
    ],
  },
  {
    id: "queens-gambit-declined",
    eco: "D37",
    name: "Queen's Gambit Declined",
    side: "w",
    category: "White Repertoire",
    style: "Positional & Solid",
    difficulty: "Intermediate",
    summary:
      "Offer the c4 flank pawn to undermine Black's d5 center, develop knights and bishops smoothly, and squeeze Black for space.",
    howToPlay: [
      "Play 1. d4 and 2. c4 to attack Black's central d5 pawn from the flank.",
      "Develop Nc3, Nf3, and Bg5 (or Bf4) before playing e3 so your dark-squared bishop isn't locked inside.",
      "Use the Exchange structure (cxd5 exd5) to launch a Queenside Minority Attack (b4-b5) or central break (e4).",
    ],
    howToTackle: [
      "As Black, support d5 with 2... e6 (QGD) or 2... c6 (Slav Defense) — never try to cling to the c4 pawn greedily.",
      "Develop ...Nf6 and ...Be7, castle early, and prepare ...c5 or ...Nbd7 to challenge White's center.",
      "Solve the problem of your light-squared c8 bishop via ...b6/...Bb7 or ...dxc4 followed by ...c5.",
    ],
    steps: [
      { san: "d4", comment: "Control d4 and e5 while protecting the d4 pawn with the Queen." },
      { san: "d5", comment: "Black stops White from playing e4 freely." },
      { san: "c4", comment: "The Queen's Gambit! Offers a wing pawn to deflect Black's central d5 pawn." },
      { san: "e6", comment: "Queen's Gambit Declined: Black solidly supports d5." },
      { san: "Nc3", comment: "Increase pressure on d5 and fight for the e4 square." },
      { san: "Nf6", comment: "Black reinforces d5 and prepares kingside castling." },
      { san: "Bg5", comment: "Pin the f6 knight, increasing indirect pressure on the d5 center." },
      { san: "Be7", comment: "Black breaks the pin and prepares O-O." },
      { san: "e3", comment: "Now that the dark-squared bishop is outside the pawn chain on g5, e3 solidifies d4 and opens the f1 bishop." },
      { san: "O-O", comment: "Black tucks the king to safety." },
      { san: "Nf3", comment: "Complete minor-piece development and control the e5 outpost." },
      { san: "Nbd7", comment: "Black supports a future ...c5 or ...e5 break." },
    ],
  },
  {
    id: "london-system",
    eco: "D02",
    name: "London System: Pyramid Attack",
    side: "w",
    category: "White Repertoire",
    style: "Solid & Universal",
    difficulty: "Beginner–Intermediate",
    summary:
      "A universal, rock-solid setup (d4, Bf4, e3, c3, Nd2, Ngf3, Bd3) that works against almost any Black defense and builds a dangerous kingside attack.",
    howToPlay: [
      "Develop your dark-squared bishop to f4 on move 2 or 3 BEFORE playing e3.",
      "Build the indestructible d4-c3-e3 pawn pyramid so Black's pieces hit a granite wall.",
      "Plant a knight on the e5 outpost, support it with f4 if needed, and aim Bd3 + Qe2/Qh5 at Black's kingside.",
    ],
    howToTackle: [
      "As Black, strike at White's center immediately with ...c5! and ...Nc6.",
      "Look to attack White's undefended b2 pawn with ...Qb6 once White's bishop leaves c1 for f4.",
      "Challenge the f4 bishop with ...Bd6 or ...Nh5 to trade off White's most active minor piece.",
    ],
    steps: [
      { san: "d4", comment: "Claim central ground." },
      { san: "d5", comment: "Black matches in the center." },
      { san: "Bf4", comment: "Key London move: develop the dark-squared bishop to an active diagonal before playing e3." },
      { san: "Nf6", comment: "Black develops a knight and controls e4." },
      { san: "e3", comment: "Solidifies d4 and opens the diagonal for the f1 bishop." },
      { san: "c5", comment: "Black's best counter: immediately challenge White's center from the flank." },
      { san: "c3", comment: "Completes the famous London pawn pyramid (c3-d4-e3)." },
      { san: "Nc6", comment: "Black develops and adds pressure to d4." },
      { san: "Nd2", comment: "Develops to d2 rather than c3 so the c3 pawn remains free to guard d4." },
      { san: "e6", comment: "Black opens the dark-squared bishop to challenge f4 with ...Bd6." },
      { san: "Ngf3", comment: "Both knights now eye the powerful e5 central outpost." },
      { san: "Bd6", comment: "Black challenges White's active London bishop." },
      { san: "Bg3", comment: "Keep tension! If Black captures ...Bxg3, White recaptures hxg3, opening the h-file for the rook." },
    ],
  },
  {
    id: "sicilian-open-najdorf",
    eco: "B90",
    name: "Sicilian Defense: Open & Najdorf",
    side: "b",
    category: "Black Repertoire",
    style: "Dynamic Counter-Attack",
    difficulty: "Intermediate–Advanced",
    summary:
      "The most fighting response to 1. e4: trade your flank c-pawn for White's central d4 pawn to claim a 2-vs-1 central pawn majority and semi-open c-file.",
    howToPlay: [
      "Meet 1. e4 with 1... c5 to fight for d4 asymmetrically without giving White a symmetrical game.",
      "After 2. Nf3 d6 3. d4 cxd4 4. Nxd4, play 4... Nf6 to force White to defend e4 with Nc3.",
      "Play 5... a6 (Najdorf) to keep pieces out of b5, prepare ...e5 or ...e6, and expand on the queenside with ...b5.",
    ],
    howToTackle: [
      "As White, open the center quickly with d4, develop Be3/Bg5 and f3/Qd2, and castle queenside (O-O-O) for a pawn storm (g4-h4).",
      "Alternatively, play the Alapin (2. c3) or Closed Sicilian (2. Nc3) if you want to avoid sharp main-line theory.",
      "Watch out for Black's tactical ...d5 break and ...Nxe4 sacrifices on the c-file.",
    ],
    steps: [
      { san: "e4", comment: "White opens with the king's pawn." },
      { san: "c5", comment: "The Sicilian Defense! Fights for d4 from the flank and creates an unbalanced, winning battleground." },
      { san: "Nf3", comment: "White prepares d4." },
      { san: "d6", comment: "Controls e5 and prepares smooth piece development." },
      { san: "d4", comment: "White opens the center." },
      { san: "cxd4", comment: "Crucial strategic trade: Black exchanges a wing c-pawn for White's central d-pawn!" },
      { san: "Nxd4", comment: "White centralizes the knight." },
      { san: "Nf6", comment: "Develop with tempo! Forces White to defend the e4 pawn." },
      { san: "Nc3", comment: "White defends e4." },
      { san: "a6", comment: "The Najdorf! Prevents Bb5+/Nb5 and prepares queenside expansion with ...b5 and central strike ...e5." },
      { san: "Be3", comment: "English Attack setup: White reinforces d4 and prepares Qd2 + O-O-O." },
      { san: "e5", comment: "Strike the center and kick White's centralized knight away from d4!" },
    ],
  },
  {
    id: "caro-kann-classical",
    eco: "B18",
    name: "Caro-Kann Defense",
    side: "b",
    category: "Black Repertoire",
    style: "Ultra-Solid & Endgame-Strong",
    difficulty: "Beginner–Intermediate",
    summary:
      "Prepare ...d5 with 1... c6 so you retain a rock-solid pawn structure while freely developing your light-squared bishop outside the pawn chain.",
    howToPlay: [
      "Play 1... c6 followed by 2... d5 to challenge White's e4 center with pawn support.",
      "Against 3. Nc3 or 3. Nd2, capture 3... dxe4 4. Nxe4 and develop 4... Bf5! (or 4... Nd7) before playing ...e6.",
      "In the Advance Variation (3. e5), immediately develop 3... Bf5! and attack the d4 base with ...e6 and ...c5.",
    ],
    howToTackle: [
      "As White, use the Advance Variation (3. e5) to claim kingside space, or the Exchange/Panov-Botvinnik (3. exd5 cxd5 4. c4) for open lines.",
      "Target Black's light-squared bishop if it ventures to f5 early.",
    ],
    steps: [
      { san: "e4", comment: "White occupies the center." },
      { san: "c6", comment: "The Caro-Kann! Prepares ...d5 while keeping the c8-h3 diagonal open for the light-squared bishop." },
      { san: "d4", comment: "White builds the ideal two-pawn center." },
      { san: "d5", comment: "Challenge e4 immediately!" },
      { san: "Nc3", comment: "White defends e4." },
      { san: "dxe4", comment: "Release the central tension so the light-squared bishop can develop cleanly." },
      { san: "Nxe4", comment: "White recaptures with the knight." },
      { san: "Bf5", comment: "Classical Caro-Kann: develop the light-squared bishop with tempo against White's knight!" },
      { san: "Ng3", comment: "White attacks the bishop and retreats the knight." },
      { san: "Bg6", comment: "Drop back to g6 where the bishop commands the h7-b1 diagonal and shields the future kingside." },
      { san: "h4", comment: "White tries to harass the g6 bishop." },
      { san: "h6", comment: "Create a safe escape pocket on h7 for the bishop before completing development with ...Nd7 and ...Ngf6." },
    ],
  },
  {
    id: "tackle-scholars-mate",
    eco: "C20",
    name: "Tackle Early Queen Attacks (Scholar's Mate Refutation)",
    side: "b",
    category: "Trap Refutation & Defense",
    style: "Punishing Overextension",
    difficulty: "Beginner–Intermediate",
    summary:
      "Learn the exact move order to shut down 2. Qh5 / 3. Bc4 Scholar's Mate attempts and gain a huge lead in development by chasing White's Queen.",
    howToPlay: [
      "Never panic when White plays 2. Qh5! Notice that Qh5 attacks BOTH f7 and e5 — defend the e5 pawn first with 2... Nc6!",
      "When White plays 3. Bc4 threatening Qxf7#, block the diagonal cleanly with 3... g6! attacking the Queen.",
      "When White retreats 4. Qf3 threatening Qxf7# again, play 4... Nf6! blocking mate and developing a second knight.",
      "Follow up with ...Nd4! attacking f3 and c2 simultaneously, seizing a winning initiative.",
    ],
    howToTackle: [
      "Never play 2... g6?? on move 2 — White will play 3. Qxe5+ winning your e5 pawn AND your h8 rook in the corner!",
      "Use White's exposed Queen as a target to develop your knights and bishops with free tempos.",
    ],
    steps: [
      { san: "e4", comment: "White starts with e4." },
      { san: "e5", comment: "Respond solidly in the center." },
      { san: "Qh5", comment: "White brings the Queen out early, attacking e5 and eyeing f7." },
      { san: "Nc6", comment: "CRITICAL MOVE 1: Defend your e5 pawn first while developing a knight! (Never play 2...g6?? here, which blunders Qxe5+ and the h8 rook!)." },
      { san: "Bc4", comment: "White sets up the Scholar's Mate battery on f7." },
      { san: "g6", comment: "CRITICAL MOVE 2: Now that e5 is protected by Nc6, 3...g6 blocks the Queen's attack on f7 with tempo!" },
      { san: "Qf3", comment: "White renews the mate threat on f7 along the f-file." },
      { san: "Nf6", comment: "CRITICAL MOVE 3: Develop your kingside knight to f6, blocking the Queen's path to f7 while preparing to castle!" },
      { san: "Ne2", comment: "White tries to catch up in development." },
      { san: "Nd4", comment: "Counter-strike! Attacks White's Queen on f3 AND threatens the c2 fork (Nxc2+)." },
      { san: "Nxd4", comment: "White is forced to trade off their only developed knight." },
      { san: "exd4", comment: "Black has a commanding center, open lines, and safe development via ...Bg7 and ...O-O." },
    ],
  },
  {
    id: "tackle-fried-liver",
    eco: "C57",
    name: "Tackle the Fried Liver / Ng5 Knight Attack",
    side: "b",
    category: "Trap Refutation & Defense",
    style: "Tactical Counter-Gambit",
    difficulty: "Intermediate",
    summary:
      "How to neutralize and punish 4. Ng5 in the Two Knights Defense using the Polerio Counter-Attack (4... d5 5. exd5 Na5!).",
    howToPlay: [
      "When White plays 4. Ng5 attacking f7 with Knight + Bishop, the ONLY good move is 4... d5! blocking the c4 bishop.",
      "After 5. exd5, DO NOT play 5... Nxd5?! (which allows the dangerous 6. Nxf7! Fried Liver sacrifice).",
      "Instead, play 5... Na5! chasing White's c4 bishop and seizing a fierce lead in piece activity for the sacrificed pawn.",
    ],
    howToTackle: [
      "After 5... Na5 6. Bb5+ c6 7. dxc6 bxc6, kick the bishop again and use ...Bc5, ...O-O, and ...Nd5 to harass White's uncoordinated knights.",
    ],
    steps: [
      { san: "e4", comment: "White opens 1. e4." },
      { san: "e5", comment: "Black matches 1... e5." },
      { san: "Nf3", comment: "White attacks e5." },
      { san: "Nc6", comment: "Black defends e5." },
      { san: "Bc4", comment: "Italian Bishop eyes f7." },
      { san: "Nf6", comment: "Two Knights Defense: Black counter-attacks e4 immediately." },
      { san: "Ng5", comment: "White gangs up on f7 with both the Knight and Bishop!" },
      { san: "d5", comment: "The only move! Blocks the c4 bishop's diagonal to f7 with tempo." },
      { san: "exd5", comment: "White captures and attacks your c6 knight." },
      { san: "Na5", comment: "Polerio Defense! Avoids the Fried Liver (5...Nxd5 6.Nxf7) and counter-attacks White's c4 bishop!" },
      { san: "Bb5+", comment: "White checks to save the bishop." },
      { san: "c6", comment: "Block the check with tempo on the b5 bishop." },
      { san: "dxc6", comment: "White takes another pawn, falling behind in development." },
      { san: "bxc6", comment: "Recapture with tempo! Black has wide-open diagonals and a huge lead in development." },
    ],
  },
];

export const TACTICAL_GUIDES = [
  {
    id: "cct-checklist",
    title: "1. The Anti-Blunder Routine: Checks, Captures, Threats (CCT)",
    badge: "Blunder Prevention",
    summary:
      "Most tactical blunders happen because a player reads only their own plan and misses the opponent's forcing reply.",
    points: [
      "Before touching a piece, scan ALL forcing moves for BOTH sides in strict order: 1) Checks, 2) Captures, 3) Threats.",
      "Ask after every opponent move: 'What did that move undefend, and what new square is that piece attacking?'",
      "Check for 'LPDO' (Loose Pieces Drop Off): undefended knights, bishops, or rooks are magnets for double attacks and forks.",
    ],
  },
  {
    id: "opening-principles",
    title: "2. Mastering the Opening & Punishing Early Violations",
    badge: "Opening Mastery",
    summary:
      "Even when your opponent goes out of book on move 3, three golden rules tell you the right move.",
    points: [
      "Fight for the center (e4, d4, e5, d5) with pawns and minor pieces before launching flank attacks.",
      "Develop Knights before Bishops, don't move the same piece twice in the opening unless winning material, and castle by move 8–10.",
      "When an opponent brings their Queen out early or pushes too many flank pawns, counter-strike in the center (d5 or e5) to open lines toward their uncastled King.",
    ],
  },
  {
    id: "converting-advantage",
    title: "3. Converting Winning Positions Without Counterplay",
    badge: "Advantage Conversion",
    summary:
      "How to close out a +2.0 or +4.0 lead cleanly without giving your opponent a miracle swindle.",
    points: [
      "When ahead in material, trade pieces (especially Queens), not pawns — fewer pieces mean fewer tactical tricks for your opponent.",
      "Before pushing pawns to attack, identify your opponent's ONLY active piece or counterplay idea and extinguish it first (prophylaxis).",
      "Keep your King safe from back-rank checks and perpetual checks by making 'luft' (h3/g3 or h6/g6) when rooks and queens are on the board.",
    ],
  },
  {
    id: "defending-under-pressure",
    title: "4. How to Tackle Pressure & Defend Worse Positions",
    badge: "Resilient Defense",
    summary:
      "Practical techniques to survive an attack and turn the tables when you are down material or under fire.",
    points: [
      "Trade off the opponent's best attacking piece — especially a bishop or knight planted near your King.",
      "When down material, keep pawns on the board and avoid simplifying into a hopeless endgame; create complications and threats.",
      "Look for tactical defensive resources: pins, intermediate checks (zwischenzug), and stalemate traps.",
    ],
  },
];

// Generates personalized improvement advice based on the current analyzed game
export function generatePersonalizedCoachPlan(comparison, records, opening) {
  const tips = [];
  const analyzed = (records || []).filter((r) => r.analyzed);
  if (!comparison || analyzed.length === 0) {
    return {
      headline: "Analyze a game to unlock personalized coaching",
      tips: [
        "Open the opening studio to practice a line move by move on the board.",
        "Switch the studio to drill mode to test the line from memory.",
      ],
      recommendedLessonId: "italian-giuoco-piano",
    };
  }

  const me = comparison.me;
  const myRecs = analyzed.filter((r) => r.color === me.color);
  const myMistakes = myRecs.filter(
    (r) => r.tag === "blunder" || r.tag === "mistake" || r.tag === "inaccuracy"
  );

  // Find biggest centipawn drop
  let worstMove = null;
  for (const r of myMistakes) {
    if (!worstMove || r.cpLoss > worstMove.cpLoss) {
      worstMove = r;
    }
  }

  if (worstMove) {
    tips.push(
      `Turning point: move ${worstMove.moveNumber}${worstMove.color === "w" ? "." : "..."} ${worstMove.san} was a ${worstMove.label.toLowerCase()} that cost ${worstMove.cpLoss} centipawns. ${worstMove.bestMoveSan || worstMove.bestMoveUci} kept the evaluation at ${worstMove.evalBeforeStr}.`
    );
  } else {
    tips.push(
      `No mistakes: all ${myRecs.length} of your moves held up at this depth.`
    );
  }

  if (me.phaseAcc.opening !== null && me.phaseAcc.opening < 85) {
    tips.push(
      `Opening: ${me.phaseAcc.opening}% accuracy over moves 1–10. You lost ground out of the ${opening?.name || "opening"}; drill the first ten moves in the studio until they are automatic.`
    );
  } else if (me.phaseAcc.middlegame !== null && me.phaseAcc.middlegame < 80) {
    tips.push(
      `Middlegame: ${me.phaseAcc.middlegame}% accuracy over moves 11–25. The opening was sound, so the losses came from tactics. Scan checks, captures and threats before each move.`
    );
  } else if (me.phaseAcc.endgame !== null && me.phaseAcc.endgame < 80) {
    tips.push(
      `Endgame: ${me.phaseAcc.endgame}% accuracy after move 25. Activate the king earlier and support passed pawns in simplified positions.`
    );
  } else {
    tips.push(
      `Steady across all phases: ${me.accuracyExact}% overall accuracy, about ${me.estimatedElo} Elo for this game.`
    );
  }

  // Pick a matching opening lesson
  let recommendedLessonId = me.color === "w" ? "italian-giuoco-piano" : "sicilian-open-najdorf";
  if (opening && opening.name) {
    const lower = opening.name.toLowerCase();
    if (lower.includes("ruy lopez")) recommendedLessonId = "ruy-lopez-morphy";
    else if (lower.includes("italian") || lower.includes("giuoco")) recommendedLessonId = "italian-giuoco-piano";
    else if (lower.includes("queen's gambit")) recommendedLessonId = "queens-gambit-declined";
    else if (lower.includes("london")) recommendedLessonId = "london-system";
    else if (lower.includes("sicilian")) recommendedLessonId = "sicilian-open-najdorf";
    else if (lower.includes("caro-kann")) recommendedLessonId = "caro-kann-classical";
    else if (lower.includes("two knights")) recommendedLessonId = "tackle-fried-liver";
  }

  return {
    headline: `Your game: ${me.accuracyExact}% accuracy, about ${me.estimatedElo} Elo (${me.tier})`,
    tips,
    worstMovePly: worstMove ? worstMove.ply : null,
    recommendedLessonId,
  };
}
