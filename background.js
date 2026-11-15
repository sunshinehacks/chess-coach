// Chess Coach — Background Service Worker (Manifest V3)
// Uses a static top-level ES module import of Stockfish 19 WASM (since dynamic
// import() is disallowed on ServiceWorkerGlobalScope by the HTML specification).
// Dispatches engine output lines asynchronously to prevent Emscripten stdout
// buffer re-entrancy, and automatically re-injects content/content.js into
// existing Chess.com tabs whenever the extension is installed, reloaded, or
// woken up so open tabs never suffer from "Extension context invalidated".

import "./engine/stockfish.js";

async function reinjectOpenChessComTabs() {
  try {
    if (!chrome?.tabs?.query || !chrome?.scripting?.executeScript) return;
    const tabs = await chrome.tabs.query({ url: ["https://www.chess.com/*"] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/content.js"],
        });
      } catch (_) {
        // Ignore restricted or unloaded tabs
      }
    }
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const existing = await chrome.storage.sync.get(["enabled", "depth", "username"]);
    await chrome.storage.sync.set({
      enabled: existing.enabled !== undefined ? existing.enabled : true,
      depth: existing.depth || 14,
      username: existing.username || "",
    });
  } catch (_) {}
  await reinjectOpenChessComTabs();
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    reinjectOpenChessComTabs();
  });
}

// Also run on service worker evaluation in case the extension was just reloaded
reinjectOpenChessComTabs();

let bgEngineReady = false;
let bgEngineLoading = false;
let bgInitError = null;
let bgReadyWaiters = [];
let bgQueue = [];
let bgCurrent = null;
let bgBusy = false;
let bgRetryInterval = null;
let bgInitTimer = null;
let bgEvalTimer = null;

function clearBgInitTimers() {
  if (bgRetryInterval) {
    clearInterval(bgRetryInterval);
    bgRetryInterval = null;
  }
  if (bgInitTimer) {
    clearTimeout(bgInitTimer);
    bgInitTimer = null;
  }
}

function clearBgEvalTimer() {
  if (bgEvalTimer) {
    clearTimeout(bgEvalTimer);
    bgEvalTimer = null;
  }
}

globalThis.__sfWasmUrl = chrome.runtime.getURL("engine/stockfish.wasm");
globalThis.__sfListener = (msg) => {
  setTimeout(() => {
    const lines = String(msg || "").split(/\r?\n/);
    for (const l of lines) onBgEngineLine(l);
  }, 0);
};

function onBgEngineLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line) return;

  if ((line === "uciok" || line.endsWith("uciok")) && !bgEngineReady) {
    globalThis.__sfSendCommand?.("isready");
    return;
  }

  if ((line === "readyok" || line.endsWith("readyok")) && !bgEngineReady) {
    clearBgInitTimers();
    bgEngineReady = true;
    bgEngineLoading = false;
    const waiters = bgReadyWaiters.splice(0);
    for (const w of waiters) w.resolve();
    pumpBgQueue();
    return;
  }

  if (!bgCurrent) return;

  if (line.startsWith("info")) {
    const depthMatch = line.match(/\bdepth (\d+)/);
    const cpMatch = line.match(/\bscore cp (-?\d+)/);
    const mateMatch = line.match(/\bscore mate (-?\d+)/);
    const pvMatch = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?.*)$/);

    if (depthMatch) bgCurrent.lastDepth = parseInt(depthMatch[1], 10);
    if (cpMatch) {
      bgCurrent.lastCp = parseInt(cpMatch[1], 10);
      bgCurrent.lastMate = null;
    }
    if (mateMatch) bgCurrent.lastMate = parseInt(mateMatch[1], 10);
    if (pvMatch) bgCurrent.lastPv = pvMatch[1].trim().split(/\s+/);
    return;
  }

  if (line.startsWith("bestmove")) {
    clearBgEvalTimer();
    const parts = line.split(/\s+/);
    const best = parts[1];
    const cur = bgCurrent;
    bgCurrent = null;
    bgBusy = false;

    const bestMove = !best || best === "(none)" || best === "0000" ? null : best;
    const pv =
      cur.lastPv && cur.lastPv.length > 0
        ? cur.lastPv
        : bestMove
        ? [bestMove]
        : [];

    cur.resolve({
      bestMove,
      cp: cur.lastCp ?? (cur.lastMate !== null ? null : 0),
      mate: cur.lastMate ?? null,
      pv,
      depth: cur.lastDepth ?? cur.depth,
      cancelled: Boolean(cur.cancelled),
    });

    pumpBgQueue();
  }
}

function ensureBgEngine() {
  if (bgEngineReady) return Promise.resolve();
  if (bgInitError) return Promise.reject(bgInitError);

  return new Promise((resolve, reject) => {
    bgReadyWaiters.push({ resolve, reject });
    if (bgEngineLoading) return;
    bgEngineLoading = true;

    clearBgInitTimers();
    bgInitTimer = setTimeout(() => {
      clearBgInitTimers();
      if (!bgEngineReady) {
        bgInitError = new Error("Background Stockfish initialization timed out after 20s.");
        bgEngineLoading = false;
        const waiters = bgReadyWaiters.splice(0);
        for (const w of waiters) w.reject(bgInitError);
      }
    }, 20000);

    const sendUci = () => {
      if (bgEngineReady) {
        clearBgInitTimers();
        return;
      }
      try {
        globalThis.__sfWasmUrl = chrome.runtime.getURL("engine/stockfish.wasm");
        globalThis.__sfSendCommand?.("uci");
      } catch (err) {
        clearBgInitTimers();
        bgInitError = err instanceof Error ? err : new Error(String(err));
        bgEngineLoading = false;
        const waiters = bgReadyWaiters.splice(0);
        for (const w of waiters) w.reject(bgInitError);
      }
    };

    sendUci();
    bgRetryInterval = setInterval(sendUci, 1500);
  });
}

function pumpBgQueue() {
  if (bgBusy || !bgEngineReady || bgQueue.length === 0) return;
  bgBusy = true;
  const current = bgQueue.shift();
  bgCurrent = current;
  current.lastCp = null;
  current.lastMate = null;
  current.lastPv = [];
  current.lastDepth = 0;

  clearBgEvalTimer();
  bgEvalTimer = setTimeout(() => {
    if (bgCurrent === current) {
      if (!current.stopSent) {
        current.stopSent = true;
        try {
          globalThis.__sfSendCommand?.("stop");
        } catch (_) {}
      }
      setTimeout(() => {
        if (bgCurrent === current) {
          bgCurrent = null;
          bgBusy = false;
          current.resolve({
            bestMove: current.lastPv?.[0] || null,
            cp: current.lastCp ?? 0,
            mate: current.lastMate ?? null,
            pv: current.lastPv || [],
            depth: current.lastDepth || 0,
            cancelled: Boolean(current.cancelled),
          });
          pumpBgQueue();
        }
      }, 1500);
    }
  }, 15000);

  globalThis.__sfSendCommand?.("position fen " + current.fen);
  globalThis.__sfSendCommand?.("go depth " + current.depth);
}

function cancelBgPending() {
  const removed = bgQueue.splice(0);
  for (const item of removed) {
    item.resolve({
      bestMove: null,
      cp: null,
      mate: null,
      pv: [],
      depth: 0,
      cancelled: true,
    });
  }
  if (bgCurrent && !bgCurrent.stopSent) {
    bgCurrent.cancelled = true;
    bgCurrent.stopSent = true;
    globalThis.__sfSendCommand?.("stop");
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;

  if (msg.type === "CHESS_COACH_ENGINE_INIT") {
    ensureBgEngine()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }

  if (msg.type === "CHESS_COACH_ENGINE_EVAL") {
    ensureBgEngine()
      .then(
        () =>
          new Promise((resolve, reject) => {
            bgQueue.push({
              fen: msg.fen,
              depth: Math.max(1, Math.min(24, parseInt(msg.depth, 10) || 14)),
              cancelled: false,
              stopSent: false,
              resolve,
              reject,
            });
            pumpBgQueue();
          })
      )
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }

  if (msg.type === "CHESS_COACH_ENGINE_CANCEL") {
    cancelBgPending();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "CHESS_COACH_OPEN_STUDIO") {
    const url =
      chrome.runtime.getURL("coach/coach.html") +
      (msg.lesson ? "?lesson=" + encodeURIComponent(msg.lesson) : "");
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "CHESS_COACH_OPEN_REVIEW") {
    chrome.tabs.create({ url: chrome.runtime.getURL("review/review.html") });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
