// Chess Coach — Live Chess.com Real-Time Post-Move Coaching Content Script
//
// Features a freely movable (draggable) coaching overlay with viewport clamping,
// persistent position, live White-relative Evaluation Bar, on-board move badges,
// rating-anchored Estimated Elo, side-by-side You vs Opponent tracking,
// one-click launchers for both Game Review and the dedicated Opening Studio,
// and seamless hot-reload recovery so reloading the extension never breaks
// an active Chess.com tab with "Extension context invalidated" errors.

(() => {
  function isContextValid() {
    try {
      return Boolean(
        typeof chrome !== "undefined" && chrome?.runtime && chrome.runtime.id
      );
    } catch (_) {
      return false;
    }
  }

  if (!isContextValid()) return;

  // Bump whenever the content script's behavior changes, so an extension
  // update always hands the tab to the newest code even if the old context
  // somehow stayed valid.
  const CC_BUILD = 5;

  // If an active, valid instance of the SAME build is already running, do not duplicate
  if (
    window.__chessCoachActiveInstance &&
    typeof window.__chessCoachActiveInstance.isContextValid === "function" &&
    window.__chessCoachActiveInstance.isContextValid() &&
    window.__chessCoachActiveInstance.build >= CC_BUILD
  ) {
    return;
  }

  // If a stale instance (older build, or from before an extension reload) exists, replace it
  let inheritedPanelPos = null;
  if (
    window.__chessCoachActiveInstance &&
    typeof window.__chessCoachActiveInstance.cleanup === "function"
  ) {
    try {
      inheritedPanelPos = window.__chessCoachActiveInstance.getPanelPos?.() || null;
      window.__chessCoachActiveInstance.cleanup({ removeDom: true });
    } catch (_) {}
  }

  // Cache extension resource URLs upfront while chrome.runtime is guaranteed valid
  const CACHED_URLS = {
    chessJs: chrome.runtime.getURL("lib/chess.js"),
    engineJs: chrome.runtime.getURL("lib/engine.js"),
    classifyJs: chrome.runtime.getURL("lib/classify.js"),
    openingsJson: chrome.runtime.getURL("lib/openings.json"),
    stockfishJs: chrome.runtime.getURL("engine/stockfish.js"),
    overlayCss: chrome.runtime.getURL("content/overlay.css"),
    reviewHtml: chrome.runtime.getURL("review/review.html"),
    coachHtml: chrome.runtime.getURL("coach/coach.html"),
  };

  let Chess;
  let Engine,
    whiteRelativeCp,
    whiteRelativeMate,
    winPercent,
    moveAccuracyFromWinSwing,
    formatEvalScore;
  let classifyMove,
    CLASSIFICATION_META,
    calculateEstimatedElo,
    loadOpenings,
    identifyOpening,
    isMoveInOpeningBook,
    summarizePlaystyle,
    materialBalance,
    uciToSanMove,
    explainMove;

  const MOVE_LIST_SELECTORS = [
    "wc-simple-move-list",
    "wc-move-list",
    ".move-list-wrapper",
    ".vertical-move-list",
    "[data-cy='move-list']",
    ".move-list",
    ".play-controller-moves",
    ".analysis-view-movelist",
  ];

  const BOARD_SELECTORS = [
    "wc-chess-board",
    ".board",
    "[data-test-element='chess-board']",
    "#board-single",
    ".board-layout-main .board",
  ];

  /* Marker backgrounds mirror the spotlight board palette (dark grade
     tokens), so badges read the same on both surfaces. */
  const MARKER_STYLE = {
    brilliant: { bg: "#42d5a0", glyph: "!!" },
    great: { bg: "#6db1ff", glyph: "!" },
    best: { bg: "#3ecf8e", glyph: "★" },
    excellent: { bg: "#57c48f", glyph: "✓" },
    good: { bg: "#9bc48f", glyph: "✓" },
    book: { bg: "#c9a24a", glyph: "Bk" },
    inaccuracy: { bg: "#f2b04a", glyph: "?!" },
    mistake: { bg: "#ff9454", glyph: "?" },
    blunder: { bg: "#ff6a5a", glyph: "??" },
    forced: { bg: "#9aa39d", glyph: "=" },
  };

  const UNICODE_FIGURINES = {
    "♔": "K",
    "♕": "Q",
    "♖": "R",
    "♗": "B",
    "♘": "N",
    "♙": "",
    "♚": "K",
    "♛": "Q",
    "♜": "R",
    "♝": "B",
    "♞": "N",
    "♟": "",
  };

  const ANALYSIS_DEPTH_DEFAULT = 14;
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  let state = {
    enabled: true,
    username: null,
    depth: ANALYSIS_DEPTH_DEFAULT,
    game: null,
    seenPlyCount: 0,
    moveRecords: [],
    myColor: null,
    myRating: null,
    oppRating: null,
    openings: null,
    engine: null,
    engineReady: false,
    initialEvalWhiteCp: 20,
    initialBestMoveUci: "e2e4",
    initialPvUci: ["e2e4", "e7e5"],
    lastEvalWhiteCp: 20,
    lastEvalWhiteMate: null,
    lastBestMoveUci: "e2e4",
    lastPvUci: ["e2e4", "e7e5"],
    pendingRuns: 0,
    starting: false,
    selectedPly: null,
    markerSquare: null,
    markerTag: null,
    minimized: false,
    panelPos: inheritedPanelPos,
    observedContainer: null,
    observedBoard: null,
    cleanedUp: false,
  };

  let markerLayer = null;
  let markerEl = null;
  let boardResizeObserver = null;
  let moveListObserver = null;
  let boardPieceObserver = null;
  let pollTimer = null;

  function cleanupInstance(options = {}) {
    state.cleanedUp = true;
    state.engineReady = false;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (moveListObserver) {
      try {
        moveListObserver.disconnect();
      } catch (_) {}
      moveListObserver = null;
    }
    if (boardPieceObserver) {
      try {
        boardPieceObserver.disconnect();
      } catch (_) {}
      boardPieceObserver = null;
    }
    if (boardResizeObserver) {
      try {
        boardResizeObserver.disconnect();
      } catch (_) {}
      boardResizeObserver = null;
    }
    if (state.engine) {
      try {
        state.engine.terminate();
      } catch (_) {}
      state.engine = null;
    }
    if (options.removeDom) {
      const oldPanel = document.getElementById("chess-coach-panel");
      if (oldPanel) oldPanel.remove();
      const oldMarkers = document.getElementById("chess-coach-board-markers");
      if (oldMarkers) oldMarkers.remove();
      markerLayer = null;
      markerEl = null;
    }
  }

  window.__chessCoachActiveInstance = {
    build: CC_BUILD,
    isContextValid,
    cleanup: cleanupInstance,
    getPanelPos: () => state.panelPos,
  };

  function safeStorageSet(items) {
    if (!isContextValid()) return;
    try {
      chrome.storage?.sync?.set(items)?.catch?.(() => {});
    } catch (_) {}
  }

  function safeStorageRemove(key) {
    if (!isContextValid()) return;
    try {
      chrome.storage?.sync?.remove(key)?.catch?.(() => {});
    } catch (_) {}
  }

  async function init() {
    try {
      const chessMod = await import(CACHED_URLS.chessJs);
      Chess = chessMod.Chess;

      const engineMod = await import(CACHED_URLS.engineJs);
      Engine = engineMod.Engine;
      whiteRelativeCp = engineMod.whiteRelativeCp;
      whiteRelativeMate = engineMod.whiteRelativeMate;
      winPercent = engineMod.winPercent;
      moveAccuracyFromWinSwing = engineMod.moveAccuracyFromWinSwing;
      formatEvalScore = engineMod.formatEvalScore;

      const classifyMod = await import(CACHED_URLS.classifyJs);
      classifyMove = classifyMod.classifyMove;
      CLASSIFICATION_META = classifyMod.CLASSIFICATION_META;
      calculateEstimatedElo = classifyMod.calculateEstimatedElo;
      loadOpenings = classifyMod.loadOpenings;
      identifyOpening = classifyMod.identifyOpening;
      isMoveInOpeningBook = classifyMod.isMoveInOpeningBook;
      summarizePlaystyle = classifyMod.summarizePlaystyle;
      materialBalance = classifyMod.materialBalance;
      uciToSanMove = classifyMod.uciToSanMove;
      explainMove = classifyMod.explainMove;

      if (isContextValid()) {
        try {
          const stored = await chrome.storage.sync.get([
            "enabled",
            "username",
            "depth",
            "panelPos",
          ]);
          state.enabled = stored.enabled !== false;
          state.username = (stored.username || "").trim().toLowerCase() || null;
          state.depth = parseInt(stored.depth, 10) || ANALYSIS_DEPTH_DEFAULT;
          if (
            stored.panelPos &&
            typeof stored.panelPos.left === "number" &&
            typeof stored.panelPos.top === "number"
          ) {
            state.panelPos = stored.panelPos;
          }
        } catch (_) {}
      }

      setupStorageListener();

      if (!state.enabled) return;

      await startLiveCoach();
    } catch (err) {
      console.error("[Chess Coach] Initialization error:", err);
    }
  }

  function setupStorageListener() {
    if (!isContextValid() || !chrome?.storage?.onChanged) return;
    try {
      chrome.storage.onChanged.addListener(async (changes, area) => {
        if (state.cleanedUp || !isContextValid() || area !== "sync") return;
        if (changes.username) {
          state.username =
            (changes.username.newValue || "").trim().toLowerCase() || null;
          detectMyColorAndRatings();
          updateHeaderAccuracyAndComparison();
        }
        if (changes.depth) {
          state.depth =
            parseInt(changes.depth.newValue, 10) || ANALYSIS_DEPTH_DEFAULT;
        }
        if (changes.enabled) {
          state.enabled = changes.enabled.newValue !== false;
          const panel = document.getElementById("chess-coach-panel");
          if (!state.enabled) {
            if (panel) panel.style.display = "none";
            if (markerLayer) markerLayer.style.display = "none";
          } else {
            if (panel) {
              panel.style.display = "";
            } else {
              await startLiveCoach();
            }
            if (markerLayer) markerLayer.style.display = "";
          }
        }
      });
    } catch (_) {}
  }

  async function startLiveCoach() {
    // one engine at a time: init + the storage listener can both call this
    if (state.starting) return;
    state.starting = true;
    try {
      state.game = new Chess();

      injectOverlay();
      setCoachStatus("Starting Stockfish 19…", "loading");
      updateEvalBar(20, null);
      detectMyColorAndRatings();

      try {
        state.openings = await loadOpenings(CACHED_URLS.openingsJson);
      } catch (err) {
        console.warn("[Chess Coach] Could not load openings book:", err);
        state.openings = [];
      }

      try {
        state.engine = new Engine(CACHED_URLS.stockfishJs);
        await state.engine.whenReady();
        state.engineReady = true;

        const startEval = await state.engine.evaluate(
          state.game.fen(),
          Math.min(state.depth, 10)
        );
        const startCp = whiteRelativeCp(startEval, "w");
        state.initialEvalWhiteCp = startCp;
        state.initialBestMoveUci = startEval.bestMove || "e2e4";
        state.initialPvUci = startEval.pv || ["e2e4", "e7e5"];

        state.lastEvalWhiteCp = startCp;
        state.lastEvalWhiteMate = whiteRelativeMate(startEval, "w");
        state.lastBestMoveUci = state.initialBestMoveUci;
        state.lastPvUci = state.initialPvUci;

        setCoachStatus(`Ready, watching the board · depth ${state.depth}`, "ready");
      } catch (err) {
        console.error("[Chess Coach] Engine failed to initialize:", err);
        setCoachStatus("Engine error. Reload the page.", "error");
        return;
      }

      startObservers();
    } finally {
      state.starting = false;
    }
  }

  function resetGameTracking() {
    if (!Chess) return;
    state.game = new Chess();
    state.seenPlyCount = 0;
    state.moveRecords = [];
    state.lastEvalWhiteCp = state.initialEvalWhiteCp ?? 20;
    state.lastEvalWhiteMate = null;
    state.lastBestMoveUci = state.initialBestMoveUci || "e2e4";
    state.lastPvUci = state.initialPvUci || ["e2e4", "e7e5"];
    state.markerSquare = null;
    state.markerTag = null;
    state.selectedPly = null;

    if (markerEl) {
      markerEl.style.display = "none";
    }

    updateEvalBar(state.lastEvalWhiteCp, null);
    const accEl = document.getElementById("chess-coach-accuracy");
    if (accEl) accEl.textContent = "—";
    const vsEl = document.getElementById("chess-coach-vs");
    if (vsEl) vsEl.textContent = "—";
    const winDeltaEl = document.getElementById("chess-coach-windelta");
    if (winDeltaEl) winDeltaEl.textContent = "—";
    const bestEl = document.getElementById("chess-coach-best");
    if (bestEl) bestEl.textContent = "—";
    const stripAccEl = document.getElementById("chess-coach-acc");
    if (stripAccEl) stripAccEl.textContent = "—";
    const openingEl = document.getElementById("chess-coach-opening");
    if (openingEl) openingEl.textContent = "Standard start";
    const lastMoveEl = document.getElementById("chess-coach-last-move");
    if (lastMoveEl) {
      lastMoveEl.className = "";
      lastMoveEl.textContent = "Waiting for moves…";
    }
    const explainEl = document.getElementById("chess-coach-explain");
    if (explainEl) {
      explainEl.textContent =
        "Play a move on the board to see move quality, accuracy, and live rating estimate.";
    }
    const logEl = document.getElementById("chess-coach-log");
    if (logEl) logEl.innerHTML = "";
    updateBreakdownBadges();
    detectMyColorAndRatings();
  }

  function findMoveListContainer() {
    for (const sel of MOVE_LIST_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findBoardElement() {
    for (const sel of BOARD_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
  }

  function inferFigurinePieceFromElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

    const figAttr =
      el.getAttribute("data-figurine") ||
      el.getAttribute("data-piece") ||
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      "";
    if (/^[KQRBN]$/i.test(figAttr.trim())) {
      return figAttr.trim().toUpperCase();
    }

    const combined = `${figAttr} ${el.className || ""}`.toLowerCase();
    if (/\b(queen|wq|bq)\b/.test(combined)) return "Q";
    if (/\b(knight|wn|bn)\b/.test(combined)) return "N";
    if (/\b(bishop|wb|bb)\b/.test(combined)) return "B";
    if (/\b(rook|wr|br)\b/.test(combined)) return "R";
    if (/\b(king|wk|bk)\b/.test(combined)) return "K";

    return null;
  }

  function extractMoveTokenFromNode(node) {
    if (!node) return null;

    let raw = "";
    let pieceHint = inferFigurinePieceFromElement(node);
    let hasFigurineEl = Boolean(pieceHint);

    const walk = (el) => {
      if (el.nodeType === Node.TEXT_NODE) {
        raw += el.nodeValue || "";
        return;
      }
      if (el.nodeType !== Node.ELEMENT_NODE) return;

      const tag = el.tagName.toLowerCase();
      const cls = typeof el.className === "string" ? el.className : "";
      if (
        cls.includes("time-white") ||
        cls.includes("time-black") ||
        cls.includes("move-time") ||
        el.hasAttribute("data-cy-clock")
      ) {
        return;
      }

      const inferred = inferFigurinePieceFromElement(el);
      if (inferred) {
        pieceHint = pieceHint || inferred;
        hasFigurineEl = true;
      } else if (
        tag === "svg" ||
        tag === "img" ||
        tag === "i" ||
        cls.includes("icon-font-chess") ||
        cls.includes("figurine") ||
        el.hasAttribute("data-figurine")
      ) {
        hasFigurineEl = true;
      }

      for (const child of el.childNodes) {
        walk(child);
      }
    };

    walk(node);

    for (const [uni, letter] of Object.entries(UNICODE_FIGURINES)) {
      if (raw.includes(uni)) {
        if (letter) {
          pieceHint = pieceHint || letter;
          hasFigurineEl = true;
        }
        raw = raw.split(uni).join(letter);
      }
    }

    raw = raw
      .replace(/[\uE000-\uF8FF\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, "")
      .replace(/0-0-0/g, "O-O-O")
      .replace(/0-0/g, "O-O")
      .replace(/[!?]+$/g, "");

    if (!raw) return null;

    if (
      pieceHint &&
      !/^[KQRBN]/.test(raw) &&
      !raw.startsWith("O-O") &&
      !raw.includes("=" + pieceHint)
    ) {
      raw = pieceHint + raw;
    }

    return {
      text: raw,
      pieceHint,
      hasFigurineEl,
    };
  }

  const FULL_OR_PARTIAL_SAN_RE =
    /^(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?)$/;

  function extractMoveSequenceFromContainer(container) {
    if (!container) return [];

    const plyNodes = Array.from(container.querySelectorAll("[data-ply]")).filter(
      (el) => !el.querySelector("[data-ply]")
    );

    if (plyNodes.length > 0) {
      plyNodes.sort((a, b) => {
        const pa = parseInt(a.getAttribute("data-ply"), 10) || 0;
        const pb = parseInt(b.getAttribute("data-ply"), 10) || 0;
        return pa - pb;
      });
      const seq = [];
      const seenPlys = new Set();
      for (const n of plyNodes) {
        // The same ply can appear in more than one node while chess.com
        // re-renders its move list; keep only the first token per ply.
        const plyAttr = parseInt(n.getAttribute("data-ply"), 10);
        if (Number.isFinite(plyAttr)) {
          if (seenPlys.has(plyAttr)) continue;
          seenPlys.add(plyAttr);
        }
        const tok = extractMoveTokenFromNode(n);
        if (tok && FULL_OR_PARTIAL_SAN_RE.test(tok.text)) {
          seq.push(tok);
        }
      }
      if (seq.length > 0) return seq;
    }

    const rawNodes = Array.from(
      container.querySelectorAll(
        ".node, .move-text, [data-cy='move-text'], .main-line-ply"
      )
    );
    const leafMoveNodes = rawNodes.filter(
      (el) => !rawNodes.some((other) => other !== el && el.contains(other))
    );

    const candidates =
      leafMoveNodes.length > 0
        ? leafMoveNodes
        : Array.from(container.querySelectorAll("*")).filter(
            (n) => n.children.length === 0 && n.textContent.trim().length > 0
          );

    const seq = [];
    for (const n of candidates) {
      const tok = extractMoveTokenFromNode(n);
      if (tok && FULL_OR_PARTIAL_SAN_RE.test(tok.text)) {
        seq.push(tok);
      }
    }
    return seq;
  }

  function resolveAndApplyMove(chessInst, moveToken, boardEl) {
    if (!chessInst || !moveToken) return null;
    const raw = typeof moveToken === "string" ? moveToken : moveToken.text;
    const hasFigurineEl = Boolean(moveToken?.hasFigurineEl);
    const pieceHint = moveToken?.pieceHint || null;

    const legalMoves = chessInst.moves({ verbose: true });
    if (legalMoves.length === 0) return null;

    const exactLegal = legalMoves.find(
      (m) =>
        m.san === raw ||
        m.san.replace(/[+#]$/, "") === raw.replace(/[+#]$/, "")
    );
    if (exactLegal && (!hasFigurineEl || exactLegal.piece !== "p")) {
      return chessInst.move(exactLegal.san, { strict: false });
    }

    const cleanRaw = raw.replace(/[+#!?]+$/, "");
    const destMatch = cleanRaw.match(/([a-h][1-8])(=[QRBN])?$/i);
    const targetSquare = destMatch ? destMatch[1].toLowerCase() : null;
    const isCapture = cleanRaw.includes("x");

    if (targetSquare) {
      let candidates = legalMoves.filter((m) => m.to === targetSquare);
      if (hasFigurineEl || cleanRaw.startsWith("x")) {
        const pieceCandidates = candidates.filter((m) => m.piece !== "p");
        if (pieceCandidates.length > 0) candidates = pieceCandidates;
      }
      if (pieceHint) {
        const hinted = candidates.filter(
          (m) => m.piece.toUpperCase() === pieceHint.toUpperCase()
        );
        if (hinted.length > 0) candidates = hinted;
      }
      if (isCapture) {
        const capCandidates = candidates.filter((m) => Boolean(m.captured));
        if (capCandidates.length > 0) candidates = capCandidates;
      }

      if (candidates.length === 1) {
        return chessInst.move(candidates[0].san, { strict: false });
      }

      if (candidates.length > 1 && boardEl) {
        const domMap = readBoardPieceMap(boardEl);
        if (domMap) {
          const pieceOnTarget = domMap.get(targetSquare);
          if (pieceOnTarget) {
            const pieceType = pieceOnTarget[1];
            const matchedByBoard = candidates.find((m) => m.piece === pieceType);
            if (matchedByBoard) {
              return chessInst.move(matchedByBoard.san, { strict: false });
            }
          }
        }
      }

      if (candidates.length > 0) {
        return chessInst.move(candidates[0].san, { strict: false });
      }
    }

    try {
      return chessInst.move(raw, { strict: false });
    } catch (_) {
      return null;
    }
  }

  function readBoardPieceMap(boardEl) {
    if (!boardEl) return null;
    const pieceEls = boardEl.querySelectorAll(".piece");
    if (!pieceEls || pieceEls.length === 0) return null;

    const map = new Map();
    for (const el of pieceEls) {
      if (el.classList.contains("dragging")) continue;
      const cls = el.className || "";
      const pieceMatch = cls.match(/\b([wb][pnbrqk])\b/i);
      const sqMatch = cls.match(/\bsquare-(\d)(\d)\b/);
      if (!pieceMatch || !sqMatch) continue;
      const file = String.fromCharCode(96 + parseInt(sqMatch[1], 10));
      const rank = sqMatch[2];
      const sq = `${file}${rank}`;
      map.set(sq, pieceMatch[1].toLowerCase());
    }
    return map.size >= 2 ? map : null;
  }

  function chessInstanceToPieceMap(chessInst) {
    const map = new Map();
    const board = chessInst.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (cell) {
          map.set(cell.square, `${cell.color}${cell.type}`);
        }
      }
    }
    return map;
  }

  function pieceMapsEqual(mapA, mapB) {
    if (!mapA || !mapB || mapA.size !== mapB.size) return false;
    for (const [sq, piece] of mapA.entries()) {
      if (mapB.get(sq) !== piece) return false;
    }
    return true;
  }

  function isBoardAtStartingPosition() {
    const boardEl = findBoardElement();
    if (!boardEl || !Chess) return false;
    const domMap = readBoardPieceMap(boardEl);
    if (!domMap || domMap.size !== 32) return false;
    const startChess = new Chess(START_FEN);
    return pieceMapsEqual(domMap, chessInstanceToPieceMap(startChess));
  }

  async function checkBoardDomFallback() {
    if (
      state.cleanedUp ||
      state.pendingRuns > 0 ||
      !state.game ||
      !state.enabled ||
      !state.engineReady
    ) {
      return;
    }

    const boardEl = findBoardElement();
    if (!boardEl) return;
    const domMap = readBoardPieceMap(boardEl);
    if (!domMap) return;

    if (state.seenPlyCount > 0 && domMap.size === 32) {
      const startChess = new Chess(START_FEN);
      if (pieceMapsEqual(domMap, chessInstanceToPieceMap(startChess))) {
        resetGameTracking();
        return;
      }
    }

    const currentMap = chessInstanceToPieceMap(state.game);
    if (pieceMapsEqual(domMap, currentMap)) return;

    const legalMoves = state.game.moves({ verbose: true });
    for (const m of legalMoves) {
      const testChess = new Chess(state.game.fen());
      testChess.move(m);
      if (pieceMapsEqual(domMap, chessInstanceToPieceMap(testChess))) {
        state.pendingRuns++;
        try {
          await processNextMove({
            text: m.san,
            pieceHint: m.piece.toUpperCase(),
            hasFigurineEl: m.piece !== "p",
          });
        } finally {
          state.pendingRuns = Math.max(0, state.pendingRuns - 1);
        }
        return;
      }
    }
  }

  function startObservers() {
    const attachIfNeeded = () => {
      if (state.cleanedUp || !state.enabled || !state.engineReady) return;

      const container = findMoveListContainer();
      if (container && container !== state.observedContainer) {
        state.observedContainer = container;
        if (moveListObserver) moveListObserver.disconnect();
        moveListObserver = new MutationObserver(() =>
          onMoveListChanged(container)
        );
        moveListObserver.observe(container, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        onMoveListChanged(container);
      } else if (container) {
        onMoveListChanged(container);
      }

      const boardEl = findBoardElement();
      if (boardEl && boardEl !== state.observedBoard) {
        state.observedBoard = boardEl;
        if (boardPieceObserver) boardPieceObserver.disconnect();
        boardPieceObserver = new MutationObserver(() => {
          if (state.cleanedUp) return;
          syncMarkerLayer();
          const c = findMoveListContainer();
          if (c) onMoveListChanged(c);
          checkBoardDomFallback();
        });
        boardPieceObserver.observe(boardEl, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "flipped"],
        });
        detectMyColorAndRatings();
        syncMarkerLayer();
      }
    };

    attachIfNeeded();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(attachIfNeeded, 1000);
  }

  async function onMoveListChanged(container) {
    if (
      state.cleanedUp ||
      state.pendingRuns > 0 ||
      !state.enabled ||
      !state.game ||
      !state.engineReady
    ) {
      return;
    }

    const moveTokens = extractMoveSequenceFromContainer(container);

    // Detect genuine new-game resets without false-triggering when checkBoardDomFallback
    // is 1 ply ahead of the move-list DOM.
    if (state.seenPlyCount > 0) {
      const firstMoveChanged =
        moveTokens[0] &&
        state.moveRecords[0] &&
        moveTokens[0].text !== state.moveRecords[0].san;
      const moveListClearedToStart =
        moveTokens.length === 0 &&
        (state.seenPlyCount > 1 || isBoardAtStartingPosition());
      const moveListRewound =
        moveTokens.length > 0 && moveTokens.length < state.seenPlyCount - 1;

      if (firstMoveChanged || moveListClearedToStart || moveListRewound) {
        resetGameTracking();
      }
    }

    if (moveTokens.length <= state.seenPlyCount) return;

    state.pendingRuns++;
    try {
      detectMyColorAndRatings();
      for (let ply = state.seenPlyCount; ply < moveTokens.length; ply++) {
        if (state.cleanedUp) break;
        const ok = await processNextMove(moveTokens[ply]);
        if (!ok) break;
      }
    } finally {
      state.pendingRuns = Math.max(0, state.pendingRuns - 1);
    }
  }

  async function processNextMove(moveToken) {
    if (state.cleanedUp || !state.game || !state.engineReady) return false;

    const fenBefore = state.game.fen();
    const sideToMove = state.game.turn();
    const legalMovesBefore = state.game.moves({ verbose: true });
    const wasOnlyLegalMove = legalMovesBefore.length === 1;
    const matBefore = materialBalance(state.game, sideToMove);

    const boardEl = findBoardElement();
    const moveObj = resolveAndApplyMove(state.game, moveToken, boardEl);
    if (!moveObj) {
      return false;
    }

    state.seenPlyCount++;
    const ply = state.seenPlyCount;
    const moveNumber = Math.ceil(ply / 2);
    const fenAfter = state.game.fen();
    const matAfter = materialBalance(state.game, sideToMove);
    const historySoFar = state.game.history();

    setCoachStatus(
      `Analyzing ${moveNumber}${sideToMove === "w" ? "." : "..."} ${moveObj.san}…`,
      "analyzing"
    );

    const whiteCpBefore = state.lastEvalWhiteCp;
    const whiteMateBefore = state.lastEvalWhiteMate;
    const bestMoveBeforeUci = state.lastBestMoveUci;

    const bestMoveBeforeObj = bestMoveBeforeUci
      ? uciToSanMove(Chess, fenBefore, bestMoveBeforeUci)
      : null;
    const bestMoveSan = bestMoveBeforeObj
      ? bestMoveBeforeObj.san
      : bestMoveBeforeUci;

    let evalAfter = { bestMove: null, cp: 0, mate: null, pv: [] };
    if (state.engine && state.engineReady) {
      try {
        evalAfter = await state.engine.evaluate(fenAfter, state.depth);
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes("Extension context invalidated") || !isContextValid()) {
          // Revert this ply so a newly re-injected instance or page refresh starts cleanly
          try {
            state.game.undo();
            state.seenPlyCount = Math.max(0, state.seenPlyCount - 1);
          } catch (_) {}
          setCoachStatus("Extension updated. Refresh the tab.", "error");
          cleanupInstance({ removeDom: false });
          return false;
        }
        console.warn("[Chess Coach] Engine eval error:", err);
        // A silent zero would look like a frozen eval bar — say so instead.
        setCoachStatus("Engine hiccup · grades may pause", "analyzing");
      }
    } else {
      // No engine yet: say it out loud instead of quietly recording 0.0.
      setCoachStatus("Engine warming up…", "analyzing");
    }

    if (state.cleanedUp) return false;

    const whiteCpAfter = whiteRelativeCp(evalAfter, state.game.turn());
    const whiteMateAfter = whiteRelativeMate(evalAfter, state.game.turn());

    state.lastEvalWhiteCp = whiteCpAfter;
    state.lastEvalWhiteMate = whiteMateAfter;
    state.lastBestMoveUci = evalAfter.bestMove;
    state.lastPvUci = evalAfter.pv || [];

    const sign = sideToMove === "w" ? 1 : -1;
    const cpBeforeForMover = sign * whiteCpBefore;
    const cpAfterForMover = sign * whiteCpAfter;
    const cpLossForMover = Math.max(0, cpBeforeForMover - cpAfterForMover);

    const winBefore = winPercent(cpBeforeForMover);
    const winAfter = winPercent(cpAfterForMover);
    const winDrop = Math.max(0, winBefore - winAfter);
    const moveAccuracy = moveAccuracyFromWinSwing(winBefore, winAfter);

    const actualUci =
      moveObj.lan || `${moveObj.from}${moveObj.to}${moveObj.promotion || ""}`;
    const matchedBestMove = Boolean(
      bestMoveBeforeUci &&
        actualUci.toLowerCase() === bestMoveBeforeUci.toLowerCase()
    );
    const isBookMove = isMoveInOpeningBook(state.openings, historySoFar);
    const isSacrifice =
      !isBookMove &&
      matAfter < matBefore &&
      (!moveObj.captured || matAfter <= matBefore - 1) &&
      cpAfterForMover >= -20;
    const isGreatCandidate =
      !isBookMove &&
      !isSacrifice &&
      matchedBestMove &&
      Math.abs(cpBeforeForMover) < 250 &&
      (moveObj.san.includes("+") || moveObj.captured) &&
      cpLossForMover <= 5;
    const missedMate =
      whiteMateBefore !== null &&
      sign * whiteMateBefore > 0 &&
      (whiteMateAfter === null || sign * whiteMateAfter <= 0);

    const opening = identifyOpening(state.openings, historySoFar);

    const classification = classifyMove(cpLossForMover, {
      wasOnlyLegalMove,
      matchedBestMove,
      isBookMove,
      isSacrifice,
      isGreatCandidate,
      winDrop,
      cpBeforeForMover,
      cpAfterForMover,
      missedMate,
    });

    const evalBeforeStr = formatEvalScore(whiteCpBefore, whiteMateBefore);
    const evalAfterStr = formatEvalScore(whiteCpAfter, whiteMateAfter);

    const record = {
      ply,
      moveNumber,
      san: moveObj.san,
      uci: actualUci,
      from: moveObj.from,
      to: moveObj.to,
      toSquare: moveObj.to,
      color: sideToMove,
      tag: classification.tag,
      label: classification.label,
      glyph: classification.glyph,
      cpLoss: Math.round(cpLossForMover),
      moveAccuracy: Math.round(moveAccuracy),
      winBefore,
      winAfter,
      winDelta: winAfter - winBefore,
      bestMoveUci: bestMoveBeforeUci,
      bestMoveSan,
      pvSan: bestMoveSan ? [bestMoveSan] : [],
      whiteCpBefore,
      whiteCpAfter,
      whiteMateBefore,
      whiteMateAfter,
      evalBeforeStr,
      evalAfterStr,
      openingName: opening ? opening.name : null,
    };
    record.explanation = explainMove(record);

    // A ply must never contribute two records, however many trigger paths
    // raced into processing it.
    const existingRecordIdx = state.moveRecords.findIndex(
      (r) => r.ply === record.ply
    );
    if (existingRecordIdx === -1) {
      state.moveRecords.push(record);
    } else {
      state.moveRecords[existingRecordIdx] = record;
    }

    setCoachStatus(`Stockfish 19 · depth ${state.depth}`, "ready");
    renderMoveFeedback(record, opening);
    return true;
  }

  // ---------- Overlay UI & Draggable Positioning ----------

  function clampPanelCoordinates(left, top, panelEl) {
    const w = panelEl.offsetWidth || 356;
    const h = panelEl.offsetHeight || 280;
    const maxLeft = Math.max(8, window.innerWidth - w - 8);
    const maxTop = Math.max(8, window.innerHeight - h - 8);
    return {
      left: Math.max(8, Math.min(maxLeft, Math.round(left))),
      top: Math.max(8, Math.min(maxTop, Math.round(top))),
    };
  }

  function applyPanelPosition(panelEl, pos) {
    if (!panelEl || !pos) return;
    const clamped = clampPanelCoordinates(pos.left, pos.top, panelEl);
    panelEl.style.left = `${clamped.left}px`;
    panelEl.style.top = `${clamped.top}px`;
    panelEl.style.right = "auto";
    panelEl.style.bottom = "auto";
    state.panelPos = clamped;
  }

  function makePanelDraggable(panelEl, handleEl) {
    if (!panelEl || !handleEl) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handleEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button")) return;

      dragging = true;
      const rect = panelEl.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      panelEl.classList.add("cc-dragging");
      try {
        handleEl.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
    });

    handleEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const nextPos = clampPanelCoordinates(
        e.clientX - offsetX,
        e.clientY - offsetY,
        panelEl
      );
      applyPanelPosition(panelEl, nextPos);
    });

    const finishDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      panelEl.classList.remove("cc-dragging");
      try {
        handleEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
      if (state.panelPos) {
        safeStorageSet({ panelPos: state.panelPos });
      }
    };

    handleEl.addEventListener("pointerup", finishDrag);
    handleEl.addEventListener("pointercancel", finishDrag);

    // Double-clicking the header drag handle resets position to default bottom-right
    handleEl.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      panelEl.style.left = "auto";
      panelEl.style.top = "auto";
      panelEl.style.right = "16px";
      panelEl.style.bottom = "16px";
      state.panelPos = null;
      safeStorageRemove("panelPos");
    });

    window.addEventListener("resize", () => {
      if (state.panelPos) {
        applyPanelPosition(panelEl, state.panelPos);
      }
    });
  }

  function injectOverlay() {
    const existingPanel = document.getElementById("chess-coach-panel");
    if (existingPanel) {
      existingPanel.remove();
    }

    if (!document.getElementById("chess-coach-overlay-css")) {
      const link = document.createElement("link");
      link.id = "chess-coach-overlay-css";
      link.rel = "stylesheet";
      link.href = CACHED_URLS.overlayCss;
      document.head.appendChild(link);
    }

    const panel = document.createElement("div");
    panel.id = "chess-coach-panel";
    panel.innerHTML = `
      <div id="chess-coach-main">
        <div id="chess-coach-header" title="Drag to move panel anywhere (double-click to reset)">
          <div class="cc-title-wrap">
            <span class="cc-drag-grip" aria-hidden="true">⋮⋮</span>
            <span class="cc-dot" id="chess-coach-status-dot"></span>
            <span class="cc-title">Chess Coach</span>
          </div>
          <div class="cc-header-actions">
            <button id="chess-coach-open-review" class="cc-hdr-btn cc-hdr-btn-icon" type="button" title="Open game review" aria-label="Open game review"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z" fill="currentColor" stroke="none"/></svg></button>
            <button id="chess-coach-open-studio" class="cc-hdr-btn cc-hdr-btn-teal cc-hdr-btn-icon" type="button" title="Open opening studio" aria-label="Open opening studio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2z"/><path d="M12 6.5v13"/></svg></button>
            <button id="chess-coach-minimize" class="cc-hdr-btn" type="button" title="Minimize or expand panel" aria-label="Minimize or expand panel">–</button>
          </div>
        </div>

        <div id="chess-coach-status-bar">
          <span id="chess-coach-opening">Standard start</span>
          <span id="chess-coach-status">Starting Stockfish 19…</span>
        </div>

        <div id="chess-coach-content">
          <div class="cc-verdict-card">
            <div id="chess-coach-last-move">Waiting for moves…</div>
            <div id="chess-coach-explain">Play a move on the board to see move quality, accuracy, and live rating estimate.</div>
            <div class="cc-verdict-strip">
              <div class="cc-sc"><span class="cc-sc-l">WIN Δ</span><span id="chess-coach-windelta" class="cc-sc-v">—</span></div>
              <div class="cc-sc"><span class="cc-sc-l">BEST</span><span id="chess-coach-best" class="cc-sc-v">—</span></div>
              <div class="cc-sc"><span class="cc-sc-l">ACC</span><span id="chess-coach-acc" class="cc-sc-v">—</span></div>
            </div>
          </div>

          <div id="chess-coach-evalbar" title="Live Stockfish 19 Evaluation (White relative)">
            <div id="chess-coach-evalbar-white"></div>
            <div id="chess-coach-evalbar-label">0.0</div>
          </div>

          <div id="chess-coach-breakdown"></div>
          <div class="cc-log-head"><span>#</span><span>White</span><span>Black</span></div>
          <div id="chess-coach-log"></div>

          <div class="cc-kpi-strip">
            <div class="cc-kpi-cell">
              <span class="cc-kpi-label">YOUR ACC · ELO</span>
              <span id="chess-coach-accuracy" class="cc-kpi-val">—</span>
            </div>
            <div class="cc-kpi-cell">
              <span class="cc-kpi-label">OPPONENT · ELO</span>
              <span id="chess-coach-vs" class="cc-kpi-val">—</span>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const headerEl = document.getElementById("chess-coach-header");
    makePanelDraggable(panel, headerEl);

    if (state.panelPos) {
      requestAnimationFrame(() => applyPanelPosition(panel, state.panelPos));
    }

    const minBtn = document.getElementById("chess-coach-minimize");
    if (minBtn) {
      minBtn.addEventListener("click", () => {
        state.minimized = !state.minimized;
        const contentEl = document.getElementById("chess-coach-content");
        if (contentEl) {
          contentEl.style.display = state.minimized ? "none" : "flex";
        }
        minBtn.textContent = state.minimized ? "+" : "–";
      });
    }

    // Clicking a move in the log brings back that move's full analysis
    const logEl = document.getElementById("chess-coach-log");
    if (logEl) {
      const rowPlyFromEvent = (e) => {
        const cell = e.target.closest(".log-half");
        const ply = cell ? parseInt(cell.dataset.ply, 10) : NaN;
        return Number.isFinite(ply) ? ply : null;
      };
      logEl.addEventListener("click", (e) => {
        const ply = rowPlyFromEvent(e);
        if (ply !== null) showRecordAnalysis(ply);
      });
      logEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const ply = rowPlyFromEvent(e);
        if (ply !== null) {
          e.preventDefault();
          showRecordAnalysis(ply);
        }
      });
    }

    const revBtn = document.getElementById("chess-coach-open-review");
    if (revBtn) {
      revBtn.addEventListener("click", () => {
        if (isContextValid()) {
          try {
            chrome.runtime.sendMessage({ type: "CHESS_COACH_OPEN_REVIEW" });
            return;
          } catch (_) {}
        }
        if (CACHED_URLS.reviewHtml) {
          try {
            window.open(CACHED_URLS.reviewHtml, "_blank");
          } catch (_) {}
        }
      });
    }

    const studioBtn = document.getElementById("chess-coach-open-studio");
    if (studioBtn) {
      studioBtn.addEventListener("click", () => {
        if (isContextValid()) {
          try {
            chrome.runtime.sendMessage({ type: "CHESS_COACH_OPEN_STUDIO" });
            return;
          } catch (_) {}
        }
        if (CACHED_URLS.coachHtml) {
          try {
            window.open(CACHED_URLS.coachHtml, "_blank");
          } catch (_) {}
        }
      });
    }

    updateBreakdownBadges();
  }

  function setCoachStatus(text, mode = "ready") {
    const statusEl = document.getElementById("chess-coach-status");
    const dotEl = document.getElementById("chess-coach-status-dot");
    if (statusEl) statusEl.textContent = text;
    if (dotEl) {
      dotEl.className = `cc-dot cc-dot-${mode}`;
    }
  }

  function updateEvalBar(whiteCp, whiteMate) {
    const fill = document.getElementById("chess-coach-evalbar-white");
    const label = document.getElementById("chess-coach-evalbar-label");
    if (!fill || !label) return;

    let pct;
    if (whiteMate !== null && whiteMate !== undefined) {
      pct = whiteMate > 0 ? 100 : 0;
    } else {
      pct = winPercent(whiteCp);
    }
    const labelText = formatEvalScore(whiteCp, whiteMate);
    const clamped = Math.max(2, Math.min(98, pct));

    fill.style.width = `${clamped}%`;
    label.textContent = labelText;
    // the chip straddles the fill boundary, pinned by the center
    label.style.left = `${Math.max(8, Math.min(92, pct))}%`;
    label.style.right = "auto";
  }

  function updateHeaderAccuracyAndComparison() {
    const accEl = document.getElementById("chess-coach-accuracy");
    const eloEl = document.getElementById("chess-coach-elo");
    const vsEl = document.getElementById("chess-coach-vs");

    const myColor = state.myColor || "w";
    const oppColor = myColor === "w" ? "b" : "w";
    const myRecords = state.moveRecords.filter((r) => r.color === myColor);
    const oppRecords = state.moveRecords.filter((r) => r.color === oppColor);

    const myStats = calculateEstimatedElo
      ? calculateEstimatedElo(myRecords, state.myRating)
      : null;
    const oppStats = calculateEstimatedElo
      ? calculateEstimatedElo(oppRecords, state.oppRating)
      : null;

    if (accEl) {
      accEl.textContent =
        myRecords.length && myStats
          ? `${myStats.accuracy}% · ~${myStats.estimatedElo}`
          : "—";
    }
    if (vsEl) {
      vsEl.textContent =
        oppRecords.length && oppStats
          ? `${oppStats.accuracy}% / ~${oppStats.estimatedElo}`
          : "—";
    }
  }

  function updateBreakdownBadges() {
    const container = document.getElementById("chess-coach-breakdown");
    if (!container) return;
    const myColor = state.myColor || "w";
    const myRecords = state.moveRecords.filter((r) => r.color === myColor);
    const counts = {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    };
    for (const r of myRecords) {
      if (counts[r.tag] !== undefined) counts[r.tag]++;
    }

    const pills = [
      { tag: "brilliant", label: "!!", title: "Brilliant" },
      { tag: "great", label: "!", title: "Great" },
      { tag: "best", label: "★", title: "Best" },
      { tag: "excellent", label: "Exc", title: "Excellent" },
      { tag: "good", label: "Good", title: "Good" },
      { tag: "book", label: "Book", title: "Book" },
      { tag: "inaccuracy", label: "?!", title: "Inaccuracy" },
      { tag: "mistake", label: "?", title: "Mistake" },
      { tag: "blunder", label: "??", title: "Blunder" },
    ];

    container.innerHTML = pills
      .map(
        (p) =>
          `<span class="cc-pill ${
            counts[p.tag] > 0 ? "cc-pill-active" : ""
          } tag-${p.tag}" title="Your ${p.title}: ${counts[p.tag]}">${
            p.label
          } <b>${counts[p.tag]}</b></span>`
      )
      .join("");
  }

  function formatVerdictLine(record) {
    const movePrefix =
      record.color === "w" ? `${record.moveNumber}.` : `${record.moveNumber}...`;
    const who = state.myColor
      ? record.color === state.myColor
        ? "You"
        : "Opp"
      : "";
    const suggestion =
      (record.tag === "mistake" ||
        record.tag === "blunder" ||
        record.tag === "inaccuracy") &&
      record.bestMoveSan &&
      record.bestMoveSan !== record.san
        ? `. Better: ${record.bestMoveSan}`
        : "";
    return `${
      who ? who + ": " : ""
    }${movePrefix} ${record.san}, ${record.glyph} ${record.label} (${
      record.evalAfterStr
    })${suggestion}`.trim();
  }

  function markSelectedLogRow(ply) {
    const log = document.getElementById("chess-coach-log");
    if (!log) return;
    for (const cell of log.querySelectorAll(".log-half")) {
      cell.classList.toggle(
        "cc-selected",
        parseInt(cell.dataset.ply, 10) === ply
      );
    }
  }

  // Replays a past move's saved analysis into the verdict card, eval bar and
  // board marker. The next analysed move always takes the card back (live).
  function showRecordAnalysis(ply) {
    const record = state.moveRecords.find((r) => r.ply === ply);
    if (!record) return;
    state.selectedPly = ply;
    markSelectedLogRow(ply);

    updateEvalBar(record.whiteCpAfter, record.whiteMateAfter);
    if (record.toSquare) placeBoardMarker(record.toSquare, record.tag);

    const lastMoveEl = document.getElementById("chess-coach-last-move");
    if (lastMoveEl) {
      lastMoveEl.className = `tag-${record.tag}`;
      lastMoveEl.textContent = formatVerdictLine(record);
    }
    const explainEl = document.getElementById("chess-coach-explain");
    if (explainEl) explainEl.textContent = record.explanation || "";
    updateVerdictStrip(record);

    const latest = state.moveRecords[state.moveRecords.length - 1];
    const viewPrefix =
      record.color === "w" ? `${record.moveNumber}.` : `${record.moveNumber}...`;
    setCoachStatus(
      record === latest
        ? `Stockfish 19 · depth ${state.depth}`
        : `Viewing saved analysis: ${viewPrefix} ${record.san}`,
      "ready"
    );
  }

  // The log is a two-column score sheet: one row per full move, White left,
  // Black right. Pairs are rebuilt from the saved records, so a ply can never
  // render twice and a pending reply simply shows an empty cell.
  function fillLogHalf(cell, rec) {
    if (!cell) return;
    if (!rec) {
      cell.className = "log-half log-half-empty";
      cell.textContent = "";
      delete cell.dataset.ply;
      cell.removeAttribute("role");
      cell.removeAttribute("tabindex");
      cell.removeAttribute("title");
      cell.classList.remove("cc-selected");
      return;
    }
    const lossText = rec.cpLoss > 0 ? `-${rec.cpLoss}cp` : "optimal";
    cell.className = `log-half tag-${rec.tag}`;
    cell.dataset.ply = String(rec.ply);
    cell.setAttribute("role", "button");
    cell.tabIndex = 0;
    cell.title = "Click to view this move's saved analysis";
    cell.innerHTML = `<span class="log-half-main">${rec.san}, ${rec.label}</span><span class="log-half-sub">${lossText} (${rec.evalAfterStr})</span>`;
    cell.classList.toggle("cc-selected", state.selectedPly === rec.ply);
  }

  function renderLogPair(moveNumber) {
    const log = document.getElementById("chess-coach-log");
    if (!log) return;

    const whiteRec = state.moveRecords.find(
      (r) => r.moveNumber === moveNumber && r.color === "w"
    );
    const blackRec = state.moveRecords.find(
      (r) => r.moveNumber === moveNumber && r.color === "b"
    );

    let pair = log.querySelector(`.log-pair[data-move="${moveNumber}"]`);
    if (!whiteRec && !blackRec) {
      if (pair) pair.remove();
      return;
    }
    if (!pair) {
      pair = document.createElement("div");
      pair.className = "log-pair";
      pair.dataset.move = String(moveNumber);
      pair.innerHTML = `<span class="log-num">${moveNumber}.</span><div class="log-half log-half-empty"></div><div class="log-half log-half-empty"></div>`;
      log.prepend(pair);
    }
    fillLogHalf(pair.children[1], whiteRec);
    fillLogHalf(pair.children[2], blackRec);
  }

  function updateVerdictStrip(record) {
    const winDeltaEl = document.getElementById("chess-coach-windelta");
    if (winDeltaEl) {
      const d = Number.isFinite(record.winDelta)
        ? record.winDelta
        : (Number.isFinite(record.winAfter) ? record.winAfter : 0) -
          (Number.isFinite(record.winBefore) ? record.winBefore : 0);
      winDeltaEl.textContent = `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
      winDeltaEl.style.color =
        d < -2 ? "#ff6a5a" : d < 0 ? "#f2b04a" : "#3ecf8e";
    }
    const bestEl = document.getElementById("chess-coach-best");
    if (bestEl) bestEl.textContent = record.bestMoveSan || "—";
    const accEl = document.getElementById("chess-coach-acc");
    if (accEl) {
      accEl.textContent = Number.isFinite(record.moveAccuracy)
        ? `${record.moveAccuracy}%`
        : "—";
    }
  }

  function renderMoveFeedback(record, opening) {
    updateEvalBar(record.whiteCpAfter, record.whiteMateAfter);
    placeBoardMarker(record.toSquare, record.tag);
    updateHeaderAccuracyAndComparison();
    updateBreakdownBadges();

    const openingEl = document.getElementById("chess-coach-opening");
    if (openingEl && opening) {
      openingEl.textContent = `${opening.eco} ${opening.name}`;
    }

    const lastMoveEl = document.getElementById("chess-coach-last-move");
    if (lastMoveEl) {
      lastMoveEl.className = `tag-${record.tag}`;
      lastMoveEl.textContent = formatVerdictLine(record);
    }

    const explainEl = document.getElementById("chess-coach-explain");
    if (explainEl) {
      explainEl.textContent = record.explanation || "";
    }

    updateVerdictStrip(record);

    // The affected score-sheet row is rebuilt from the saved records; a
    // re-analysed ply replaces its cell instead of adding a second one.
    renderLogPair(record.moveNumber);

    // A fresh analysis always owns the verdict card again
    state.selectedPly = record.ply;
    markSelectedLogRow(record.ply);
  }

  // ---------- On-board move markers ----------

  function isBoardFlipped(boardEl) {
    if (boardEl) {
      if (boardEl.classList.contains("flipped")) return true;
      if (
        boardEl.hasAttribute("flipped") &&
        boardEl.getAttribute("flipped") !== "false"
      ) {
        return true;
      }
      const coords = boardEl.querySelectorAll(
        ".coordinate-light, .coordinate-dark, text"
      );
      for (const c of coords) {
        const txt = (c.textContent || "").trim();
        if (txt === "1" || txt === "8") {
          const bRect = boardEl.getBoundingClientRect();
          const cRect = c.getBoundingClientRect();
          if (bRect.height > 0 && cRect.top > 0) {
            const isTopHalf = cRect.top - bRect.top < bRect.height / 2;
            if (txt === "1" && isTopHalf) return true;
            if (txt === "8" && isTopHalf) return false;
          }
        }
      }
    }
    return state.myColor === "b";
  }

  function squareToGrid(square, flipped) {
    const file = square.charCodeAt(0) - 96;
    const rank = parseInt(square[1], 10);
    if (!flipped) return { col: file - 1, row: 8 - rank };
    return { col: 8 - file, row: rank - 1 };
  }

  function ensureMarkerLayer() {
    if (markerLayer) return markerLayer;
    const existing = document.getElementById("chess-coach-board-markers");
    if (existing) existing.remove();
    markerLayer = document.createElement("div");
    markerLayer.id = "chess-coach-board-markers";
    document.body.appendChild(markerLayer);
    window.addEventListener("scroll", () => syncMarkerLayer(), {
      passive: true,
    });
    window.addEventListener("resize", () => syncMarkerLayer());
    return markerLayer;
  }

  function syncMarkerLayer() {
    if (state.cleanedUp) return;
    const board = findBoardElement();
    if (!board || !markerLayer) return;
    const rect = board.getBoundingClientRect();
    markerLayer.style.left = rect.left + "px";
    markerLayer.style.top = rect.top + "px";
    markerLayer.style.width = rect.width + "px";
    markerLayer.style.height = rect.height + "px";

    if (!boardResizeObserver) {
      boardResizeObserver = new ResizeObserver(() => syncMarkerLayer());
      boardResizeObserver.observe(board);
    }
    if (state.markerSquare) positionMarker(board);
  }

  function positionMarker(board) {
    if (!markerEl || !state.markerSquare) return;
    const flipped = isBoardFlipped(board);
    const { col, row } = squareToGrid(state.markerSquare, flipped);
    const rect = board.getBoundingClientRect();
    const squareSize = rect.width / 8;
    markerEl.style.left = col * squareSize + squareSize * 0.56 + "px";
    markerEl.style.top = row * squareSize - squareSize * 0.12 + "px";
    const size = Math.max(16, Math.round(squareSize * 0.44));
    markerEl.style.width = size + "px";
    markerEl.style.height = size + "px";
    markerEl.style.fontSize = Math.max(9, Math.round(squareSize * 0.22)) + "px";
  }

  function placeBoardMarker(square, tag) {
    if (!square) return;
    const board = findBoardElement();
    if (!board) return;

    ensureMarkerLayer();
    if (!markerEl) {
      markerEl = document.createElement("div");
      markerEl.id = "chess-coach-marker";
      markerLayer.appendChild(markerEl);
    }

    const style = MARKER_STYLE[tag] || MARKER_STYLE.good;
    markerEl.style.display = "flex";
    markerEl.style.background = style.bg;
    markerEl.textContent = style.glyph;
    markerEl.classList.remove("chess-coach-marker-pop");
    void markerEl.offsetWidth;
    markerEl.classList.add("chess-coach-marker-pop");

    state.markerSquare = square;
    state.markerTag = tag;
    syncMarkerLayer();
  }

  function extractRatingNearElement(el) {
    if (!el || !el.parentElement) return null;
    const container =
      el.parentElement.closest(
        "[class*='player-component'], [class*='player-tagline'], [class*='user-tagline'], [class*='player-row'], .player-top, .player-bottom"
      ) || el.parentElement;
    if (!container) return null;
    const text = container.textContent || "";
    const match = text.match(/\((\d{2,4})\)/);
    if (match) {
      const r = parseInt(match[1], 10);
      if (r >= 100 && r <= 3500) return r;
    }
    return null;
  }

  function detectMyColorAndRatings() {
    const board = findBoardElement();
    const flipped = isBoardFlipped(board);

    state.myColor = flipped ? "b" : "w";

    const usernameEls = Array.from(
      document.querySelectorAll(
        "[data-username], .user-username-component, .user-tagline-username, [data-cy='user-tagline-username']"
      )
    );

    const boardRect = board ? board.getBoundingClientRect() : null;
    const boardMidY = boardRect
      ? boardRect.top + boardRect.height / 2
      : window.innerHeight / 2;

    for (const el of usernameEls) {
      const text = (el.getAttribute("data-username") || el.textContent || "")
        .trim()
        .toLowerCase();
      const rating = extractRatingNearElement(el);
      const elRect = el.getBoundingClientRect();
      const isBottom =
        Boolean(
          el.closest(
            "[class*='player-bottom'], [class*='bottom-player'], #player-bottom"
          )
        ) ||
        (elRect.top > 0 && elRect.top > boardMidY);

      if (state.username && text === state.username) {
        if (isBottom) {
          state.myColor = flipped ? "b" : "w";
        } else {
          state.myColor = flipped ? "w" : "b";
        }
        if (rating) state.myRating = rating;
      } else if (isBottom) {
        if (rating && !state.myRating) state.myRating = rating;
      } else {
        if (rating) state.oppRating = rating;
      }
    }
  }

  init();
})();
