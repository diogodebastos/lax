// Plan usage from the status line (lib/usage.mjs).
import assert from 'node:assert/strict';
import { readUsage, resetsIn, usageLine, usageText } from '../lib/usage.mjs';

const now = Date.UTC(2026, 9, 6, 12, 0);
const rl = { five_hour: { used_percentage: 23.4, resets_at: now / 1000 + 130 * 60 }, seven_day: { used_percentage: 41, resets_at: now / 1000 + 3 * 864e2 } };

const u = readUsage(rl);
assert.deepEqual(u, { five_hour: { pct: 23, resets: now + 130 * 60000 }, seven_day: { pct: 41, resets: now + 3 * 864e5 } });
assert.equal(readUsage(null), null);
assert.equal(readUsage({}), null);
assert.equal(readUsage({ five_hour: { used_percentage: 'x' } }), null);
assert.deepEqual(readUsage({ seven_day: { used_percentage: 140 } }), { seven_day: { pct: 100, resets: null } });

assert.equal(resetsIn(now + 5 * 60000, now), 'in 5m');
assert.equal(resetsIn(now + 130 * 60000, now), 'in 2h 10m');
assert.equal(resetsIn(now + 120 * 60000, now), 'in 2h');
assert.match(resetsIn(now + 3 * 864e5, now), /^[A-Z][a-z]{2} \d\d:\d\d$/);
assert.equal(resetsIn(null, now), '');

assert.equal(usageLine(u), '5h 23% · 7d 41%');
assert.equal(usageLine({ seven_day: { pct: 9 } }), '7d 9%');
assert.match(usageText({ ...u, ts: now - 4 * 60000 }, now), /^5-hour limit 23% used \(resets in 2h 10m\); weekly limit 41% used \(resets .+\), as of 4 min ago\.$/);
assert.match(usageText(null, now), /^unknown/);

console.log('usage ok');
