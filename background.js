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

// Reads usage from a live Claude.ai tab using that tab's own session. We inject
// the fetch on demand (chrome.scripting) rather than relying on a pre-injected
// content script, so it works even for tabs opened before the extension loaded.
async function refreshViaTab(meta) {
  const tab = await firstClaudeTab();
  if (!tab) return { ok: false, reason: "no-tab" };
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN", // page context => same-origin fetch with the live session
      func: readUsageInPage,
      args: [meta.url],
    });
    const res = inj?.result;
    if (res?.ok) {
      await save(res.data, { ...meta, capturedAt: Date.now(), source: "tab" });
      return { ok: true };
    }
    return { ok: false, reason: "fetch-failed", error: res?.error || "no result" };
  } catch (err) {
    // e.g. the tab is discarded/unloaded and can't run a script right now.
    return { ok: false, reason: "inject-failed", error: String(err) };
  }
}

// Runs inside the Claude.ai page. Must be self-contained (no closure refs).
function readUsageInPage(url) {
  return fetch(url, { credentials: "include", headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json().then((data) => ({ ok: true, data })) : { ok: false, error: "HTTP " + r.status }))
    .catch((e) => ({ ok: false, error: String(e) }));
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
      : "Couldn't read usage from your Claude.ai tab: " + r.error;
  await setError(meta, msg);
  return { ok: false, error: msg };
}

// Prefer a fully-loaded, non-discarded Claude.ai tab so the injected fetch runs.
async function firstClaudeTab() {
  const tabs = await chrome.tabs.query({ url: "https://claude.ai/*" });
  if (!tabs.length) return null;
  return (
    tabs.find((t) => !t.discarded && t.status === "complete") ||
    tabs.find((t) => !t.discarded) ||
    tabs[0]
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
