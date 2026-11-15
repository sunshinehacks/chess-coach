const form = document.getElementById("settingsForm");
const usernameEl = document.getElementById("username");
const savedEl = document.getElementById("saved");
const themeRadios = Array.from(document.querySelectorAll('input[name="theme"]'));

function setDepth(value) {
  const radios = document.querySelectorAll('input[name="depth"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === String(value);
  });
}

function setTheme(value) {
  const theme = value === "light" ? "light" : "dark";
  themeRadios.forEach((radio) => {
    radio.checked = radio.value === theme;
  });
  document.documentElement.setAttribute("data-theme", theme);
}

let savedTimer = null;

function showSaved() {
  savedEl.textContent = "Settings saved.";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    savedEl.textContent = "";
  }, 1800);
}

const storage = typeof chrome !== "undefined" && chrome?.storage?.sync ? chrome.storage.sync : null;

const systemTheme = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";

if (storage) {
  storage.get(["username", "depth", "theme"]).then(({ username, depth, theme }) => {
    usernameEl.value = username || "";
    setDepth(depth || 14);
    setTheme(theme === "light" || theme === "dark" ? theme : systemTheme());
  });
} else {
  setDepth(14);
  setTheme(systemTheme());
}

themeRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.checked) setTheme(radio.value);
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const depthRadio = document.querySelector('input[name="depth"]:checked');
  const themeRadio = document.querySelector('input[name="theme"]:checked');

  if (storage) {
    await storage.set({
      username: usernameEl.value.trim().toLowerCase(),
      depth: parseInt(depthRadio?.value || "14", 10),
      theme: themeRadio?.value === "light" ? "light" : "dark",
    });
  }

  showSaved();
});
