// Runs in the PAGE (MAIN) world so it can see Claude.ai's own network activity.
// We do NOT initiate any requests here. We only observe the ONE endpoint the
// usage page already calls — /api/organizations/{org_id}/usage — and forward
// that response to our content script. Nothing else is read; chat traffic,
// other API calls, and page content are never inspected.
(function () {
  "use strict";

  // Confirmed endpoint: /api/organizations/{org_id}/usage
  const isUsageUrl = (url) => {
    try {
      const p = new URL(url, location.origin).pathname;
      return /\/api\/organizations\/[^/]+\/usage\/?$/.test(p);
    } catch (_) {
      return false;
    }
  };

  const forward = (channel, url, data) => {
    try {
      window.postMessage(
        { source: "claude-usage-tracker", type: "USAGE_DATA", channel, url, data, capturedAt: Date.now() },
        location.origin
      );
    } catch (_) {}
  };

  // --- fetch (how the usage page loads its data) ---
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    return origFetch.apply(this, args).then((res) => {
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        const ct = res.headers.get("content-type") || "";
        if (url && isUsageUrl(url) && ct.includes("json")) {
          res.clone().json().then((d) => forward("fetch", url, d)).catch(() => {});
        }
      } catch (_) {}
      return res;
    });
  };

  // --- XMLHttpRequest (fallback, in case the app ever uses it) ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__cu_url = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      try {
        if (this.__cu_url && isUsageUrl(this.__cu_url)) {
          forward("xhr", this.__cu_url, JSON.parse(this.responseText));
        }
      } catch (_) {}
    });
    return origSend.apply(this, args);
  };
})();
