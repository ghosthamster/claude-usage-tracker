# Chrome Web Store listing

## Name
Claude Usage Tracker

## Summary (≤132 chars)
See your Claude.ai subscription usage — current session and weekly limits — at a
glance from your browser toolbar.

## Single purpose
Display the user's own Claude.ai subscription usage (session and weekly limits).

## Detailed description
Claude Usage Tracker puts your Claude.ai subscription usage in your toolbar so you
don't have to keep reopening the settings page.

- Current session (5h) and weekly limits as clear progress bars
- Reset times for each limit
- A badge showing your highest current utilization

Privacy first: everything stays on your device. There is no tracking, no
analytics, no accounts, and no servers. The extension never sends your data
anywhere. It only reads your usage from Claude.ai using the session you're already
logged in to, and stores it locally in your browser.

Not affiliated with or endorsed by Anthropic.

## Permission justifications
- **host_permissions `https://claude.ai/*`** — Required to read your subscription
  usage from Claude.ai and to refresh it through an open Claude.ai tab using your
  existing login. The extension reads only the usage endpoint
  (`/api/organizations/{org}/usage`).
- **storage** — To cache your latest usage locally so the popup loads instantly.
  Data never leaves your device.
- **alarms** — To schedule an infrequent (every ~15 minutes) refresh, and only
  when a Claude.ai tab is already open.
- **scripting** — To refresh usage, the extension runs a small one-line fetch of
  the usage endpoint inside an already-open Claude.ai tab (using your existing
  session). It is used only for this and only on Claude.ai.

## Data usage disclosures (Privacy practices tab)
- Does the extension collect or use data? **No data is collected or transmitted.**
- All processing happens locally on the user's device.
- Privacy policy URL: <host PRIVACY.md publicly and paste the URL here>

## Category
Productivity

## Assets needed
- 1280×800 screenshots of the popup (you already have one)
- 440×280 small promo tile (optional)
