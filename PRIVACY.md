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

### We do not sell or share your data

We do not sell your data, share it with third parties, or use it for advertising,
creditworthiness, lending, or any purpose unrelated to the single purpose of this
extension (showing your own Claude.ai usage). No data is transferred off your
device, so there is nothing to sell or share.

### Permissions

- `host_permissions: https://claude.ai/*` — to read your usage from Claude.ai.
- `storage` — to cache the latest usage locally on your device.
- `alarms` — to schedule an infrequent (≤ every 15 min) refresh.
- `scripting` — to read the usage endpoint inside an already-open Claude.ai tab,
  using your existing session. Used only for this, only on Claude.ai.

### Changes

If this policy changes, the "Last updated" date above will be revised and the new
version published at the same URL.

### Developer & contact

Published by the developer of the open-source project
**Claude Usage Tracker** (https://github.com/ghosthamster/claude-usage-tracker).
Questions or concerns: open an issue on the repository, or email
support@mpopovych.com.
