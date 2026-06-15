# Privacy Policy — Claude Usage Tracker

_Last updated: 2026-06-15_

**Claude Usage Tracker does not collect, transmit, or sell any personal data.**

- The extension reads your Claude.ai subscription usage by observing the single
  usage request (`/api/organizations/{org}/usage`) the Claude.ai page already
  makes in your own browser session. It inspects no other traffic.
- Usage figures and the learned endpoint URL are stored **locally** on your device
  via `chrome.storage.local`. They never leave your browser.
- The extension does **not** read, store, or transmit your cookies, authentication
  tokens, passwords, message contents, or any other Claude.ai data beyond the
  usage numbers shown in the popup.
- The extension **never makes a network request on its own.** It only observes
  data the Claude.ai page already loaded, or asks an already-open Claude.ai tab to
  re-read usage using your existing login.
- There are **no analytics, no tracking, no accounts, and no remote servers.**
  The developer receives no data of any kind.

### Permissions

- `host_permissions: https://claude.ai/*` — to read your usage from Claude.ai.
- `storage` — to cache the latest usage locally.
- `alarms` — to schedule an infrequent (≤ every 15 min) refresh.

### Contact

Questions: open an issue on the project repository.
