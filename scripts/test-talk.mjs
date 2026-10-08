// When Lax's own conversation starts fresh, and what it carries over (lib/talk.mjs).
import assert from 'node:assert/strict';
import { FRESH, freshDue, contextSize, recap } from '../lib/talk.mjs';

const H = 3600e3, now = Date.parse('2026-10-08T09:00:00Z');

// Quiet for 8h or more, or 150k tokens or more: start fresh. Otherwise carry on.
assert.equal(freshDue({ last: now - 7.9 * H, tokens: 1000 }, now), null);
assert.equal(freshDue({ last: now - 8 * H }, now), 'quiet 8h');
assert.equal(freshDue({ last: now - 13.5 * H }, now), 'quiet 13h');
assert.equal(freshDue({ last: now - H, tokens: 149_999 }, now), null);
assert.equal(freshDue({ last: now - H, tokens: 163_400 }, now), 'long (163k)');
assert.equal(freshDue({}, now), null); // nothing known yet (the first message, or a Lax from before)
assert.equal(freshDue(undefined, now), null);
assert.equal(freshDue({ last: now - 2 * H }, now, { hours: 1 }), 'quiet 2h');
assert.equal(freshDue({ tokens: 20 }, now, { maxTokens: 10 }), 'long (0k)');

// How full it is: everything one call read in (fresh, cached, and newly cached).
assert.equal(contextSize({ input_tokens: 2, cache_read_input_tokens: 398822, cache_creation_input_tokens: 1006, output_tokens: 154 }), 399830);
assert.equal(contextSize({}), 0);
assert.equal(contextSize(undefined), 0);

// "Start fresh", said on its own.
for (const t of ['start fresh', 'Start fresh.', "let's start over", 'start again', 'new conversation', 'a new chat', 'fresh start!',
  'forget this conversation', 'okay, start fresh', 'start a new conversation please', 'Lax, new chat'])
  assert.ok(FRESH.test(t), t);
for (const t of ['start the server fresh', 'start over the build', 'what is a new conversation?', 'make a new chat app', 'fresh', 'start'])
  assert.ok(!FRESH.test(t), t);

// The recap: what you said and what Lax answered, short; no steps, no context block.
const at = (m) => new Date(now + m * 60e3).toISOString();
const you = (text, m) => ({ type: 'user', uuid: 'u' + m, timestamp: at(m), message: { content: text } });
const me = (content, m) => ({ type: 'assistant', uuid: 'a' + m, timestamp: at(m), message: { content } });
const recs = [
  you('[Context now: x]\nsessions…\n[/Context]\n\nwhat is the weather?', 0),
  me([{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', name: 'WebFetch', input: { url: 'https://wttr.in' } }], 1),
  { type: 'user', uuid: 'r2', timestamp: at(2), message: { content: [{ type: 'tool_result', content: 'sunny' }] } },
  me([{ type: 'text', text: 'Sunny in Lisbon, 24 degrees.' }], 3),
  you('and tomorrow?', 4),
  me([{ type: 'text', text: 'x'.repeat(1000) }], 5),
];
const clean = (t) => t.replace(/^\[Context now[^\]\n]*\]\n[\s\S]*?\n\[\/Context\]\n*/, '');
const r = recap(recs, { clean });
assert.equal(r.split('\n').length, 4, r);
assert.match(r, /^You: what is the weather\?\nMe: Sunny in Lisbon, 24 degrees\.\nYou: and tomorrow\?\nMe: x+…$/);
assert.ok(!/Context|Let me look|WebFetch/.test(r), r);
assert.equal(r.split('\n')[3].length, 'Me: '.length + 300);
assert.equal(recap(recs, { turns: 1, clean }).split('\n')[0], 'You: and tomorrow?');
assert.equal(recap([]), '');

console.log('talk: all checks passed');
