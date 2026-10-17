// Quick actions by voice: a closed list of things Lax may type into a live `lax` session (bin/claude-lax.mjs).
// Never free text: injected keys are as powerful as typing at the terminal.
import net from 'node:net';
import { SEED } from './vocab.mjs';
import { DEFAULT_COMPANION_NAME } from './names.mjs';

/** action → what the wrapper does:
 *  text: typed, then Enter on its own (typed together, it reads as a paste) · keys: pressed as is
 *  mode: Shift+Tab until the footer shows that mode · read: then send the screen back after that many ms (close: Esc after) */
export const MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
export const ACTIONS = {
  clear: { text: '/clear' }, compact: { text: '/compact' }, continue: { text: 'continue' }, stop: { keys: '\x1b' },
  quit: { text: '/exit' }, exit: { text: '/exit' }, close: { text: '/exit' },
  'plan mode': { mode: 'plan' }, 'auto mode': { mode: 'auto' }, 'manual mode': { mode: 'manual' }, 'accept edits': { mode: 'accept edits' },
  context: { text: '/context', read: 2500 },
  usage: { text: '/usage', read: 2500, close: true }, cost: { text: '/usage', read: 2500, close: true },
  model: { text: '/model', read: 1500, close: true }, // which model: the picker's ✔, then Esc
  ...Object.fromEntries(MODELS.map((m) => [`model ${m}`, { text: `/model ${m}`, read: 1500 }])),
  // Answers to a menu an action opened ("Switch model?"), picked on the phone: never from voice (see voiceAction).
  'pick 1': { keys: '1', read: 1500 }, 'pick 2': { keys: '2', read: 1500 },
};

/** What speech often hears instead of an action's words (the built-in pairs of Lax's vocabulary). */
const MISHEARD = SEED;
/** The same actions said in Portuguese. */
const PT = { limpa: 'clear', limpar: 'clear', compacta: 'compact', compactar: 'compact', continua: 'continue', continuar: 'continue',
  para: 'stop', pára: 'stop', parar: 'stop', sai: 'exit', sair: 'exit', fecha: 'close', fechar: 'close',
  'modo plano': 'plan mode', 'modo de plano': 'plan mode', 'modo planeamento': 'plan mode', 'modo de planeamento': 'plan mode',
  'modo automático': 'auto mode', 'modo auto': 'auto mode', 'modo manual': 'manual mode', 'aceitar edições': 'accept edits', 'aceita edições': 'accept edits',
  contexto: 'context', uso: 'usage', utilização: 'usage', custo: 'cost', modelo: 'model' };

/** "Clear." / "stop!" / "/compact" / "Slash clear" (as speech hears it) / "Plan mode." / "switch to auto mode" /
 *  "use sonnet" → the action; anything longer ("clear up the README") is a normal message. */
export function voiceAction(text) {
  let w = String(text || '').trim().toLowerCase().replace(/[.!?,\s]+$/, '').replace(/\s+/g, ' ')
    .replace(/^(\/|slash )/, '').replace(/^(switch to|go to|change to|use|muda para|mudar para|passa para|passar para|usa|usar) (?:o )?/, '');
  if (Object.hasOwn(MISHEARD, w)) w = MISHEARD[w];
  if (Object.hasOwn(PT, w)) w = PT[w];
  const model = /^(?:model |modelo )?(\w+)(?: model)?$/.exec(w)?.[1]; // "sonnet", "model sonnet", "sonnet model", "modelo sonnet"
  if (MODELS.includes(model)) return `model ${model}`;
  return Object.hasOwn(ACTIONS, w) && !w.startsWith('pick ') ? w : null;
}

/** "Talk to edge cava" / "switch to the side-project session" / "go to lax cli two" / "go to edge kava" → that tab's session
 *  id; "back to you" / "talk to Lax" → 'all' (Lax's own tab); anything that doesn't name a tab (or a Lax) → null, a
 *  normal message. tabs: the phone's tabs, as [{ id, project, where }], in order. A tab's full name ("lax·cli 2") wins,
 *  then its project; names match without spaces or dashes, and a near miss counts. */
export function tabCommand(text, tabs, name = DEFAULT_COMPANION_NAME) {
  const w = String(text || '').trim().toLowerCase().replace(/[.!?,\s]+$/, '').replace(/\s+/g, ' ');
  // Filler at the end is dropped, and only filler. "To"/"too" may be "two" (a numbered tab), so they're tried both ways.
  const m = /^(?:talk to|talk with|speak to|switch to|go to|go back to|back to|change to|fala com|falar com|muda para|mudar para|passa para|vai para|volta para|voltar para|volta a|volta ao|volta à) (?:the |[aà] sessão d[oea] |o |a |à |ao )?(.+?)(?: (?:session|tab|please|now|the|a|sessão|separador|por favor|agora))*$/.exec(w);
  if (!m) return null;
  const NUM = { one: '1', two: '2', to: '2', too: '2', three: '3', four: '4', for: '4', five: '5',
    um: '1', dois: '2', duas: '2', três: '3', tres: '3', quatro: '4', cinco: '5' };
  const numbered = squash(m[1].replace(/(?<![\p{L}])(one|two|to|too|three|four|for|five|um|dois|duas|três|tres|quatro|cinco)(?![\p{L}])/gu, (n) => NUM[n]));
  const plain = squash(m[1].replace(/ (?:to|two|too)$/, ''));
  if (['you', 'yourself', 'ti', 'tu', squash(name)].includes(plain)) return 'all';
  const labels = tabLabels(tabs).map(squash);
  const byLabel = tabs.find((t, i) => labels[i] === numbered);
  if (byLabel) return byLabel.id;
  if (plain.length < 3) return null;
  const hit = (t) => [squash(t.project), squash(t.project + (t.where || 'cli'))].some((n) => n === plain || (n.length >= 5 && near(n, plain)));
  return tabs.find(hit)?.id ?? null;
}
/** Tab names: project·where, numbered if repeated ("lax·cli", "lax·cli 2"). The page (public/lax.js) names them the same way. */
export function tabLabels(list) {
  const seen = {};
  return list.map((s) => { const base = `${s.project}·${s.where || 'cli'}`; seen[base] = (seen[base] || 0) + 1; return seen[base] > 1 ? `${base} ${seen[base]}` : base; });
}
const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
// At most one letter off per five ("edge kava", "sideprojects"), never more than two.
function near(a, b) {
  const max = Math.min(2, Math.floor(a.length / 5));
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** A numbered menu Claude Code is waiting on at the bottom of the screen ("Switch model?" before a model switch):
 *  { question, detail, options: [label…] } (options in order: option i is picked by pressing i+1), or null. */
export function screenMenu(screen) {
  const lines = String(screen || '').split('\n'), opts = [];
  let i = lines.length - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  for (; i >= 0; i--) { const m = /^\s*(?:❯\s*)?(\d+)\.\s+(.+?)\s*$/.exec(lines[i]); if (!m) break; opts.unshift(m[2]); }
  if (opts.length < 2) return null;
  const body = []; // the menu's text: up to the line it starts at (Claude Code draws a ▔ rule above it)
  for (; i >= 0 && !/^[▔─]{10,}/.test(lines[i]); i--) body.unshift(lines[i].trim());
  const text = body.filter(Boolean);
  return text.length ? { question: text[0], detail: text.slice(1).map((l) => /[.!?]$/.test(l) ? l : l + '.').join(' '), options: opts } : null;
}

/** The permission mode in Claude Code's footer ("⏸ plan mode on", "⏵⏵ accept edits on"), or null. */
export function screenMode(screen) {
  const lines = String(screen || '').split('\n').filter((l) => l.trim()).slice(-4).reverse();
  for (const l of lines) { const m = /(\w+) mode on\b|accept edits on\b|bypass permissions on\b/.exec(l); if (m) return m[1] || m[0].replace(/ on$/, ''); }
  return null;
}

/** What a status action's screen says: { say } (one short sentence to read aloud) and { text } (the details, for the feed). */
export function readStatus(action, screen) {
  const s = String(screen || '');
  if (action === 'context') {
    const at = s.lastIndexOf('Context Usage'), part = s.slice(Math.max(0, at)).split(/\n─{10,}/)[0];
    // The header ("27.3k/1m tokens (3%)") scrolls off a short window (Claude Code redraws in place, no scrollback);
    // then it's worked out from what stays at the bottom: free space (and its %) and the autocompact buffer.
    let m = /([\d.]+k?)\/([\d.]+[km]) tokens \((\d+)%\)/.exec(part);
    const free = /Free space: ([\d.]+[km]?) \(([\d.]+)%\)/.exec(part), buffer = /Autocompact buffer: ([\d.]+[km]?) tokens/.exec(part);
    if (!m && free && +free[2] > 0) {
      const k = (t) => parseFloat(t) * (/m$/.test(t) ? 1000 : /k$/.test(t) ? 1 : 0.001);
      const fmt = (n) => n >= 990 ? `${+(n / 1000).toFixed(1)}m` : n >= 100 ? `${Math.round(n)}k` : `${+n.toFixed(1)}k`;
      const total = k(free[1]) / (free[2] / 100), used = Math.max(0, total - k(free[1]) - (buffer ? k(buffer[1]) : 0));
      m = [null, fmt(used), fmt(total), String(Math.round(used / total * 100))];
    }
    const cats = [...part.matchAll(/⛁ ([^:\n]+): ([\d.]+k?) tokens/g)].map((c) => `${c[1]}: ${c[2]}`);
    return m ? { say: `Context is ${m[3]}% full: ${m[1]} of ${m[2]} tokens.`, text: [`${m[1]}/${m[2]} tokens (${m[3]}%)`, ...cats].join('\n') }
      : { say: 'I couldn\'t read the context.', text: '' };
  }
  if (action === 'model') { // the picker: "❯ 2.  Opus 5.5 ✔   For complex work…" ("Default (recommended) ✔  Opus 5.5 · …")
    const l = s.split('\n').filter((x) => x.includes('✔')).pop() || '';
    const name = /^\s*(?:❯\s*)?\d+\.\s+(.+?)\s*✔\s*(.*)$/.exec(l);
    const model = name && (/^Default/.test(name[1]) ? name[2].split('·')[0].trim() : name[1]);
    return model ? { say: `This session uses ${model}.`, text: `model: ${model}` } : { say: 'I couldn\'t read the model.', text: '' };
  }
  if (action.startsWith('model ') || action.startsWith('pick ')) { // "⎿  Set model to Sonnet 5.5 and saved as your default for new sessions"
    const menu = screenMenu(s); // mid-conversation, Claude Code asks first ("Switch model?"): the phone answers it
    if (menu) return { say: menu.question, text: '', menu };
    const kept = /Kept model as (.+?)\s*$/m.exec(s.slice(s.lastIndexOf('Kept model as')));
    if (kept && s.lastIndexOf('Kept model as') > s.lastIndexOf('Set model to')) return { say: `Kept ${kept[1]}.`, text: kept[0].trim() };
    const m = /Set model to (.+?)(?: and saved[^\n]*)?\s*$/m.exec(s.slice(s.lastIndexOf('Set model to')));
    return m ? { say: `Switched to ${m[1]}.${/saved as your default/.test(m[0]) ? ' New sessions will use it too.' : ''}`, text: m[0].trim() } : { say: 'I couldn\'t switch the model.', text: '' };
  }
  const limit = (name) => { const m = new RegExp(`${name}\\n[^\\n]*?(\\d+)% used\\n\\s*Resets ([^\\n(]+)`).exec(s); return m && { used: m[1], resets: m[2].trim() }; };
  const sess = limit('Current session'), week = limit('Current week \\(all models\\)');
  const cost = /Total cost:\s+(\$[\d.]+)/.exec(s)?.[1];
  if (!sess && !week) return { say: 'I couldn\'t read the usage.', text: '' };
  const say = [sess && `This session window is ${sess.used}% used, resets ${sess.resets}.`, week && `This week, ${week.used}%.`].filter(Boolean).join(' ');
  const text = [sess && `session ${sess.used}% · resets ${sess.resets}`, week && `week ${week.used}% · resets ${week.resets}`, cost && `this session: ${cost}`].filter(Boolean).join('\n');
  return { say, text };
}

/** Ask the wrapper behind `sock` to do `action`. Resolves { ok, screen? } (screen: for actions that read it back). */
export function sendAction(sock, action, timeout = 8000) {
  return new Promise((resolve) => {
    if (!sock || !Object.hasOwn(ACTIONS, action)) return resolve({ ok: false });
    let out = '';
    const c = net.connect(sock, () => c.write(action + '\n'));
    c.setEncoding('utf8'); c.setTimeout(timeout, () => c.destroy());
    c.on('data', (d) => { out += d; });
    c.on('close', () => { try { resolve(JSON.parse(out)); } catch { resolve({ ok: false }); } });
    c.on('error', () => resolve({ ok: false }));
  });
}
