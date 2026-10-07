// Narration from the transcript (lib/transcript.mjs) and edit diffs (lib/diff.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tailRecords, newAssistantText } from '../lib/transcript.mjs';
import { editDiff } from '../lib/diff.mjs';

const say = (uuid, text, extra = {}) => ({ type: 'assistant', uuid, message: { content: [{ type: 'text', text }] }, ...extra });
const tool = (uuid) => ({ type: 'assistant', uuid, message: { content: [{ type: 'tool_use', name: 'Bash' }] } });
const result = (uuid) => ({ type: 'user', uuid, message: { content: [{ type: 'tool_result', content: 'ok' }] } });
const prompt = (uuid, text) => ({ type: 'user', uuid, message: { content: text } });
const recs = [prompt('p0', 'old'), say('a0', 'old turn'), prompt('p1', 'fix it'), say('a1', 'Looking at the code.'), tool('t1'), result('r1'),
  { type: 'assistant', uuid: 'th', message: { content: [{ type: 'thinking', thinking: 'hm' }] } },
  say('a2', 'Found it.'), say('s1', 'subagent talk', { isSidechain: true }), tool('t2')];

// First look: only this turn, never the old one; sidechains and thinking are left out.
assert.deepEqual(newAssistantText(recs, null), { texts: ['Looking at the code.', 'Found it.'], last: 'a2' });
// Since the last one shown.
assert.deepEqual(newAssistantText(recs, 'a1'), { texts: ['Found it.'], last: 'a2' });
assert.deepEqual(newAssistantText(recs, 'a2'), { texts: [], last: 'a2' });
// Gone from the tail: back to this turn.
assert.deepEqual(newAssistantText(recs, 'zzz').texts, ['Looking at the code.', 'Found it.']);

// The tail of a real file: the cut-off first line is dropped.
const f = path.join(os.tmpdir(), `lax-tr-${process.pid}.jsonl`);
fs.writeFileSync(f, recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
assert.equal(tailRecords(f).length, recs.length);
assert.equal(tailRecords(f, 60).length < recs.length, true);
assert.deepEqual(tailRecords('/nope/none.jsonl'), []);
fs.rmSync(f);

// Diffs: the tool's own patch first.
assert.deepEqual(editDiff('Edit', {}, { structuredPatch: [{ lines: [' a', '-b', '+c', '+d '] }] }), { add: 2, del: 1, lines: ['- b', '+ c', '+ d'] });
// Without one: what it was asked to change, minus the lines both sides share.
assert.deepEqual(editDiff('Edit', { old_string: 'x\ny\nz', new_string: 'x\nY\nz' }), { add: 1, del: 1, lines: ['- y', '+ Y'] });
assert.deepEqual(editDiff('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b' }, { old_string: '', new_string: 'n' }] }).add, 2);
assert.deepEqual(editDiff('Write', { content: '1\n2\n3\n4\n5\n6\n7\n8\n' }), { add: 8, del: 0, lines: ['+ 1', '+ 2', '+ 3', '+ 4', '+ 5', '+ 6'] });
assert.equal(editDiff('Edit', { old_string: 'same', new_string: 'same' }), null);
assert.equal(editDiff('Bash', { command: 'ls' }), null);
console.log('transcript ok');

// Lax's own history: prompts, narration, steps and the answer, turn by turn; old turns cut.
{
  const { conversation } = await import('../lib/transcript.mjs');
  const T = (i) => new Date(Date.UTC(2026, 9, 7, 10, i)).toISOString();
  const recs = [
    { ...prompt('p1', 'weather tomorrow'), timestamp: T(0) },
    { ...say('a1', 'Checking.'), timestamp: T(1) },
    { type: 'assistant', uuid: 't1', timestamp: T(1), message: { content: [{ type: 'tool_use', name: 'WebFetch', input: { url: 'wttr.in' } }] } },
    { ...result('r1'), timestamp: T(2) },
    { ...say('a2', 'Sunny, 24.'), timestamp: T(2) },
    { ...prompt('p2', '<command-name>/clear</command-name>'), timestamp: T(3) },
    { ...prompt('p3', 'thanks'), timestamp: T(4) },
    { ...say('a3', 'Any time.'), timestamp: T(5) },
  ];
  const c = conversation(recs);
  assert.deepEqual(c.map((x) => x.kind), ['prompt', 'say', 'tool', 'answer', 'prompt', 'answer']);
  assert.equal(c[2].tool, 'WebFetch'); assert.equal(c[3].text, 'Sunny, 24.'); assert.equal(c[4].text, 'thanks');
  assert.deepEqual(conversation(recs, 1).map((x) => x.text), ['thanks', 'Any time.']);
  console.log('conversation ok');
}
