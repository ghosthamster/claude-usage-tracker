# Claude Usage Tracker

A Chrome / Brave extension (Manifest V3) that shows your **Claude.ai subscription**
usage — current session and weekly limits — right in the toolbar, so you don't
have to keep reopening `claude.ai/settings/usage`.

> Not affiliated with or endorsed by Anthropic. Claude.ai has no official public
> API for subscription usage; this extension reads the same internal endpoint the
> usage page itself calls, which may change without notice.

## Privacy: everything stays on your device

This extension does **not** track you and has **no servers**.

- **No telemetry, no analytics, no accounts.** Nothing is ever sent to us or any
  third party — there is no "us" to send it to.
- **All data stays local** in `chrome.storage.local` on your own machine.
- **No cookie or token handling.** It reuses your existing Claude.ai login inside
  your browser; it never reads, stores, or transmits your credentials.
- **It reads exactly one endpoint** — `/api/organizations/{org}/usage` — and
  nothing else. Chat content and other traffic are never inspected.
- **Background polling** runs on a randomized ~5-minute timer (jittered between 4
  and 6 minutes). Each poll reads only your own usage endpoint — through an open
  Claude.ai tab when one exists, otherwise via a direct request using your
  existing login. Nothing is ever sent to any third party.
- **Minimal permissions:** `storage`, `alarms`, `scripting`, and host access to
  `https://claude.ai/*` only. `scripting` is used solely to read the usage
  endpoint from an open Claude.ai tab. No `<all_urls>`, no `webRequest`, no `tabs`
  permission, no access to any site other than Claude.ai.

## How it works

1. While you have a Claude.ai tab open, the page periodically loads your usage.
   A small page-world script (`interceptor.js`) notices *that one request* and
   hands the result to the extension.
2. The popup renders it as bars with reset times; the toolbar badge shows your
   highest utilization %.
3. A randomized ~5-minute timer (and the manual refresh button) re-reads your
   usage — through an open Claude.ai tab if one is available, otherwise via a
   direct request to your own usage endpoint using your existing login.

### Components

| File | World | Role |
|------|-------|------|
| `interceptor.js` | page (MAIN) | Observes the one usage request, forwards its JSON |
| `content.js` | isolated | Bridge; refreshes via the tab's own session (same-origin only) |
| `background.js` | service worker | Stores data, slow tab-based refresh, toolbar badge |
| `usage-parse.js` | shared | Maps the usage JSON to display bars + badge % |
| `popup/` | — | UI: usage bars, reset times, refresh |

## Install (development)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Open `https://claude.ai/settings/usage` once while logged in. The extension
   captures your first reading.
4. Click the toolbar icon to see usage.

## Endpoint & schema

`GET https://claude.ai/api/organizations/{org_id}/usage` — a plain REST/JSON
endpoint the usage page polls.

```jsonc
{
  "five_hour":  { "utilization": 12.0, "resets_at": "2026-06-15T20:49:59Z" },
  "seven_day":  { "utilization": 2.0,  "resets_at": "2026-06-17T04:59:59Z" },
  "seven_day_opus": null,        // model/feature buckets, null when N/A
  "seven_day_sonnet": null,
  "seven_day_cowork": null,
  "seven_day_oauth_apps": null,
  // ...other null codename buckets (tangelo, omelette, cinder_cove, ...)
  "extra_usage": { "is_enabled": false, "monthly_limit": null,
                   "used_credits": null, "utilization": null, "currency": null }
}
```

- `utilization` is already a **percentage** (0–100), not a raw count.
- A `null` bucket means it doesn't apply to this account — skip it.
- `extra_usage` is credit-based; shown only when `is_enabled` is true.

The mapping lives in `usage-parse.js`. Unknown codename buckets fall back to a
prettified label if they ever return data.

## Build a store package

```bash
./build.sh        # produces dist/claude-usage-tracker-<version>.zip
```

## Chrome Web Store checklist

- [x] Real icons (16/48/128)
- [ ] `PRIVACY.md` hosted at a public URL; link it in the store listing.
- [ ] Permission justifications (see `STORE_LISTING.md`).
- [ ] Screenshots (1280×800), short + detailed description.
- [ ] Single purpose statement: "Display the user's Claude.ai subscription usage."
- [ ] Confirm compliance with Anthropic's Usage Policy & Chrome Web Store policy.

## License

MIT — see [LICENSE](LICENSE).
