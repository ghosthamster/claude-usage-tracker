// Service worker: stores the latest usage reading and coordinates refreshes.
//
// Privacy & good-citizen posture:
//   - The extension NEVER makes a network request on its own. It only ever asks
//     an already-open Claude.ai tab to read your usage (your live session), or
//     passively stores what the usage page already fetched.
//   - All data stays on this device in chrome.storage.local. Nothing is sent
//     anywhere. There is no analytics, no tracking, no remote server.

importScripts("usage-parse.js"); // provides self.ClaudeUsage

const REFRESH_MINUTES = 15;
const STORAGE_KEY = "usage";
const META_KEY = "usageMeta"; // { url, capturedAt, source, lastError }

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
function ensureAlarm() {
  chrome.alarms.create("refresh", { periodInMinutes: REFRESH_MINUTES });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "USAGE_CAPTURED") {
    save(msg.data, { url: msg.url || null, capturedAt: msg.capturedAt || Date.now(), source: msg.channel || "page" });
    return;
  }
  if (msg?.type === "REQUEST_REFRESH") {
    refresh().then(sendResponse);
    return true; // async response
  }
});

// Periodic refresh is silent: it updates only if a Claude.ai tab is open, and
// never surfaces an error if one isn't (no nagging when you're simply not on Claude).
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "refresh") return;
  const { [META_KEY]: meta } = await chrome.storage.local.get(META_KEY);
  if (meta?.url) await refreshViaTab(meta); // ignore the result
});

async function save(data, meta) {
  const clean = { ...meta };
  delete clean.lastError; // a successful save clears any previous error
  await chrome.storage.local.set({ [STORAGE_KEY]: data, [META_KEY]: clean });
  updateBadge(data);
}

async function setError(meta, msg) {
  await chrome.storage.local.set({ [META_KEY]: { ...meta, lastError: msg } });
}

// Asks an open Claude.ai tab to read usage with its own session. Returns a
// structured result; callers decide whether to surface failures to the user.
async function refreshViaTab(meta) {
  const tab = await firstClaudeTab();
  if (!tab) return { ok: false, reason: "no-tab" };
  const res = await askTab(tab.id, meta.url);
  if (res?.ok) {
    await save(res.data, { ...meta, capturedAt: Date.now(), source: "tab" });
    return { ok: true };
  }
  return { ok: false, reason: res === null ? "no-content-script" : "fetch-failed", error: res?.error };
}

// User-initiated refresh (the popup button): surfaces actionable guidance.
async function refresh() {
  const { [META_KEY]: meta } = await chrome.storage.local.get(META_KEY);
  if (!meta?.url) {
    return { ok: false, error: "Open claude.ai/settings/usage once so the extension can read your usage." };
  }
  const r = await refreshViaTab(meta);
  if (r.ok) return { ok: true };
  const msg =
    r.reason === "no-tab"
      ? "Open a Claude.ai tab to refresh your usage."
      : r.reason === "no-content-script"
      ? "Reload your Claude.ai tab, then click refresh again."
      : "Couldn't read usage from the Claude.ai tab: " + r.error;
  await setError(meta, msg);
  return { ok: false, error: msg };
}

function firstClaudeTab() {
  return new Promise((resolve) =>
    chrome.tabs.query({ url: "https://claude.ai/*" }, (tabs) => resolve(tabs && tabs[0]))
  );
}

function askTab(tabId, url) {
  return new Promise((resolve) =>
    chrome.tabs.sendMessage(tabId, { type: "REFRESH_FROM_TAB", url }, (resp) =>
      resolve(chrome.runtime.lastError ? null : resp)
    )
  );
}

// Badge shows the most-constraining limit (highest utilization %).
function updateBadge(data) {
  try {
    const pct = ClaudeUsage.topPercent(data);
    if (pct == null) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }
    chrome.action.setBadgeText({ text: pct >= 100 ? "MAX" : String(Math.round(pct)) });
    chrome.action.setBadgeBackgroundColor({ color: pct >= 90 ? "#cc3333" : "#6645d8" });
  } catch (_) {}
}
