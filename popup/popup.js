// Renders the latest stored usage and lets the user trigger a refresh.
// Parsing of the /usage payload lives in usage-parse.js (ClaudeUsage.parseUsage).

const barsEl = document.getElementById("bars");
const emptyEl = document.getElementById("empty");
const updatedEl = document.getElementById("updated");
const sourceEl = document.getElementById("source");
const errorEl = document.getElementById("error");
const errorMsgEl = document.getElementById("error-msg");
const refreshBtn = document.getElementById("refresh");

function showError(msg) {
  errorMsgEl.textContent = msg;
  errorEl.classList.remove("hidden"); // also reveals the "Open Claude usage page" link
}
function clearError() {
  errorEl.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", load);
refreshBtn.addEventListener("click", refresh);

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
    const div = document.createElement("div");
    div.className = "bar";
    div.innerHTML = `
      <div class="row">
        <span class="label"></span>
        <span class="value"></span>
      </div>
      <div class="track"><div class="fill${pct >= 90 ? " warn" : ""}" style="width:${pct}%"></div></div>
      ${b.resetsAt ? `<div class="reset">Resets ${fmtReset(b.resetsAt)}</div>` : ""}`;
    div.querySelector(".label").textContent = b.label;
    div.querySelector(".value").textContent = b.valueText || `${Math.round(pct)}%`;
    barsEl.appendChild(div);
  }
  updatedEl.textContent = meta?.capturedAt ? "Updated " + fmtAgo(meta.capturedAt) : "";
  sourceEl.textContent = meta?.source ? "via " + meta.source : "";
}

async function refresh() {
  refreshBtn.classList.add("spin");
  clearError();
  try {
    const res = await chrome.runtime.sendMessage({ type: "REQUEST_REFRESH" });
    if (!res?.ok) showError(res?.error || "Refresh failed.");
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
function fmtReset(v) {
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
