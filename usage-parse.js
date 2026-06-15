// Exact parser for Claude.ai's /api/organizations/{org}/usage response.
// Shared by popup.js (rendering) and background.js (badge). Loaded via a
// <script> tag in the popup and importScripts() in the service worker.
//
// Observed shape (2026-06): each bucket is { utilization: <percent 0-100>,
// resets_at: <ISO8601> } or null. `extra_usage` is credit-based.
(function (root) {
  "use strict";

  // Only known buckets are displayed. Unknown keys (internal codenames like
  // "tangelo", "omelette", "cinder_cove", ...) are ignored so we never surface
  // confusing internal names in the UI.
  const LABELS = {
    five_hour: "Current session · 5h",
    seven_day: "Weekly · all models",
    seven_day_opus: "Weekly · Opus",
    seven_day_sonnet: "Weekly · Sonnet",
    seven_day_haiku: "Weekly · Haiku",
    seven_day_cowork: "Weekly · Cowork",
    seven_day_oauth_apps: "Weekly · connected apps",
    extra_usage: "Extra usage",
  };

  const labelFor = (key) => LABELS[key];
  const pctText = (u) => `${Math.round(u * 10) / 10}%`;

  // Display order: session first, weekly next, extras last, rest in between.
  const orderOf = (k) => (k === "five_hour" ? 0 : k === "seven_day" ? 1 : k === "extra_usage" ? 9 : 5);

  function parseUsage(data) {
    if (!data || typeof data !== "object") return [];
    const bars = [];

    for (const key of Object.keys(data)) {
      if (!(key in LABELS)) continue; // ignore unknown/internal buckets
      const v = data[key];
      if (!v || typeof v !== "object") continue; // null buckets are skipped

      if (key === "extra_usage") {
        if (v.is_enabled && typeof v.utilization === "number") {
          const valueText =
            v.used_credits != null && v.monthly_limit != null
              ? `${v.used_credits} / ${v.monthly_limit}${v.currency ? " " + v.currency : ""}`
              : pctText(v.utilization);
          bars.push({ key, label: labelFor(key), percent: v.utilization, valueText, resetsAt: null });
        }
        continue;
      }

      if (typeof v.utilization === "number") {
        bars.push({
          key,
          label: labelFor(key),
          percent: v.utilization,
          valueText: pctText(v.utilization),
          resetsAt: v.resets_at || null,
        });
      }
    }

    bars.sort((a, b) => orderOf(a.key) - orderOf(b.key) || a.key.localeCompare(b.key));
    return bars;
  }

  function topPercent(data) {
    const bars = parseUsage(data);
    return bars.length ? Math.max(...bars.map((b) => b.percent)) : null;
  }

  root.ClaudeUsage = { parseUsage, topPercent };
})(typeof self !== "undefined" ? self : this);
