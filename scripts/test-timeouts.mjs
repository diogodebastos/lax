// The hooks' timeouts (hooks/timeouts.mjs) stay layered: the server's longest wait for you < the hook's request <
// Claude Code's timeout for the hook. A hook killed first would leave a bubble on the phone that answers nothing.
import { MAX_WAIT_S, ASK_MS, EVENTS } from '../hooks/timeouts.mjs';
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const longestSetting = 120, question = longestSetting * 4; // "wait before terminal" at 2 min; a question waits 4x
check('a question at the longest setting fits the server\'s wait', question <= MAX_WAIT_S, `${question} s ≤ ${MAX_WAIT_S} s`);
check('the hook\'s request outlasts the server\'s wait', ASK_MS / 1000 > MAX_WAIT_S, `${ASK_MS / 1000} s`);
for (const ev of ['PreToolUse', 'PermissionRequest']) check(`Claude Code lets ${ev} outlast the hook's request`, EVENTS[ev] > ASK_MS / 1000, `${EVENTS[ev]} s`);
check('the rest only tell Lax what happened: a few seconds', ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionEnd'].every((e) => EVENTS[e] <= 5));
console.log(failed ? `\n${failed} timeout check(s) failed` : '\nall timeout checks passed');
process.exit(failed ? 1 : 0);
