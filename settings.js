// Shared settings with defaults. Loaded via importScripts() in the service
// worker and a <script> tag in the popup/options pages. Stored locally only.
(function (root) {
  "use strict";

  const DEFAULTS = {
    intervalMinutes: 5, // center of the randomized background poll
    pauseWhenIdle: true, // skip background polls while the machine is idle/locked
    backgroundFetchWhenNoTab: true, // refresh even when no Claude.ai tab is open
    notifyThreshold: 90, // notify when a limit crosses this % (0 = off)
  };

  async function getSettings() {
    const { settings } = await chrome.storage.local.get("settings");
    return { ...DEFAULTS, ...(settings || {}) };
  }

  async function setSettings(patch) {
    const next = { ...(await getSettings()), ...patch };
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  root.ClaudeUsageSettings = { DEFAULTS, getSettings, setSettings };
})(typeof self !== "undefined" ? self : this);
