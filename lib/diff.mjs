// An edit, the way Claude Code shows it: "+12 -3" and the first changed lines.
// From the tool's own patch when it has one (tool_response.structuredPatch), else from what it was asked to change.

/** { add, del, lines: ['+ …', '- …'] } for Edit / Write / MultiEdit, or null. */
export function editDiff(tool, input = {}, response = {}, max = /\.(md|markdown)$/i.test(input.file_path || '') ? 400 : 6) {
  const patch = response?.structuredPatch;
  let changed = [];
  if (Array.isArray(patch) && patch.length) {
    for (const h of patch) for (const l of h.lines || []) if (l[0] === '+' || l[0] === '-') changed.push(l);
  } else if (tool === 'Write') {
    if (typeof input.content !== 'string') return null;
    changed = input.content.replace(/\n$/, '').split('\n').map((l) => '+' + l);
  } else if (tool === 'Edit' || tool === 'MultiEdit') {
    const edits = tool === 'Edit' ? [input] : input.edits || [];
    for (const e of edits) changed.push(...lineDiff(String(e.old_string ?? ''), String(e.new_string ?? '')));
  } else return null;
  const add = changed.filter((l) => l[0] === '+').length, del = changed.length - add;
  if (!add && !del) return null;
  return { add, del, lines: changed.slice(0, max).map((l) => l[0] + ' ' + l.slice(1).replace(/\s+$/, '').slice(0, max > 6 ? 2000 : 200)) };
}

// Old vs new text: the lines they share at the start and the end aren't changes.
function lineDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  let s = 0; while (s < x.length && s < y.length && x[s] === y[s]) s++;
  let e = 0; while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++;
  return [...x.slice(s, x.length - e).map((l) => '-' + l), ...y.slice(s, y.length - e).map((l) => '+' + l)];
}
