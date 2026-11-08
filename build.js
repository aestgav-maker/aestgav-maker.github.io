// 블로그 사이트 빌드 스크립트 (외부 패키지 없음)
// posts/*.html 글을 읽어 docs/ 에 사이트를 만든다. GitHub Pages가 docs/ 를 그대로 보여 준다.
//
// 글 파일 형식 (posts/YYYY-MM-DD-slug.html):
//   <meta name="description" content="검색 결과에 보일 요약">
//   <meta name="tags" content="#태그1 #태그2">
//   <h1>제목</h1> ...본문...
// 사진은 images/<slug>/파일.jpg 에 두고 본문에서 src="images/<slug>/파일.jpg" 로 쓴다.

const fs = require('fs');
const path = require('path');

const root = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const out = path.join(root, 'docs');
const base = config.baseUrl.replace(/\/$/, '');

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function readPost(file) {
  const raw = fs.readFileSync(path.join(root, 'posts', file), 'utf8');
  const match = file.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.html$/);
  if (!match) throw new Error(`글 파일 이름은 YYYY-MM-DD-slug.html 이어야 해요: ${file}`);
  const [, date, slug] = match;

  const meta = (name) => {
    const m = raw.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i'));
    return m ? decode(m[1]) : '';
  };
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : raw;
  const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1) throw new Error(`<h1> 제목이 없어요: ${file}`);
  const title = stripTags(h1[1]);
  body = body.replace(h1[0], '').trim();

  const firstImg = body.match(/<img[^>]*\ssrc="([^"]+)"/i);
  const firstPara = body.match(/<p>([\s\S]*?)<\/p>/i);
  const description = meta('description') || (firstPara ? stripTags(firstPara[1]).slice(0, 120) : config.description);
  const tags = meta('tags').split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);

  // 본문 사진은 사이트 루트 기준 경로로, 늦게 불러오기
  body = body.replace(/<img([^>]*)\ssrc="(?!https?:|\/)([^"]+)"/gi, '<img$1 loading="lazy" src="/$2"');

  return { file, date, slug, title, description, tags, body, image: firstImg ? firstImg[1].replace(/^\/?/, '/') : '' };
}

function layout({ title, description, url, image, body, type = 'website', extraHead = '' }) {
  const fullTitle = title === config.title ? title : `${title} | ${config.title}`;
  const verify = [
    config.naverSiteVerification && `<meta name="naver-site-verification" content="${escapeHtml(config.naverSiteVerification)}">`,
    config.googleSiteVerification && `<meta name="google-site-verification" content="${escapeHtml(config.googleSiteVerification)}">`,
  ].filter(Boolean).join('\n  ');
  return `<!doctype html>
<html lang="${config.language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="${escapeHtml(config.title)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${url}">
  ${image ? `<meta property="og:image" content="${base}${image}">` : ''}
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="${base}/feed.xml">
  <link rel="stylesheet" href="/style.css">
  ${verify}
  ${extraHead}
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a class="logo" href="/">${escapeHtml(config.title)}</a>
      <p class="tagline">${escapeHtml(config.description)}</p>
    </div>
  </header>
  <main class="wrap">
${body}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <p>이 사이트의 글은 공개된 사용 후기와 제조사 공식 자료를 모아 정리한 글입니다. 직접 사용한 체험기는 글에 따로 밝힙니다.</p>
      <p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.author)} · <a href="/feed.xml">RSS</a></p>
    </div>
  </footer>
</body>
</html>
`;
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${y}년 ${Number(m)}월 ${Number(day)}일`;
}

function build() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const posts = fs.readdirSync(path.join(root, 'posts'))
    .filter((f) => f.endsWith('.html'))
    .map(readPost)
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const post of posts) {
    const url = `${base}/${post.slug}/`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      author: { '@type': 'Organization', name: config.author },
      ...(post.image ? { image: `${base}${post.image}` } : {}),
      mainEntityOfPage: url,
    };
    const tags = post.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join(' ');
    const body = `    <article class="post">
      <p class="post-date"><time datetime="${post.date}">${formatDate(post.date)}</time></p>
      <h1>${escapeHtml(post.title)}</h1>
${post.body}
      ${tags ? `<p class="tags">${tags}</p>` : ''}
      <p class="back"><a href="/">← 다른 후기 보기</a></p>
    </article>`;
    const dir = path.join(out, post.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), layout({
      title: post.title, description: post.description, url, image: post.image, body, type: 'article',
      extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    }));
  }

  const cards = posts.map((p) => `      <li class="card">
        <a href="/${p.slug}/">
          ${p.image ? `<img src="${p.image}" alt="" loading="lazy">` : ''}
          <div class="card-text">
            <h2>${escapeHtml(p.title)}</h2>
            <p>${escapeHtml(p.description)}</p>
            <time datetime="${p.date}">${formatDate(p.date)}</time>
          </div>
        </a>
      </li>`).join('\n');
  fs.writeFileSync(path.join(out, 'index.html'), layout({
    title: config.title, description: config.description, url: `${base}/`,
    image: posts[0] ? posts[0].image : '',
    body: posts.length ? `    <ul class="cards">\n${cards}\n    </ul>` : '    <p>아직 글이 없어요.</p>',
  }));

  fs.writeFileSync(path.join(out, '404.html'), layout({
    title: '페이지를 찾을 수 없어요', description: config.description, url: `${base}/404.html`,
    body: '    <p>찾으시는 페이지가 없어요. <a href="/">첫 화면으로 가기</a></p>',
  }));

  const sitemap = [`${base}/`, ...posts.map((p) => `${base}/${p.slug}/`)];
  fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((u, i) => `  <url><loc>${u}</loc>${i > 0 ? `<lastmod>${posts[i - 1].date}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);

  const items = posts.slice(0, 20).map((p) => `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${base}/${p.slug}/</link>
      <guid>${base}/${p.slug}/</guid>
      <pubDate>${new Date(`${p.date}T07:00:00+09:00`).toUTCString()}</pubDate>
      <description>${escapeHtml(p.description)}</description>
    </item>`).join('\n');
  fs.writeFileSync(path.join(out, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(config.title)}</title>
    <link>${base}/</link>
    <description>${escapeHtml(config.description)}</description>
    <language>${config.language}</language>
${items}
  </channel>
</rss>
`);

  fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  if (config.indexNowKey) fs.writeFileSync(path.join(out, `${config.indexNowKey}.txt`), config.indexNowKey);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  fs.copyFileSync(path.join(root, 'style.css'), path.join(out, 'style.css'));
  fs.cpSync(path.join(root, 'images'), path.join(out, 'images'), { recursive: true });

  console.log(`글 ${posts.length}개로 사이트를 만들었어요: ${out}`);
}

build();
