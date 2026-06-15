// Runs in the ISOLATED world. Bridges page-world messages to the extension,
// and can perform a same-origin authenticated refresh on request (it inherits
// the user's existing Claude.ai session — no cookie handling on our side).
(function () {
  "use strict";

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== "claude-usage-tracker" || msg.type !== "USAGE_DATA") return;
    chrome.runtime.sendMessage({
      type: "USAGE_CAPTURED",
      channel: msg.channel,
      url: msg.url,
      data: msg.data,
      capturedAt: msg.capturedAt,
    });
  });

  // Allow the service worker / popup to ask this tab to refresh, reusing the
  // page's own session. Same-origin fetch => cookies + any CSRF context apply.
  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (req?.type !== "REFRESH_FROM_TAB" || !req.url) return;
    // Defense-in-depth: only ever fetch a same-origin Claude.ai URL.
    let url;
    try {
      url = new URL(req.url, location.origin);
    } catch (_) {
      sendResponse({ ok: false, error: "bad url" });
      return; // sync response
    }
    if (url.origin !== location.origin) {
      sendResponse({ ok: false, error: "cross-origin blocked" });
      return;
    }
    fetch(url.href, { credentials: "include", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async response
  });
})();
