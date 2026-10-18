// How long a hook may wait for you on the phone, in three layers, each outlasting the one inside it:
//   the server's wait for your answer   at most MAX_WAIT_S: a scheduled job 10 min; else "wait before terminal"
//                                        (15 s to 2 min), 4x for a question you have to read
//   the hook's request to the server    ASK_MS, a little longer, so the server's "no answer" always arrives
//   Claude Code's timeout for the hook  EVENTS, longer again (installed in ~/.claude/settings.json by install-hooks)
// The rest of the hooks only tell Lax what happened (0.4 s at most), so a few seconds is plenty.
export const MAX_WAIT_S = 600;
export const ASK_MS = (MAX_WAIT_S + 30) * 1000;
export const EVENTS = { SessionStart: 5, UserPromptSubmit: 5, PreToolUse: MAX_WAIT_S + 40, PostToolUse: 5, PostToolUseFailure: 5,
  Notification: 5, PermissionRequest: MAX_WAIT_S + 40, Stop: 5, SessionEnd: 2 };
