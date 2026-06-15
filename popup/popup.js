// Renders the latest stored usage, auto-refreshes on open, and lets the user
// trigger a manual refresh or open Options. Parsing lives in usage-parse.js.

const barsEl = document.getElementById("bars");
const emptyEl = document.getElementById("empty");
const updatedEl = document.getElementById("updated");
const sourceEl = document.getElementById("source");
const errorEl = document.getElementById("error");
const errorMsgEl = document.getElementById("error-msg");
const refreshBtn = document.getElementById("refresh");
const optionsBtn = document.getElementById("options");

function showError(msg) {
  errorMsgEl.textContent = msg;
  errorEl.classList.remove("hidden"); // also reveals the "Open Claude usage page" link
}
function clearError() {
  errorEl.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  await load(); // show cached data immediately
  refresh(true); // then refresh quietly in the background
  setInterval(load, 30000); // keep "updated" + countdowns ticking while open
});
refreshBtn.addEventListener("click", () => refresh(false));
optionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

async function load() {
  const { usage, usageMeta } = await chrome.storage.local.get(["usage", "usageMeta"]);
  render(usage, usageMeta);
}

function render(usage, meta) {
  const bars = usage ? ClaudeUsage.parseUsage(usage) : [];
  barsEl.innerHTML = "";
  if (meta?.lastError) showError(meta.lastError);
  else clearError();

  if (!bars.length) {
    emptyEl.classList.remove("hidden");
    updatedEl.textContent = "";
    sourceEl.textContent = "";
    return;
  }
  emptyEl.classList.add("hidden");

  for (const b of bars) {
    const pct = Math.min(100, Math.max(0, b.percent));
    const cls = pct >= 90 ? " warn" : pct >= 75 ? " caution" : "";
    const countdown = b.resetsAt ? fmtCountdown(b.resetsAt) : null;
    const div = document.createElement("div");
    div.className = "bar";
    div.innerHTML = `
      <div class="row">
        <span class="label"></span>
        <span class="value"></span>
      </div>
      <div class="track"><div class="fill${cls}" style="width:${pct}%"></div></div>
      ${countdown ? `<div class="reset" title="${fmtReset(b.resetsAt)}">Resets in ${countdown}</div>` : ""}`;
    div.querySelector(".label").textContent = b.label;
    div.querySelector(".value").textContent = b.valueText || `${Math.round(pct)}%`;
    barsEl.appendChild(div);
  }
  updatedEl.textContent = meta?.capturedAt ? "Updated " + fmtAgo(meta.capturedAt) : "";
  sourceEl.textContent = meta?.source ? "via " + meta.source : "";
}

// silent=true: auto-refresh on open — don't show the error banner if it fails,
// since we're already displaying cached data.
async function refresh(silent) {
  refreshBtn.classList.add("spin");
  if (!silent) clearError();
  try {
    const res = await chrome.runtime.sendMessage({ type: "REQUEST_REFRESH" });
    if (!res?.ok && !silent) showError(res?.error || "Refresh failed.");
  } finally {
    refreshBtn.classList.remove("spin");
    await load();
  }
}

function fmtAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  return Math.round(s / 3600) + "h ago";
}

function fmtCountdown(v) {
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  let s = Math.round((d - Date.now()) / 1000);
  if (s <= 0) return "now";
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (days >= 1) return `${days}d ${h}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtReset(v) {
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return "Resets " + d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
