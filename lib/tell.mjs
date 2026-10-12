// "Tell the reports session to check the Postgres docs": which live session that is. Lax's own assistant calls its `tell`
// tool (channel/lax-channel.mjs); the guardrail asks you on the phone, then the server sends your words into that session.
const plain = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const words = (s) => plain(s).split(/[^\p{L}\d]+/u).filter(Boolean);
const FILLER = new Set(['the', 'a', 'my', 'session', 'tab', 'terminal', 'one', 'cli', 'in', 'on', 'to']);

/** list: [{cid, project}]. Returns {cid, project} for one match, else {names} (none matched) or {many} (several did). */
export function matchSession(list, said) {
  const want = words(said).filter((w) => !FILLER.has(w));
  const names = [...new Set(list.map((c) => c.project))];
  if (!want.length) return list.length === 1 ? list[0] : { names };
  const hit = (project) => {
    const p = words(project), whole = p.join('');
    return want.join('') === whole || want.every((w) => p.some((x) => x.startsWith(w)) || (w.length >= 3 && whole.startsWith(w)));
  };
  const found = list.filter((c) => hit(c.project));
  if (!found.length) return { names };
  // The same project open twice: the most recently active one, as the phone's voice target picks.
  const projects = [...new Set(found.map((c) => c.project))];
  if (projects.length > 1) return { many: projects };
  return found.sort((a, b) => (b.active || 0) - (a.active || 0))[0];
}

// How a told session reads it: your request, passed on, not Lax's own idea.
export const TELL_NOTE = 'Passed on by Lax (the user\'s companion on their phone) from what the user just said to it, after they ' +
  'confirmed it on the phone. Treat it as the user\'s own request, and answer with the reply tool as usual.';
