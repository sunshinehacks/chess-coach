import { Chess } from "../lib/chess.js";
import {
  Engine,
  whiteRelativeCp,
  whiteRelativeMate,
  winPercent,
  formatEvalScore,
  parseUciMove,
} from "../lib/engine.js";
import {
  OPENING_LESSONS,
  TACTICAL_GUIDES,
  uciToSanMove,
  buildPvSteps,
} from "../lib/classify.js";

  // ---------- Chess Piece Art ----------
// Cburnett set (Colin M.L. Burnett, CC-BY-SA 3.0 — the Lichess standard),
// recolored: white #ffffff / ink #1c2026, black #23272e / light rim #f0f4f8.
const PIECE_SVGS = {
  wP: `<svg class="chess-piece" viewBox="0 0 45 45"><path fill="#ffffff" stroke="#1c2026" stroke-linecap="round" stroke-width="1.5" d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/></svg>`,
  wR: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="#ffffff" fill-rule="evenodd" stroke="#1c2026" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9zm3-3v-4h21v4zm-1-22V9h4v2h5V9h5v2h5V9h4v5"/><path d="m34 14-3 3H14l-3-3"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M31 17v12.5H14V17"/><path d="m31 29.5 1.5 2.5h-20l1.5-2.5"/><path fill="none" stroke-linejoin="miter" d="M11 14h23"/></g></svg>`,
  wN: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#1c2026" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#ffffff" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#ffffff" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><path fill="#1c2026" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5"/></g></svg>`,
  wB: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#1c2026" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#ffffff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g></svg>`,
  wQ: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="#ffffff" fill-rule="evenodd" stroke="#1c2026" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0m16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0M16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0"/><path stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14z"/><path stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"/></g></svg>`,
  wK: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#1c2026" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.63V6M20 8h5"/><path fill="#ffffff" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#ffffff" d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g></svg>`,
  bP: `<svg class="chess-piece" viewBox="0 0 45 45"><path fill="#23272e" stroke="#f0f4f8" stroke-linecap="round" stroke-width="1.5" d="M22.5 9a4 4 0 0 0-3.22 6.38 6.48 6.48 0 0 0-.87 10.65c-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47a6.46 6.46 0 0 0-.87-10.65A4.01 4.01 0 0 0 22.5 9z"/></svg>`,
  bR: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="#23272e" fill-rule="evenodd" stroke="#f0f4f8" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#23272e" stroke-linecap="butt" d="M9 39h27v-3H9zm3.5-7 1.5-2.5h17l1.5 2.5zm-.5 4v-4h21v4z"/><path fill="#23272e" stroke-linecap="butt" stroke-linejoin="miter" d="M14 29.5v-13h17v13z"/><path fill="#23272e" stroke-linecap="butt" d="M14 16.5 11 14h23l-3 2.5zM11 14V9h4v2h5V9h5v2h5V9h4v5z"/><path fill="none" stroke="#f0f4f8" stroke-linejoin="miter" stroke-width="1" d="M12 35.5h21m-20-4h19m-18-2h17m-17-13h17M11 14h23"/></g></svg>`,
  bN: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#f0f4f8" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#23272e" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#23272e" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-1-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-2 2.5-3c1 0 1 3 1 3"/><path fill="#f0f4f8" stroke="#f0f4f8" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.43-9.75a.5 1.5 30 1 1-.86-.5.5 1.5 30 1 1 .86.5"/><path fill="#f0f4f8" stroke="none" d="m24.55 10.4-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34s-5.79-6.64-9.19-7.16z"/></g></svg>`,
  bB: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#f0f4f8" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#23272e" stroke-linecap="butt"><path fill="#23272e" d="M9 36c3.4-1 10.1.4 13.5-2 3.4 2.4 10.1 1 13.5 2 0 0 1.6.5 3 2-.7 1-1.6 1-3 .5-3.4-1-10.1.5-13.5-1-3.4 1.5-10.1 0-13.5 1-1.4.5-2.3.5-3-.5 1.4-2 3-2 3-2z"/><path fill="#23272e" d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path fill="#23272e" d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path fill="#23272e" stroke="#f0f4f8" stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g></svg>`,
  bQ: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="#23272e" fill-rule="evenodd" stroke="#f0f4f8" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#23272e" stroke="none"><circle fill="#23272e" cx="6" cy="12" r="2.75"/><circle fill="#23272e" cx="14" cy="9" r="2.75"/><circle fill="#23272e" cx="22.5" cy="8" r="2.75"/><circle fill="#23272e" cx="31" cy="9" r="2.75"/><circle fill="#23272e" cx="39" cy="12" r="2.75"/></g><path fill="#23272e" stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5z"/><path fill="#23272e" stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" stroke-linecap="butt" d="M11 38.5a35 35 1 0 0 23 0"/><path fill="none" stroke="#f0f4f8" d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0"/></g></svg>`,
  bK: `<svg class="chess-piece" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#f0f4f8" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#23272e" stroke-linejoin="miter" d="M22.5 11.6V6"/><path fill="#23272e" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#23272e" d="M11.5 37a22.3 22.3 0 0 0 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z"/><path fill="#23272e" stroke-linejoin="miter" d="M20 8h5"/><path fill="#23272e" stroke="#f0f4f8" d="M32 29.5s8.5-4 6-9.7C34.1 14 25 18 22.5 24.6v2.1-2.1C20 18 9.9 14 7 19.9c-2.5 5.6 4.8 9 4.8 9"/><path fill="#23272e" stroke="#f0f4f8" d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g></svg>`
};

// Puts the promoting side's piece art on the promotion buttons.
function setPromotionPieceArt(color) {
  document.querySelectorAll(".promo-btn").forEach((btn) => {
    const glyph = btn.querySelector(".promo-glyph");
    if (!glyph) return;
    const letter = (btn.getAttribute("data-promo") || "q").toUpperCase();
    glyph.innerHTML = PIECE_SVGS[`${color}${letter}`] || "";
  });
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// The suggested-move arrow takes the review page's brass token so it follows
// the active theme instead of a hardcoded near-match.
const ARROW_BEST = "var(--sq-select)";

// ---------- DOM Elements ----------

const engineBadge = document.getElementById("engineBadge");
const engineStatusText = document.getElementById("engineStatusText");
const btnThemeToggle = document.getElementById("btnThemeToggle");

const topCoachColorSwatch = document.getElementById("topCoachColorSwatch");
const bottomCoachColorSwatch = document.getElementById("bottomCoachColorSwatch");
const lessonProgressPill = document.getElementById("lessonProgressPill");
const drillStatusPill = document.getElementById("drillStatusPill");

const nextMovePromptBar = document.getElementById("nextMovePromptBar");
const nmpTurnBadge = document.getElementById("nmpTurnBadge");
const nmpMoveTarget = document.getElementById("nmpMoveTarget");
const nmpExplanation = document.getElementById("nmpExplanation");

const chessboardEl = document.getElementById("chessboard");
const boardArrowsSvg = document.getElementById("boardArrowsSvg");
const promotionModal = document.getElementById("promotionModal");
const btnCancelPromo = document.getElementById("btnCancelPromo");

const btnModeGuided = document.getElementById("btnModeGuided");
const btnModeDrill = document.getElementById("btnModeDrill");
const btnModeSpar = document.getElementById("btnModeSpar");
const btnShowHint = document.getElementById("btnShowHint");
const btnPlayCoachMove = document.getElementById("btnPlayCoachMove");

const btnFirst = document.getElementById("btnFirst");
const btnPrev = document.getElementById("btnPrev");
const btnPlay = document.getElementById("btnPlay");
const btnPause = document.getElementById("btnPause");
const btnNext = document.getElementById("btnNext");
const btnLast = document.getElementById("btnLast");
const btnFlip = document.getElementById("btnFlip");

const lessonEcoBadge = document.getElementById("lessonEcoBadge");
const lessonTitle = document.getElementById("lessonTitle");
const lessonMetaTag = document.getElementById("lessonMetaTag");
const lessonSummary = document.getElementById("lessonSummary");
const roadmapProgressText = document.getElementById("roadmapProgressText");
const lessonRoadmapList = document.getElementById("lessonRoadmapList");
const lessonHowToPlay = document.getElementById("lessonHowToPlay");
const lessonHowToTackle = document.getElementById("lessonHowToTackle");
const openingLessonsGrid = document.getElementById("openingLessonsGrid");
const tacticalGuidesGrid = document.getElementById("tacticalGuidesGrid");

// ---------- Opening Studio State ----------

const state = {
  theme: "dark",
  engine: null,
  engineReady: false,
  depth: 12,

  categoryFilter: "all",
  activeLessonId: OPENING_LESSONS[0].id,
  mode: "guided", // "guided" | "drill" | "spar"
  boardFlipped: false,

  lessonBuiltSteps: [],
  stepIndex: 0, // 0..lessonBuiltSteps.length
  showHintArrow: false,

  // Free Sparring History Stack (when mode === "spar" or continuing past book moves)
  sparHistory: [], // Array of { fenBefore, fenAfter, san, uci, from, to, color, moveNumber, bestFollowUpSan, bestFollowUpFrom, bestFollowUpTo, explanation, whiteCp, whiteMate }
  sparCursor: 0,
  sparBaseFen: START_FEN,

  selectedSquare: null,
  legalTargetsForSelected: [],
  pendingPromotion: null,
  playTimer: null,
  replyTimer: null,
  evalRequestId: 0,
};

// ---------- Initialization ----------

async function initOpeningStudio() {
  renderEmptyBoardGrid();
  renderTacticalGuides();

  // Check URL query parameter ?lesson=<id>
  try {
    const params = new URLSearchParams(window.location.search);
    const requestedLesson = params.get("lesson");
    if (requestedLesson && OPENING_LESSONS.some((l) => l.id === requestedLesson)) {
      state.activeLessonId = requestedLesson;
    }
  } catch (_) {}

  if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
    try {
      const stored = await chrome.storage.sync.get(["depth", "theme"]);
      if (stored.depth) state.depth = parseInt(stored.depth, 10) || 12;
      if (stored.theme === "light" || stored.theme === "dark") {
        applyTheme(stored.theme, false);
      } else {
        applyTheme(prefersDark() ? "dark" : "light", false);
      }
    } catch (_) {
      applyTheme(prefersDark() ? "dark" : "light", false);
    }
  } else {
    applyTheme(prefersDark() ? "dark" : "light", false);
  }

  bindEvents();
  selectLesson(state.activeLessonId, { mode: "guided" });
  await initEngine();
}

function prefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

function applyTheme(theme, persist = true) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  if (btnThemeToggle) {
    const next = state.theme === "dark" ? "Light" : "Dark";
    const tip = `Switch to the ${next.toLowerCase()} theme`;
    btnThemeToggle.setAttribute("data-tip", tip);
    btnThemeToggle.setAttribute("aria-label", tip);
  }
  if (persist && typeof chrome !== "undefined" && chrome?.storage?.sync) {
    chrome.storage.sync.set({ theme: state.theme }).catch(() => {});
  }
}

async function initEngine() {
  try {
    const engineUrl =
      typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("engine/stockfish.js")
        : "../engine/stockfish.js";
    state.engine = new Engine(engineUrl);
    await state.engine.whenReady();
    state.engineReady = true;
    engineStatusText.textContent = "Stockfish 19 ready";
    engineBadge.className = "engine-badge status-ready";
    evaluateCurrentPositionLive();
  } catch (err) {
    engineStatusText.textContent = "Engine error";
    engineBadge.className = "engine-badge status-error";
  }
}

// ---------- Events ----------

function bindEvents() {
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });
  }

  // The bottom transport/mode bars were removed — the lesson panel's own
  // controls (reset / prev / next / hint) are the navigation now.
  if (btnModeGuided) {
    btnModeGuided.addEventListener("click", () => setTrainingMode("guided"));
  }
  if (btnModeDrill) {
    btnModeDrill.addEventListener("click", () => setTrainingMode("drill"));
  }
  if (btnModeSpar) {
    btnModeSpar.addEventListener("click", () => setTrainingMode("spar"));
  }

  if (btnShowHint) {
    btnShowHint.addEventListener("click", () => {
      state.showHintArrow = true;
      refreshStudioUI();
    });
  }

  if (btnPlayCoachMove) {
    btnPlayCoachMove.addEventListener("click", () => {
      stopAutoPlay();
      playRecommendedMoveNow();
    });
  }

  if (btnFirst) {
    btnFirst.addEventListener("click", () => {
      stopAutoPlay();
      selectLesson(state.activeLessonId, { mode: state.mode });
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      stopAutoPlay();
      stepBackward();
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", () => {
      stopAutoPlay();
      stepForward();
    });
  }

  if (btnLast) {
    btnLast.addEventListener("click", () => {
      stopAutoPlay();
      if (state.mode === "spar" && state.sparHistory.length > 0) {
        state.sparCursor = state.sparHistory.length;
        refreshStudioUI();
      } else {
        jumpToLessonStep(state.lessonBuiltSteps.length);
      }
    });
  }

  if (btnPlay) {
    btnPlay.addEventListener("click", startAutoPlay);
  }
  if (btnPause) {
    btnPause.addEventListener("click", stopAutoPlay);
  }

  if (btnFlip) {
    btnFlip.addEventListener("click", () => {
      state.boardFlipped = !state.boardFlipped;
      document.body.dataset.flipped = state.boardFlipped ? "1" : "0";
      refreshStudioUI();
    });
  }

  document.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.categoryFilter = btn.getAttribute("data-cat") || "all";
      renderLessonSelectorGrid();
    });
  });

  document.querySelectorAll(".promo-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const piece = btn.getAttribute("data-promo") || "q";
      const pending = state.pendingPromotion;
      state.pendingPromotion = null;
      promotionModal.classList.add("hidden");
      if (pending) handleUserBoardMove(pending.from, pending.to, piece);
    });
  });

  if (btnCancelPromo) {
    btnCancelPromo.addEventListener("click", () => {
      state.pendingPromotion = null;
      promotionModal.classList.add("hidden");
    });
  }

  window.addEventListener("keydown", (e) => {
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stopAutoPlay();
      stepBackward();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stopAutoPlay();
      stepForward();
    } else if (e.key === "Home") {
      e.preventDefault();
      stopAutoPlay();
      selectLesson(state.activeLessonId, { mode: state.mode });
    } else if (e.key === "End") {
      e.preventDefault();
      stopAutoPlay();
      jumpToLessonStep(state.lessonBuiltSteps.length);
    } else if (e.key === " ") {
      e.preventDefault();
      if (state.playTimer) stopAutoPlay();
      else startAutoPlay();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      state.boardFlipped = !state.boardFlipped;
      document.body.dataset.flipped = state.boardFlipped ? "1" : "0";
      refreshStudioUI();
    }
  });
}

// ---------- Lesson & Mode Management ----------

export function selectLesson(lessonId, options = {}) {
  stopAutoPlay();
  if (state.replyTimer) {
    clearTimeout(state.replyTimer);
    state.replyTimer = null;
  }

  const lesson =
    OPENING_LESSONS.find((l) => l.id === lessonId) || OPENING_LESSONS[0];
  state.activeLessonId = lesson.id;
  state.mode = options.mode || state.mode || "guided";
  state.showHintArrow = state.mode === "guided";
  state.selectedSquare = null;
  state.legalTargetsForSelected = [];

  // Build verified move steps
  const temp = new Chess();
  const built = [];
  for (let i = 0; i < lesson.steps.length; i++) {
    const raw = lesson.steps[i];
    const beforeFen = temp.fen();
    const moveNumber = temp.moveNumber();
    const color = temp.turn();
    const moved = temp.move(raw.san, { strict: false });
    if (!moved) break;
    built.push({
      index: i,
      ply: i + 1,
      moveNumber,
      color,
      san: moved.san,
      uci: moved.lan || `${moved.from}${moved.to}`,
      from: moved.from,
      to: moved.to,
      beforeFen,
      afterFen: temp.fen(),
      comment: raw.comment,
    });
  }

  state.lessonBuiltSteps = built;
  state.boardFlipped = lesson.side === "b";
  document.body.dataset.flipped = state.boardFlipped ? "1" : "0";
  state.stepIndex = 0;
  state.sparHistory = [];
  state.sparCursor = 0;
  state.sparBaseFen = START_FEN;

  // If playing as Black in Guided or Drill mode, automatically play White's move 1 so it is Black's turn!
  if (lesson.side === "b" && built.length > 0 && state.mode !== "spar") {
    state.stepIndex = 1;
  }

  updateModeButtonsUI();
  renderLessonMetadata(lesson);
  renderLessonSelectorGrid();
  refreshStudioUI();
  evaluateCurrentPositionLive();
}

export function setTrainingMode(mode) {
  stopAutoPlay();
  state.mode = mode;
  state.showHintArrow = mode === "guided";
  state.selectedSquare = null;
  state.legalTargetsForSelected = [];

  if (mode === "spar") {
    state.sparBaseFen = getDisplayedFen();
    state.sparHistory = [];
    state.sparCursor = 0;
    updateModeButtonsUI();
    refreshStudioUI();
    evaluateCurrentPositionLive();
    return;
  }

  selectLesson(state.activeLessonId, { mode });
}

function updateModeButtonsUI() {
  if (btnModeGuided && btnModeDrill && btnModeSpar) {
    btnModeGuided.classList.toggle("active", state.mode === "guided");
    btnModeDrill.classList.toggle("active", state.mode === "drill");
    btnModeSpar.classList.toggle("active", state.mode === "spar");
    btnModeGuided.setAttribute("aria-pressed", String(state.mode === "guided"));
    btnModeDrill.setAttribute("aria-pressed", String(state.mode === "drill"));
    btnModeSpar.setAttribute("aria-pressed", String(state.mode === "spar"));
  }

  if (drillStatusPill) {
    drillStatusPill.textContent =
      state.mode === "guided"
        ? "Guided Play-Along"
        : state.mode === "drill"
        ? "Memory Drill"
        : "Free Sparring";
  }
}

function renderLessonMetadata(lesson) {
  lessonEcoBadge.textContent = lesson.eco;
  lessonTitle.textContent = lesson.name;
  lessonMetaTag.textContent = `${
    lesson.side === "w" ? "Playing White" : "Playing Black"
  }, ${lesson.style.toLowerCase()}, ${lesson.difficulty.toLowerCase()}`;
  lessonSummary.textContent = lesson.summary;

  topCoachColorSwatch.className = `player-color-swatch color-${
    lesson.side === "w" ? "b" : "w"
  }`;
  bottomCoachColorSwatch.className = `player-color-swatch color-${lesson.side}`;

  lessonHowToPlay.innerHTML = lesson.howToPlay
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("");
  lessonHowToTackle.innerHTML = lesson.howToTackle
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("");
}

function renderLessonSelectorGrid() {
  const filtered = OPENING_LESSONS.filter(
    (l) =>
      state.categoryFilter === "all" || l.category === state.categoryFilter
  );

  openingLessonsGrid.innerHTML = filtered
    .map(
      (l) => `
      <div class="lesson-card ${l.id === state.activeLessonId ? "active" : ""}" data-lesson-id="${l.id}">
        <div class="lesson-card-top">
          <span><span class="verdict-pill bg-book">${escapeHtml(l.eco)}</span> ${escapeHtml(l.name)}</span>
          <span class="badge-you">${l.side === "w" ? "White" : "Black"}</span>
        </div>
        <div class="lesson-card-sub">${escapeHtml(l.category)}, ${escapeHtml(l.style)}</div>
      </div>
    `
    )
    .join("");

  openingLessonsGrid.querySelectorAll(".lesson-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-lesson-id");
      if (id) selectLesson(id, { mode: state.mode === "spar" ? "guided" : state.mode });
    });
  });
}

// ---------- Step & Sparring Navigation ----------

export function jumpToLessonStep(idx) {
  if (state.replyTimer) {
    clearTimeout(state.replyTimer);
    state.replyTimer = null;
  }
  const max = state.lessonBuiltSteps.length;
  state.stepIndex = Math.max(0, Math.min(max, parseInt(idx, 10) || 0));
  state.sparHistory = [];
  state.sparCursor = 0;
  state.selectedSquare = null;
  state.legalTargetsForSelected = [];
  state.showHintArrow = state.mode === "guided";

  refreshStudioUI();
  evaluateCurrentPositionLive();
}

function stepBackward() {
  if (state.sparHistory.length > 0 && state.sparCursor > 0) {
    state.sparCursor--;
    state.selectedSquare = null;
    state.legalTargetsForSelected = [];
    refreshStudioUI();
    return;
  }
  if (state.stepIndex > 0) {
    jumpToLessonStep(state.stepIndex - 1);
  }
}

function stepForward() {
  if (state.sparHistory.length > 0 && state.sparCursor < state.sparHistory.length) {
    state.sparCursor++;
    state.selectedSquare = null;
    state.legalTargetsForSelected = [];
    refreshStudioUI();
    return;
  }
  if (state.stepIndex < state.lessonBuiltSteps.length) {
    jumpToLessonStep(state.stepIndex + 1);
    return;
  }
  playRecommendedMoveNow();
}

function startAutoPlay() {
  if (state.playTimer) return;
  if (state.stepIndex >= state.lessonBuiltSteps.length) {
    jumpToLessonStep(0);
  }
  if (btnPlay) btnPlay.classList.add("hidden");
  if (btnPause) btnPause.classList.remove("hidden");

  state.playTimer = setInterval(() => {
    if (state.stepIndex < state.lessonBuiltSteps.length) {
      jumpToLessonStep(state.stepIndex + 1);
    } else {
      stopAutoPlay();
    }
  }, 950);
}

function stopAutoPlay() {
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
  }
  if (btnPlay) btnPlay.classList.remove("hidden");
  if (btnPause) btnPause.classList.add("hidden");
}

// ---------- Interactive Board Play & Real-Time Coach Follow-Up ----------

function getDisplayedFen() {
  if (state.sparHistory.length > 0 && state.sparCursor > 0) {
    return state.sparHistory[state.sparCursor - 1].fenAfter;
  }
  if (state.mode === "spar") {
    return state.sparBaseFen || START_FEN;
  }
  if (state.stepIndex <= 0 || state.lessonBuiltSteps.length === 0) {
    return START_FEN;
  }
  return state.lessonBuiltSteps[state.stepIndex - 1].afterFen;
}

function onBoardSquareClicked(square) {
  stopAutoPlay();
  const currentFen = getDisplayedFen();
  const chess = new Chess(currentFen);

  const matchingLegal = state.legalTargetsForSelected.find((m) => m.to === square);
  if (state.selectedSquare && matchingLegal) {
    const isPromotion =
      matchingLegal.piece === "p" &&
      ((matchingLegal.color === "w" && square[1] === "8") ||
        (matchingLegal.color === "b" && square[1] === "1"));

    if (isPromotion) {
      state.pendingPromotion = { from: state.selectedSquare, to: square };
      setPromotionPieceArt(matchingLegal.color);
      promotionModal.classList.remove("hidden");
      return;
    }

    handleUserBoardMove(state.selectedSquare, square, undefined);
    return;
  }

  const pieceOnSquare = chess.get(square);
  if (pieceOnSquare && pieceOnSquare.color === chess.turn()) {
    if (state.selectedSquare === square) {
      state.selectedSquare = null;
      state.legalTargetsForSelected = [];
    } else {
      state.selectedSquare = square;
      state.legalTargetsForSelected = chess.moves({ square, verbose: true });
    }
    refreshStudioUI();
  } else {
    state.selectedSquare = null;
    state.legalTargetsForSelected = [];
    refreshStudioUI();
  }
}

export async function handleUserBoardMove(from, to, promotion) {
  const currentFen = getDisplayedFen();
  const temp = new Chess(currentFen);
  const moved = temp.move({ from, to, promotion: promotion || "q" });
  if (!moved) return;

  state.selectedSquare = null;
  state.legalTargetsForSelected = [];

  const expectedBookStep =
    state.mode !== "spar" && state.sparHistory.length === 0
      ? state.lessonBuiltSteps[state.stepIndex]
      : null;

  // Case 1: In Guided or Drill mode and within the book steps
  if (expectedBookStep) {
    if (moved.san === expectedBookStep.san) {
      // User played the exact book move!
      state.stepIndex++;
      state.showHintArrow = state.mode === "guided";
      nextMovePromptBar.className = "next-move-prompt prompt-success";

      const lesson = OPENING_LESSONS.find((l) => l.id === state.activeLessonId);
      const nextStep = state.lessonBuiltSteps[state.stepIndex];

      // If the next move in the book belongs to the opponent side, auto-play the opponent's book reply!
      if (nextStep && lesson && nextStep.color !== lesson.side) {
        refreshStudioUI();
        nmpTurnBadge.textContent = "✓ Correct move";
        nmpMoveTarget.textContent = `You played ${expectedBookStep.moveNumber}${
          expectedBookStep.color === "w" ? "." : "..."
        } ${expectedBookStep.san}`;
        nmpExplanation.textContent = `${expectedBookStep.comment} Coach is replying with ${nextStep.moveNumber}${
          nextStep.color === "w" ? "." : "..."
        } ${nextStep.san}…`;

        state.replyTimer = setTimeout(() => {
          state.stepIndex++;
          refreshStudioUI();
          evaluateCurrentPositionLive();
        }, 320);
        return;
      }

      refreshStudioUI();
      evaluateCurrentPositionLive();
      return;
    } else {
      // User played a different legal move during book training: show hint arrow & explanation!
      state.showHintArrow = true;
      nextMovePromptBar.className = "next-move-prompt prompt-warning";
      nmpTurnBadge.textContent = "Book deviation";
      nmpMoveTarget.textContent = `Expected ${expectedBookStep.moveNumber}${
        expectedBookStep.color === "w" ? "." : "..."
      } ${expectedBookStep.san} (${expectedBookStep.from} → ${expectedBookStep.to})`;
      nmpExplanation.textContent = `You played ${moved.san}. In this opening, play ${expectedBookStep.san} (${expectedBookStep.from} → ${expectedBookStep.to}, shown by the teal arrow): ${expectedBookStep.comment}`;
      renderBoardPosition(currentFen);
      return;
    }
  }

  // Case 2: User is in Free Sparring mode OR has finished all book moves and is continuing the game!
  if (state.sparHistory.length === 0) {
    state.sparBaseFen = currentFen;
  }
  if (state.sparCursor < state.sparHistory.length) {
    state.sparHistory = state.sparHistory.slice(0, state.sparCursor);
  }

  const sparStep = {
    fenBefore: currentFen,
    fenAfter: temp.fen(),
    san: moved.san,
    uci: moved.lan || `${moved.from}${moved.to}`,
    from: moved.from,
    to: moved.to,
    color: moved.color,
    moveNumber: Math.ceil(temp.history().length / 2) || 1,
    bestFollowUpSan: null,
    bestFollowUpUci: null,
    bestFollowUpFrom: null,
    bestFollowUpTo: null,
    explanation: `Analyzing follow-up after ${moved.san} with Stockfish 19…`,
    whiteCp: 0,
    whiteMate: null,
  };

  state.sparHistory.push(sparStep);
  state.sparCursor = state.sparHistory.length;
  refreshStudioUI();

  await evaluateSparStepAndSuggestNext(sparStep);
}

async function evaluateSparStepAndSuggestNext(sparStep) {
  if (!state.engine || !state.engineReady) return;
  try {
    const res = await state.engine.evaluate(sparStep.fenAfter, state.depth);
    if (res.cancelled) return;
    const nextSide = sparStep.fenAfter.split(" ")[1] || "w";
    sparStep.whiteCp = whiteRelativeCp(res, nextSide);
    sparStep.whiteMate = whiteRelativeMate(res, nextSide);

    if (res.bestMove) {
      const followObj = uciToSanMove(Chess, sparStep.fenAfter, res.bestMove);
      const pvSteps = buildPvSteps(Chess, sparStep.fenAfter, res.pv || [res.bestMove], 6);
      sparStep.bestFollowUpUci = res.bestMove;
      sparStep.bestFollowUpSan = followObj ? followObj.san : res.bestMove;
      sparStep.bestFollowUpFrom = followObj
        ? followObj.from
        : parseUciMove(res.bestMove)?.from || null;
      sparStep.bestFollowUpTo = followObj
        ? followObj.to
        : parseUciMove(res.bestMove)?.to || null;
      const pvLine = pvSteps.map((s) => s.san).join(" ");
      sparStep.explanation = `Best continuation for ${
        nextSide === "w" ? "White" : "Black"
      } is ${sparStep.bestFollowUpSan} (${sparStep.bestFollowUpFrom} → ${
        sparStep.bestFollowUpTo
      })${pvLine ? ` — main line: ${pvLine}` : ""}.`;
    } else {
      sparStep.explanation = "Game over — no further legal moves.";
    }

    refreshStudioUI();
  } catch (_) {}
}

export async function playRecommendedMoveNow() {
  const expectedBookStep =
    state.mode !== "spar" && state.sparHistory.length === 0
      ? state.lessonBuiltSteps[state.stepIndex]
      : null;

  if (expectedBookStep) {
    await handleUserBoardMove(expectedBookStep.from, expectedBookStep.to, undefined);
    return;
  }

  // In sparring or post-book mode, play Stockfish's best move for the side to move
  const currentSpar =
    state.sparCursor > 0 ? state.sparHistory[state.sparCursor - 1] : null;
  if (currentSpar?.bestFollowUpFrom && currentSpar?.bestFollowUpTo) {
    await handleUserBoardMove(
      currentSpar.bestFollowUpFrom,
      currentSpar.bestFollowUpTo,
      undefined
    );
    return;
  }

  if (state.engine && state.engineReady) {
    const fen = getDisplayedFen();
    const res = await state.engine.evaluate(fen, state.depth);
    if (res.bestMove) {
      const parsed = parseUciMove(res.bestMove);
      if (parsed) await handleUserBoardMove(parsed.from, parsed.to, parsed.promotion);
    }
  }
}

async function evaluateCurrentPositionLive() {
  if (!state.engine || !state.engineReady) return;
  const reqId = ++state.evalRequestId;
  const fen = getDisplayedFen();
  try {
    const res = await state.engine.evaluate(fen, Math.min(state.depth, 10));
    if (reqId !== state.evalRequestId || res.cancelled) return;
    const side = fen.split(" ")[1] || "w";
    updateEvalBar(whiteRelativeCp(res, side), whiteRelativeMate(res, side));
  } catch (_) {}
}

// ---------- UI & Board Rendering ----------

function refreshStudioUI() {
  const fen = getDisplayedFen();
  renderBoardPosition(fen);
  renderRoadmapUI();
  updateNextMovePromptBanner();

  const totalBook = state.lessonBuiltSteps.length;
  lessonProgressPill.textContent = `Step ${state.stepIndex} / ${totalBook}`;
  roadmapProgressText.textContent = `${state.stepIndex} / ${totalBook} completed`;
}

function updateNextMovePromptBanner() {
  nextMovePromptBar.className = "next-move-prompt";

  // If in Sparring / Post-Book continuation
  if (state.sparHistory.length > 0 && state.sparCursor > 0) {
    const curSpar = state.sparHistory[state.sparCursor - 1];
    updateEvalBar(curSpar.whiteCp, curSpar.whiteMate);
    nmpTurnBadge.textContent = `Sparring (${state.sparCursor}/${state.sparHistory.length})`;
    nmpMoveTarget.textContent = curSpar.bestFollowUpSan
      ? `After ${curSpar.san} — Recommended next move: ${curSpar.bestFollowUpSan} (${curSpar.bestFollowUpFrom} → ${curSpar.bestFollowUpTo})`
      : `Played ${curSpar.san}`;
    nmpExplanation.textContent = curSpar.explanation;
    return;
  }

  const nextStep = state.lessonBuiltSteps[state.stepIndex];
  const prevStep =
    state.stepIndex > 0 ? state.lessonBuiltSteps[state.stepIndex - 1] : null;

  if (!nextStep) {
    nextMovePromptBar.className = "next-move-prompt prompt-success";
    nmpTurnBadge.textContent = "Opening line complete";
    nmpMoveTarget.textContent =
      "All book moves completed — continue playing on the board to spar with Stockfish!";
    nmpExplanation.textContent = prevStep
      ? `Last book move: ${prevStep.moveNumber}${
          prevStep.color === "w" ? "." : "..."
        } ${prevStep.san} — ${prevStep.comment}`
      : "";
    return;
  }

  const prefix =
    nextStep.color === "w"
      ? `${nextStep.moveNumber}.`
      : `${nextStep.moveNumber}...`;

  if (state.mode === "drill" && !state.showHintArrow) {
    nmpTurnBadge.textContent = `Your turn (${
      nextStep.color === "w" ? "White" : "Black"
    })`;
    nmpMoveTarget.textContent = `Find book move ${prefix} ? on the board`;
    nmpExplanation.textContent = prevStep
      ? `After ${prevStep.moveNumber}${prevStep.color === "w" ? "." : "..."} ${
          prevStep.san
        } (${prevStep.comment}) — play the book reply on the board, or click Show hint arrow.`
      : `Make the opening book move on the board, or click Show hint arrow.`;
  } else {
    nmpTurnBadge.textContent = `Next move to play`;
    nmpMoveTarget.textContent = `Play ${prefix} ${nextStep.san} (${nextStep.from} → ${nextStep.to})`;
    nmpExplanation.textContent = nextStep.comment;
  }
}

function renderRoadmapUI() {
  if (!lessonRoadmapList) return;
  lessonRoadmapList.innerHTML = "";

  state.lessonBuiltSteps.forEach((step, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isDone = idx < state.stepIndex;
    const isNext = idx === state.stepIndex;
    btn.className = `roadmap-step ${isDone ? "step-done" : ""} ${
      isNext ? "step-next" : ""
    }`;

    const prefix =
      step.color === "w" ? `${step.moveNumber}.` : `${step.moveNumber}...`;
    const statusIcon = isDone ? "✓ " : isNext ? "▶ " : "";

    btn.innerHTML = `
      <span class="roadmap-step-san">${statusIcon}${escapeHtml(prefix)} ${escapeHtml(step.san)}</span>
      <span class="roadmap-step-desc">${escapeHtml(step.comment)}</span>
    `;

    btn.addEventListener("click", () => {
      stopAutoPlay();
      jumpToLessonStep(idx + 1);
    });

    lessonRoadmapList.appendChild(btn);
  });
}

function renderEmptyBoardGrid() {
  chessboardEl.innerHTML = "";
  for (let i = 0; i < 64; i++) {
    const sqEl = document.createElement("div");
    sqEl.className = "board-square";
    sqEl.setAttribute("role", "gridcell");
    sqEl.addEventListener("click", () => {
      const sq = sqEl.getAttribute("data-square");
      if (sq) onBoardSquareClicked(sq);
    });
    chessboardEl.appendChild(sqEl);
  }
}

function squareToBoardCoords(square, flipped) {
  const fileIndex = square.charCodeAt(0) - 97;
  const rankIndex = parseInt(square[1], 10) - 1;
  const col = flipped ? 7 - fileIndex : fileIndex;
  const row = flipped ? rankIndex : 7 - rankIndex;
  return { col, row };
}

function renderBoardPosition(fen) {
  let chess;
  try {
    chess = new Chess(fen);
  } catch (_) {
    chess = new Chess(START_FEN);
  }

  const board = chess.board();
  const inCheck = chess.inCheck();
  const turnColor = chess.turn();

  const prevBookStep =
    state.sparHistory.length === 0 && state.stepIndex > 0
      ? state.lessonBuiltSteps[state.stepIndex - 1]
      : null;
  const nextBookStep =
    state.sparHistory.length === 0
      ? state.lessonBuiltSteps[state.stepIndex]
      : null;
  const curSparStep =
    state.sparCursor > 0 ? state.sparHistory[state.sparCursor - 1] : null;

  const legalTargetSet = new Map();
  for (const m of state.legalTargetsForSelected) {
    legalTargetSet.set(m.to, Boolean(m.captured));
  }

  for (let visualRow = 0; visualRow < 8; visualRow++) {
    for (let visualCol = 0; visualCol < 8; visualCol++) {
      const boardRow = state.boardFlipped ? 7 - visualRow : visualRow;
      const boardCol = state.boardFlipped ? 7 - visualCol : visualCol;

      const fileChar = String.fromCharCode(97 + boardCol);
      const rankChar = String(8 - boardRow);
      const sqName = `${fileChar}${rankChar}`;
      const isLight = (boardRow + boardCol) % 2 === 0;

      const sqEl = chessboardEl.children[visualRow * 8 + visualCol];
      sqEl.setAttribute("data-square", sqName);
      sqEl.className = `board-square ${isLight ? "light" : "dark"}`;

      if (curSparStep) {
        if (sqName === curSparStep.from) sqEl.classList.add("sq-last-from");
        if (sqName === curSparStep.to) sqEl.classList.add("sq-last-to");
        if (curSparStep.bestFollowUpFrom && sqName === curSparStep.bestFollowUpFrom) {
          sqEl.classList.add("sq-best-from");
        }
        if (curSparStep.bestFollowUpTo && sqName === curSparStep.bestFollowUpTo) {
          sqEl.classList.add("sq-best-to");
        }
      } else {
        if (prevBookStep) {
          if (sqName === prevBookStep.from) sqEl.classList.add("sq-last-from");
          if (sqName === prevBookStep.to) sqEl.classList.add("sq-last-to");
        }
        if (nextBookStep && (state.mode === "guided" || state.showHintArrow)) {
          if (sqName === nextBookStep.from) sqEl.classList.add("sq-best-from");
          if (sqName === nextBookStep.to) sqEl.classList.add("sq-best-to");
        }
      }

      if (state.selectedSquare === sqName) {
        sqEl.classList.add("sq-selected");
      }

      const cellPiece = board[boardRow][boardCol];
      if (inCheck && cellPiece && cellPiece.type === "k" && cellPiece.color === turnColor) {
        sqEl.classList.add("sq-check");
      }

      let inner = "";
      if (visualCol === 0) inner += `<span class="coord-rank">${rankChar}</span>`;
      if (visualRow === 7) inner += `<span class="coord-file">${fileChar}</span>`;

      if (cellPiece) {
        const key = `${cellPiece.color}${cellPiece.type.toUpperCase()}`;
        inner += PIECE_SVGS[key] || "";
      }

      if (legalTargetSet.has(sqName)) {
        const isCap = legalTargetSet.get(sqName) || Boolean(cellPiece);
        inner += isCap
          ? `<span class="legal-ring"></span>`
          : `<span class="legal-dot"></span>`;
      }

      sqEl.innerHTML = inner;
    }
  }

  // Render arrows on the training board
  let svg = "";
  if (curSparStep) {
    svg += buildSvgArrow(curSparStep.from, curSparStep.to, ARROW_BEST, false);
    if (curSparStep.bestFollowUpFrom && curSparStep.bestFollowUpTo) {
      svg += buildSvgArrow(
        curSparStep.bestFollowUpFrom,
        curSparStep.bestFollowUpTo,
        ARROW_BEST,
        true
      );
    }
  } else {
    if (prevBookStep) {
      svg += buildSvgArrow(prevBookStep.from, prevBookStep.to, ARROW_BEST, false);
    }
    if (nextBookStep && (state.mode === "guided" || state.showHintArrow)) {
      svg += buildSvgArrow(nextBookStep.from, nextBookStep.to, ARROW_BEST, true);
    }
  }
  boardArrowsSvg.innerHTML = svg;
}

function buildSvgArrow(fromSq, toSq, colorHex, isDashed = false) {
  const from = squareToBoardCoords(fromSq, state.boardFlipped);
  const to = squareToBoardCoords(toSq, state.boardFlipped);

  const x1 = from.col * 100 + 50;
  const y1 = from.row * 100 + 50;
  const x2 = to.col * 100 + 50;
  const y2 = to.row * 100 + 50;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const sx = x1 + ux * 18;
  const sy = y1 + uy * 18;
  const tipX = x2 - ux * 10;
  const tipY = y2 - uy * 10;
  const baseX = x2 - ux * 38;
  const baseY = y2 - uy * 38;
  const headHalfW = 20;

  const p1x = baseX + px * headHalfW;
  const p1y = baseY + py * headHalfW;
  const p2x = baseX - px * headHalfW;
  const p2y = baseY - py * headHalfW;

  const dashAttr = ""; // arrows are always solid — no dash patterns on the board
  // A dark underlay keeps the arrow readable on light squares; the colored
  // shapes are drawn over it, leaving a ~2px ink ring around the whole arrow.
  return `
    <g opacity="0.88">
      <line x1="${sx}" y1="${sy}" x2="${baseX}" y2="${baseY}" stroke-width="18" stroke-linecap="round" style="stroke: #17130c" ${dashAttr} />
      <polygon points="${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}" style="fill: #17130c; stroke: #17130c; stroke-width: 4; stroke-linejoin: round" />
      <line x1="${sx}" y1="${sy}" x2="${baseX}" y2="${baseY}" stroke-width="14" stroke-linecap="round" style="stroke: ${colorHex}" ${dashAttr} />
      <polygon points="${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}" style="fill: ${colorHex}" />
    </g>
  `;
}

function updateEvalBar(whiteCp, whiteMate) {
  const fill = document.getElementById("evalbarWhite");
  const label = document.getElementById("evalbarLabel");
  if (!fill || !label) return;

  let pct;
  if (whiteMate !== null && whiteMate !== undefined) {
    pct = whiteMate > 0 ? 100 : 0;
  } else {
    pct = winPercent(whiteCp);
  }
  const labelText = formatEvalScore(whiteCp, whiteMate);

  fill.style.height = `${Math.max(2, Math.min(98, pct))}%`;
  label.textContent = labelText;
  label.style.color = pct < 50 ? "#f0f4f8" : "#151921";
  label.style.top = pct < 50 ? "5px" : "auto";
  label.style.bottom = pct < 50 ? "auto" : "5px";
}

function renderTacticalGuides() {
  if (!tacticalGuidesGrid) return;
  tacticalGuidesGrid.innerHTML = TACTICAL_GUIDES.map(
    (g) => `
    <div class="guide-card">
      <span class="verdict-pill bg-great">${escapeHtml(g.badge)}</span>
      <h3>${escapeHtml(g.title)}</h3>
      <p>${escapeHtml(g.summary)}</p>
      <ul>
        ${g.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join("")}
      </ul>
    </div>
  `
  ).join("");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (typeof window !== "undefined") {
  window.__chessCoachStudio = {
    state,
    selectLesson,
    setTrainingMode,
    jumpToLessonStep,
    handleUserBoardMove,
    playRecommendedMoveNow,
  };
}

initOpeningStudio();
