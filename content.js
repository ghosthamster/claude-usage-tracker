// Runs in the ISOLATED world. Sole job: relay the usage data that interceptor.js
// (page world) observes up to the extension. No requests are made here.
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
})();
