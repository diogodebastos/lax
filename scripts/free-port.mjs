// A port nobody is listening on right now, for a test's throwaway Lax: fixed ones collided when two `npm test`s ran
// at once (two worktrees), or a server a test left behind still held it.
import net from 'node:net';

export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
