#!/usr/bin/env node
// Lax as a Claude Code channel: pushes what you say to Lax (phone) into this running session,
// sends Claude's replies back to Lax, and relays permission prompts to the phone.
// Claude Code spawns this over stdio; it talks to the Lax server on loopback with the Lax token.
// Start a session with: claude --dangerously-load-development-channels server:lax
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { claudePid, processArgs } from '../lib/claude-pid.mjs';
import { readToken } from '../lib/paths.mjs';
import { share, finishShare, pickOption } from '../lib/share.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LAX = process.env.LAX_URL || 'http://127.0.0.1:7777';
const TOKEN = readToken();
if (!TOKEN) { process.stderr.write('[lax-channel] no Lax token yet (start Lax first)\n'); process.exit(0); }
const CID = crypto.randomBytes(5).toString('hex');
const SESSION_PID = claudePid();
// Registered at user level, so this server starts in every session. Only sessions launched with the lax channel
// (`claude --dangerously-load-development-channels server:lax` / `--channels …lax…`) receive channel events;
// everywhere else stay dormant: no tools, no link to Lax (voice would vanish into a session that can't hear it).
const CHANNEL_MODE = process.env.LAX_CHANNEL_FORCE ? process.env.LAX_CHANNEL_FORCE === '1' // tests: on or off
  : /--(dangerously-load-development-)?channels\b[^]*\blax\b/.test(processArgs(SESSION_PID));
// Lax's own assistant (a voice run, lib/server talk()) gets only `gap`: it talks back through its answer, not `reply`.
const VOICE_MODE = !CHANNEL_MODE && process.env.LAX_VOICE === '1' && !process.env.LAX_REFLECT && !process.env.LAX_BUILD;
// Lax's own runs (reflecting, recalling, building) get nothing from here. Every other session may `recall`: Lax's
// long-term memory is for all of them, live with Lax or not. (The voice assistant searches its memory itself.)
const OWN_RUN = !!(process.env.LAX_REFLECT || process.env.LAX_RECALL || process.env.LAX_BUILD);
const RECALL_MODE = !OWN_RUN && !VOICE_MODE;
const log = (...a) => process.stderr.write(`[lax-channel] ${a.join(' ')}\n`); // stdout belongs to MCP

const post = (body) => fetch(`${LAX}/api/channel/event`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN },
  body: JSON.stringify({ cid: CID, ...body }), signal: AbortSignal.timeout(5000),
}).then((r) => r.json()).catch((e) => { log('post failed:', e.message); return { ok: false }; });

const mcp = new Server(
  { name: 'lax', version: '0.2.0' },
  {
    capabilities: {
      experimental: { 'claude/channel': {}, 'claude/channel/permission': {} },
      tools: {},
    },
    instructions:
      'Messages from <channel source="lax" chat_id="..."> are the user talking to you by voice through Lax, ' +
      'a pixel companion on their phone (they may be away from the keyboard). Treat them like normal user messages ' +
      'and do the work in this session. When done (or if you need to ask something), call the lax `reply` tool with the ' +
      'chat_id. Lax reads the reply aloud: make the first sentence short, plain and speakable (no markdown, no code); ' +
      'details may follow. ' +
      'If you can\'t do what they asked through Lax (no tool, no access, not built yet), or they say "you should be able to…" ' +
      'or "learn to…", call the lax `gap` tool once, then answer as usual: Lax keeps a wish list and may offer to learn it.',
  },
);

const GAP = {
  name: 'gap',
  description: 'Tell Lax about something the user asked for that you can\'t do (no tool, no access, not built yet), or that they ' +
    'said Lax should learn. Call it once per ask, then answer the user as usual. Lax keeps a wish list and may later offer, by voice, ' +
    'to learn it (on a branch the user merges).',
  inputSchema: {
    type: 'object',
    properties: {
      asked: { type: 'string', description: 'What the user asked for, in a few plain words ("share this to WhatsApp")' },
      why: { type: 'string', description: 'Why it couldn\'t be done ("no way to reach WhatsApp from here")' },
      idea: { type: 'string', description: 'How Lax could learn it, if you see a way (optional)' },
    },
    required: ['asked', 'why'],
  },
};

const RECALL = {
  name: 'recall',
  description: 'Ask Lax\'s long-term memory about the past: "how did we fix the tunnel 502?", "when did we decide X, and why?", ' +
    '"what did we try for Y?". Lax keeps every Claude Code session (episodes it wrote, its notes, and the archived transcripts, ' +
    'kept past Claude Code\'s 30 days) across all projects, and searches them. Answers with date and project. Takes a minute or two.',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The question, in plain words, with the names that matter (project, error, file, tool)' } },
    required: ['query'],
  },
};

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: VOICE_MODE ? [GAP] : !CHANNEL_MODE ? (RECALL_MODE ? [RECALL] : []) : [GAP, RECALL, {
    name: 'reply',
    description: 'Reply to the user through Lax (shown in a speech bubble on their phone and read aloud).',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'chat_id from the <channel source="lax"> tag' },
        text: { type: 'string', description: 'The reply. First sentence short and speakable.' },
      },
      required: ['chat_id', 'text'],
    },
  }, {
    name: 'share',
    description: 'Share a file or text from this Mac. Default (app "whatsapp"): opens the contact\'s chat in WhatsApp ' +
      'Desktop with the text typed in or the file pasted in; Lax then asks the user on the phone and sends only on their yes. ' +
      'If several contacts match, Lax asks the user which one on the phone and carries on by itself. ' +
      'Someone not in the Mac\'s Contacts is found with WhatsApp\'s own search (first match); the result then has "check", ' +
      'a screenshot: Read it and make sure the open chat is the right person before telling the user. ' +
      'Other apps: "airdrop", "messages", "mail" open that app with it; "any" opens the macOS share menu to pick an app. ' +
      'Returns what to tell the user (say it with reply).',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Absolute path of the file or image to share' },
        text: { type: 'string', description: 'Text to put in the chat' },
        to: { type: 'string', description: 'WhatsApp: contact name as the user said it ("Veralicious"); looked up in macOS Contacts, then WhatsApp' },
        app: { type: 'string', enum: ['whatsapp', 'airdrop', 'messages', 'mail', 'any'], description: 'Where to share (default whatsapp)' },
      },
    },
  }],
}));

// A share that asked "Which Vera?" waits here for your answer from the phone.
const picks = new Map(); // id -> { args, contacts }
async function shareAndTell(args) {
  const r = await share(args).catch((e) => ({ ok: false, say: `Sharing failed: ${e.message}` }));
  if (r.pick) {
    const id = crypto.randomBytes(4).toString('hex');
    picks.set(id, { args, contacts: r.pick.contacts });
    await post({ type: 'pick', id, question: r.pick.question, options: r.pick.options });
  }
  if (r.line) await post({ type: 'share', line: r.line, ready: r.ready }); // ready → Lax asks "Send it?" on the phone
  r.done?.then((res) => post({ type: 'shared', sent: res === 'shared', failed: res.startsWith('error') ? res.slice(7) : undefined })); // share sheet
  return r;
}

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'recall' && RECALL_MODE) {
    const r = await fetch(`${LAX}/api/recall`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': TOKEN },
      body: JSON.stringify({ query: String(req.params.arguments?.query || ''), cwd: process.cwd() }), signal: AbortSignal.timeout(5 * 60e3) })
      .then((x) => x.json()).catch((e) => ({ ok: false, answer: `Lax is not reachable (${e.message}).` }));
    return { content: [{ type: 'text', text: r.answer || 'Nothing came back.' }], isError: !r.ok };
  }
  if (req.params.name === 'share') {
    const { done, pick, ...r } = await shareAndTell(req.params.arguments || {});
    return { content: [{ type: 'text', text: JSON.stringify(r) }], isError: !r.ok };
  }
  if (req.params.name === 'gap' && (CHANNEL_MODE || VOICE_MODE)) {
    const { asked, why, idea } = req.params.arguments || {};
    const r = await post({ type: 'gap', asked: String(asked || ''), why: String(why || ''), idea: String(idea || ''), cwd: process.cwd(), voice: VOICE_MODE });
    return { content: [{ type: 'text', text: r.ok ? 'Noted on Lax\'s wish list. Now answer the user as usual.' : 'Lax is not reachable; answer the user as usual.' }] };
  }
  if (req.params.name !== 'reply' || !CHANNEL_MODE) throw new Error(`unknown tool: ${req.params.name}`);
  const { chat_id, text } = req.params.arguments || {};
  const r = await post({ type: 'reply', chat_id: String(chat_id || ''), text: String(text || '') });
  return { content: [{ type: 'text', text: r.ok ? 'sent to Lax' : 'Lax is not reachable; the user did not get this reply' }] };
});

// Claude Code → channel: a permission dialog opened in this session. Forward it to the phone.
mcp.setNotificationHandler(z.object({
  method: z.literal('notifications/claude/channel/permission_request'),
  params: z.object({ request_id: z.string(), tool_name: z.string(), description: z.string(), input_preview: z.string() }),
}), async ({ params }) => { await post({ type: 'permission', ...params }); });

await mcp.connect(new StdioServerTransport());

// Lax server → channel: messages from the phone and permission verdicts, over a loopback SSE stream.
async function listen() {
  for (let delay = 1000; ; delay = Math.min(delay * 2, 30000)) {
    try {
      const qs = new URLSearchParams({ cid: CID, pid: String(process.pid), session_pid: String(SESSION_PID || ''), cwd: process.cwd(),
        pty: process.env.LAX_PTY || '' }); // the `lax` wrapper's socket, for quick actions by voice
      const res = await fetch(`${LAX}/api/channel/stream?${qs}`, { headers: { 'x-lax-token': TOKEN } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log('linked to Lax as', CID, 'session pid', SESSION_PID);
      delay = 1000;
      let buf = '';
      for await (const chunk of res.body) {
        buf += Buffer.from(chunk).toString('utf8');
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
          if (!ev || !data) continue;
          const d = JSON.parse(data);
          if (ev === 'message') {
            await mcp.notification({ method: 'notifications/claude/channel',
              params: { content: d.text, meta: { chat_id: d.chat_id, via: d.via || 'voice' } } });
          } else if (ev === 'pick') { // your answer to "Which Vera?"
            const p = picks.get(d.id); picks.delete(d.id);
            const contact = p && p.contacts[pickOption(p.contacts.map((c) => c.label), d.answer, p.contacts.map((c) => c.nickname))];
            if (contact) { const r = await shareAndTell({ ...p.args, contact }); if (!r.ready) await post({ type: 'say', text: r.say }); }
            else if (p && d.answer) await post({ type: 'say', text: /\b(none|neither|nobody|no one|cancel|never ?mind|forget it|stop)\b/i.test(d.answer)
              ? `Okay, I won't share it.` : `I didn't catch which one, so I didn't share it.` });
          } else if (ev === 'share') { // your answer to "Send it?" from the phone; pressed here, where the terminal has Accessibility
            await finishShare(d.send).then(() => post({ type: 'shared', sent: !!d.send, who: d.who }),
              (e) => post({ type: 'shared', failed: e.message, who: d.who }));
          } else if (ev === 'verdict') {
            await mcp.notification({ method: 'notifications/claude/channel/permission',
              params: { request_id: d.request_id, behavior: d.behavior === 'allow' ? 'allow' : 'deny' } });
          }
        }
      }
      throw new Error('stream ended');
    } catch (e) {
      log('link lost:', e.message, `- retrying in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
if (CHANNEL_MODE) listen(); else log('session not started with the lax channel: staying dormant');
