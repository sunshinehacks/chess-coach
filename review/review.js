import { Chess } from "../lib/chess.js";
import {
  Engine,
  whiteRelativeCp,
  whiteRelativeMate,
  winPercent,
  moveAccuracyFromWinSwing,
  formatEvalScore,
  parseUciMove,
} from "../lib/engine.js";
import {
  CLASSIFICATION_META,
  classifyMove,
  calculateEstimatedElo,
  buildPlayerComparison,
  loadOpenings,
  identifyOpening,
  isMoveInOpeningBook,
  summarizePlaystyle,
  materialBalance,
  uciToSanMove,
  buildPvSteps,
  explainMove,
  safeParsePgn,
  OPENING_LESSONS,
  TACTICAL_GUIDES,
  generatePersonalizedCoachPlan,
} from "../lib/classify.js";

// The suggested-move arrow takes the review page's brass token so it follows
// the active theme instead of a hardcoded near-match.
const ARROW_BEST = "var(--sq-select)";

const marqueeWord = document.getElementById("marqueeWord");
const marqueeWhy = document.getElementById("marqueeWhy");

// The verdict is the loudest word on the page: the appbar marquee mirrors the
// selected move's grade and one-line why.
function setMarquee(word, why, tag) {
  if (!marqueeWord || !marqueeWhy) return;
  marqueeWord.textContent = word;
  marqueeWord.className = tag ? `marquee-word tag-${tag}` : "marquee-word";
  marqueeWhy.textContent = why;
}

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

const SAMPLE_GAME = {
  pgn:
    "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 " +
    "8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 " +
    "14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#",
  white: { username: "Paul Morphy", rating: "" },
  black: { username: "Duke of Brunswick", rating: "" },
  time_class: "sample",
  event: "Paris Opera House, 1858",
};

// ---------- DOM References ----------

const modeBtnReview = document.getElementById("modeBtnReview");
const modeBtnComparison = document.getElementById("modeBtnComparison");
const modeBtnCoach = null; // Moved to dedicated coach/coach.html page
const gameReviewPanel = document.getElementById("gameReviewPanel");
const comparisonPanel = document.getElementById("comparisonPanel");
const coachTrainerPanel = document.getElementById("coachTrainerPanel");
const btnThemeToggle = document.getElementById("btnThemeToggle");

const usernameEl = document.getElementById("username");
const loadBtn = document.getElementById("load");
const btnTogglePgn = document.getElementById("btnTogglePgn");
const pgnDrawer = document.getElementById("pgnDrawer");
const btnClosePgn = document.getElementById("btnClosePgn");
const pgnInput = document.getElementById("pgnInput");
const btnAnalyzePgn = document.getElementById("btnAnalyzePgn");
const pgnErrorMsg = document.getElementById("pgnErrorMsg");

const engineBadge = document.getElementById("engineBadge");
const engineStatusText = document.getElementById("engineStatusText");

const gamesEl = document.getElementById("games");
const progressEl = document.getElementById("progress");
const progressBarWrap = document.getElementById("progressBarWrap");
const progressBarFill = document.getElementById("progressBarFill");

const chessboardEl = document.getElementById("chessboard");
const boardArrowsSvg = document.getElementById("boardArrowsSvg");
const boardMoveBadge = document.getElementById("boardMoveBadge");
const promotionModal = document.getElementById("promotionModal");
const btnCancelPromo = document.getElementById("btnCancelPromo");

const topPlayerName = document.getElementById("topPlayerName");
const topPlayerYouTag = document.getElementById("topPlayerYouTag");
const topPlayerRating = document.getElementById("topPlayerRating");
const topPlayerMaterial = document.getElementById("topPlayerMaterial");
const topPlayerElo = document.getElementById("topPlayerElo");
const topPlayerAcc = document.getElementById("topPlayerAcc");
const topPlayerColorDot = document.getElementById("topPlayerColorDot");

const bottomPlayerName = document.getElementById("bottomPlayerName");
const bottomPlayerYouTag = document.getElementById("bottomPlayerYouTag");
const bottomPlayerRating = document.getElementById("bottomPlayerRating");
const bottomPlayerMaterial = document.getElementById("bottomPlayerMaterial");
const bottomPlayerElo = document.getElementById("bottomPlayerElo");
const bottomPlayerAcc = document.getElementById("bottomPlayerAcc");
const bottomPlayerColorDot = document.getElementById("bottomPlayerColorDot");

const boardModeBadge = document.getElementById("boardModeBadge");
const boardPositionStatus = document.getElementById("boardPositionStatus");
const btnToggleBeforeAfter = document.getElementById("btnToggleBeforeAfter");
const btnPreviewBest = document.getElementById("btnPreviewBest");
const btnStepPv = document.getElementById("btnStepPv");
const btnReturnGame = document.getElementById("btnReturnGame");
const variationTrailWrap = document.getElementById("variationTrailWrap");
const variationTrail = document.getElementById("variationTrail");

const btnFirst = document.getElementById("btnFirst");
const btnPrev = document.getElementById("btnPrev");
const btnPlay = document.getElementById("btnPlay");
const btnPause = document.getElementById("btnPause");
const btnNext = document.getElementById("btnNext");
const btnLast = document.getElementById("btnLast");
const btnFlip = document.getElementById("btnFlip");

const detailMoveTitle = document.getElementById("detailMoveTitle");
const detailMoveBadge = document.getElementById("detailMoveBadge");
const detailFenTurn = document.getElementById("detailFenTurn");
const detailExplanation = document.getElementById("detailExplanation");
const detailWinProb = document.getElementById("detailWinProb");
const detailBestMoveLabel = document.getElementById("detailBestMoveLabel");
const detailBestMove = document.getElementById("detailBestMove");
const detailMoveAcc = document.getElementById("detailMoveAcc");
const detailPvLabel = document.getElementById("detailPvLabel");
const detailPvLine = document.getElementById("detailPvLine");

const summaryEl = document.getElementById("summary");
const openingVal = document.getElementById("openingVal");
const btnTrainDetectedOpening = document.getElementById("btnTrainDetectedOpening");
const headToHeadBanner = document.getElementById("headToHeadBanner");

const cmpWhiteName = document.getElementById("cmpWhiteName");
const cmpWhiteYou = document.getElementById("cmpWhiteYou");
const cmpBlackName = document.getElementById("cmpBlackName");
const cmpBlackYou = document.getElementById("cmpBlackYou");
const cmpWhiteAcc = document.getElementById("cmpWhiteAcc");
const cmpBlackAcc = document.getElementById("cmpBlackAcc");
const cmpWhiteElo = document.getElementById("cmpWhiteElo");
const cmpBlackElo = document.getElementById("cmpBlackElo");
const cmpWhiteTier = document.getElementById("cmpWhiteTier");
const cmpBlackTier = document.getElementById("cmpBlackTier");
const cmpWhiteAcpl = document.getElementById("cmpWhiteAcpl");
const cmpBlackAcpl = document.getElementById("cmpBlackAcpl");
const cmpWhitePhase = document.getElementById("cmpWhitePhase");
const cmpBlackPhase = document.getElementById("cmpBlackPhase");

const classificationGrid = document.getElementById("classificationGrid");
const whiteFeedbackTitle = document.getElementById("whiteFeedbackTitle");
const whiteFeedbackText = document.getElementById("whiteFeedbackText");
const blackFeedbackTitle = document.getElementById("blackFeedbackTitle");
const blackFeedbackText = document.getElementById("blackFeedbackText");
const playstyleEl = document.getElementById("playstyle");

const tabPairedMoves = document.getElementById("tabPairedMoves");
const tabDetailedTable = document.getElementById("tabDetailedTable");
const playerFilterSelect = document.getElementById("playerFilterSelect");
const moveListContainer = document.getElementById("moveListContainer");
const moveListGrid = document.getElementById("moveListGrid");
const moveTableContainer = document.getElementById("moveTableContainer");
const moveTableBody = document.getElementById("moveTable");

const evalGraphEl = document.getElementById("evalGraph");
const evalGraphSvg = document.getElementById("evalGraphSvg");
const evalGraphTip = document.getElementById("evalGraphTip");
const evalGraphValue = document.getElementById("evalGraphValue");
const evalGraphMid = document.getElementById("evalGraphMid");
const evalGraphEnd = document.getElementById("evalGraphEnd");

// Opening Studio & Tactical Coach DOM References
const coachPlanHeadline = document.getElementById("coachPlanHeadline");
const coachPlanTips = document.getElementById("coachPlanTips");
const btnJumpWorstMove = document.getElementById("btnJumpWorstMove");
const openingLessonsGrid = document.getElementById("openingLessonsGrid");
const lessonEcoBadge = document.getElementById("lessonEcoBadge");
const lessonTitle = document.getElementById("lessonTitle");
const lessonMetaTag = document.getElementById("lessonMetaTag");
const btnCoachModeGuided = document.getElementById("btnCoachModeGuided");
const btnCoachModeDrill = document.getElementById("btnCoachModeDrill");
const lessonSummary = document.getElementById("lessonSummary");
const coachStepStatusBadge = document.getElementById("coachStepStatusBadge");
const btnLessonReset = document.getElementById("btnLessonReset");
const btnLessonPrev = document.getElementById("btnLessonPrev");
const btnLessonNext = document.getElementById("btnLessonNext");
const btnLessonHint = document.getElementById("btnLessonHint");
const coachStepComment = document.getElementById("coachStepComment");
const lessonMoveStrip = document.getElementById("lessonMoveStrip");
const lessonHowToPlay = document.getElementById("lessonHowToPlay");
const lessonHowToTackle = document.getElementById("lessonHowToTackle");
const tacticalGuidesGrid = document.getElementById("tacticalGuidesGrid");

// ---------- Application State ----------

const state = {
  appMode: "review", // "review" | "comparison" | "coach"
  theme: "dark",
  engine: null,
  engineReady: false,
  openings: [],
  depth: 14,
  username: "",

  initialFen: START_FEN,
  whitePlayer: { username: "White", rating: "" },
  blackPlayer: { username: "Black", rating: "" },
  myColor: "w",
  opening: null,

  records: [],
  comparison: null,
  coachPlan: null,
  startPositionEval: {
    whiteCp: 20,
    whiteMate: null,
    bestMove: "e2e4",
    pv: ["e2e4", "e7e5"],
  },

  selectedPly: 0,
  boardFlipped: false,
  viewMode: "after", // "after" | "before" | "variation" | "coach"

  // Full Multi-Step Variation History Stack & Cursor
  // Allows playing multiple moves off any game position, getting live Stockfish
  // evaluation + best follow-up arrows after every move, and stepping backward/forward
  // 1 move at a time with Prev/Next without losing the variation!
  variationBasePly: 0,
  variationBaseMode: "after", // "before" | "after"
  variationBaseFen: START_FEN,
  variationBaseEval: {
    whiteCp: 20,
    whiteMate: null,
    bestMoveUci: "e2e4",
    bestMoveSan: "e4",
    pvUci: ["e2e4", "e7e5"],
  },
  variationStack: [], // Array of variation step records
  variationCursor: 0, // 0 = at variationBaseFen; 1..N = after variationStack[cursor - 1]

  selectedSquare: null,
  legalTargetsForSelected: [],
  pendingPromotion: null,

  playTimer: null,
  activeFilter: "all",
  playerFilter: "both",
  analysisSessionId: 0,
  liveEvalRequestId: 0,

  // Opening Studio State
  lessonCategoryFilter: "all",
  activeLessonId: OPENING_LESSONS[0].id,
  coachSubMode: "guided", // "guided" | "drill"
  lessonStepIndex: 0,
  lessonBuiltSteps: [],
  lessonShowHintArrow: false,
  coachDrillVariationFen: null,
  coachDrillVariationMove: null,
};

// ---------- Initialization ----------

async function initReviewApp() {
  renderEmptyBoardGrid();
  renderBoardPosition(START_FEN);
  updateSummaryMetrics();
  initCoachTrainerUI();

  if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
    try {
      const stored = await chrome.storage.sync.get(["username", "depth", "theme"]);
      if (stored.username) {
        state.username = stored.username.trim().toLowerCase();
        usernameEl.value = stored.username;
      }
      if (stored.depth) {
        state.depth = parseInt(stored.depth, 10) || 14;
      }
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

  syncThemeButton();
  bindEventListeners();
  bindEvalGraphEvents();
  await initEngineAndOpenings();

  if (new URLSearchParams(window.location.search).has("sample")) {
    analyzeGame(SAMPLE_GAME, "");
  } else if (usernameEl.value.trim()) {
    loadGames();
  }
}

function prefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

function applyTheme(theme, persist = true) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  syncThemeButton();
  if (persist && typeof chrome !== "undefined" && chrome?.storage?.sync) {
    chrome.storage.sync.set({ theme: state.theme }).catch(() => {});
  }
}

function setButtonTip(button, text) {
  if (!button) return;
  button.setAttribute("data-tip", text);
  button.setAttribute("aria-label", text);
}

function syncThemeButton() {
  if (!btnThemeToggle) return;
  const next = state.theme === "dark" ? "Light" : "Dark";
  setButtonTip(btnThemeToggle, `Switch to the ${next.toLowerCase()} theme`);
}

async function initEngineAndOpenings() {
  setEngineBadge("Starting engine…", "loading");
  try {
    const openingsUrl =
      typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("lib/openings.json")
        : "../lib/openings.json";
    state.openings = await loadOpenings(openingsUrl);
  } catch (err) {
    console.warn("[Chess Coach Review] Could not load openings:", err);
    state.openings = [];
  }

  try {
    const engineUrl =
      typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("engine/stockfish.js")
        : "../engine/stockfish.js";
    state.engine = new Engine(engineUrl);
    await state.engine.whenReady();
    state.engineReady = true;
    setEngineBadge("Stockfish 19 ready", "ready");
  } catch (err) {
    console.error("[Chess Coach Review] Engine initialization failed:", err);
    setEngineBadge("Engine error", "error");
    progressEl.textContent =
      "Stockfish failed to initialize: " + (err?.message || String(err));
  }
}

function setEngineBadge(text, status = "ready") {
  if (engineStatusText) engineStatusText.textContent = text;
  if (engineBadge) {
    engineBadge.className = `engine-badge status-${status}`;
  }
}

// ---------- Mode Switching ----------

export function switchPlatformMode(mode) {
  stopAutoPlay();
  if (mode === "coach") state.appMode = "coach";
  else if (mode === "comparison") state.appMode = "comparison";
  else state.appMode = "review";

  if (modeBtnReview) {
    modeBtnReview.classList.toggle("active", state.appMode === "review");
    modeBtnReview.setAttribute("aria-selected", String(state.appMode === "review"));
  }
  if (modeBtnComparison) {
    modeBtnComparison.classList.toggle("active", state.appMode === "comparison");
    modeBtnComparison.setAttribute("aria-selected", String(state.appMode === "comparison"));
  }
  if (modeBtnCoach) {
    modeBtnCoach.classList.toggle("active", state.appMode === "coach");
    modeBtnCoach.setAttribute("aria-selected", String(state.appMode === "coach"));
  }

  if (gameReviewPanel) {
    gameReviewPanel.classList.toggle("hidden", state.appMode !== "review");
  }
  if (comparisonPanel) {
    comparisonPanel.classList.toggle("hidden", state.appMode !== "comparison");
  }
  if (coachTrainerPanel) {
    coachTrainerPanel.classList.toggle("hidden", state.appMode !== "coach");
  }

  if (state.appMode === "coach") {
    selectOpeningLesson(state.activeLessonId, { subMode: state.coachSubMode });
  } else {
    if (state.viewMode === "coach") {
      state.viewMode = "after";
    }
    refreshBoardAndDetails();
  }
}

// ---------- Event Listeners ----------

function bindEventListeners() {
  if (modeBtnReview) {
    modeBtnReview.addEventListener("click", () => switchPlatformMode("review"));
  }
  if (modeBtnComparison) {
    modeBtnComparison.addEventListener("click", () => switchPlatformMode("comparison"));
  }
  if (modeBtnCoach) {
    modeBtnCoach.addEventListener("click", () => switchPlatformMode("coach"));
  }

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });
  }

  if (btnTrainDetectedOpening) {
    btnTrainDetectedOpening.addEventListener("click", () => {
      const lessonId = state.coachPlan?.recommendedLessonId || "italian-giuoco-piano";
      window.location.href = "../coach/coach.html?lesson=" + encodeURIComponent(lessonId);
    });
  }

  loadBtn.addEventListener("click", loadGames);

  const loadSampleBtn = document.getElementById("loadSample");
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener("click", () => {
      pgnDrawer.classList.add("hidden");
      switchPlatformMode("review");
      analyzeGame(SAMPLE_GAME, "");
    });
  }
  usernameEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadGames();
  });


  if (btnTogglePgn) {
    btnTogglePgn.addEventListener("click", () => {
      pgnDrawer.classList.toggle("hidden");
      pgnErrorMsg.textContent = "";
    });
  }
  if (btnClosePgn) {
    btnClosePgn.addEventListener("click", () => {
      pgnDrawer.classList.add("hidden");
    });
  }
  if (btnAnalyzePgn) {
    btnAnalyzePgn.addEventListener("click", () => {
      const raw = pgnInput.value.trim();
      if (!raw) {
        pgnErrorMsg.textContent = "Please paste a PGN string first.";
        return;
      }
      pgnErrorMsg.textContent = "";
      pgnDrawer.classList.add("hidden");
      switchPlatformMode("review");
      analyzeGame(
        {
          pgn: raw,
          white: { username: "White", rating: "" },
          black: { username: "Black", rating: "" },
          time_class: "custom",
        },
        usernameEl.value.trim().toLowerCase()
      );
    });
  }

  // Transport controls
  btnFirst.addEventListener("click", () => {
    stopAutoPlay();
    if (state.appMode === "coach") {
      setLessonStep(0);
    } else if (state.viewMode === "variation") {
      jumpToVariationCursor(0);
    } else {
      selectMovePly(0, { mode: "after" });
    }
  });

  btnPrev.addEventListener("click", () => {
    stopAutoPlay();
    if (state.appMode === "coach") {
      setLessonStep(Math.max(0, state.lessonStepIndex - 1));
    } else {
      stepPreviousMove();
    }
  });

  btnNext.addEventListener("click", () => {
    stopAutoPlay();
    if (state.appMode === "coach") {
      setLessonStep(Math.min(state.lessonBuiltSteps.length, state.lessonStepIndex + 1));
    } else {
      stepNextMove();
    }
  });

  btnLast.addEventListener("click", () => {
    stopAutoPlay();
    if (state.appMode === "coach") {
      setLessonStep(state.lessonBuiltSteps.length);
    } else if (state.viewMode === "variation" && state.variationCursor < state.variationStack.length) {
      jumpToVariationCursor(state.variationStack.length);
    } else {
      selectMovePly(state.records.length, { mode: "after" });
    }
  });

  btnPlay.addEventListener("click", startAutoPlay);
  btnPause.addEventListener("click", stopAutoPlay);

  btnFlip.addEventListener("click", () => {
    state.boardFlipped = !state.boardFlipped;
    refreshBoardAndDetails();
  });

  // Mistake / Variation Controls
  btnToggleBeforeAfter.addEventListener("click", () => {
    if (state.selectedPly <= 0) return;
    stopAutoPlay();
    const targetMode = state.viewMode === "before" ? "after" : "before";
    selectMovePly(state.selectedPly, { mode: targetMode });
  });

  btnPreviewBest.addEventListener("click", () => {
    stopAutoPlay();
    previewRecommendedMove();
  });

  btnStepPv.addEventListener("click", () => {
    stopAutoPlay();
    stepNextPvMove();
  });

  btnReturnGame.addEventListener("click", () => {
    stopAutoPlay();
    if (state.appMode === "coach") {
      setLessonStep(state.lessonStepIndex);
    } else {
      returnToOriginalGamePosition();
    }
  });

  // History Tabs & Filters
  tabPairedMoves.addEventListener("click", () => {
    tabPairedMoves.classList.add("active");
    tabDetailedTable.classList.remove("active");
    moveListContainer.classList.remove("hidden");
    moveTableContainer.classList.add("hidden");
  });

  tabDetailedTable.addEventListener("click", () => {
    tabDetailedTable.classList.add("active");
    tabPairedMoves.classList.remove("active");
    moveTableContainer.classList.remove("hidden");
    moveListContainer.classList.add("hidden");
  });

  if (playerFilterSelect) {
    playerFilterSelect.addEventListener("change", () => {
      state.playerFilter = playerFilterSelect.value || "both";
      renderMoveHistoryViews();
    });
  }

  document.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeFilter = btn.getAttribute("data-filter") || "all";
      renderMoveHistoryViews();
    });
  });

  // Promotion modal buttons
  document.querySelectorAll(".promo-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const piece = btn.getAttribute("data-promo") || "q";
      completePendingPromotion(piece);
    });
  });
  if (btnCancelPromo) {
    btnCancelPromo.addEventListener("click", () => {
      state.pendingPromotion = null;
      promotionModal.classList.add("hidden");
    });
  }

  // Keyboard navigation
  window.addEventListener("keydown", (e) => {
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.target?.closest?.(".evalgraph")) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stopAutoPlay();
      if (state.appMode === "coach") {
        setLessonStep(Math.max(0, state.lessonStepIndex - 1));
      } else {
        stepPreviousMove();
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stopAutoPlay();
      if (state.appMode === "coach") {
        setLessonStep(Math.min(state.lessonBuiltSteps.length, state.lessonStepIndex + 1));
      } else {
        stepNextMove();
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      stopAutoPlay();
      if (state.appMode === "coach") setLessonStep(0);
      else if (state.viewMode === "variation") jumpToVariationCursor(0);
      else selectMovePly(0, { mode: "after" });
    } else if (e.key === "End") {
      e.preventDefault();
      stopAutoPlay();
      if (state.appMode === "coach") setLessonStep(state.lessonBuiltSteps.length);
      else if (state.viewMode === "variation") jumpToVariationCursor(state.variationStack.length);
      else selectMovePly(state.records.length, { mode: "after" });
    } else if (e.key === " ") {
      e.preventDefault();
      if (state.playTimer) stopAutoPlay();
      else startAutoPlay();
    } else if (e.key === "Escape") {
      if (state.viewMode === "variation" || state.viewMode === "before") {
        e.preventDefault();
        returnToOriginalGamePosition();
      }
    } else if (e.key === "/") {
      e.preventDefault();
      usernameEl.focus();
      usernameEl.select();
    } else if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) {
      window.location.href = "../coach/coach.html";
    } else if (e.key === "1") {
      switchPlatformMode("review");
    } else if (e.key === "2") {
      switchPlatformMode("comparison");
    } else if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) {
      state.boardFlipped = !state.boardFlipped;
      refreshBoardAndDetails();
    } else if (e.key === "]" || e.key === "[") {
      e.preventDefault();
      stopAutoPlay();
      jumpToError(e.key === "]" ? 1 : -1);
    }
  });
}

// ---------- Chess.com Archive Fetching ----------

async function loadGames() {
  const username = usernameEl.value.trim().toLowerCase();
  if (!username) {
    progressEl.textContent = "Add a chess.com username to load recent games.";
    return;
  }

  state.username = username;
  if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
    chrome.storage.sync.set({ username }).catch(() => {});
  }

  const gamesHeader = document.getElementById("gamesHeaderTitle");
  if (gamesHeader) gamesHeader.textContent = "Recent games";
  gamesEl.innerHTML = `<div class="empty-state-msg">Loading games for <b>${escapeHtml(username)}</b>…</div>`;
  progressEl.textContent = `Fetching game archives for ${username}…`;

  try {
    const archivesRes = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`
    );
    if (!archivesRes.ok) {
      throw new Error(`No Chess.com archive found for "${username}" (HTTP ${archivesRes.status}).`);
    }
    const { archives } = await archivesRes.json();
    if (!Array.isArray(archives) || !archives.length) {
      gamesEl.innerHTML = `<div class="empty-state-msg">No finished games found for ${escapeHtml(username)}.</div>`;
      progressEl.textContent = "No games found.";
      return;
    }

    let games = [];
    for (let i = archives.length - 1; i >= 0 && games.length < 20; i--) {
      const res = await fetch(archives[i]);
      if (!res.ok) continue;
      const data = await res.json();
      games = games.concat(data.games || []);
    }

    games = games
      .filter((g) => g && typeof g.pgn === "string" && g.pgn.trim().length > 0)
      .slice(-20)
      .reverse();

    if (!games.length) {
      gamesEl.innerHTML = `<div class="empty-state-msg">No PGN games available in recent archives.</div>`;
      progressEl.textContent = "No PGN games found.";
      return;
    }

    gamesEl.innerHTML = "";
    games.forEach((g, idx) => {
      const row = document.createElement("div");
      row.className = "game-row";
      row.setAttribute("role", "listitem");
      const white = g.white?.username || "White";
      const black = g.black?.username || "Black";
      const wRating = g.white?.rating ? `(${g.white.rating})` : "";
      const bRating = g.black?.rating ? `(${g.black.rating})` : "";
      const result =
        g.white?.result === "win"
          ? `${white} won`
          : g.black?.result === "win"
          ? `${black} won`
          : "Draw";
      const dateStr = g.end_time
        ? new Date(g.end_time * 1000).toLocaleDateString()
        : "";

      row.innerHTML = `
        <div class="game-row-top">
          <span>${escapeHtml(white)} ${escapeHtml(wRating)} vs ${escapeHtml(black)} ${escapeHtml(bRating)}</span>
        </div>
        <div class="game-row-sub">
          <span>${escapeHtml(g.time_class || "chess")}, ${escapeHtml(dateStr)}</span>
          <strong>${escapeHtml(result)}</strong>
        </div>
      `;

      row.addEventListener("click", () => {
        document.querySelectorAll(".game-row").forEach((el) => el.classList.remove("active"));
        row.classList.add("active");
        if (state.appMode === "coach") switchPlatformMode("review");
        analyzeGame(g, username);
      });

      gamesEl.appendChild(row);

      if (idx === 0) {
        row.classList.add("active");
        analyzeGame(g, username);
      }
    });
  } catch (e) {
    gamesEl.innerHTML = `<div class="empty-state-msg">Couldn't load games: ${escapeHtml(e.message)}</div>`;
    progressEl.textContent = "Couldn't load games: " + e.message;
  }
}

// ---------- Game Parsing & Progressive Local Stockfish Analysis ----------

export async function analyzeGame(gameData, username) {
  stopAutoPlay();

  const sessionId = ++state.analysisSessionId;
  if (state.engine) {
    state.engine.cancelPending();
  }

  const parsed = safeParsePgn(Chess, gameData?.pgn || "");
  if (!parsed.ok || parsed.moves.length === 0) {
    progressEl.textContent = parsed.error || "Could not parse PGN data for this game.";
    progressBarWrap.classList.add("hidden");
    return;
  }

  const headers = parsed.headers || {};
  const whiteName = gameData?.white?.username || headers.White || "White";
  const blackName = gameData?.black?.username || headers.Black || "Black";
  const whiteRating = gameData?.white?.rating || headers.WhiteElo || "";
  const blackRating = gameData?.black?.rating || headers.BlackElo || "";

  state.initialFen = parsed.initialFen || START_FEN;
  state.whitePlayer = { username: whiteName, rating: whiteRating };
  state.blackPlayer = { username: blackName, rating: blackRating };

  const normalizedUser = (username || state.username || "").trim().toLowerCase();
  if (normalizedUser && blackName.toLowerCase() === normalizedUser) {
    state.myColor = "b";
    state.boardFlipped = true;
  } else {
    state.myColor = "w";
    state.boardFlipped = false;
  }

  const sanHistory = parsed.moves.map((m) => m.san);
  state.opening = identifyOpening(state.openings, sanHistory);

  const verifyChess = new Chess(state.initialFen);
  state.records = parsed.moves.map((m, idx) => {
    const ply = idx + 1;
    const moveNumber = Math.ceil(ply / 2);
    const legalBefore = verifyChess.moves({ verbose: true });
    const wasOnlyLegalMove = legalBefore.length === 1;
    const matBefore = materialBalance(verifyChess, m.color);
    verifyChess.move(m.san, { strict: false });
    const matAfter = materialBalance(verifyChess, m.color);
    const uci = m.lan || `${m.from}${m.to}${m.promotion || ""}`;

    return {
      ply,
      moveNumber,
      san: m.san,
      uci,
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      piece: m.piece,
      captured: m.captured,
      color: m.color,
      fenBefore: m.before,
      fenAfter: m.after,
      wasOnlyLegalMove,
      matBefore,
      matAfter,
      isBookMove: isMoveInOpeningBook(state.openings, sanHistory.slice(0, ply)),
      openingName: state.opening ? state.opening.name : null,

      analyzed: false,
      tag: "good",
      label: "Analyzing…",
      glyph: "·",
      cpLoss: 0,
      moveAccuracy: 100,
      whiteCpBefore: 0,
      whiteMateBefore: null,
      whiteCpAfter: 0,
      whiteMateAfter: null,
      evalBeforeStr: "0.0",
      evalAfterStr: "0.0",
      winBefore: 50,
      winAfter: 50,
      winDelta: 0,
      bestMoveUci: null,
      bestMoveSan: null,
      bestMoveFrom: null,
      bestMoveTo: null,
      pvUci: [],
      pvSan: [],
      pvSteps: [],
      explanation: "Waiting for Stockfish evaluation…",
    };
  });

  summaryEl.style.display = "block";
  document.body.dataset.state = "game";

  const isSampleGame = gameData?.time_class === "sample";
  const gamesHeader = document.getElementById("gamesHeaderTitle");
  if (gamesHeader) gamesHeader.textContent = isSampleGame ? "Sample game" : "Recent games";
  if (isSampleGame) {
    progressEl.textContent = "Morphy, Paris 1858. Analysis runs on this machine.";
  }
  openingVal.textContent = state.opening
    ? `${state.opening.eco} ${state.opening.name}`
    : headers.ECO
    ? `${headers.ECO}`
    : "Standard Chess";

  if (state.appMode !== "coach") {
    selectMovePly(0, { mode: "after" });
  }
  renderMoveHistoryViews();
  updateSummaryMetrics();

  if (!state.engine) {
    await initEngineAndOpenings();
  }
  if (!state.engine) return;

  try {
    await state.engine.whenReady();
  } catch (err) {
    progressEl.textContent = "Engine error: " + (err?.message || String(err));
    return;
  }

  if (sessionId !== state.analysisSessionId) return;

  const totalPlies = state.records.length;
  progressBarWrap.classList.remove("hidden");
  progressBarFill.style.width = "0%";
  setEngineBadge(`Analyzing 0/${totalPlies}`, "busy");

  const analysisDepth = state.depth || 14;
  const eval0 = await state.engine.evaluate(state.initialFen, Math.min(analysisDepth, 12));
  if (sessionId !== state.analysisSessionId || eval0.cancelled) return;

  const startSide = state.initialFen.split(" ")[1] || "w";
  let prevWhiteCp = whiteRelativeCp(eval0, startSide);
  let prevWhiteMate = whiteRelativeMate(eval0, startSide);
  let prevBestMoveUci = eval0.bestMove;
  let prevPvUci = eval0.pv || [];

  state.startPositionEval = {
    whiteCp: prevWhiteCp,
    whiteMate: prevWhiteMate,
    bestMove: prevBestMoveUci,
    pv: prevPvUci,
  };

  for (let i = 0; i < totalPlies; i++) {
    if (sessionId !== state.analysisSessionId) return;

    const rec = state.records[i];
    const pct = Math.round(((i + 1) / totalPlies) * 100);
    progressEl.textContent = `Analyzing move ${i + 1} of ${totalPlies} (${pct}%)…`;
    progressBarFill.style.width = `${pct}%`;
    setEngineBadge(`Analyzing ${i + 1}/${totalPlies}`, "busy");

    const bestMoveBeforeUci = prevBestMoveUci;
    const pvBeforeUci =
      prevPvUci && prevPvUci.length ? prevPvUci : bestMoveBeforeUci ? [bestMoveBeforeUci] : [];
    const bestMoveObj = bestMoveBeforeUci
      ? uciToSanMove(Chess, rec.fenBefore, bestMoveBeforeUci)
      : null;
    const pvSteps = buildPvSteps(Chess, rec.fenBefore, pvBeforeUci, 8);

    const evalAfter = await state.engine.evaluate(rec.fenAfter, analysisDepth);
    if (sessionId !== state.analysisSessionId || evalAfter.cancelled) return;

    const nextTurn = rec.color === "w" ? "b" : "w";
    const whiteCpAfter = whiteRelativeCp(evalAfter, nextTurn);
    const whiteMateAfter = whiteRelativeMate(evalAfter, nextTurn);

    const sign = rec.color === "w" ? 1 : -1;
    const cpBeforeForMover = sign * prevWhiteCp;
    const cpAfterForMover = sign * whiteCpAfter;
    const cpLoss = Math.max(0, cpBeforeForMover - cpAfterForMover);

    const winBefore = winPercent(cpBeforeForMover);
    const winAfter = winPercent(cpAfterForMover);
    const winDrop = Math.max(0, winBefore - winAfter);
    const acc = moveAccuracyFromWinSwing(winBefore, winAfter);

    const matchedBestMove = Boolean(
      bestMoveBeforeUci && rec.uci.toLowerCase() === bestMoveBeforeUci.toLowerCase()
    );
    const isSacrifice =
      !rec.isBookMove &&
      rec.matAfter < rec.matBefore &&
      (!rec.captured || rec.matAfter <= rec.matBefore - 1) &&
      cpAfterForMover >= -20;
    const isGreatCandidate =
      !rec.isBookMove &&
      !isSacrifice &&
      matchedBestMove &&
      Math.abs(cpBeforeForMover) < 250 &&
      (rec.san.includes("+") || Boolean(rec.captured)) &&
      cpLoss <= 5;
    const missedMate =
      prevWhiteMate !== null &&
      sign * prevWhiteMate > 0 &&
      (whiteMateAfter === null || sign * whiteMateAfter <= 0);

    const cls = classifyMove(cpLoss, {
      wasOnlyLegalMove: rec.wasOnlyLegalMove,
      matchedBestMove,
      isBookMove: rec.isBookMove,
      isSacrifice,
      isGreatCandidate,
      winDrop,
      cpBeforeForMover,
      cpAfterForMover,
      missedMate,
    });

    rec.analyzed = true;
    rec.tag = cls.tag;
    rec.label = cls.label;
    rec.glyph = cls.glyph;
    rec.cpLoss = Math.round(cpLoss);
    rec.moveAccuracy = Math.round(acc);
    rec.whiteCpBefore = prevWhiteCp;
    rec.whiteMateBefore = prevWhiteMate;
    rec.whiteCpAfter = whiteCpAfter;
    rec.whiteMateAfter = whiteMateAfter;
    rec.evalBeforeStr = formatEvalScore(prevWhiteCp, prevWhiteMate);
    rec.evalAfterStr = formatEvalScore(whiteCpAfter, whiteMateAfter);
    rec.winBefore = winBefore;
    rec.winAfter = winAfter;
    rec.winDelta = winAfter - winBefore;
    rec.bestMoveUci = bestMoveBeforeUci;
    rec.bestMoveSan = bestMoveObj ? bestMoveObj.san : bestMoveBeforeUci;
    rec.bestMoveFrom = bestMoveObj
      ? bestMoveObj.from
      : parseUciMove(bestMoveBeforeUci)?.from || null;
    rec.bestMoveTo = bestMoveObj
      ? bestMoveObj.to
      : parseUciMove(bestMoveBeforeUci)?.to || null;
    rec.pvUci = pvBeforeUci;
    rec.pvSteps = pvSteps;
    rec.pvSan = pvSteps.map((s) => s.san);
    rec.explanation = explainMove(rec);

    // Also store the engine's recommended follow-up move AFTER rec.fenAfter
    const followUpObj = evalAfter.bestMove
      ? uciToSanMove(Chess, rec.fenAfter, evalAfter.bestMove)
      : null;
    rec.followUpUci = evalAfter.bestMove || null;
    rec.followUpSan = followUpObj ? followUpObj.san : evalAfter.bestMove || null;
    rec.followUpPvUci = evalAfter.pv || [];

    prevWhiteCp = whiteCpAfter;
    prevWhiteMate = whiteMateAfter;
    prevBestMoveUci = evalAfter.bestMove;
    prevPvUci = evalAfter.pv || [];

    scheduleSummaryUpdate();
    updateAnalyzedMoveInLists(rec);
    scheduleEvalGraph();
    if (state.appMode !== "coach" && state.viewMode !== "variation") {
      if (state.selectedPly === rec.ply || (state.selectedPly === 0 && i === 0)) {
        refreshBoardAndDetails();
      } else if (state.selectedPly === 0) {
        updateEvalBar(whiteCpAfter, whiteMateAfter);
      }
    }
  }

  progressBarWrap.classList.add("hidden");
  progressEl.textContent = `Analysis complete (${totalPlies} plies at depth ${analysisDepth}). Click any move or play on the board to explore variations.`;
  setEngineBadge("Stockfish 19 ready", "ready");

  flushSummaryUpdate();
  renderMoveHistoryViews();
  if (state.appMode !== "coach") {
    refreshBoardAndDetails();
  }
}

// ---------- Game Move Navigation & Multi-Step Variation History ----------

export function selectMovePly(ply, options = {}) {
  if (state.appMode === "coach") {
    switchPlatformMode("review");
  }
  const maxPly = state.records.length;
  const clampedPly = Math.max(0, Math.min(maxPly, parseInt(ply, 10) || 0));

  state.selectedPly = clampedPly;
  state.selectedSquare = null;
  state.legalTargetsForSelected = [];
  state.pendingPromotion = null;
  promotionModal.classList.add("hidden");

  // Clear variation stack when selecting a main-line game move
  state.variationStack = [];
  state.variationCursor = 0;

  if (clampedPly === 0) {
    state.viewMode = "after";
  } else {
    const rec = state.records[clampedPly - 1];
    const isCriticalError =
      rec && (rec.tag === "blunder" || rec.tag === "mistake" || rec.tag === "inaccuracy");

    if (options.mode) {
      state.viewMode = options.mode;
    } else if (isCriticalError && rec.analyzed) {
      state.viewMode = "before";
    } else {
      state.viewMode = "after";
    }
  }

  refreshBoardAndDetails();
  highlightSelectedMoveInHistory();
  scheduleEvalGraph();
}

// Initializes variation exploration anchored at the current board state
function ensureVariationInitialized() {
  if (state.viewMode === "variation") return;

  const basePly = state.selectedPly;
  const baseMode = state.viewMode === "before" ? "before" : "after";
  let baseFen = state.initialFen;
  let baseEval = {
    whiteCp: state.startPositionEval.whiteCp,
    whiteMate: state.startPositionEval.whiteMate,
    bestMoveUci: state.startPositionEval.bestMove,
    bestMoveSan: "e4",
    pvUci: state.startPositionEval.pv || [],
  };

  if (basePly > 0 && state.records[basePly - 1]) {
    const rec = state.records[basePly - 1];
    if (baseMode === "before") {
      baseFen = rec.fenBefore;
      baseEval = {
        whiteCp: rec.whiteCpBefore,
        whiteMate: rec.whiteMateBefore,
        bestMoveUci: rec.bestMoveUci,
        bestMoveSan: rec.bestMoveSan,
        pvUci: rec.pvUci || [],
      };
    } else {
      baseFen = rec.fenAfter;
      baseEval = {
        whiteCp: rec.whiteCpAfter,
        whiteMate: rec.whiteMateAfter,
        bestMoveUci: rec.followUpUci || null,
        bestMoveSan: rec.followUpSan || null,
        pvUci: rec.followUpPvUci || [],
      };
    }
  }

  state.viewMode = "variation";
  state.variationBasePly = basePly;
  state.variationBaseMode = baseMode;
  state.variationBaseFen = baseFen;
  state.variationBaseEval = baseEval;
  state.variationStack = [];
  state.variationCursor = 0;
}

// Pushes a move ({ from, to, promotion }) onto the multi-step variation stack,
// advances variationCursor, renders the board immediately, and runs real-time
// Stockfish analysis on the new position so the user gets immediate follow-up
// move arrows, updated PV chips, and coaching explanation!
export async function playMoveInVariation(from, to, promotion) {
  ensureVariationInitialized();

  const currentFen = getDisplayedFen();
  const chess = new Chess(currentFen);
  const legalBefore = chess.moves({ verbose: true });
  const wasOnlyLegalMove = legalBefore.length === 1;
  const sideToMove = chess.turn();
  const moveNumber = chess.moveNumber();
  const matBefore = materialBalance(chess, sideToMove);

  const moved = chess.move({ from, to, promotion: promotion || "q" });
  if (!moved) return null;

  const fenAfter = chess.fen();
  const matAfter = materialBalance(chess, sideToMove);
  const actualUci = moved.lan || `${moved.from}${moved.to}${moved.promotion || ""}`;

  // Previous evaluation before this variation move
  const prevVarStep =
    state.variationCursor > 0 ? state.variationStack[state.variationCursor - 1] : null;
  const whiteCpBefore = prevVarStep
    ? prevVarStep.whiteCpAfter
    : state.variationBaseEval.whiteCp;
  const whiteMateBefore = prevVarStep
    ? prevVarStep.whiteMateAfter
    : state.variationBaseEval.whiteMate;
  const bestMoveBeforeUci = prevVarStep
    ? prevVarStep.bestFollowUpUci
    : state.variationBaseEval.bestMoveUci;
  const bestMoveBeforeObj = bestMoveBeforeUci
    ? uciToSanMove(Chess, currentFen, bestMoveBeforeUci)
    : null;
  const bestMoveBeforeSan = bestMoveBeforeObj
    ? bestMoveBeforeObj.san
    : bestMoveBeforeUci;

  // Truncate any redo steps if the user had stepped back and played a new move
  if (state.variationCursor < state.variationStack.length) {
    state.variationStack = state.variationStack.slice(0, state.variationCursor);
  }

  const stepIndex = state.variationStack.length;
  const stepRecord = {
    stepIndex,
    ply: (state.variationBasePly || 0) + stepIndex + 1,
    moveNumber,
    color: sideToMove,
    san: moved.san,
    uci: actualUci,
    from: moved.from,
    to: moved.to,
    promotion: moved.promotion,
    captured: moved.captured,
    fenBefore: currentFen,
    fenAfter,
    wasOnlyLegalMove,
    matBefore,
    matAfter,

    // Initial state while Stockfish evaluates this custom move
    analyzed: false,
    tag: "best",
    label: "Analyzing move…",
    glyph: "…",
    cpLoss: 0,
    moveAccuracy: 100,
    whiteCpBefore,
    whiteMateBefore,
    whiteCpAfter: whiteCpBefore,
    whiteMateAfter: whiteMateBefore,
    evalBeforeStr: formatEvalScore(whiteCpBefore, whiteMateBefore),
    evalAfterStr: "…",
    winBefore: winPercent((sideToMove === "w" ? 1 : -1) * whiteCpBefore),
    winAfter: winPercent((sideToMove === "w" ? 1 : -1) * whiteCpBefore),
    winDelta: 0,
    bestAlternativeUci: bestMoveBeforeUci,
    bestAlternativeSan: bestMoveBeforeSan,

    // Stockfish's recommended follow-up from fenAfter (populated below)
    bestFollowUpUci: null,
    bestFollowUpSan: null,
    bestFollowUpFrom: null,
    bestFollowUpTo: null,
    pvSteps: [],
    pvSan: [],
    explanation: `Analyzing ${moveNumber}${sideToMove === "w" ? "." : "..."} ${moved.san} with Stockfish 19…`,
  };

  state.variationStack.push(stepRecord);
  state.variationCursor = state.variationStack.length;
  state.selectedSquare = null;
  state.legalTargetsForSelected = [];

  refreshBoardAndDetails();

  // Run Stockfish 19 on the new variation position
  await analyzeVariationStepLive(stepRecord);
  return stepRecord;
}

async function analyzeVariationStepLive(stepRecord) {
  if (!state.engine || !state.engineReady || !stepRecord) return;
  const reqId = ++state.liveEvalRequestId;

  try {
    const evalDepth = Math.max(10, Math.min(state.depth || 14, 14));
    const res = await state.engine.evaluate(stepRecord.fenAfter, evalDepth);
    if (res.cancelled) return;

    const nextTurn = stepRecord.color === "w" ? "b" : "w";
    const whiteCpAfter = whiteRelativeCp(res, nextTurn);
    const whiteMateAfter = whiteRelativeMate(res, nextTurn);

    const sign = stepRecord.color === "w" ? 1 : -1;
    const cpBeforeForMover = sign * stepRecord.whiteCpBefore;
    const cpAfterForMover = sign * whiteCpAfter;
    const cpLoss = Math.max(0, cpBeforeForMover - cpAfterForMover);

    const winBefore = winPercent(cpBeforeForMover);
    const winAfter = winPercent(cpAfterForMover);
    const winDrop = Math.max(0, winBefore - winAfter);
    const acc = moveAccuracyFromWinSwing(winBefore, winAfter);

    const matchedBestMove = Boolean(
      stepRecord.bestAlternativeUci &&
        stepRecord.uci.toLowerCase() === stepRecord.bestAlternativeUci.toLowerCase()
    );
    const isSacrifice =
      stepRecord.matAfter < stepRecord.matBefore &&
      (!stepRecord.captured || stepRecord.matAfter <= stepRecord.matBefore - 1) &&
      cpAfterForMover >= -20;

    const cls = classifyMove(cpLoss, {
      wasOnlyLegalMove: stepRecord.wasOnlyLegalMove,
      matchedBestMove,
      isBookMove: false,
      isSacrifice,
      isGreatCandidate: matchedBestMove && cpLoss <= 5 && Boolean(stepRecord.captured),
      winDrop,
      cpBeforeForMover,
      cpAfterForMover,
      missedMate: false,
    });

    // Compute Stockfish's recommended follow-up move & PV starting from stepRecord.fenAfter!
    const followUpUci = res.bestMove || null;
    const followUpObj = followUpUci
      ? uciToSanMove(Chess, stepRecord.fenAfter, followUpUci)
      : null;
    const pvUci =
      res.pv && res.pv.length > 0 ? res.pv : followUpUci ? [followUpUci] : [];
    const pvSteps = buildPvSteps(Chess, stepRecord.fenAfter, pvUci, 8);

    stepRecord.analyzed = true;
    stepRecord.tag = cls.tag;
    stepRecord.label = cls.label;
    stepRecord.glyph = cls.glyph;
    stepRecord.cpLoss = Math.round(cpLoss);
    stepRecord.moveAccuracy = Math.round(acc);
    stepRecord.whiteCpAfter = whiteCpAfter;
    stepRecord.whiteMateAfter = whiteMateAfter;
    stepRecord.evalAfterStr = formatEvalScore(whiteCpAfter, whiteMateAfter);
    stepRecord.winBefore = winBefore;
    stepRecord.winAfter = winAfter;
    stepRecord.winDelta = winAfter - winBefore;

    stepRecord.bestFollowUpUci = followUpUci;
    stepRecord.bestFollowUpSan = followUpObj ? followUpObj.san : followUpUci;
    stepRecord.bestFollowUpFrom = followUpObj
      ? followUpObj.from
      : parseUciMove(followUpUci)?.from || null;
    stepRecord.bestFollowUpTo = followUpObj
      ? followUpObj.to
      : parseUciMove(followUpUci)?.to || null;
    stepRecord.pvSteps = pvSteps;
    stepRecord.pvSan = pvSteps.map((s) => s.san);

    // Short verdict + the single most useful follow-up move.
    const baseVerdict = explainMove({
      ...stepRecord,
      bestMoveSan: stepRecord.bestAlternativeSan,
      bestMoveUci: stepRecord.bestAlternativeUci,
    });
    const nextColorName = nextTurn === "w" ? "White" : "Black";
    const followUpSentence = stepRecord.bestFollowUpSan
      ? ` Next best follow-up for ${nextColorName}: ${stepRecord.bestFollowUpSan}.`
      : "";

    stepRecord.explanation = baseVerdict + followUpSentence;

    if (
      state.viewMode === "variation" &&
      (reqId === state.liveEvalRequestId ||
        state.variationStack[state.variationCursor - 1] === stepRecord)
    ) {
      refreshBoardAndDetails();
    }
  } catch (err) {
    console.warn("[Chess Coach Review] Variation eval error:", err);
  }
}

export function jumpToVariationCursor(cursorIndex) {
  if (state.viewMode !== "variation") return;
  const clamped = Math.max(
    0,
    Math.min(state.variationStack.length, parseInt(cursorIndex, 10) || 0)
  );
  state.variationCursor = clamped;
  state.selectedSquare = null;
  state.legalTargetsForSelected = [];
  refreshBoardAndDetails();
}

// Step back 1 move:
// - If inside a variation with cursor > 0, steps back 1 move in the variation stack!
// - Only exits variation mode if already at variationCursor === 0.
function stepPreviousMove() {
  if (state.viewMode === "variation") {
    if (state.variationCursor > 0) {
      state.variationCursor--;
      state.selectedSquare = null;
      state.legalTargetsForSelected = [];
      refreshBoardAndDetails();
      return;
    }
    returnToOriginalGamePosition();
    return;
  }
  if (state.selectedPly > 0) {
    selectMovePly(state.selectedPly - 1);
  }
}

// Step forward 1 move:
// - If inside a variation and cursor < variationStack.length, steps forward 1 move in the variation!
// - If at the end of variationStack, plays Stockfish's recommended follow-up move if available!
// - Otherwise advances in the main game.
function stepNextMove() {
  if (state.viewMode === "variation") {
    if (state.variationCursor < state.variationStack.length) {
      state.variationCursor++;
      state.selectedSquare = null;
      state.legalTargetsForSelected = [];
      refreshBoardAndDetails();
      return;
    }
    stepNextPvMove();
    return;
  }
  if (state.selectedPly < state.records.length) {
    selectMovePly(state.selectedPly + 1);
  }
}

function startAutoPlay() {
  if (state.playTimer) return;
  if (state.appMode === "coach") {
    if (state.lessonStepIndex >= state.lessonBuiltSteps.length) {
      setLessonStep(0);
    }
    btnPlay.classList.add("hidden");
    btnPause.classList.remove("hidden");
    state.playTimer = setInterval(() => {
      if (state.lessonStepIndex < state.lessonBuiltSteps.length) {
        setLessonStep(state.lessonStepIndex + 1);
      } else {
        stopAutoPlay();
      }
    }, 1000);
    return;
  }

  if (state.viewMode === "variation") {
    returnToOriginalGamePosition();
  }
  if (state.selectedPly >= state.records.length) {
    selectMovePly(0, { mode: "after" });
  }
  btnPlay.classList.add("hidden");
  btnPause.classList.remove("hidden");

  state.playTimer = setInterval(() => {
    if (state.selectedPly < state.records.length) {
      selectMovePly(state.selectedPly + 1, { mode: "after" });
    } else {
      stopAutoPlay();
    }
  }, 900);
}

function stopAutoPlay() {
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
  }
  btnPlay.classList.remove("hidden");
  btnPause.classList.add("hidden");
}

// Plays the engine's recommended alternative move from the position before the selected game move
export async function previewRecommendedMove() {
  if (state.selectedPly <= 0) return;
  const rec = state.records[state.selectedPly - 1];
  if (!rec || !rec.bestMoveUci) return;

  // Reset variation base to the position immediately before `rec`
  state.viewMode = "before";
  ensureVariationInitialized();

  const parsed = parseUciMove(rec.bestMoveUci);
  if (!parsed) return;
  await playMoveInVariation(parsed.from, parsed.to, parsed.promotion);
}

// Plays the next best follow-up move in the current variation (or starts the PV if not yet in variation)
export async function stepNextPvMove() {
  if (state.viewMode !== "variation") {
    await previewRecommendedMove();
    return;
  }

  // If the user stepped back inside the variation stack, step forward through existing stack first
  if (state.variationCursor < state.variationStack.length) {
    state.variationCursor++;
    refreshBoardAndDetails();
    return;
  }

  // Otherwise play Stockfish's best follow-up move from the current variation tip
  const currentVarStep =
    state.variationCursor > 0 ? state.variationStack[state.variationCursor - 1] : null;
  const nextUci = currentVarStep
    ? currentVarStep.bestFollowUpUci
    : state.variationBaseEval.bestMoveUci;

  if (!nextUci) return;
  const parsed = parseUciMove(nextUci);
  if (!parsed) return;
  await playMoveInVariation(parsed.from, parsed.to, parsed.promotion);
}

// Plays a sequence of PV moves up to `stepIdx` onto the variation stack
export async function jumpToPvStep(stepIdx) {
  if (state.viewMode === "variation" && state.variationCursor > 0) {
    const curStep = state.variationStack[state.variationCursor - 1];
    if (!curStep || !curStep.pvSteps || !curStep.pvSteps[stepIdx]) return;
    const stepsToPlay = curStep.pvSteps.slice(0, stepIdx + 1);
    for (const s of stepsToPlay) {
      await playMoveInVariation(s.from, s.to, s.promotion);
    }
    return;
  }

  if (state.selectedPly <= 0) return;
  const rec = state.records[state.selectedPly - 1];
  if (!rec || !rec.pvSteps || !rec.pvSteps[stepIdx]) return;

  state.viewMode = "before";
  ensureVariationInitialized();
  const stepsToPlay = rec.pvSteps.slice(0, stepIdx + 1);
  for (const s of stepsToPlay) {
    await playMoveInVariation(s.from, s.to, s.promotion);
  }
}

export function returnToOriginalGamePosition() {
  state.variationStack = [];
  state.variationCursor = 0;
  state.selectedSquare = null;
  state.legalTargetsForSelected = [];

  if (state.selectedPly <= 0) {
    state.viewMode = "after";
  } else {
    const rec = state.records[state.selectedPly - 1];
    const isCritical =
      rec && (rec.tag === "blunder" || rec.tag === "mistake" || rec.tag === "inaccuracy");
    state.viewMode = isCritical ? "before" : "after";
  }

  refreshBoardAndDetails();
}

// ---------- Interactive Board Rendering & Click-to-Move Exploration ----------

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

function getCurrentVariationStep() {
  if (state.viewMode !== "variation" || state.variationCursor <= 0) return null;
  return state.variationStack[state.variationCursor - 1] || null;
}

function getDisplayedFen() {
  if (state.appMode === "coach") {
    if (state.coachDrillVariationFen) return state.coachDrillVariationFen;
    if (state.lessonStepIndex <= 0 || state.lessonBuiltSteps.length === 0) {
      return START_FEN;
    }
    const step = state.lessonBuiltSteps[state.lessonStepIndex - 1];
    return step ? step.afterFen : START_FEN;
  }

  if (state.viewMode === "variation") {
    const varStep = getCurrentVariationStep();
    return varStep ? varStep.fenAfter : state.variationBaseFen;
  }

  if (state.selectedPly <= 0 || state.records.length === 0) {
    return state.initialFen;
  }
  const rec = state.records[state.selectedPly - 1];
  return state.viewMode === "before" ? rec.fenBefore : rec.fenAfter;
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
      state.pendingPromotion = {
        from: state.selectedSquare,
        to: square,
        fen: currentFen,
      };
      setPromotionPieceArt(matchingLegal.color);
      promotionModal.classList.remove("hidden");
      return;
    }

    if (state.appMode === "coach" && state.coachSubMode === "drill") {
      handleCoachDrillUserMove(currentFen, state.selectedSquare, square, undefined);
    } else {
      playMoveInVariation(state.selectedSquare, square, undefined);
    }
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
    refreshBoardAndDetails();
  } else {
    state.selectedSquare = null;
    state.legalTargetsForSelected = [];
    refreshBoardAndDetails();
  }
}

function completePendingPromotion(promoPiece) {
  const pending = state.pendingPromotion;
  state.pendingPromotion = null;
  promotionModal.classList.add("hidden");
  if (!pending) return;
  if (state.appMode === "coach" && state.coachSubMode === "drill") {
    handleCoachDrillUserMove(pending.fen, pending.from, pending.to, promoPiece);
  } else {
    playMoveInVariation(pending.from, pending.to, promoPiece);
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
  const squares = chessboardEl.children;
  if (squares.length !== 64) {
    renderEmptyBoardGrid();
  }

  const rec =
    state.appMode !== "coach" && state.selectedPly > 0
      ? state.records[state.selectedPly - 1]
      : null;
  const varStep = getCurrentVariationStep();
  const coachStep =
    state.appMode === "coach" && state.lessonStepIndex > 0
      ? state.lessonBuiltSteps[state.lessonStepIndex - 1]
      : null;

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

      if (state.appMode === "coach") {
        if (state.coachDrillVariationMove) {
          if (sqName === state.coachDrillVariationMove.from) sqEl.classList.add("sq-last-from");
          if (sqName === state.coachDrillVariationMove.to) sqEl.classList.add("sq-last-to");
        } else if (coachStep) {
          if (sqName === coachStep.from) sqEl.classList.add("sq-last-from");
          if (sqName === coachStep.to) sqEl.classList.add("sq-last-to");
        }
      } else if (state.viewMode === "variation") {
        if (varStep) {
          if (sqName === varStep.from) sqEl.classList.add("sq-last-from");
          if (sqName === varStep.to) sqEl.classList.add("sq-last-to");
          if (varStep.bestFollowUpFrom && sqName === varStep.bestFollowUpFrom) {
            sqEl.classList.add("sq-best-from");
          }
          if (varStep.bestFollowUpTo && sqName === varStep.bestFollowUpTo) {
            sqEl.classList.add("sq-best-to");
          }
        }
      } else if (rec && state.viewMode === "before") {
        if (sqName === rec.from) sqEl.classList.add("sq-mistake-from");
        if (sqName === rec.to) sqEl.classList.add("sq-mistake-to");
        if (rec.bestMoveFrom && sqName === rec.bestMoveFrom) sqEl.classList.add("sq-best-from");
        if (rec.bestMoveTo && sqName === rec.bestMoveTo) sqEl.classList.add("sq-best-to");
      } else if (rec && state.viewMode === "after") {
        if (sqName === rec.from) sqEl.classList.add("sq-last-from");
        if (sqName === rec.to) sqEl.classList.add("sq-last-to");
      }

      if (state.selectedSquare === sqName) {
        sqEl.classList.add("sq-selected");
      }

      const cellPiece = board[boardRow][boardCol];
      if (inCheck && cellPiece && cellPiece.type === "k" && cellPiece.color === turnColor) {
        sqEl.classList.add("sq-check");
      }

      // coordinates live on the rails outside the board — nothing inside the squares

      let inner = "";
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

  renderBoardArrowsAndBadge(rec, varStep, coachStep);
  updatePlayerBars(chess);
}

function renderBoardArrowsAndBadge(rec, varStep, coachStep) {
  boardArrowsSvg.innerHTML = "";
  boardMoveBadge.classList.add("hidden");

  if (state.appMode === "coach") {
    let svg = "";
    if (coachStep && !state.coachDrillVariationMove) {
      svg += buildSvgArrow(coachStep.from, coachStep.to, ARROW_BEST, "arrow-best", false);
    }
    const nextExpected = state.lessonBuiltSteps[state.lessonStepIndex];
    if (nextExpected && (state.coachSubMode === "guided" || state.lessonShowHintArrow)) {
      svg += buildSvgArrow(nextExpected.from, nextExpected.to, ARROW_BEST, "arrow-best", true);
    }
    boardArrowsSvg.innerHTML = svg;
    return;
  }

  // Variation Mode: draw the variation move just played AND the engine's recommended follow-up arrow!
  if (state.viewMode === "variation") {
    let svg = "";
    if (varStep) {
      const meta = CLASSIFICATION_META[varStep.tag] || CLASSIFICATION_META.best;
      svg += buildSvgArrow(varStep.from, varStep.to, meta.color, "arrow-actual", false);

      // Draw Stockfish's recommended follow-up move for the NEXT turn!
      if (varStep.bestFollowUpFrom && varStep.bestFollowUpTo) {
        svg += buildSvgArrow(
          varStep.bestFollowUpFrom,
          varStep.bestFollowUpTo,
          ARROW_BEST,
          "arrow-best",
          true
        );
      }

      if (varStep.analyzed && varStep.to) {
        const { col, row } = squareToBoardCoords(varStep.to, state.boardFlipped);
        boardMoveBadge.style.left = `${((col + 0.82) / 8) * 100}%`;
        boardMoveBadge.style.top = `${((row + 0.18) / 8) * 100}%`;
        boardMoveBadge.style.background = meta.color;
        boardMoveBadge.textContent = varStep.glyph;
        boardMoveBadge.classList.remove("hidden");
      }
    } else if (state.variationBaseEval?.bestMoveUci) {
      const parsed = parseUciMove(state.variationBaseEval.bestMoveUci);
      if (parsed) {
        svg += buildSvgArrow(parsed.from, parsed.to, ARROW_BEST, "arrow-best", true);
      }
    }
    boardArrowsSvg.innerHTML = svg;
    return;
  }

  if (!rec) return;

  let svgContent = "";
  const meta = CLASSIFICATION_META[rec.tag] || CLASSIFICATION_META.good;

  if (rec.from && rec.to) {
    svgContent += buildSvgArrow(rec.from, rec.to, meta.color, "arrow-actual", false);
  }

  if (
    rec.bestMoveFrom &&
    rec.bestMoveTo &&
    (rec.bestMoveFrom !== rec.from || rec.bestMoveTo !== rec.to)
  ) {
    svgContent += buildSvgArrow(
      rec.bestMoveFrom,
      rec.bestMoveTo,
      ARROW_BEST,
      "arrow-best",
      true
    );
  }

  boardArrowsSvg.innerHTML = svgContent;

  if (rec.analyzed && rec.to) {
    const { col, row } = squareToBoardCoords(rec.to, state.boardFlipped);
    boardMoveBadge.style.left = `${((col + 0.82) / 8) * 100}%`;
    boardMoveBadge.style.top = `${((row + 0.18) / 8) * 100}%`;
    boardMoveBadge.style.background = meta.color;
    boardMoveBadge.textContent = rec.glyph;
    boardMoveBadge.classList.remove("hidden");
  }
}

function buildSvgArrow(fromSq, toSq, colorHex, _markerId, isDashed = false) {
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

// ---------- Evaluation Bar & Position Inspector Sync ----------

export function updateEvalBar(whiteCp, whiteMate) {
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
  // the value chip straddles the fill boundary; its colors flip by side
  label.className = `evalbar-label ${pct >= 50 ? "on-white" : "on-dark"}`;
  label.style.bottom = `${Math.max(2, Math.min(98, pct))}%`;
  label.style.top = "auto";
}

function updatePlayerBars(chessInst) {
  const topIsBlack = !state.boardFlipped;
  const topInfo = topIsBlack ? state.blackPlayer : state.whitePlayer;
  const bottomInfo = topIsBlack ? state.whitePlayer : state.blackPlayer;
  const topColor = topIsBlack ? "b" : "w";
  const bottomColor = topIsBlack ? "w" : "b";

  topPlayerName.textContent = topInfo.username || (topColor === "w" ? "White" : "Black");
  topPlayerRating.textContent = topInfo.rating ? `(${topInfo.rating})` : "";
  topPlayerColorDot.className = `player-color-swatch color-${topColor}`;
  if (topPlayerYouTag) {
    topPlayerYouTag.classList.toggle("hidden", state.myColor !== topColor);
  }

  bottomPlayerName.textContent =
    bottomInfo.username || (bottomColor === "w" ? "White" : "Black");
  bottomPlayerRating.textContent = bottomInfo.rating ? `(${bottomInfo.rating})` : "";
  bottomPlayerColorDot.className = `player-color-swatch color-${bottomColor}`;
  if (bottomPlayerYouTag) {
    bottomPlayerYouTag.classList.toggle("hidden", state.myColor !== bottomColor);
  }

  const topMatDiff = materialBalance(chessInst, topColor);
  const bottomMatDiff = materialBalance(chessInst, bottomColor);
  topPlayerMaterial.textContent = topMatDiff > 0 ? `+${topMatDiff}` : "";
  topPlayerMaterial.style.display = topMatDiff > 0 ? "inline-block" : "none";
  bottomPlayerMaterial.textContent = bottomMatDiff > 0 ? `+${bottomMatDiff}` : "";
  bottomPlayerMaterial.style.display = bottomMatDiff > 0 ? "inline-block" : "none";
}

function renderVariationTrailUI() {
  if (!variationTrailWrap || !variationTrail) return;
  if (state.viewMode !== "variation" || state.variationStack.length === 0) {
    variationTrailWrap.classList.add("hidden");
    variationTrail.innerHTML = "";
    return;
  }

  variationTrailWrap.classList.remove("hidden");
  variationTrail.innerHTML = "";

  const baseBtn = document.createElement("button");
  baseBtn.type = "button";
  baseBtn.className =
    "trail-step-btn" + (state.variationCursor === 0 ? " active" : "");
  baseBtn.textContent = `Branch (Ply ${state.variationBasePly})`;
  baseBtn.addEventListener("click", () => jumpToVariationCursor(0));
  variationTrail.appendChild(baseBtn);

  state.variationStack.forEach((step, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "trail-step-btn" + (state.variationCursor === idx + 1 ? " active" : "");
    const prefix =
      step.color === "w"
        ? `${step.moveNumber}.`
        : idx === 0
        ? `${step.moveNumber}...`
        : "";
    btn.textContent = `${prefix}${step.san} ${step.analyzed ? step.glyph : ""}`.trim();
    btn.addEventListener("click", () => jumpToVariationCursor(idx + 1));
    variationTrail.appendChild(btn);
  });
}

function refreshBoardAndDetails() {
  const displayedFen = getDisplayedFen();
  renderBoardPosition(displayedFen);
  renderVariationTrailUI();
  document.body.dataset.flipped = state.boardFlipped ? "1" : "0";

  if (state.appMode === "coach") {
    boardModeBadge.className = "state-pill state-variation";
    boardModeBadge.textContent =
      state.coachSubMode === "drill" ? "Opening drill" : "Opening walkthrough";
    boardPositionStatus.textContent = `Step ${state.lessonStepIndex} / ${state.lessonBuiltSteps.length}`;
    btnToggleBeforeAfter.disabled = true;
    btnPreviewBest.disabled = true;
    btnStepPv.disabled = true;
    btnReturnGame.classList.add("hidden");
    return;
  }

  const chess = new Chess(displayedFen);
  let statusSuffix = "";
  if (chess.isCheckmate()) statusSuffix = ", checkmate";
  else if (chess.isStalemate()) statusSuffix = ", stalemate";
  else if (chess.isDraw()) statusSuffix = ", draw";
  else if (chess.inCheck()) statusSuffix = ", check";

  detailFenTurn.textContent =
    (chess.turn() === "w" ? "White to move" : "Black to move") + statusSuffix;

  // Transport controls state
  btnFirst.disabled = state.selectedPly <= 0 && state.viewMode !== "variation";
  btnPrev.disabled = state.selectedPly <= 0 && state.viewMode !== "variation";
  btnNext.disabled =
    state.selectedPly >= state.records.length &&
    state.viewMode !== "variation";
  btnLast.disabled =
    state.selectedPly >= state.records.length &&
    state.viewMode !== "variation";

  // CASE 1: Exploring a custom or recommended variation line!
  if (state.viewMode === "variation") {
    const varStep = getCurrentVariationStep();
    boardModeBadge.className = "state-pill state-variation";
    boardModeBadge.textContent = `Variation (${state.variationCursor}/${state.variationStack.length})`;
    btnToggleBeforeAfter.disabled = true;
    btnPreviewBest.disabled = true;
    btnReturnGame.classList.remove("hidden");

    if (!varStep) {
      // Cursor is at 0 (the branch base position before the first variation move)
      boardPositionStatus.textContent = `Branch start (use Next ▶ to step into variation)`;
      btnStepPv.disabled = false;
      setButtonTip(btnStepPv, "Step forward in variation");
      updateEvalBar(state.variationBaseEval.whiteCp, state.variationBaseEval.whiteMate);
      detailMoveTitle.textContent = `Variation branch point`;
      detailMoveBadge.className = "verdict-pill tag-forced";
      detailMoveBadge.textContent = "Branch";
      detailExplanation.textContent =
        "You stepped back to the start of your variation. Press Next (▶) to step forward through your variation moves, play a different move on the board, or click Return to game.";
      setMarquee("Variation", "You stepped back to the start of your variation.");
      return;
    }

    boardPositionStatus.textContent = `Variation step ${state.variationCursor} of ${state.variationStack.length}`;
    updateEvalBar(varStep.whiteCpAfter, varStep.whiteMateAfter);

    const canFollowUp = Boolean(
      state.variationCursor < state.variationStack.length || varStep.bestFollowUpUci
    );
    btnStepPv.disabled = !canFollowUp;
    if (state.variationCursor < state.variationStack.length) {
      const nextRecorded = state.variationStack[state.variationCursor];
      setButtonTip(btnStepPv, `Next variation move (${nextRecorded.san})`);
    } else if (varStep.bestFollowUpSan) {
      setButtonTip(btnStepPv, `Play best follow-up (${varStep.bestFollowUpSan})`);
    } else {
      setButtonTip(btnStepPv, "Play best follow-up");
    }

    const moveLabel =
      varStep.color === "w"
        ? `${varStep.moveNumber}. ${varStep.san}`
        : `${varStep.moveNumber}... ${varStep.san}`;
    detailMoveTitle.textContent = `Variation: ${moveLabel}`;
    detailMoveBadge.className = `verdict-pill bg-${varStep.tag}`;
    detailMoveBadge.textContent = `${varStep.glyph} ${varStep.label}`;
    detailExplanation.textContent = varStep.explanation;
    setMarquee(
      "Variation",
      `${moveLabel} · ${varStep.explanation || "Exploring the engine line."}`
    );

    const wDelta = (varStep.winDelta >= 0 ? "+" : "") + varStep.winDelta.toFixed(1);
    detailWinProb.textContent = `${wDelta}% win`;

    if (detailBestMoveLabel) {
      detailBestMoveLabel.textContent = "Best next move";
    }
    detailBestMove.textContent = varStep.bestFollowUpSan || "Analyzing…";
    detailMoveAcc.textContent = varStep.analyzed ? `${varStep.moveAccuracy}%` : "…";

    if (detailPvLabel) {
      detailPvLabel.textContent = "Engine line";
    }
    if (varStep.pvSteps && varStep.pvSteps.length > 0) {
      detailPvLine.innerHTML = "";
      const shownSteps = varStep.pvSteps.slice(0, 6);
      shownSteps.forEach((step, idx) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "pv-chip";
        const numPrefix =
          step.color === "w"
            ? `${step.moveNumber}.`
            : idx === 0
            ? `${step.moveNumber}...`
            : "";
        chip.textContent = `${numPrefix}${step.san}`;
        chip.title = `Click to play ${step.san} on the variation board`;
        chip.addEventListener("click", () => {
          stopAutoPlay();
          jumpToPvStep(idx);
        });
        detailPvLine.appendChild(chip);
      });
      if (varStep.pvSteps.length > shownSteps.length) {
        const more = document.createElement("span");
        more.className = "pv-more";
        more.textContent = "…";
        detailPvLine.appendChild(more);
      }
    } else {
      detailPvLine.innerHTML = `<span class="text-muted">${
        varStep.analyzed ? "Game over / no legal moves" : "Calculating follow-up line…"
      }</span>`;
    }
    return;
  }

  // CASE 2: Starting Position (Ply 0)
  if (state.selectedPly <= 0) {
    boardModeBadge.className = "state-pill state-game";
    boardModeBadge.textContent = "Game line";
    boardPositionStatus.textContent = `Start position (0 / ${state.records.length})`;
    btnToggleBeforeAfter.disabled = true;
    btnPreviewBest.disabled = true;
    btnStepPv.disabled = true;
    btnReturnGame.classList.add("hidden");

    updateEvalBar(state.startPositionEval.whiteCp, state.startPositionEval.whiteMate);
    detailMoveTitle.textContent = "Starting position";
    detailMoveBadge.className = "verdict-pill tag-forced hidden";
    detailMoveBadge.textContent = "";
    detailExplanation.textContent =
      state.records.length > 0
        ? "Step through the game with the arrow keys, or click any move in the list."
        : "Load a game, paste a PGN, or open the sample game.";
    detailWinProb.textContent = "—";
    if (detailBestMoveLabel) detailBestMoveLabel.textContent = "Best move";
    detailBestMove.textContent = state.startPositionEval.bestMove || "e2e4";
    detailMoveAcc.textContent = "—";
    setMarquee(
      "—",
      state.records.length > 0
        ? "Step through the game with the arrow keys, or click any move in the list."
        : "Open a game to see every move graded."
    );
    detailPvLine.innerHTML = `<span class="text-muted">No line yet.</span>`;
    return;
  }

  // CASE 3: Selected Game Move (Ply 1..N)
  const rec = state.records[state.selectedPly - 1];
  if (!rec) return;

  btnToggleBeforeAfter.disabled = false;
  setButtonTip(
    btnToggleBeforeAfter,
    state.viewMode === "before" ? `Show played move (${rec.san})` : "View before move"
  );

  const hasBestMove = Boolean(rec.bestMoveUci);
  btnPreviewBest.disabled = !hasBestMove;
  setButtonTip(
    btnPreviewBest,
    rec.bestMoveSan ? `Play recommended (${rec.bestMoveSan})` : "Play recommended"
  );
  btnStepPv.disabled = !rec.pvSteps || rec.pvSteps.length === 0;
  setButtonTip(btnStepPv, "Play best follow-up");

  if (state.viewMode === "before") {
    boardModeBadge.className = "state-pill state-before-mistake";
    boardModeBadge.textContent = `Before ${rec.moveNumber}${
      rec.color === "w" ? "." : "..."
    } ${rec.san}`;
    boardPositionStatus.textContent = `Pre-move position (Ply ${rec.ply} / ${state.records.length})`;
    btnReturnGame.classList.remove("hidden");
    updateEvalBar(rec.whiteCpBefore, rec.whiteMateBefore);
  } else {
    boardModeBadge.className = "state-pill state-game";
    boardModeBadge.textContent = "Game line";
    boardPositionStatus.textContent = `Move ${rec.ply} / ${state.records.length}`;
    btnReturnGame.classList.add("hidden");
    updateEvalBar(rec.whiteCpAfter, rec.whiteMateAfter);
  }

  const moveLabel =
    rec.color === "w"
      ? `${rec.moveNumber}. ${rec.san}`
      : `${rec.moveNumber}... ${rec.san}`;
  const playerOwner =
    rec.color === state.myColor
      ? "You"
      : rec.color === "w"
      ? state.whitePlayer.username
      : state.blackPlayer.username;
  detailMoveTitle.textContent = `${moveLabel} · ${playerOwner}`;
  detailMoveBadge.className = `verdict-pill bg-${rec.tag}`;
  detailMoveBadge.textContent = `${rec.glyph} ${rec.label}`;
  detailExplanation.textContent = rec.explanation;
  setMarquee(
    rec.label,
    `move ${rec.moveNumber} · ${moveLabel} · ${rec.explanation}`,
    rec.tag
  );

  const wDelta = (rec.winDelta >= 0 ? "+" : "") + rec.winDelta.toFixed(1);
  detailWinProb.textContent = `${wDelta}% win`;

  if (detailBestMoveLabel) {
    detailBestMoveLabel.textContent = "Best move";
  }
  detailBestMove.textContent = rec.bestMoveSan || rec.bestMoveUci || "—";
  detailMoveAcc.textContent = `${rec.moveAccuracy}%`;

  if (detailPvLabel) {
    detailPvLabel.textContent = "Engine line";
  }
  if (rec.pvSteps && rec.pvSteps.length > 0) {
    detailPvLine.innerHTML = "";
    const shownSteps = rec.pvSteps.slice(0, 6);
    shownSteps.forEach((step, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "pv-chip";
      const numPrefix =
        step.color === "w" ? `${step.moveNumber}.` : idx === 0 ? `${step.moveNumber}...` : "";
      chip.textContent = `${numPrefix}${step.san}`;
      chip.title = `Click to play variation up to ${step.san}`;
      chip.addEventListener("click", () => {
        stopAutoPlay();
        jumpToPvStep(idx);
      });
      detailPvLine.appendChild(chip);
    });
    if (rec.pvSteps.length > shownSteps.length) {
      const more = document.createElement("span");
      more.className = "pv-more";
      more.textContent = "…";
      detailPvLine.appendChild(more);
    }
  } else {
    detailPvLine.innerHTML = `<span class="text-muted">${escapeHtml(rec.bestMoveSan || "—")}</span>`;
  }
}

// ---------- Summary Metrics, Estimated Elo & Side-by-Side Comparison ----------

let summaryUpdateTimer = 0;

function scheduleSummaryUpdate() {
  if (summaryUpdateTimer) return;
  summaryUpdateTimer = setTimeout(() => {
    summaryUpdateTimer = 0;
    updateSummaryMetrics();
  }, 180);
}

function flushSummaryUpdate() {
  if (summaryUpdateTimer) {
    clearTimeout(summaryUpdateTimer);
    summaryUpdateTimer = 0;
  }
  updateSummaryMetrics();
}

function updateSummaryMetrics() {
  const analyzed = state.records.filter((r) => r.analyzed);
  const comparison = buildPlayerComparison(analyzed, {
    whiteName: state.whitePlayer.username || "White",
    blackName: state.blackPlayer.username || "Black",
    whiteRating: state.whitePlayer.rating,
    blackRating: state.blackPlayer.rating,
    myColor: state.myColor,
  });
  state.comparison = comparison;

  const w = comparison.white;
  const b = comparison.black;
  const me = comparison.me;

  const topIsBlack = !state.boardFlipped;
  const topStats = topIsBlack ? b : w;
  const bottomStats = topIsBlack ? w : b;

  topPlayerAcc.textContent = topStats.totalMoves ? `Acc ${topStats.accuracy}%` : "";
  bottomPlayerAcc.textContent = bottomStats.totalMoves
    ? `Acc ${bottomStats.accuracy}%`
    : "";
  if (topPlayerElo) {
    topPlayerElo.textContent = topStats.totalMoves ? `Est. ${topStats.estimatedElo}` : "";
  }
  if (bottomPlayerElo) {
    bottomPlayerElo.textContent = bottomStats.totalMoves
      ? `Est. ${bottomStats.estimatedElo}`
      : "";
  }

  if (headToHeadBanner) {
    headToHeadBanner.textContent = comparison.headToHeadVerdict;
  }

  if (cmpWhiteName) {
    cmpWhiteName.textContent = `${w.name}${w.rating ? ` (${w.rating})` : ""}`;
  }
  if (cmpBlackName) {
    cmpBlackName.textContent = `${b.name}${b.rating ? ` (${b.rating})` : ""}`;
  }
  if (cmpWhiteYou) cmpWhiteYou.classList.toggle("hidden", !w.isMe);
  if (cmpBlackYou) cmpBlackYou.classList.toggle("hidden", !b.isMe);

  if (cmpWhiteAcc) cmpWhiteAcc.textContent = w.totalMoves ? `${w.accuracyExact}%` : "—";
  if (cmpBlackAcc) cmpBlackAcc.textContent = b.totalMoves ? `${b.accuracyExact}%` : "—";

  if (cmpWhiteElo) cmpWhiteElo.textContent = w.totalMoves ? `${w.estimatedElo}` : "—";
  if (cmpBlackElo) cmpBlackElo.textContent = b.totalMoves ? `${b.estimatedElo}` : "—";
  if (cmpWhiteTier) cmpWhiteTier.textContent = w.totalMoves ? w.tier : "";
  if (cmpBlackTier) cmpBlackTier.textContent = b.totalMoves ? b.tier : "";

  if (cmpWhiteAcpl) cmpWhiteAcpl.textContent = w.totalMoves ? `${w.acpl} cp` : "—";
  if (cmpBlackAcpl) cmpBlackAcpl.textContent = b.totalMoves ? `${b.acpl} cp` : "—";

  const fmtPhases = (ph) =>
    [ph.opening, ph.middlegame, ph.endgame]
      .map((v) => (v !== null ? `${v}%` : "—"))
      .join(" / ");
  if (cmpWhitePhase) cmpWhitePhase.textContent = w.totalMoves ? fmtPhases(w.phaseAcc) : "—";
  if (cmpBlackPhase) cmpBlackPhase.textContent = b.totalMoves ? fmtPhases(b.phaseAcc) : "—";

  if (whiteFeedbackTitle) {
    whiteFeedbackTitle.textContent = `${w.name} ${w.isMe ? "(You)" : "(Opponent)"}`;
  }
  if (whiteFeedbackText) {
    whiteFeedbackText.textContent = w.coachFeedback.replace(/\*\*/g, "");
  }
  if (blackFeedbackTitle) {
    blackFeedbackTitle.textContent = `${b.name} ${b.isMe ? "(You)" : "(Opponent)"}`;
  }
  if (blackFeedbackText) {
    blackFeedbackText.textContent = b.coachFeedback.replace(/\*\*/g, "");
  }

  if (me.notes && me.notes.length > 0) {
    playstyleEl.textContent = `Playstyle: ${me.notes.join(", ")}.`;
  } else {
    playstyleEl.textContent = "";
  }

  renderSideBySideClassificationRows(w.counts, b.counts);
  updatePersonalizedCoachPlanUI();
}

function renderSideBySideClassificationRows(countsW, countsB) {
  if (!classificationGrid) return;
  const ordered = Object.values(CLASSIFICATION_META).sort((a, b) => a.order - b.order);

  classificationGrid.innerHTML = ordered
    .map(
      (meta) => `
      <div class="sbs-cls-row" data-tag="${meta.tag}">
        <div class="sbs-val-left">
          <button type="button" class="sbs-count-btn tag-${meta.tag}" data-color="w" data-tag="${meta.tag}" title="Inspect White's ${meta.label} moves">
            ${countsW[meta.tag] || 0}
          </button>
        </div>
        <div class="sbs-cls-center tag-${meta.tag}">
          <span class="move-glyph-badge bg-${meta.tag}">${meta.glyph}</span>
          <span>${meta.label}</span>
        </div>
        <div class="sbs-val-right">
          <button type="button" class="sbs-count-btn tag-${meta.tag}" data-color="b" data-tag="${meta.tag}" title="Inspect Black's ${meta.label} moves">
            ${countsB[meta.tag] || 0}
          </button>
        </div>
      </div>
    `
    )
    .join("");

  classificationGrid.querySelectorAll(".sbs-count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = btn.getAttribute("data-color");
      const tag = btn.getAttribute("data-tag");
      const firstMatch = state.records.find((r) => r.color === color && r.tag === tag);
      if (firstMatch) {
        stopAutoPlay();
        selectMovePly(firstMatch.ply);
      }
    });
  });
}

// ---------- Move History Rendering ----------

function matchesFilter(rec) {
  if (!rec) return false;

  if (state.playerFilter === "me" && rec.color !== state.myColor) return false;
  if (state.playerFilter === "opponent" && rec.color === state.myColor) return false;
  if (state.playerFilter === "w" && rec.color !== "w") return false;
  if (state.playerFilter === "b" && rec.color !== "b") return false;

  if (state.activeFilter === "all") return true;
  if (state.activeFilter === "critical") {
    return (
      rec.tag === "blunder" ||
      rec.tag === "mistake" ||
      rec.tag === "inaccuracy"
    );
  }
  if (state.activeFilter === "highlights") {
    return (
      rec.tag === "brilliant" ||
      rec.tag === "great" ||
      rec.tag === "best"
    );
  }
  return rec.tag === state.activeFilter;
}

// ---------- Evaluation timeline ----------

const EVAL_GRAPH_W = 1000;
const EVAL_GRAPH_H = 100;
const EVAL_GRAPH_CLAMP = 800;
const EVAL_GRAPH_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"];

const moveCellByPly = new Map();
const moveRowByPly = new Map();

let evalGraphFrame = 0;
let evalGraphRect = null;

function scheduleEvalGraph() {
  if (!evalGraphEl || evalGraphFrame) return;
  evalGraphFrame = requestAnimationFrame(() => {
    evalGraphFrame = 0;
    renderEvalGraph();
  });
}

function graphScale(records, startEval) {
  let maxAbs = Math.abs(startEval.whiteCp || 0);
  let hasMate = startEval.whiteMate !== null && startEval.whiteMate !== undefined;
  for (const rec of records) {
    if (rec.whiteMate !== null && rec.whiteMate !== undefined) hasMate = true;
    const abs = Math.abs(rec.whiteCpAfter || 0);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (hasMate) return EVAL_GRAPH_CLAMP;
  return Math.min(EVAL_GRAPH_CLAMP, Math.max(200, Math.ceil(maxAbs / 100) * 100));
}

function evalGraphY(cp, mate, scale) {
  if (mate !== null && mate !== undefined) {
    return mate > 0 ? 4 : EVAL_GRAPH_H - 4;
  }
  const limit = scale || EVAL_GRAPH_CLAMP;
  const clamped = Math.max(-limit, Math.min(limit, cp || 0));
  return EVAL_GRAPH_H / 2 - (clamped / limit) * (EVAL_GRAPH_H / 2 - 4);
}

function graphPlyLabel(ply) {
  if (ply === 0) return "Starting position";
  const rec = state.records[ply - 1];
  if (!rec) return "Move " + ply;
  if (ply === 1) return "1. " + rec.san;
  return rec.moveNumber + (rec.color === "w" ? "." : "...") + " " + rec.san;
}

function renderEvalGraph() {
  if (!evalGraphEl || !evalGraphSvg) return;

  const total = state.records.length;
  const selected = Math.min(state.selectedPly, total);

  evalGraphEl.setAttribute("aria-valuemax", String(total));
  evalGraphEl.setAttribute("aria-valuenow", String(selected));

  if (total === 0) {
    evalGraphSvg.innerHTML = "";
    if (evalGraphValue) evalGraphValue.textContent = "\u2014";
    if (evalGraphMid) evalGraphMid.textContent = "\u2014";
    if (evalGraphEnd) evalGraphEnd.textContent = "\u2014";
    evalGraphEl.setAttribute("aria-valuetext", "No game loaded");
    return;
  }

  const stepX = EVAL_GRAPH_W / total;
  const startEval = state.startPositionEval;
  const scale = graphScale(state.records, startEval);
  const points = [[0, evalGraphY(startEval.whiteCp, startEval.whiteMate, scale)]];
  const marks = [];

  state.records.forEach((rec, index) => {
    const x = (index + 1) * stepX;
    const y = evalGraphY(rec.whiteCpAfter, rec.whiteMateAfter, scale);
    points.push([x, y]);
    const isEvent = rec.tag === "inaccuracy" || rec.tag === "mistake" || rec.tag === "blunder";
    if (rec.analyzed && isEvent) {
      marks.push(
        '<line class="evalgraph-mark tag-' +
          rec.tag +
          '" x1="' +
          x.toFixed(1) +
          '" x2="' +
          x.toFixed(1) +
          '" y1="' +
          (y - 4).toFixed(1) +
          '" y2="' +
          (y + 4).toFixed(1) +
          '" />'
      );
    }
  });

  const line = points
    .map(([x, y], index) => (index === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1))
    .join(" ");
  const area = line + " L" + EVAL_GRAPH_W + "," + EVAL_GRAPH_H / 2 + " L0," + EVAL_GRAPH_H / 2 + " Z";
  const cursorX = (selected * stepX).toFixed(1);

  evalGraphSvg.innerHTML =
    '<path class="evalgraph-area" d="' + area + '" />' +
    '<line class="evalgraph-zero" x1="0" y1="' + EVAL_GRAPH_H / 2 + '" x2="' + EVAL_GRAPH_W + '" y2="' + EVAL_GRAPH_H / 2 + '" />' +
    '<path class="evalgraph-line" d="' + line + '" />' +
    marks.join("") +
    '<line class="evalgraph-cursor" x1="' + cursorX + '" x2="' + cursorX + '" y1="2" y2="' + (EVAL_GRAPH_H - 2) + '" />';

  const rec = selected > 0 ? state.records[selected - 1] : null;
  const evalStr = rec
    ? rec.evalAfterStr
    : formatEvalScore(startEval.whiteCp, startEval.whiteMate);
  if (evalGraphValue) evalGraphValue.textContent = evalStr;

  const grade = rec && rec.analyzed ? ", " + rec.label : "";
  evalGraphEl.setAttribute(
    "aria-valuetext",
    graphPlyLabel(selected) + ", evaluation " + evalStr + grade
  );

  const totalMoves = Math.ceil(total / 2);
  if (evalGraphMid) evalGraphMid.textContent = String(Math.max(2, Math.ceil(totalMoves / 2)));
  if (evalGraphEnd) evalGraphEnd.textContent = String(totalMoves);
}

function jumpToError(direction) {
  const errors = state.records.filter(
    (r) => r.analyzed && (r.tag === "inaccuracy" || r.tag === "mistake" || r.tag === "blunder")
  );
  if (errors.length === 0) return;

  if (direction > 0) {
    const next = errors.find((r) => r.ply > state.selectedPly) || errors[0];
    selectMovePly(next.ply);
  } else {
    const previous = errors.filter((r) => r.ply < state.selectedPly).pop() || errors[errors.length - 1];
    selectMovePly(previous.ply);
  }
}

function graphPlyFromEvent(event) {
  if (!evalGraphEl || state.records.length === 0) return 0;
  const rect = evalGraphRect || evalGraphEl.getBoundingClientRect();
  if (!rect.width) return 0;
  const ratio = (event.clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(state.records.length, Math.round(ratio * state.records.length)));
}

function showEvalGraphTip(ply, clientX) {
  if (!evalGraphTip || !evalGraphEl || state.records.length === 0) return;
  const rec = ply > 0 ? state.records[ply - 1] : null;
  const evalStr = rec
    ? rec.evalAfterStr
    : formatEvalScore(state.startPositionEval.whiteCp, state.startPositionEval.whiteMate);
  const grade = rec && rec.analyzed ? " \u00b7 " + rec.label : "";
  evalGraphTip.textContent = graphPlyLabel(ply) + " \u00b7 " + evalStr + grade;

  const rect = evalGraphRect || evalGraphEl.getBoundingClientRect();
  let x =
    clientX === undefined
      ? (ply / Math.max(1, state.records.length)) * rect.width
      : clientX - rect.left;
  x = Math.max(56, Math.min(rect.width - 56, x));
  evalGraphTip.style.left = x + "px";
  evalGraphTip.classList.remove("hidden");
}

function hideEvalGraphTip() {
  if (evalGraphTip) evalGraphTip.classList.add("hidden");
}

function bindEvalGraphEvents() {
  if (!evalGraphEl) return;

  evalGraphEl.addEventListener("pointerenter", () => {
    evalGraphRect = evalGraphEl.getBoundingClientRect();
  });
  evalGraphEl.addEventListener("pointermove", (event) => {
    showEvalGraphTip(graphPlyFromEvent(event), event.clientX);
  });
  evalGraphEl.addEventListener("pointerleave", () => {
    evalGraphRect = null;
    hideEvalGraphTip();
  });
  window.addEventListener("resize", () => {
    evalGraphRect = null;
  });
  evalGraphEl.addEventListener("click", (event) => {
    stopAutoPlay();
    selectMovePly(graphPlyFromEvent(event));
  });
  evalGraphEl.addEventListener("focus", () => {
    showEvalGraphTip(Math.min(state.selectedPly, state.records.length));
  });
  evalGraphEl.addEventListener("blur", hideEvalGraphTip);
  evalGraphEl.addEventListener("keydown", (event) => {
    if (!EVAL_GRAPH_KEYS.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    stopAutoPlay();
    if (event.key === "ArrowLeft") selectMovePly(state.selectedPly - 1);
    else if (event.key === "ArrowRight") selectMovePly(state.selectedPly + 1);
    else if (event.key === "Home") selectMovePly(0);
    else if (event.key === "End") selectMovePly(state.records.length);
    showEvalGraphTip(Math.min(state.selectedPly, state.records.length));
  });
}

function renderMoveHistoryViews() {
  renderPairedMoveList();
  renderDetailedMoveTable();
  scheduleEvalGraph();
}

function renderPairedMoveList() {
  if (!moveListGrid) return;
  if (state.records.length === 0) {
    moveCellByPly.clear();
    moveListGrid.innerHTML = `<div class="empty-state-msg">No game moves loaded yet.</div>`;
    return;
  }

  moveListGrid.innerHTML = "";
  moveCellByPly.clear();
  const totalMoves = Math.ceil(state.records.length / 2);

  for (let m = 1; m <= totalMoves; m++) {
    const whiteRec = state.records[(m - 1) * 2] || null;
    const blackRec = state.records[(m - 1) * 2 + 1] || null;

    if (!matchesFilter(whiteRec) && !matchesFilter(blackRec)) {
      continue;
    }

    const row = document.createElement("div");
    row.className = "move-pair-row";

    const numCell = document.createElement("div");
    numCell.className = "move-pair-num";
    numCell.textContent = `${m}.`;
    row.appendChild(numCell);

    row.appendChild(createMoveCellElement(matchesFilter(whiteRec) ? whiteRec : null));
    row.appendChild(createMoveCellElement(matchesFilter(blackRec) ? blackRec : null));

    moveListGrid.appendChild(row);
  }
}

function moveCellMarkup(rec) {
  const badgeHtml = rec.analyzed
    ? `<span class="move-glyph-badge tag-${rec.tag}" title="${escapeHtml(rec.label)}">${escapeHtml(rec.glyph)}</span>`
    : `<span class="text-muted">\u2026</span>`;
  const evalHtml = rec.analyzed
    ? `<span class="text-muted">${escapeHtml(rec.evalAfterStr)}</span>`
    : "";
  return `<span class="move-cell-san tag-${rec.tag}">${escapeHtml(rec.san)}</span>` +
    `<span class="move-cell-meta">${evalHtml}${badgeHtml}</span>`;
}

function updateMoveCellElement(cell, rec) {
  cell.className = "move-cell" + (state.selectedPly === rec.ply ? " selected" : "");
  cell.innerHTML = moveCellMarkup(rec);
}

function updateAnalyzedMoveInLists(rec) {
  const cell = moveCellByPly.get(rec.ply);
  if (cell) updateMoveCellElement(cell, rec);

  const row = moveRowByPly.get(rec.ply);
  if (row) {
    row.className = state.selectedPly === rec.ply ? "selected" : "";
    row.innerHTML = moveTableRowMarkup(rec);
  }
}

function createMoveCellElement(rec) {
  const cell = document.createElement("div");
  cell.className = "move-cell";
  if (!rec) {
    cell.innerHTML = `<span class="text-muted">—</span>`;
    return cell;
  }

  cell.setAttribute("data-ply", String(rec.ply));
  cell.setAttribute("tabindex", "0");
  moveCellByPly.set(rec.ply, cell);
  if (state.selectedPly === rec.ply) {
    cell.classList.add("selected");
  }

  cell.innerHTML = moveCellMarkup(rec);

  const onSelect = () => {
    stopAutoPlay();
    selectMovePly(rec.ply);
  };
  cell.addEventListener("click", onSelect);
  cell.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  });

  return cell;
}

function moveTableRowMarkup(r) {
  const moveLabel =
    r.color === "w" ? `${r.moveNumber}. ${r.san}` : `${r.moveNumber}... ${r.san}`;
  const whoLabel = r.color === state.myColor ? "You" : "Opp";
  const winDeltaStr = (r.winDelta >= 0 ? "+" : "") + r.winDelta.toFixed(1) + "%";
  const bestAlt =
    r.bestMoveSan && r.bestMoveSan !== r.san
      ? `${r.bestMoveSan} (${r.bestMoveUci})`
      : r.bestMoveSan || r.bestMoveUci || "\u2014";

  return `
    <td>${r.ply}</td>
    <td>${escapeHtml(whoLabel)} (${r.color === "w" ? "W" : "B"})</td>
    <td class="tag-${r.tag}"><b>${escapeHtml(moveLabel)}</b></td>
    <td class="tag-${r.tag}">${escapeHtml(r.glyph)} ${escapeHtml(r.label)}</td>
    <td>${escapeHtml(r.evalBeforeStr)} \u2192 ${escapeHtml(r.evalAfterStr)}</td>
    <td>${escapeHtml(winDeltaStr)}</td>
    <td>${escapeHtml(bestAlt)}</td>
  `;
}

function renderDetailedMoveTable() {
  if (!moveTableBody) return;
  moveTableBody.innerHTML = "";
  moveRowByPly.clear();

  for (const r of state.records) {
    if (!matchesFilter(r)) continue;
    const tr = document.createElement("tr");
    tr.setAttribute("data-ply", String(r.ply));
    if (state.selectedPly === r.ply) {
      tr.classList.add("selected");
    }

    tr.innerHTML = moveTableRowMarkup(r);

    tr.addEventListener("click", () => {
      stopAutoPlay();
      selectMovePly(r.ply);
    });

    moveRowByPly.set(r.ply, tr);
    moveTableBody.appendChild(tr);
  }
}

function highlightSelectedMoveInHistory() {
  document.querySelectorAll("[data-ply]").forEach((el) => {
    const p = parseInt(el.getAttribute("data-ply"), 10);
    if (p === state.selectedPly) {
      el.classList.add("selected");
      el.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    } else {
      el.classList.remove("selected");
    }
  });
}

// ---------- Opening Studio & Tactical Coach ----------

function initCoachTrainerUI() {
  renderOpeningLessonCards();
  renderTacticalGuides();

  document.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.lessonCategoryFilter = btn.getAttribute("data-cat") || "all";
      renderOpeningLessonCards();
    });
  });

  if (btnCoachModeGuided) {
    btnCoachModeGuided.addEventListener("click", () => {
      selectOpeningLesson(state.activeLessonId, { subMode: "guided" });
    });
  }
  if (btnCoachModeDrill) {
    btnCoachModeDrill.addEventListener("click", () => {
      selectOpeningLesson(state.activeLessonId, { subMode: "drill" });
    });
  }

  if (btnLessonReset) {
    btnLessonReset.addEventListener("click", () => {
      selectOpeningLesson(state.activeLessonId, { subMode: state.coachSubMode });
    });
  }
  if (btnLessonPrev) {
    btnLessonPrev.addEventListener("click", () => {
      setLessonStep(Math.max(0, state.lessonStepIndex - 1));
    });
  }
  if (btnLessonNext) {
    btnLessonNext.addEventListener("click", () => {
      setLessonStep(Math.min(state.lessonBuiltSteps.length, state.lessonStepIndex + 1));
    });
  }
  if (btnLessonHint) {
    btnLessonHint.addEventListener("click", () => {
      state.lessonShowHintArrow = true;
      const expected = state.lessonBuiltSteps[state.lessonStepIndex];
      if (expected) {
        coachStepComment.textContent = `Hint: Play ${expected.moveNumber}${
          expected.color === "w" ? "." : "..."
        } ${expected.san} (${expected.from} → ${expected.to}) — ${expected.comment}`;
      }
      refreshBoardAndDetails();
    });
  }

  if (btnJumpWorstMove) {
    btnJumpWorstMove.addEventListener("click", () => {
      if (state.coachPlan?.worstMovePly) {
        switchPlatformMode("review");
        selectMovePly(state.coachPlan.worstMovePly);
      }
    });
  }

  selectOpeningLesson(state.activeLessonId, { subMode: "guided", skipBoardRender: true });
}

function updatePersonalizedCoachPlanUI() {
  const panel = document.getElementById("takeawaysPanel");
  const hasAnalysis = (state.records || []).some((r) => r.analyzed);
  if (panel) panel.classList.toggle("hidden", !hasAnalysis);

  const plan = generatePersonalizedCoachPlan(
    state.comparison,
    state.records,
    state.opening
  );
  state.coachPlan = plan;

  if (coachPlanHeadline) {
    coachPlanHeadline.textContent = plan.headline;
  }
  if (coachPlanTips) {
    coachPlanTips.innerHTML = plan.tips
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
  }
  if (btnJumpWorstMove) {
    btnJumpWorstMove.classList.toggle("hidden", !plan.worstMovePly);
  }
}

function renderOpeningLessonCards() {
  if (!openingLessonsGrid) return;
  const filtered = OPENING_LESSONS.filter(
    (l) =>
      state.lessonCategoryFilter === "all" ||
      l.category === state.lessonCategoryFilter
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
      if (id) selectOpeningLesson(id, { subMode: state.coachSubMode });
    });
  });
}

export function selectOpeningLesson(lessonId, options = {}) {
  const lesson =
    OPENING_LESSONS.find((l) => l.id === lessonId) || OPENING_LESSONS[0];
  state.activeLessonId = lesson.id;
  state.coachSubMode = options.subMode || state.coachSubMode || "guided";
  state.lessonShowHintArrow = false;
  state.coachDrillVariationFen = null;
  state.coachDrillVariationMove = null;
  state.selectedSquare = null;
  state.legalTargetsForSelected = [];

  const temp = new Chess();
  const built = [];
  for (let i = 0; i < lesson.steps.length; i++) {
    const rawStep = lesson.steps[i];
    const beforeFen = temp.fen();
    const moveNumber = temp.moveNumber();
    const color = temp.turn();
    const moved = temp.move(rawStep.san, { strict: false });
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
      comment: rawStep.comment,
    });
  }
  state.lessonBuiltSteps = built;
  state.boardFlipped = lesson.side === "b";

  if (btnCoachModeGuided && btnCoachModeDrill) {
    btnCoachModeGuided.classList.toggle("active", state.coachSubMode === "guided");
    btnCoachModeDrill.classList.toggle("active", state.coachSubMode === "drill");
  }

  if (lessonEcoBadge) lessonEcoBadge.textContent = lesson.eco;
  if (lessonTitle) lessonTitle.textContent = lesson.name;
  if (lessonMetaTag) {
    lessonMetaTag.textContent = `${
      lesson.side === "w" ? "Playing White" : "Playing Black"
    }, ${lesson.style.toLowerCase()}, ${lesson.difficulty.toLowerCase()}`;
  }
  if (lessonSummary) lessonSummary.textContent = lesson.summary;

  if (lessonHowToPlay) {
    lessonHowToPlay.innerHTML = lesson.howToPlay
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("");
  }
  if (lessonHowToTackle) {
    lessonHowToTackle.innerHTML = lesson.howToTackle
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("");
  }

  renderOpeningLessonCards();

  if (options.skipBoardRender) return;

  if (state.coachSubMode === "drill") {
    startCoachDrillFromBeginning(lesson);
  } else {
    setLessonStep(0);
  }
}

export function setLessonStep(stepIdx) {
  const maxStep = state.lessonBuiltSteps.length;
  const clamped = Math.max(0, Math.min(maxStep, parseInt(stepIdx, 10) || 0));
  state.lessonStepIndex = clamped;
  state.coachDrillVariationFen = null;
  state.coachDrillVariationMove = null;
  state.lessonShowHintArrow = false;
  if (btnLessonHint) btnLessonHint.classList.add("hidden");

  if (coachStepStatusBadge) {
    coachStepStatusBadge.textContent = `Step ${clamped} / ${maxStep}`;
  }

  if (clamped === 0) {
    const nextStep = state.lessonBuiltSteps[0];
    if (coachStepComment) {
      coachStepComment.textContent = nextStep
        ? `Starting position. Next book move: 1. ${nextStep.san}. ${nextStep.comment}`
        : "Starting position";
    }
    updateEvalBar(20, null);
  } else {
    const curStep = state.lessonBuiltSteps[clamped - 1];
    const prefix =
      curStep.color === "w" ? `${curStep.moveNumber}.` : `${curStep.moveNumber}...`;
    if (coachStepComment) {
      coachStepComment.textContent = `${prefix} ${curStep.san} — ${curStep.comment}`;
    }
  }

  renderLessonMoveStrip();
  if (state.appMode === "coach") {
    refreshBoardAndDetails();
  }
}

function startCoachDrillFromBeginning(lesson) {
  state.lessonStepIndex = 0;
  state.coachDrillVariationFen = null;
  state.coachDrillVariationMove = null;
  state.lessonShowHintArrow = false;

  if (btnLessonHint) btnLessonHint.classList.remove("hidden");

  if (lesson.side === "b" && state.lessonBuiltSteps.length > 0) {
    state.lessonStepIndex = 1;
    const oppStep = state.lessonBuiltSteps[0];
    const nextUserStep = state.lessonBuiltSteps[1];
    coachStepStatusBadge.textContent = `Drill: Move 1 / ${state.lessonBuiltSteps.length}`;
    coachStepComment.textContent = `Opponent played 1. ${oppStep.san}. Your turn as Black! Click a piece on the board to play the book response${
      nextUserStep ? ` (or click Show hint arrow)` : ""
    }.`;
  } else {
    coachStepStatusBadge.textContent = `Drill: Move 0 / ${state.lessonBuiltSteps.length}`;
    coachStepComment.textContent = `Your turn as White! Click a piece on the board to play move 1 of the ${lesson.name}.`;
  }

  renderLessonMoveStrip();
  refreshBoardAndDetails();
}

function handleCoachDrillUserMove(currentFen, from, to, promotion) {
  const expectedStep = state.lessonBuiltSteps[state.lessonStepIndex];
  const temp = new Chess(currentFen);
  const moved = temp.move({ from, to, promotion: promotion || "q" });
  if (!moved) return;

  state.selectedSquare = null;
  state.legalTargetsForSelected = [];

  if (!expectedStep) {
    state.coachDrillVariationFen = temp.fen();
    state.coachDrillVariationMove = { from: moved.from, to: moved.to, san: moved.san };
    coachStepComment.textContent = `Free sparring: You played ${moved.san}.`;
    refreshBoardAndDetails();
    return;
  }

  if (moved.san === expectedStep.san) {
    state.lessonShowHintArrow = false;
    state.coachDrillVariationFen = null;
    state.coachDrillVariationMove = null;
    state.lessonStepIndex++;

    const prefix =
      expectedStep.color === "w"
        ? `${expectedStep.moveNumber}.`
        : `${expectedStep.moveNumber}...`;

    const oppReply = state.lessonBuiltSteps[state.lessonStepIndex];
    if (oppReply) {
      coachStepStatusBadge.textContent = `✓ Correct (${state.lessonStepIndex} / ${state.lessonBuiltSteps.length})`;
      coachStepComment.textContent = `✓ Spot on! ${prefix} ${expectedStep.san} — ${expectedStep.comment} Opponent replies ${oppReply.moveNumber}${
        oppReply.color === "w" ? "." : "..."
      } ${oppReply.san}. Your turn!`;
      state.lessonStepIndex++;
    } else {
      coachStepStatusBadge.textContent = `Line completed`;
      coachStepComment.textContent = `You completed the entire ${
        OPENING_LESSONS.find((l) => l.id === state.activeLessonId)?.name || "opening"
      } drill! (${prefix} ${expectedStep.san} — ${expectedStep.comment})`;
    }

    renderLessonMoveStrip();
    refreshBoardAndDetails();
  } else {
    state.lessonShowHintArrow = true;
    coachStepStatusBadge.textContent = "Try again";
    coachStepComment.textContent = `You played ${moved.san}, which deviates from the main book line. Here, the recommended move is ${expectedStep.moveNumber}${
      expectedStep.color === "w" ? "." : "..."
    } ${expectedStep.san}. ${expectedStep.comment} The blue arrow shows it; play ${expectedStep.san} on the board.`;
    refreshBoardAndDetails();
  }
}

function renderLessonMoveStrip() {
  if (!lessonMoveStrip) return;
  lessonMoveStrip.innerHTML = "";
  state.lessonBuiltSteps.forEach((step, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className =
      "pv-chip" + (state.lessonStepIndex === idx + 1 ? " active" : "");
    const prefix = step.color === "w" ? `${step.moveNumber}.` : "";
    chip.textContent = `${prefix}${step.san}`;
    chip.addEventListener("click", () => {
      stopAutoPlay();
      setLessonStep(idx + 1);
    });
    lessonMoveStrip.appendChild(chip);
  });
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
  window.__chessCoachReview = {
    state,
    analyzeGame,
    selectMovePly,
    previewRecommendedMove,
    stepNextPvMove,
    playMoveInVariation,
    jumpToVariationCursor,
    returnToOriginalGamePosition,
    switchPlatformMode,
    selectOpeningLesson,
    setLessonStep,
  };
}

initReviewApp();
