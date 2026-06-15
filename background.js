// Service worker: stores the latest usage reading and coordinates refreshes.
//
// Privacy posture:
//   - Reads only your own usage endpoint (/api/organizations/{org}/usage) using
//     the Claude.ai session you're already logged in to. No other traffic is read.
//   - All data stays on this device in chrome.storage.local. Nothing is sent
//     anywhere. No analytics, no tracking, no accounts, no remote server.
//   - Background polling runs on a randomized ~5 min timer (see MIN/MAX). It
//     refreshes through an open Claude.ai tab when possible, otherwise does a
//     direct fetch of your own usage endpoint.

importScripts("usage-parse.js"); // provides self.ClaudeUsage

const MIN_MINUTES = 4; // randomized background interval, lower bound
const MAX_MINUTES = 6; // ...upper bound (centers on ~5 min)
const STORAGE_KEY = "usage";
const META_KEY = "usageMeta"; // { url, capturedAt, source, lastError }

// --- Scheduling: a self-rescheduling one-shot alarm with a random delay, so the
// polling interval is jittered rather than a fixed cadence. ---
function scheduleNext() {
  const minutes = MIN_MINUTES + Math.random() * (MAX_MINUTES - MIN_MINUTES);
  chrome.alarms.create("refresh", { delayInMinutes: minutes });
}

chrome.runtime.onInstalled.addListener(scheduleNext);
chrome.runtime.onStartup.addListener(scheduleNext);
// Whenever the service worker spins up, make sure an alarm exists.
chrome.alarms.get("refresh", (a) => {
  if (!a) scheduleNext();
});

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
    const { [META_KEY]: meta } = await chrome.storage.local.get(META_KEY);
    if (meta?.url) await doRefresh(meta);
  } finally {
    scheduleNext();
  }
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

// Core refresh used by both the timer and the popup button:
//   1) preferred: read via an open Claude.ai tab (its live session)
//   2) fallback: direct fetch of the user's own usage endpoint
async function doRefresh(meta) {
  const viaTab = await refreshViaTab(meta);
  if (viaTab.ok) return { ok: true };
  if (await directFetch(meta)) return { ok: true };
  return { ok: false, reason: viaTab.reason, error: viaTab.error };
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

// Direct background fetch of the user's own usage endpoint. Cookies are attached
// via host_permissions. May fail if Claude requires page context; that's fine —
// the tab path covers the common case, and we just keep the last reading.
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

// User-initiated refresh (the popup button): surfaces actionable guidance.
async function refresh() {
  const { [META_KEY]: meta } = await chrome.storage.local.get(META_KEY);
  if (!meta?.url) {
    return { ok: false, error: "Open claude.ai/settings/usage once so the extension can read your usage." };
  }
  const r = await doRefresh(meta);
  if (r.ok) return { ok: true };
  const msg =
    r.reason === "no-tab"
      ? "Couldn't refresh in the background — open a Claude.ai tab and try again."
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
