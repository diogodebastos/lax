#!/usr/bin/env node
// After Lax merged something it learned (lib/learn.mjs, on your "merge it"): restart Lax, check it's healthy, and push main.
// If it doesn't come back healthy, put main back where it was (nothing was pushed yet), restart again, and say so.
// Detached from the server, since it restarts it.   node scripts/after-merge.mjs <body> <commit before the merge> <wish id>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { LOGS, readToken } from '../lib/paths.mjs';

const [BODY, PREV, WISH] = process.argv.slice(2);
const LAX = process.env.LAX_URL || `http://127.0.0.1:${process.env.LAX_PORT || 7777}`;
const RESTART = process.env.LAX_RESTART || `launchctl kickstart -k gui/${process.getuid()}/com.diogodebastos.lax`;
const WAIT = Number(process.env.LAX_HEALTH_WAIT || 30) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (t) => { try { fs.appendFileSync(path.join(LOGS, 'merge.log'), `[${new Date().toISOString()}] ${WISH}: ${t}\n`); } catch {} };
const git = (...a) => execFileSync('git', ['-C', BODY, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Healthy: the server answers /api/health, started after this restart.
async function healthy(since) {
  for (const end = Date.now() + WAIT; Date.now() < end; await sleep(1000)) {
    try {
      const r = await fetch(`${LAX}/api/health`, { signal: AbortSignal.timeout(2000) });
      const h = r.ok ? await r.json() : null;
      if (h?.ok && h.started >= since) return true;
    } catch {}
  }
  return false;
}
async function restart() {
  const since = Date.now();
  try { execFileSync('/bin/sh', ['-c', RESTART], { stdio: 'ignore', timeout: 20000 }); } catch (e) { log(`restart failed: ${e.message}`); }
  return healthy(since);
}
const tell = (body) => fetch(`${LAX}/api/learn/merged`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lax-token': readToken() || '' },
  body: JSON.stringify({ id: WISH, ...body }), signal: AbortSignal.timeout(5000) }).catch((e) => log(`couldn't tell Lax: ${e.message}`));

await sleep(1500); // let Lax say "merging…" first
if (await restart()) {
  let pushed = true;
  try { git('push', 'origin', 'main'); } catch (e) { pushed = false; log(`push failed: ${String(e.stderr || e.message).trim().slice(0, 300)}`); }
  log(`healthy${pushed ? ', pushed' : ', not pushed'}`);
  await tell({ ok: true, pushed });
} else {
  const why = 'after the merge I didn\'t come back healthy within ' + WAIT / 1000 + ' seconds';
  try { git('reset', '--keep', PREV); } catch (e) { log(`rollback failed: ${String(e.stderr || e.message).trim()}`); }
  log(`unhealthy: rolled back to ${PREV}`);
  if (await restart()) await tell({ ok: false, why });
  else log('still unhealthy after the rollback');
}
