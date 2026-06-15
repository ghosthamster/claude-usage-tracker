// Service worker: stores the latest usage reading and coordinates refreshes.
//
// Privacy posture:
//   - Reads only your own usage endpoint (/api/organizations/{org}/usage) using
//     the Claude.ai session you're already logged in to. No other traffic is read.
//   - All data stays on this device in chrome.storage.local. Nothing is sent
//     anywhere. No analytics, no tracking, no accounts, no remote server.
//   - Background polling runs on a randomized ~5 min timer (configurable). It
//     pauses while the machine is idle, backs off when requests fail, and can be
//     limited to only run when a Claude.ai tab is open (see Options).

importScripts("usage-parse.js", "settings.js"); // self.ClaudeUsage, self.ClaudeUsageSettings

const STORAGE_KEY = "usage";
const META_KEY = "usageMeta"; // { url, capturedAt, source, lastError }
const FAIL_KEY = "failCount"; // consecutive background failures (for backoff)
const NOTIFY_KEY = "notified"; // last "<bucket>:<resets_at>" we notified for
const MAX_BACKOFF_MINUTES = 60;

const { getSettings } = self.ClaudeUsageSettings;

// --- Scheduling: a self-rescheduling one-shot alarm with a random, backoff-aware
// delay, so the cadence is jittered rather than a fixed tick. ---
async function scheduleNext() {
  const s = await getSettings();
  const { [FAIL_KEY]: failCount = 0 } = await chrome.storage.local.get(FAIL_KEY);
  const base = Math.min(s.intervalMinutes * Math.pow(2, failCount), MAX_BACKOFF_MINUTES);
  const jittered = base * (0.85 + Math.random() * 0.3); // ±15%
  chrome.alarms.create("refresh", { delayInMinutes: Math.max(1, jittered) });
}

chrome.runtime.onInstalled.addListener(scheduleNext);
chrome.runtime.onStartup.addListener(scheduleNext);

// On every service-worker spin-up: ensure an alarm exists and restore the badge.
chrome.alarms.get("refresh", (a) => {
  if (!a) scheduleNext();
});
(async () => {
  const { [STORAGE_KEY]: data } = await chrome.storage.local.get(STORAGE_KEY);
  if (data) updateBadge(data);
})();

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

// Background tick: refresh silently (no error nagging), then reschedule.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "refresh") return;
  try {
    await backgroundRefresh();
  } finally {
    await scheduleNext();
  }
});

async function backgroundRefresh() {
  const s = await getSettings();
  const { [META_KEY]: meta } = await chrome.storage.local.get(META_KEY);
  if (!meta?.url) return;

  // Don't poll while the user is away (most "automation-like", least useful).
  if (s.pauseWhenIdle && (await queryIdle(60)) !== "active") return;

  const r = await doRefresh(meta, { allowDirect: s.backgroundFetchWhenNoTab });
  const { [FAIL_KEY]: failCount = 0 } = await chrome.storage.local.get(FAIL_KEY);
  if (r.ok) {
    if (failCount) await chrome.storage.local.set({ [FAIL_KEY]: 0 });
  } else if (r.reason === "no-tab") {
    // Tab-gated mode with no tab open: expected, not a failure — don't back off.
  } else {
    await chrome.storage.local.set({ [FAIL_KEY]: Math.min(failCount + 1, 6) });
  }
}

async function save(data, meta) {
  const clean = { ...meta };
  delete clean.lastError; // a successful save clears any previous error
  await chrome.storage.local.set({ [STORAGE_KEY]: data, [META_KEY]: clean });
  updateBadge(data);
  maybeNotify(data);
}

async function setError(meta, msg) {
  await chrome.storage.local.set({ [META_KEY]: { ...meta, lastError: msg } });
}

// Core refresh used by both the timer and the popup button:
//   1) preferred: read via an open Claude.ai tab (its live session)
//   2) fallback (if allowed): direct fetch of the user's own usage endpoint
async function doRefresh(meta, opts) {
  const allowDirect = opts ? opts.allowDirect : true;
  const viaTab = await refreshViaTab(meta);
  if (viaTab.ok) return { ok: true };
  if (allowDirect) {
    if (await directFetch(meta)) return { ok: true };
    return { ok: false, reason: "fetch-failed", error: viaTab.error || "background fetch failed" };
  }
  return { ok: false, reason: viaTab.reason, error: viaTab.error };
}

// Reads usage from a live Claude.ai tab using that tab's own session. Tries each
// candidate tab until one succeeds. Injects the fetch on demand (chrome.scripting)
// rather than relying on a pre-injected content script.
async function refreshViaTab(meta) {
  const tabs = await claudeTabs();
  if (!tabs.length) return { ok: false, reason: "no-tab" };
  let lastErr = "no result";
  for (const tab of tabs) {
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
      lastErr = res?.error || lastErr;
    } catch (err) {
      lastErr = String(err); // e.g. tab discarded/unloaded; try the next one
    }
  }
  return { ok: false, reason: "fetch-failed", error: lastErr };
}

// Runs inside the Claude.ai page. Must be self-contained (no closure refs).
function readUsageInPage(url) {
  return fetch(url, { credentials: "include", headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json().then((data) => ({ ok: true, data })) : { ok: false, error: "HTTP " + r.status }))
    .catch((e) => ({ ok: false, error: String(e) }));
}

// Direct background fetch of the user's own usage endpoint. Cookies are attached
// via host_permissions. May fail if Claude requires page context; that's fine —
// the tab path covers the common case, and we keep the last reading.
async function directFetch(meta) {
  try {
    const r = await fetch(meta.url, { credentials: "include", headers: { accept: "application/json" } });
    if (!r.ok) return false;
    const data = await r.json();
    await save(data, { ...meta, capturedAt: Date.now(), source: "background" });
    return true;
  } catch (_) {
    return false;
  }
}

// User-initiated refresh (the popup button): always allowed to use the direct
// fallback, and surfaces actionable guidance on failure.
async function refresh() {
  const { [META_KEY]: meta } = await chrome.storage.local.get(META_KEY);
  if (!meta?.url) {
    return { ok: false, error: "Open claude.ai/settings/usage once so the extension can read your usage." };
  }
  const r = await doRefresh(meta, { allowDirect: true });
  if (r.ok) {
    await chrome.storage.local.set({ [FAIL_KEY]: 0 });
    return { ok: true };
  }
  const msg = "Couldn't read your usage right now. Open a Claude.ai tab and try again.";
  await setError(meta, msg);
  return { ok: false, error: msg };
}

// Notify once per limit-window when a bucket crosses the configured threshold.
async function maybeNotify(data) {
  try {
    const s = await getSettings();
    if (!s.notifyThreshold) return;
    const bars = ClaudeUsage.parseUsage(data).filter((b) => b.percent >= s.notifyThreshold && b.resetsAt);
    if (!bars.length) return;
    const top = bars.reduce((a, b) => (b.percent > a.percent ? b : a));
    const tag = `${top.key}:${top.resetsAt}`;
    const { [NOTIFY_KEY]: notified } = await chrome.storage.local.get(NOTIFY_KEY);
    if (notified === tag) return; // already notified for this window
    await chrome.storage.local.set({ [NOTIFY_KEY]: tag });
    chrome.notifications.create(tag, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Claude usage is high",
      message: `${top.label} is at ${Math.round(top.percent)}%.`,
    });
  } catch (_) {}
}

function queryIdle(seconds) {
  return new Promise((resolve) => chrome.idle.queryState(seconds, resolve));
}

// All loaded, non-discarded Claude.ai tabs first (so the injected fetch can run).
async function claudeTabs() {
  const tabs = await chrome.tabs.query({ url: "https://claude.ai/*" });
  return tabs.sort((a, b) => rank(a) - rank(b));
}
function rank(t) {
  if (!t.discarded && t.status === "complete") return 0;
  if (!t.discarded) return 1;
  return 2;
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
    chrome.action.setBadgeBackgroundColor({ color: pct >= 90 ? "#cc3333" : pct >= 75 ? "#d08700" : "#6645d8" });
  } catch (_) {}
}
