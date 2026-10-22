// Lax's blog (/demo/blog): the posts in docs/write-ups/, the same markdown GitHub shows, as pages in the public face's
// own look (public/demo.html, mind.html). Built into the demo by scripts/demo.mjs, and served live from the working
// folder by server.mjs. The markdown is only what the posts use (headings, paragraphs, lists, quotes, code, tables,
// images, links, bold and italic), read here in plain JS: no dependency for a blog. Tests: scripts/test-blog.mjs.

/** The posts, newest first. by: who wrote it; date: when it was published. */
export const POSTS = [
  { slug: 'hi-im-lax', by: 'Lax', date: '2026-10-22' },
  { slug: 'rewrites-itself', by: 'Diogo', date: '2026-10-22' },
  { slug: 'lax-on-cloudflare', by: 'Diogo', date: '2026-10-22' },
  { slug: 'every-extension-point', by: 'Diogo', date: '2026-10-22' },
];
/** The pictures the posts show (in docs/, written as ../name in the markdown), served at /demo/blog-img/name. */
export const IMAGES = ['cover-screen.jpg', 'timelapse.gif', 'mind.png'];
const imgUrl = (src) => (src.startsWith('../') ? `/demo/blog-img/${src.slice(3)}` : src);

// ---------- markdown ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugOf = (s) => s.toLowerCase().replace(/<[^>]+>|[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-');
function inline(s, img) {
  const codes = []; // code first, so nothing inside it is read as markdown
  s = esc(s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${img(src)}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}
const BLOCK = /^(```|#{1,3} |>|\||[-*] |\d+\. |---+\s*$)/;
/** Markdown to HTML. img: where an image's src points (the blog's own folder by default). */
export function md(text, { img = imgUrl } = {}) {
  const lines = String(text).replace(/\r/g, '').split('\n'), out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    let m;
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) {
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    if ((m = /^(#{1,3}) (.+)$/.exec(l))) { const n = m[1].length; out.push(`<h${n} id="${slugOf(m[2])}">${inline(m[2], img)}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (l.startsWith('>')) {
      const q = []; while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^> ?/, ''));
      out.push(`<blockquote>${md(q.join('\n'), { img })}</blockquote>`); continue;
    }
    if (l.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c, img)}</th>`).join('')}</tr></thead>`
        + `<tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c, img)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^([-*]|\d+\.) /.test(l)) {
      const ordered = /^\d+\./.test(l), items = [];
      while (i < lines.length && lines[i].trim()) {
        if (/^([-*]|\d+\.) /.test(lines[i])) items.push(lines[i].replace(/^([-*]|\d+\.) /, ''));
        else items[items.length - 1] += ' ' + lines[i].trim(); // a wrapped line of the item above
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x, img)}</li>`).join('')}</${tag}>`); continue;
    }
    const p = []; while (i < lines.length && lines[i].trim() && !BLOCK.test(lines[i])) p.push(lines[i++]);
    const t = p.join(' ');
    out.push(/^!\[[^\]]*\]\([^)]+\)$/.test(t) ? `<figure>${inline(t, img)}</figure>` : `<p>${inline(t, img)}</p>`);
  }
  return out.join('\n');
}

// ---------- a post ----------
/** A post's parts from its markdown: title (# line), subtitle (the *line* under it), body, reading time. */
export function parse(text) {
  const title = /^# (.+)$/m.exec(text)?.[1] || 'Untitled';
  const sub = /^# .+\n+\*(.+)\*\s*$/m.exec(text)?.[1] || '';
  const body = text.replace(/^# .+\n+(\*.+\*\s*\n+)?(---\s*\n+)?/, '');
  return { title, sub, body, minutes: Math.max(1, Math.round(body.split(/\s+/).length / 220)) };
}
const when = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ---------- the pages, in the public face's look ----------
const ORIGIN = 'https://lax.diogodebastos.com';
function page({ title, desc, path, image, body }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#121110">
<link rel="icon" href="/demo/favicon.svg" type="image/svg+xml">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${ORIGIN}${path}"><meta property="og:image" content="${ORIGIN}/demo/blog-img/${image}">
<meta name="twitter:card" content="summary_large_image">
<link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet">
<style>
  /* Lax's blog: the public face's look (demo.html, mind.html): its night, its coral, VT323 for what's short, and a
     plain font for reading, since a whole article in a pixel font is hard on the eyes. */
  :root { --bg:#121110; --fg:#e8e2d6; --dim:#8a8378; --coral:#D97757; --line:#2c2824; --well:#0a0908; --px:'VT323',ui-monospace,monospace; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:17px/1.65 ui-sans-serif,system-ui,-apple-system,sans-serif; overflow-x:hidden; }
  .top, footer { font-family:var(--px); font-size:20px; color:var(--dim); text-align:center; padding:18px 16px 0; }
  .top a, footer a { color:var(--fg); text-decoration:none; } .top a:hover, footer a:hover { color:var(--coral); }
  .top b { color:var(--coral); font-weight:400; }
  main { max-width:700px; margin:0 auto; padding:26px 18px 48px; }
  h1, h2, h3, .meta, th { font-family:var(--px); font-weight:400; }
  header { text-align:center; margin:12px 0 30px; }
  h1 { color:var(--coral); font-size:44px; line-height:1; margin:0; }
  .sub { color:var(--dim); font-family:var(--px); font-size:21px; line-height:1.15; margin:8px auto 0; max-width:600px; }
  .meta { color:var(--dim); font-size:19px; margin-top:10px; }
  h2 { color:var(--coral); font-size:31px; line-height:1.05; margin:40px 0 10px; }
  h3 { font-size:24px; margin:26px 0 6px; }
  p, ul, ol, table, pre, blockquote, figure { margin:0 0 16px; }
  a { color:var(--fg); text-decoration:underline; text-decoration-color:var(--coral); text-underline-offset:3px; } a:hover { color:var(--coral); }
  ul { list-style:none; padding:0; } ul li { padding-left:20px; position:relative; margin-bottom:6px; }
  ul li::before { content:'>'; color:var(--coral); font-family:var(--px); font-size:20px; position:absolute; left:0; top:-1px; }
  ol { padding-left:22px; } ol li { margin-bottom:6px; } ol li::marker { color:var(--coral); font-family:var(--px); font-size:20px; }
  strong { color:#fff6ea; }
  code { font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:var(--well); border:1px solid var(--line); padding:1px 5px; }
  pre { background:var(--well); border:2px solid var(--line); padding:12px 14px; overflow-x:auto; }
  pre code { border:0; padding:0; background:none; font-size:13.5px; }
  blockquote { border-left:3px solid var(--coral); padding:2px 0 2px 14px; color:#d6cfc2; }
  blockquote p:last-child { margin-bottom:0; }
  figure { text-align:center; } img { max-width:100%; height:auto; border:2px solid var(--line); image-rendering:pixelated; }
  table { display:block; max-width:100%; overflow-x:auto; border-collapse:collapse; font-size:15px; }
  th { color:var(--dim); font-size:20px; text-align:left; border-bottom:2px solid var(--line); padding:4px 10px; }
  td { border-bottom:1px solid var(--line); padding:6px 10px; vertical-align:top; }
  hr { border:0; border-top:2px solid var(--line); margin:30px 0; }
  .post { border:2px solid var(--line); padding:16px 18px; margin:0 0 18px; }
  .post h2 { margin:0 0 6px; font-size:29px; } .post h2 a { color:var(--coral); text-decoration:none; } .post h2 a:hover { color:var(--fg); }
  .post p { color:var(--dim); margin:0 0 8px; } .post .meta { margin:0; }
  footer { padding:0 16px 32px; }
  @media (max-width:480px) { h1 { font-size:36px; } h2 { font-size:27px; } body { font-size:16px; } }
</style></head>
<body>
<div class="top"><a href="/demo">meet Lax</a> · <a href="/demo/mind">its mind, live</a> · <a href="/demo/blog">blog</a> · <a href="https://github.com/diogodebastos/lax">github</a></div>
<main>
${body}
</main>
<footer><a href="/demo">meet Lax</a> · <a href="/demo/mind">its mind, live</a> · <a href="https://github.com/diogodebastos/lax">github</a></footer>
</body></html>
`;
}

/** One post's page. text: its markdown. */
export function postPage(post, text) {
  const p = parse(text);
  return page({ title: p.title, desc: p.sub || p.title, path: `/demo/blog/${post.slug}`, image: 'cover-screen.jpg',
    body: `<header><h1>${inline(p.title, imgUrl)}</h1>${p.sub ? `<p class="sub">${inline(p.sub, imgUrl)}</p>` : ''}`
      + `<div class="meta">by ${esc(post.by)} · ${when(post.date)} · ${p.minutes} min read</div></header>\n<article>${md(p.body)}</article>`
      + `\n<hr><p class="meta" style="text-align:center"><a href="/demo/blog">all posts</a></p>` });
}

/** The blog's front page: every post, newest first. texts: slug → markdown. */
export function indexPage(texts) {
  const items = POSTS.filter((p) => texts[p.slug]).map((post) => {
    const p = parse(texts[post.slug]);
    return `<div class="post"><h2><a href="/demo/blog/${post.slug}">${inline(p.title, imgUrl)}</a></h2>${p.sub ? `<p>${inline(p.sub, imgUrl)}</p>` : ''}`
      + `<div class="meta">by ${esc(post.by)} · ${when(post.date)} · ${p.minutes} min read</div></div>`;
  }).join('\n');
  return page({ title: "Lax's blog", desc: 'Lax, the pixel companion for Claude Code, and how it is built: by Lax, and by Diogo.', path: '/demo/blog', image: 'cover-screen.jpg',
    body: `<header><h1>Lax's blog</h1><p class="sub">What Lax writes about itself, and how Diogo built it.</p></header>\n${items}` });
}
