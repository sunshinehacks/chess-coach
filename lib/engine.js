// Stockfish 19 (lite, single-threaded) WASM worker wrapper.
// Provides reliable UCI initialization (with 20s readiness timeout),
// worker error propagation, sequential evaluation queue management,
// search cancellation / stale-request protection, and automatic bridge
// to the extension's background service worker (plus pre-cached in-tab
// Blob Worker fallback if the extension context is reloaded mid-game).

const DEFAULT_READY_TIMEOUT_MS = 20000;
const DEFAULT_EVAL_TIMEOUT_MS = 25000;

export function isExtensionContextValid() {
  try {
    return Boolean(
      typeof globalThis.chrome !== "undefined" &&
        globalThis.chrome?.runtime &&
        globalThis.chrome.runtime.id
    );
  } catch (_) {
    return false;
  }
}

export function resolveEngineUrls(engineJsUrl) {
  let jsUrl = engineJsUrl || "engine/stockfish.js";
  let wasmUrl = "engine/stockfish.wasm";

  const hasChromeRuntime =
    isExtensionContextValid() &&
    typeof globalThis.chrome.runtime.getURL === "function";

  if (hasChromeRuntime) {
    const cleanPath = String(jsUrl)
      .replace(/^(\.\.?\/)+/, "")
      .replace(/^\//, "");
    if (
      !jsUrl.startsWith("chrome-extension://") &&
      !jsUrl.startsWith("http://") &&
      !jsUrl.startsWith("https://") &&
      !jsUrl.startsWith("blob:")
    ) {
      jsUrl = globalThis.chrome.runtime.getURL(cleanPath || "engine/stockfish.js");
    }
    wasmUrl = globalThis.chrome.runtime.getURL("engine/stockfish.wasm");
  } else if (typeof globalThis.location !== "undefined" && globalThis.location?.href) {
    try {
      const resolvedJs = new URL(jsUrl, globalThis.location.href);
      jsUrl = resolvedJs.href;
      wasmUrl = new URL(
        resolvedJs.pathname.replace(/\.js$/i, ".wasm"),
        resolvedJs.origin
      ).href;
    } catch (_) {
      wasmUrl = String(jsUrl).replace(/\.js(\?.*|#.*)?$/i, ".wasm");
    }
  } else {
    wasmUrl = String(jsUrl).replace(/\.js(\?.*|#.*)?$/i, ".wasm");
  }

  const workerUrlWithHash = jsUrl.includes("#")
    ? jsUrl
    : `${jsUrl}#${encodeURIComponent(wasmUrl)}`;

  return { jsUrl, wasmUrl, workerUrlWithHash };
}

export class Engine {
  constructor(engineJsUrl, options = {}) {
    this.readyTimeoutMs = options.readyTimeoutMs || DEFAULT_READY_TIMEOUT_MS;
    this.evalTimeoutMs = options.evalTimeoutMs || DEFAULT_EVAL_TIMEOUT_MS;
    this.ready = false;
    this._terminated = false;
    this._initError = null;
    this._queue = [];
    this._current = null;
    this._busy = false;
    this._readyWaiters = [];
    this._readyTimer = null;
    this._evalTimer = null;
    this._nextRequestId = 1;
    this._blobWorkerUrl = null;
    this._cachedScriptText = null;
    this._cachedWasmBlobUrl = null;
    this._useBackgroundBridge = false;
    this.worker = null;

    const { jsUrl, wasmUrl, workerUrlWithHash } = resolveEngineUrls(engineJsUrl);
    this.engineJsUrl = jsUrl;
    this.engineWasmUrl = wasmUrl;
    this.workerUrl = workerUrlWithHash;

    this._initWorkerOrBridge();
  }

  async _preloadWorkerAssets() {
    try {
      if (this._cachedScriptText) return;
      const [jsRes, wasmRes] = await Promise.all([
        fetch(this.engineJsUrl),
        fetch(this.engineWasmUrl),
      ]);
      if (jsRes.ok) {
        this._cachedScriptText = await jsRes.text();
      }
      if (wasmRes.ok) {
        const wasmBuf = await wasmRes.arrayBuffer();
        const wasmBlob = new Blob([wasmBuf], { type: "application/wasm" });
        this._cachedWasmBlobUrl = URL.createObjectURL(wasmBlob);
      }
    } catch (_) {}
  }

  _initWorkerOrBridge() {
    const isContentScript =
      typeof globalThis.location !== "undefined" &&
      globalThis.location.protocol !== "chrome-extension:" &&
      isExtensionContextValid() &&
      typeof globalThis.chrome.runtime.sendMessage === "function";

    if (isContentScript) {
      this._preloadWorkerAssets();
      this._initBackgroundBridge();
      return;
    }

    this._startReadyTimeout();

    try {
      this.worker = new Worker(this.workerUrl);
      this._attachWorkerHandlers();
      this.worker.postMessage("uci");
    } catch (err) {
      if (
        isExtensionContextValid() &&
        typeof globalThis.chrome.runtime.sendMessage === "function"
      ) {
        this._clearReadyTimeout();
        this._initBackgroundBridge();
        return;
      }
      this._tryFetchedBlobWorker().then((ok) => {
        if (!ok) {
          this._fail(
            new Error(
              `Failed to construct Stockfish Worker (${this.engineJsUrl}): ${
                err?.message || String(err)
              }`
            )
          );
        }
      });
    }
  }

  async _tryFetchedBlobWorker() {
    try {
      let scriptText = this._cachedScriptText;
      if (!scriptText) {
        const res = await fetch(this.engineJsUrl);
        if (!res.ok) return false;
        scriptText = await res.text();
      }
      const wasmTargetUrl = this._cachedWasmBlobUrl || this.engineWasmUrl;
      const bootstrapCode = `globalThis.__sfWasmUrl = ${JSON.stringify(
        wasmTargetUrl
      )};\n${scriptText}`;
      const blob = new Blob([bootstrapCode], { type: "application/javascript" });
      this._blobWorkerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this._blobWorkerUrl);
      this._useBackgroundBridge = false;
      this._attachWorkerHandlers();
      this.worker.postMessage("uci");
      return true;
    } catch (_) {
      if (this._blobWorkerUrl) {
        try {
          URL.revokeObjectURL(this._blobWorkerUrl);
        } catch (_) {}
        this._blobWorkerUrl = null;
      }
      return false;
    }
  }

  _switchToLocalBlobWorkerAndRetry(failedItem) {
    return new Promise((resolve) => {
      if (!this._cachedScriptText) {
        resolve(false);
        return;
      }
      try {
        const wasmTargetUrl = this._cachedWasmBlobUrl || this.engineWasmUrl;
        const bootstrapCode = `globalThis.__sfWasmUrl = ${JSON.stringify(
          wasmTargetUrl
        )};\n${this._cachedScriptText}`;
        const blob = new Blob([bootstrapCode], { type: "application/javascript" });
        this._blobWorkerUrl = URL.createObjectURL(blob);
        this.worker = new Worker(this._blobWorkerUrl);
        this._useBackgroundBridge = false;
        this.ready = false;
        this._initError = null;
        if (failedItem) {
          this._queue.unshift(failedItem);
        }
        this._readyWaiters.push({
          resolve: () => resolve(true),
          reject: () => resolve(false),
        });
        this._startReadyTimeout();
        this._attachWorkerHandlers();
        this.worker.postMessage("uci");
      } catch (_) {
        resolve(false);
      }
    });
  }

  _initBackgroundBridge() {
    this._useBackgroundBridge = true;
    this._startReadyTimeout();

    if (!isExtensionContextValid()) {
      this._fail(new Error("Extension context invalidated."));
      return;
    }

    try {
      globalThis.chrome.runtime.sendMessage(
        { type: "CHESS_COACH_ENGINE_INIT" },
        async (response) => {
          let lastErr = null;
          try {
            lastErr = globalThis.chrome?.runtime?.lastError;
          } catch (e) {
            lastErr = e;
          }
          if (lastErr || !response || !response.ok) {
            const blobOk = await this._tryFetchedBlobWorker();
            if (blobOk) return;
            this._fail(
              new Error(
                lastErr?.message ||
                  response?.error ||
                  "Background Stockfish engine failed to initialize."
              )
            );
            return;
          }
          this._markReady();
        }
      );
    } catch (err) {
      this._fail(err);
    }
  }

  _startReadyTimeout() {
    this._clearReadyTimeout();
    this._readyTimer = setTimeout(() => {
      if (!this.ready && !this._terminated) {
        this._fail(
          new Error(
            `Stockfish engine initialization timed out after ${Math.round(
              this.readyTimeoutMs / 1000
            )} seconds.`
          )
        );
      }
    }, this.readyTimeoutMs);
  }

  _clearReadyTimeout() {
    if (this._readyTimer) {
      clearTimeout(this._readyTimer);
      this._readyTimer = null;
    }
  }

  _clearEvalTimeout() {
    if (this._evalTimer) {
      clearTimeout(this._evalTimer);
      this._evalTimer = null;
    }
  }

  _attachWorkerHandlers() {
    if (!this.worker) return;

    this.worker.onmessage = (ev) => {
      const raw = ev?.data;
      if (typeof raw === "string") {
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) this._onLine(trimmed);
        }
      } else if (raw !== undefined && raw !== null) {
        this._onLine(String(raw).trim());
      }
    };

    this.worker.onerror = (ev) => {
      if (ev && typeof ev.preventDefault === "function") {
        ev.preventDefault();
      }
      const detail =
        ev?.message ||
        (ev?.filename
          ? `Worker script error in ${ev.filename}:${ev.lineno || 0}`
          : "Unknown Stockfish worker error");
      this._fail(new Error(`Stockfish worker error: ${detail}`));
    };

    this.worker.onmessageerror = () => {
      this._fail(new Error("Stockfish worker message deserialization error."));
    };
  }

  _markReady() {
    if (this.ready || this._terminated || this._initError) return;
    this._clearReadyTimeout();
    this.ready = true;
    const waiters = this._readyWaiters.splice(0);
    for (const w of waiters) {
      try {
        w.resolve();
      } catch (_) {}
    }
    this._pump();
  }

  _fail(err) {
    const errorObj = err instanceof Error ? err : new Error(String(err || "Engine error"));
    this._clearReadyTimeout();
    this._clearEvalTimeout();

    if (!this._initError) {
      this._initError = errorObj;
    }
    this.ready = false;

    const readyWaiters = this._readyWaiters.splice(0);
    for (const w of readyWaiters) {
      try {
        w.reject(errorObj);
      } catch (_) {}
    }

    this._rejectAllPending(errorObj);
    this._cleanupWorker();
  }

  _rejectAllPending(errorObj) {
    this._clearEvalTimeout();
    if (this._current) {
      const cur = this._current;
      this._current = null;
      this._busy = false;
      try {
        cur.reject(errorObj);
      } catch (_) {}
    }
    const pending = this._queue.splice(0);
    for (const item of pending) {
      try {
        item.reject(errorObj);
      } catch (_) {}
    }
  }

  _cleanupWorker() {
    this._clearReadyTimeout();
    this._clearEvalTimeout();
    if (this.worker) {
      try {
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.onmessageerror = null;
      } catch (_) {}
      try {
        this.worker.postMessage("stop");
        this.worker.postMessage("quit");
      } catch (_) {}
      try {
        this.worker.terminate();
      } catch (_) {}
      this.worker = null;
    }
    if (this._blobWorkerUrl) {
      try {
        URL.revokeObjectURL(this._blobWorkerUrl);
      } catch (_) {}
      this._blobWorkerUrl = null;
    }
  }

  _onLine(line) {
    if (!line || this._terminated) return;

    if (line === "uciok") {
      try {
        this.worker.postMessage("isready");
      } catch (err) {
        this._fail(err);
      }
      return;
    }

    if (line === "readyok" && !this.ready) {
      this._markReady();
      return;
    }

    if (!this._current) return;

    if (line.startsWith("info")) {
      const depthMatch = line.match(/\bdepth (\d+)/);
      const cpMatch = line.match(/\bscore cp (-?\d+)/);
      const mateMatch = line.match(/\bscore mate (-?\d+)/);
      const pvMatch = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?.*)$/);

      if (depthMatch) {
        this._current.lastDepth = parseInt(depthMatch[1], 10);
      }
      if (cpMatch) {
        this._current.lastCp = parseInt(cpMatch[1], 10);
        this._current.lastMate = null;
      }
      if (mateMatch) {
        this._current.lastMate = parseInt(mateMatch[1], 10);
      }
      if (pvMatch) {
        this._current.lastPv = pvMatch[1].trim().split(/\s+/);
      }

      if (typeof this._current.onInfo === "function" && !this._current.cancelled) {
        try {
          this._current.onInfo({
            depth: this._current.lastDepth || 0,
            cp: this._current.lastCp ?? null,
            mate: this._current.lastMate ?? null,
            pv: this._current.lastPv ?? [],
            bestMove: this._current.lastPv?.[0] ?? null,
          });
        } catch (_) {}
      }
      return;
    }

    if (line.startsWith("bestmove")) {
      this._clearEvalTimeout();
      const parts = line.split(/\s+/);
      const best = parts[1];
      const cur = this._current;
      this._current = null;
      this._busy = false;

      const bestMove =
        !best || best === "(none)" || best === "0000" ? null : best;
      const pv =
        cur.lastPv && cur.lastPv.length > 0
          ? cur.lastPv
          : bestMove
          ? [bestMove]
          : [];

      const result = {
        bestMove,
        cp: cur.lastCp ?? (cur.lastMate !== null ? null : 0),
        mate: cur.lastMate ?? null,
        pv,
        depth: cur.lastDepth ?? cur.depth,
        cancelled: Boolean(cur.cancelled),
        requestId: cur.requestId,
      };

      try {
        cur.resolve(result);
      } catch (_) {}

      this._pump();
    }
  }

  whenReady() {
    if (this._initError) {
      return Promise.reject(this._initError);
    }
    if (this._terminated) {
      return Promise.reject(new Error("Stockfish engine has been terminated."));
    }
    if (this.ready) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this._readyWaiters.push({ resolve, reject });
    });
  }

  evaluate(fen, depth = 14, options = {}) {
    if (this._initError) {
      return Promise.reject(this._initError);
    }
    if (this._terminated) {
      return Promise.reject(new Error("Stockfish engine has been terminated."));
    }
    if (!this.ready && !this._readyTimer && !this._useBackgroundBridge) {
      return Promise.reject(new Error("Stockfish engine is not ready."));
    }
    const normalizedDepth = Math.max(1, Math.min(24, parseInt(depth, 10) || 14));
    const requestId = this._nextRequestId++;

    return new Promise((resolve, reject) => {
      const item = {
        requestId,
        fen,
        depth: normalizedDepth,
        onInfo: options.onInfo || null,
        cancelled: false,
        stopSent: false,
        lastCp: null,
        lastMate: null,
        lastPv: [],
        lastDepth: 0,
        resolve,
        reject,
      };

      if (options.signal) {
        if (options.signal.aborted) {
          resolve({
            bestMove: null,
            cp: null,
            mate: null,
            pv: [],
            depth: 0,
            cancelled: true,
            requestId,
          });
          return;
        }
        options.signal.addEventListener(
          "abort",
          () => {
            this.cancelRequest(requestId);
          },
          { once: true }
        );
      }

      this._queue.push(item);
      this._pump();
    });
  }

  evaluateLatest(fen, depth = 14, options = {}) {
    this.cancelPending();
    return this.evaluate(fen, depth, options);
  }

  cancelRequest(requestId) {
    const qIdx = this._queue.findIndex((item) => item.requestId === requestId);
    if (qIdx !== -1) {
      const [removed] = this._queue.splice(qIdx, 1);
      try {
        removed.resolve({
          bestMove: null,
          cp: null,
          mate: null,
          pv: [],
          depth: 0,
          cancelled: true,
          requestId: removed.requestId,
        });
      } catch (_) {}
      return;
    }

    if (this._current && this._current.requestId === requestId && !this._current.stopSent) {
      this._current.cancelled = true;
      this._current.stopSent = true;
      if (!this._useBackgroundBridge && this.worker) {
        try {
          this.worker.postMessage("stop");
        } catch (_) {}
      }
    }
  }

  cancelPending() {
    const removed = this._queue.splice(0);
    for (const item of removed) {
      try {
        item.resolve({
          bestMove: null,
          cp: null,
          mate: null,
          pv: [],
          depth: 0,
          cancelled: true,
          requestId: item.requestId,
        });
      } catch (_) {}
    }

    if (this._current && !this._current.stopSent) {
      this._current.cancelled = true;
      this._current.stopSent = true;
      if (this._useBackgroundBridge) {
        if (isExtensionContextValid()) {
          try {
            globalThis.chrome.runtime.sendMessage({ type: "CHESS_COACH_ENGINE_CANCEL" });
          } catch (_) {}
        }
      } else if (this.worker) {
        try {
          this.worker.postMessage("stop");
        } catch (_) {}
      }
    }
  }

  _pump() {
    if (this._busy || !this.ready || this._terminated || this._queue.length === 0) {
      return;
    }

    this._busy = true;
    const current = this._queue.shift();
    this._current = current;

    if (this._useBackgroundBridge) {
      if (!isExtensionContextValid()) {
        this._busy = false;
        this._current = null;
        this._switchToLocalBlobWorkerAndRetry(current).then((switched) => {
          if (!switched) {
            const ctxErr = new Error("Extension context invalidated.");
            current.reject(ctxErr);
            this._fail(ctxErr);
          }
        });
        return;
      }

      this._clearEvalTimeout();
      this._evalTimer = setTimeout(() => {
        if (this._current && this._current.requestId === current.requestId) {
          this._busy = false;
          this._current = null;
          current.reject(new Error("Background engine evaluation timed out."));
          this._pump();
        }
      }, this.evalTimeoutMs);

      try {
        globalThis.chrome.runtime.sendMessage(
          {
            type: "CHESS_COACH_ENGINE_EVAL",
            fen: current.fen,
            depth: current.depth,
            requestId: current.requestId,
          },
          (response) => {
            if (!this._current || this._current.requestId !== current.requestId) {
              return;
            }
            this._clearEvalTimeout();
            this._busy = false;
            this._current = null;

            let lastErr = null;
            try {
              lastErr = globalThis.chrome?.runtime?.lastError;
            } catch (e) {
              lastErr = e;
            }

            if (lastErr) {
              const errMsg = lastErr.message || String(lastErr);
              if (errMsg.includes("Extension context invalidated") || !isExtensionContextValid()) {
                this._switchToLocalBlobWorkerAndRetry(current).then((switched) => {
                  if (!switched) {
                    const ctxErr = new Error("Extension context invalidated.");
                    current.reject(ctxErr);
                    this._fail(ctxErr);
                  }
                });
                return;
              }
              current.reject(new Error(errMsg));
              this._pump();
              return;
            }
            if (!response || !response.ok) {
              current.reject(new Error(response?.error || "Engine evaluation failed."));
              this._pump();
              return;
            }
            current.resolve({
              ...response.result,
              cancelled: Boolean(current.cancelled || response.result?.cancelled),
              requestId: current.requestId,
            });
            this._pump();
          }
        );
      } catch (err) {
        this._clearEvalTimeout();
        this._busy = false;
        this._current = null;
        if (String(err?.message || err).includes("Extension context invalidated") || !isExtensionContextValid()) {
          this._switchToLocalBlobWorkerAndRetry(current).then((switched) => {
            if (!switched) {
              current.reject(err instanceof Error ? err : new Error(String(err)));
              this._fail(err);
            }
          });
          return;
        }
        current.reject(err instanceof Error ? err : new Error(String(err)));
        this._pump();
      }
      return;
    }

    this._clearEvalTimeout();
    this._evalTimer = setTimeout(() => {
      if (this._current && this._current.requestId === current.requestId && !current.stopSent) {
        current.stopSent = true;
        try {
          this.worker?.postMessage("stop");
        } catch (_) {}
      }
    }, this.evalTimeoutMs);

    try {
      this.worker.postMessage("position fen " + current.fen);
      this.worker.postMessage("go depth " + current.depth);
    } catch (err) {
      this._fail(err);
    }
  }

  terminate() {
    if (this._terminated) return;
    this._terminated = true;
    this.ready = false;
    const termErr = new Error("Stockfish engine was terminated.");
    const readyWaiters = this._readyWaiters.splice(0);
    for (const w of readyWaiters) {
      try {
        w.reject(termErr);
      } catch (_) {}
    }
    this._rejectAllPending(termErr);
    this._cleanupWorker();
  }
}

export function whiteRelativeCp(evalResult, sideToMove) {
  if (!evalResult) return 0;
  const MATE_CP = 10000;
  let cp;
  if (evalResult.mate !== null && evalResult.mate !== undefined) {
    cp =
      evalResult.mate > 0
        ? MATE_CP - Math.abs(evalResult.mate) * 10
        : -MATE_CP + Math.abs(evalResult.mate) * 10;
  } else {
    cp = evalResult.cp ?? 0;
  }
  return sideToMove === "w" ? cp : -cp;
}

export function whiteRelativeMate(evalResult, sideToMove) {
  if (!evalResult || evalResult.mate === null || evalResult.mate === undefined) {
    return null;
  }
  if (evalResult.mate === 0) {
    return sideToMove === "w" ? -1 : 1;
  }
  return sideToMove === "w" ? evalResult.mate : -evalResult.mate;
}

export function winPercent(whiteCp) {
  const cp = Math.max(-1000, Math.min(1000, Number(whiteCp) || 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function moveAccuracyFromWinSwing(winBefore, winAfter) {
  const drop = Math.max(0, (Number(winBefore) || 0) - (Number(winAfter) || 0));
  const acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1668;
  return Math.max(0, Math.min(100, acc));
}

export function formatEvalScore(whiteCp, whiteMate) {
  if (whiteMate !== null && whiteMate !== undefined) {
    const sign = whiteMate > 0 ? "+" : "-";
    return `${sign}M${Math.abs(whiteMate)}`;
  }
  const pawns = (Number(whiteCp) || 0) / 100;
  if (Math.abs(pawns) < 0.05) return "0.0";
  return (pawns > 0 ? "+" : "") + pawns.toFixed(1);
}

export function parseUciMove(uci) {
  if (!uci || typeof uci !== "string" || uci.length < 4) return null;
  const clean = uci.trim().toLowerCase();
  const match = clean.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!match) return null;
  return {
    from: match[1],
    to: match[2],
    promotion: match[3] || undefined,
  };
}
