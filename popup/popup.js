const enabledBox = document.getElementById("enabled");
const liveNote = document.getElementById("liveNote");
const versionLabel = document.getElementById("versionLabel");

function renderLiveNote(enabled) {
  if (!liveNote) return;
  liveNote.textContent = enabled
    ? "On chess.com game pages"
    : "Off. Turn it on before your next game.";
}

const storage = typeof chrome !== "undefined" && chrome?.storage?.sync ? chrome.storage.sync : null;

const systemTheme = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}

if (storage) {
  storage.get(["enabled", "theme"]).then(({ enabled, theme }) => {
    const isOn = enabled !== false;
    enabledBox.checked = isOn;
    renderLiveNote(isOn);
    applyTheme(theme === "light" || theme === "dark" ? theme : systemTheme());
  });
} else {
  enabledBox.checked = true;
  renderLiveNote(true);
  applyTheme(systemTheme());
}

enabledBox.addEventListener("change", () => {
  if (storage) storage.set({ enabled: enabledBox.checked });
  renderLiveNote(enabledBox.checked);
});

document.getElementById("openOptions").addEventListener("click", () => {
  if (typeof chrome !== "undefined" && chrome?.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  }
});

document.getElementById("openReview").addEventListener("click", (event) => {
  event.preventDefault();
  if (typeof chrome === "undefined" || !chrome?.tabs) return;
  chrome.tabs.create({ url: chrome.runtime.getURL("review/review.html") });
});

document.getElementById("openStudio").addEventListener("click", () => {
  if (typeof chrome === "undefined" || !chrome?.tabs) return;
  chrome.tabs.create({ url: chrome.runtime.getURL("coach/coach.html") });
});

if (versionLabel) {
  if (typeof chrome !== "undefined" && chrome?.runtime?.getManifest) {
    versionLabel.textContent = `Chess Coach ${chrome.runtime.getManifest().version}`;
  }
}
