// The Mac's end of the relay (lib/relay.mjs) when the link dies without a word: a stand-in relay that takes the link,
// then answers nothing, not even the close. The old client waited forever for that close and Lax stayed "asleep" to
// the phone; now it drops the link unheard and dials again. A dial that hangs is dropped the same way.
//   node --no-warnings scripts/test-relay-link.mjs
import net from 'node:net';
import crypto from 'node:crypto';
import { startRelay } from '../lib/relay.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

// Takes the WebSocket handshake (or, with hang, not even that), then reads and answers nothing, ever.
function silentRelay({ hang = false } = {}) {
  const dials = [];
  const server = net.createServer((sock) => {
    dials.push(sock); sock.on('error', () => {});
    let head = '';
    sock.on('data', (d) => {
      if (hang || head.includes('\r\n\r\n')) return;
      head += d;
      const key = /sec-websocket-key: *(.+)\r\n/i.exec(head)?.[1];
      if (!key || !head.includes('\r\n\r\n')) return;
      const accept = crypto.createHash('sha1').update(key.trim() + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ dials, port: server.address().port, close: () => { for (const s of dials) s.destroy(); server.close(); } })));
}

{
  const relay = await silentRelay(), logs = [];
  const link = startRelay({ url: `http://127.0.0.1:${relay.port}`, key: 'k', port: 1, log: (l) => logs.push(l), ping: 50, dead: 200 });
  for (let i = 0; i < 40 && !link.linked(); i++) await sleep(25);
  check('the link comes up', link.linked());
  for (let i = 0; i < 60 && relay.dials.length < 2; i++) await sleep(25);
  check('a link that goes silent, close and all, is dropped and dialled again', relay.dials.length >= 2, `dials ${relay.dials.length}; ${logs.join(' | ')}`);
  check('…saying so', logs.includes('relay: no answer, reconnecting') && logs.includes('relay: link lost'));
  for (let i = 0; i < 40 && !link.linked(); i++) await sleep(25);
  check('…and is linked again', link.linked());
  link.stop(); relay.close();
}
{
  const relay = await silentRelay({ hang: true });
  const link = startRelay({ url: `http://127.0.0.1:${relay.port}`, key: 'k', port: 1, ping: 50, dead: 200 });
  for (let i = 0; i < 60 && relay.dials.length < 2; i++) await sleep(25);
  check('a dial that never gets an answer is given up and tried again', relay.dials.length >= 2, `dials ${relay.dials.length}`);
  check('…never counting as linked', !link.linked());
  link.stop(); relay.close();
}

console.log(failed ? `\n${failed} relay link check(s) failed` : '\nall relay link checks passed');
process.exit(failed ? 1 : 0);
