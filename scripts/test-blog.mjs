// Lax's blog (lib/blog.mjs): its markdown, and every real post as a page with nothing left unread and nothing missing.
import fs from 'node:fs';
import path from 'node:path';
import { md, parse, postPage, indexPage, POSTS, IMAGES } from '../lib/blog.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

check('headings, with an id to link to', md('## How my mind is built') === '<h2 id="how-my-mind-is-built">How my mind is built</h2>');
check('bold, italic, links and code, and nothing read inside code', md('**Yes.** a *you* [here](https://x.y) and `a * b ** c`')
  === '<p><strong>Yes.</strong> a <em>you</em> <a href="https://x.y">here</a> and <code>a * b ** c</code></p>', md('**Yes.** a *you* [here](https://x.y) and `a * b ** c`'));
check('a paragraph joins its lines; text is escaped', md('one <b>\ntwo & "three"') === '<p>one &lt;b&gt; two &amp; &quot;three&quot;</p>');
check('lists, with "> " bullets in the page, and a wrapped item', md('- a\n- b\n  more\n\n1. one\n2. two') === '<ul><li>a</li><li>b more</li></ul>\n<ol><li>one</li><li>two</li></ol>');
check('code blocks keep their lines, escaped', md('```js\nif (a < b) x = 1;\n```') === '<pre><code>if (a &lt; b) x = 1;</code></pre>');
check('quotes, tables and rules', md('> said\n>\n> more') === '<blockquote><p>said</p>\n<p>more</p></blockquote>'
  && md('| a | b |\n|---|---|\n| `1` | 2 |') === '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td><code>1</code></td><td>2</td></tr></tbody></table>'
  && md('---') === '<hr>');
check('a picture on its own is a figure, from the blog\'s pictures', md('![Lax\'s "mind"](../mind.png)') === '<figure><img src="/demo/blog-img/mind.png" alt="Lax\'s &quot;mind&quot;" loading="lazy"></figure>');
const p = parse('# Hi, I\'m Lax!\n\n*Written by Lax.*\n\n---\n\nHello there.\n');
check('a post: its title, subtitle and body', p.title === 'Hi, I\'m Lax!' && p.sub === 'Written by Lax.' && p.body === 'Hello there.\n' && p.minutes === 1);

// Every real post: read whole, its pictures there, and no draft lines.
const texts = {};
for (const post of POSTS) {
  const f = path.join(ROOT, 'docs', 'write-ups', `${post.slug}.md`);
  if (!fs.existsSync(f)) { check(`${post.slug}: its markdown`, false, f); continue; }
  const text = texts[post.slug] = fs.readFileSync(f, 'utf8'), html = postPage(post, text), body = html.split('<article>')[1];
  const left = (body.replace(/<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g, '').match(/\*\*|\]\(|```|^#+ /gm) || []);
  const pics = [...text.matchAll(/!\[[^\]]*\]\(\.\.\/([^)]+)\)/g)].map((m) => m[1]);
  check(`${post.slug}: a page with nothing left unread`, !left.length && !/Draft, \d/.test(text), left.join(' '));
  check(`${post.slug}: its pictures are the blog's, and in docs/`, pics.every((f) => IMAGES.includes(f) && fs.existsSync(path.join(ROOT, 'docs', f))), pics.join(', '));
}
const index = indexPage(texts);
check('the front page lists every post, newest first', POSTS.every((p) => index.includes(`/demo/blog/${p.slug}"`)) && index.indexOf(POSTS[0].slug) < index.indexOf(POSTS.at(-1).slug));
check('Lax\'s own post is titled as it says hello', parse(texts['hi-im-lax'] || '').title === 'Hi, I\'m Lax!');

if (failed) { console.log(`\n${failed} blog check(s) failed`); process.exit(1); }
console.log('\nall blog checks passed');
