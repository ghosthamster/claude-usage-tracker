// Minimal test for the usage parser. Run: node test/usage-parse.test.js
const assert = require("assert");

global.self = global;
require("../usage-parse.js");
const { parseUsage, topPercent } = self.ClaudeUsage;

let passed = 0;
const ok = (cond, name) => {
  assert.ok(cond, name);
  passed++;
};

// Real-world payload shape (2026-06).
const sample = {
  five_hour: { utilization: 12.0, resets_at: "2026-06-15T20:49:59Z" },
  seven_day: { utilization: 2.0, resets_at: "2026-06-17T04:59:59Z" },
  seven_day_opus: null,
  seven_day_sonnet: null,
  tangelo: null,
  iguana_necktie: null,
  extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null, currency: null },
};

const bars = parseUsage(sample);
ok(bars.length === 2, "two visible buckets");
ok(bars[0].key === "five_hour", "session bucket first");
ok(bars[0].percent === 12 && bars[0].valueText === "12%", "session percent + text");
ok(bars[0].resetsAt === "2026-06-15T20:49:59Z", "reset time carried through");
ok(bars[1].key === "seven_day", "weekly bucket second");
ok(topPercent(sample) === 12, "topPercent is the max utilization");

// Disabled extra_usage is hidden; enabled credit-based extra_usage shows credits.
ok(parseUsage({ extra_usage: { is_enabled: false, utilization: 5 } }).length === 0, "disabled extra_usage hidden");
const extra = parseUsage({
  extra_usage: { is_enabled: true, utilization: 40, used_credits: 4, monthly_limit: 10, currency: "USD" },
});
ok(extra.length === 1 && extra[0].valueText === "4 / 10 USD", "extra_usage credit text");

// Unknown internal codenames with numbers are ignored, not prettified.
ok(parseUsage({ tangelo: { utilization: 99 } }).length === 0, "unknown bucket ignored");

// Defensive: bad input.
ok(parseUsage(null).length === 0, "null input -> []");
ok(topPercent({}) === null, "empty object -> null topPercent");

console.log(`ok — ${passed} assertions passed`);
