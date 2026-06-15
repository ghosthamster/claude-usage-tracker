// Loads settings into the form and auto-saves on change.
const { getSettings, setSettings, DEFAULTS } = ClaudeUsageSettings;

const fields = {
  intervalMinutes: { el: document.getElementById("intervalMinutes"), type: "int", min: 1, max: 60 },
  pauseWhenIdle: { el: document.getElementById("pauseWhenIdle"), type: "bool" },
  backgroundFetchWhenNoTab: { el: document.getElementById("backgroundFetchWhenNoTab"), type: "bool" },
  notifyThreshold: { el: document.getElementById("notifyThreshold"), type: "int", min: 0, max: 100 },
};
const savedEl = document.getElementById("saved");

init();

async function init() {
  const s = await getSettings();
  for (const [key, f] of Object.entries(fields)) {
    if (f.type === "bool") f.el.checked = !!s[key];
    else f.el.value = s[key];
    f.el.addEventListener("change", () => onChange(key, f));
  }
}

async function onChange(key, f) {
  let value;
  if (f.type === "bool") {
    value = f.el.checked;
  } else {
    value = parseInt(f.el.value, 10);
    if (isNaN(value)) value = DEFAULTS[key];
    value = Math.max(f.min, Math.min(f.max, value));
    f.el.value = value; // reflect the clamped value back
  }
  await setSettings({ [key]: value });
  flashSaved();
}

let savedTimer;
function flashSaved() {
  savedEl.classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => savedEl.classList.remove("show"), 1200);
}
