// Secrets out of what Lax keeps (the transcript archive, lib/archive.mjs): known token shapes, credentials in URLs,
// `SECRET=…`-style assignments, and the literal values of Lax's own secrets. Each becomes [scrubbed]; the rest is kept
// as it was. RULES goes up when the rules change, so the archive is scrubbed again with the new ones.
import fs from 'node:fs';
import { secret, readEnv } from './paths.mjs';

export const RULES = 1;
export const MARK = '[scrubbed]';

const SHAPES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|[A-Za-z0-9+/=\s]*)/g, // or cut short
  /\bsk-ant-[\w-]{20,}/g,                                  // Anthropic
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g,           // OpenAI
  /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{22,})/g,  // GitHub
  /\bglpat-[\w-]{20,}/g,                                   // GitLab
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,                        // AWS access key id
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,                      // Slack
  /\bAIza[\w-]{35}/g,                                      // Google
  /\b[rs]k_(?:live|test)_[0-9A-Za-z]{16,}/g,               // Stripe
  /\bnpm_[A-Za-z0-9]{36}\b/g,                              // npm
  /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g,              // JWT
  /\beyJ[A-Za-z0-9+/]{60,}={0,2}/g,                        // base64 JSON blobs, like a cloudflared tunnel token
];
// Kept around the secret: "Bearer ", "https://", "API_KEY=".
const AROUND = [
  [/(\bBearer\s+)[\w.~+/=-]{16,}/gi, '$1'],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@"'\\]+:[^\s/@"'\\]+@/gi, '$1', '@'],
];
// NAME=value, "name": "value", Name: value, where the name says secret and the value looks like one (16+ chars, with
// letters and digits), so `token = getToken()` and `input_tokens: 12` stay readable.
const ASSIGN = /\b([\w-]*(?:secret|token|passw(?:or)?d|api[_-]?key|access[_-]?key|private[_-]?key|auth)[\w-]*["']?[ \t]*[:=][ \t]*["']?)([\w.~+/=-]{16,})/gi;
const secretish = (v) => /\d/.test(v) && /[a-z]/i.test(v) && !/^[\w-]+\.(?:mjs|js|ts|json|md|txt|py)$/i.test(v);

/** Lax's own secrets, as literal strings to take out wherever they show up. */
export function ownSecrets() {
  const out = [];
  for (const f of ['token', 'tunnel-token', 'cf-setup-token']) try { out.push(fs.readFileSync(secret(f), 'utf8').trim()); } catch {}
  for (const [k, v] of Object.entries(readEnv())) if (/secret|token|key|pass|client_id/i.test(k) && typeof v === 'string') out.push(v.trim());
  return [...new Set(out.filter((s) => s.length >= 12))];
}

/** The text with its secrets replaced by [scrubbed]. */
export function scrub(text, literals = []) {
  let t = String(text);
  for (const s of literals) if (t.includes(s)) t = t.split(s).join(MARK);
  for (const re of SHAPES) t = t.replace(re, MARK);
  for (const [re, pre, post = ''] of AROUND) t = t.replace(re, `${pre}${MARK}${post}`);
  return t.replace(ASSIGN, (m, name, v) => secretish(v) ? name + MARK : m);
}

/**
 * One transcript line (JSON), scrubbed string by string, so it stays valid JSON. Base64 payloads (images, files) and
 * thinking signatures are left alone: random base64 can look like a token. Returns the line itself when nothing changed.
 */
export function scrubLine(line, literals = []) {
  let rec;
  try { rec = JSON.parse(line); } catch { return scrub(line, literals); }
  let changed = false;
  const walk = (v) => {
    if (typeof v === 'string') { const s = scrub(v, literals); if (s !== v) changed = true; return s; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = (k === 'data' && v.type === 'base64') || k === 'signature' ? x : walk(x);
      return o;
    }
    return v;
  };
  const out = walk(rec);
  return changed ? JSON.stringify(out) : line;
}
