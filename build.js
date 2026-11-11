// 블로그 사이트 빌드 스크립트 (외부 패키지 없음)
// posts/*.html 글을 읽어 docs/ 에 사이트를 만든다. GitHub Pages가 docs/ 를 그대로 보여 준다.
//
// 글 파일 형식 (posts/YYYY-MM-DD-slug.html):
//   <meta name="description" content="검색 결과에 보일 요약">
//   <meta name="category" content="오디오">   (CATEGORIES 중 하나)
//   <meta name="tags" content="#태그1 #태그2">
//   <h1>제목</h1> ...본문...
// 사진은 images/<slug>/파일.jpg 에 두고 본문에서 src="images/<slug>/파일.jpg" 로 쓴다.
// 본문의 첫 사진과 바로 뒤 caption 문단은 글 머리의 대표 사진으로 옮겨진다.

const fs = require('fs');
const path = require('path');

const root = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const out = path.join(root, 'docs');
const base = config.baseUrl.replace(/\/$/, '');

const CATEGORIES = [
  { name: '스마트폰', slug: 'smartphone' },
  { name: '오디오', slug: 'audio' },
  { name: '웨어러블', slug: 'wearable' },
  { name: '노트북·태블릿', slug: 'computing' },
  { name: '가전', slug: 'appliance' },
  { name: '생활', slug: 'lifestyle' },
];
const OTHER = { name: '기타', slug: 'etc' };

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${y}. ${Number(m)}. ${Number(day)}.`;
}

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

  // 첫 사진(+설명)을 대표 사진으로 꺼낸다
  // <meta name="hero" content="none">: 첫 사진이 경쟁 제품처럼 대표로 쓰면 안 되는 사진일 때
  let hero = null;
  const heroMatch = meta('hero') === 'none' ? null : body.match(/(?:<p>\s*)?<img([^>]*)\ssrc="([^"]+)"([^>]*)>(?:\s*<\/p>)?\s*(?:<p class="caption">([\s\S]*?)<\/p>)?/i);
  if (heroMatch) {
    const alt = (heroMatch[0].match(/alt="([^"]*)"/i) || [])[1] || '';
    hero = { src: '/' + heroMatch[2].replace(/^\//, ''), alt: decode(alt), caption: heroMatch[4] || '' };
    body = body.replace(heroMatch[0], '');
  }

  // 본문 사진은 사이트 루트 기준 경로로, 늦게 불러오기, figure로 감싸기
  body = body.replace(/(?:<p>\s*)?<img([^>]*)\ssrc="(?!https?:|\/)([^"]+)"([^>]*)>(?:\s*<\/p>)?\s*(?:<p class="caption">([\s\S]*?)<\/p>)?/gi,
    (m, a, src, b, cap) => `<figure><img${a} loading="lazy" src="/${src}"${b}>${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`);

  // 목차용 소제목 id
  const toc = [];
  body = body.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (m, attrs, inner) => {
    const id = `s${toc.length + 1}`;
    toc.push({ id, text: stripTags(inner) });
    return `<h2 id="${id}"${attrs}>${inner}</h2>`;
  });

  // 참고 자료 수: "참고" 소제목 뒤 목록의 링크 수
  const refSection = body.split(/<h2[^>]*>[^<]*참고[^<]*<\/h2>/i)[1] || '';
  const refCount = (refSection.match(/<a\s/gi) || []).length;

  const firstPara = body.match(/<p>([\s\S]*?)<\/p>/i);
  const description = meta('description') || (firstPara ? stripTags(firstPara[1]).slice(0, 120) : config.description);
  const tags = meta('tags').split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
  const category = CATEGORIES.find((c) => c.name === meta('category')) || OTHER;
  const minutes = Math.max(1, Math.round(stripTags(body).length / 600));

  return { file, date, slug, title, description, tags, category, body, hero, toc, refCount, minutes };
}

const ICON_ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function header(activeSlug, cats) {
  const nav = cats.map((c) => `<a href="/category/${c.slug}/"${c.slug === activeSlug ? ' aria-current="page"' : ''}>${escapeHtml(c.name)}</a>`).join('');
  return `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="${escapeHtml(config.title)} 홈">
        <span class="brand-mark" aria-hidden="true">H</span>
        <span class="brand-name">${escapeHtml(config.title)}</span>
      </a>
      <nav class="nav" aria-label="카테고리">${nav}</nav>
      <a class="header-search" href="/#finder" aria-label="후기 검색"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>후기 검색</span></a>
      <a class="header-link" href="/about/">편집 원칙</a>
    </div>
  </header>`;
}

function footer(cats) {
  return `<footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">H</span><span class="brand-name">${escapeHtml(config.title)}</span></a>
        <p>${escapeHtml(config.description)}</p>
      </div>
      <div class="footer-cols">
        <div>
          <h3>카테고리</h3>
          <ul>${cats.map((c) => `<li><a href="/category/${c.slug}/">${escapeHtml(c.name)}</a></li>`).join('')}</ul>
        </div>
        <div>
          <h3>사이트</h3>
          <ul><li><a href="/about/">편집 원칙</a></li><li><a href="/feed.xml">RSS</a></li><li><a href="/sitemap.xml">사이트맵</a></li></ul>
        </div>
      </div>
    </div>
    <div class="footer-note">
      <p>이 사이트의 리뷰는 공개된 사용 후기와 제조사 공식 자료를 모아 정리한 큐레이션입니다. 협찬과 광고를 받지 않으며, 직접 사용한 체험기는 글에 따로 밝힙니다.</p>
      <p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.author)}</p>
    </div>
  </footer>`;
}

function layout({ title, description, url, image, body, cats, activeSlug = '', type = 'website', extraHead = '', bodyClass = '' }) {
  const fullTitle = title === config.title ? `${title} | 테크 리뷰 큐레이션` : `${title} | ${config.title}`;
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
  ${image ? `<meta property="og:image" content="${base}${image}">\n  <meta name="twitter:card" content="summary_large_image">` : ''}
  <meta name="theme-color" content="#000000">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="${base}/feed.xml">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="/style.css">
  ${verify}
  ${config.goatcounterCode ? `<script data-goatcounter="https://${escapeHtml(config.goatcounterCode)}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>` : ''}
  ${extraHead}
</head>
<body class="${bodyClass}">
  ${header(activeSlug, cats)}
  <main>
${body}
  </main>
  ${footer(cats)}
</body>
</html>
`;
}

// 대표 사진이 없을 때: 제품 이름을 크게 쓴 표지
function placeholder(p) {
  const name = p.title.split(/\s+후기|:/)[0];
  return `<div class="placeholder cat-${p.category.slug}"><span>${escapeHtml(p.category.name)}</span><strong>${escapeHtml(name)}</strong></div>`;
}

function card(p, size = '') {
  const searchText = [p.title, p.description, p.category.name, ...p.tags].join(' ').toLowerCase();
  return `<article class="card ${size}" data-cat="${p.category.slug}" data-date="${p.date}" data-min="${p.minutes}" data-title="${escapeHtml(p.title)}" data-text="${escapeHtml(searchText)}">
        <a href="/${p.slug}/" class="card-link">
          <div class="card-media">${p.hero ? `<img src="${p.hero.src}" alt="" loading="lazy">` : placeholder(p)}</div>
          <div class="card-body">
            <span class="kicker">${escapeHtml(p.category.name)}</span>
            <h3>${escapeHtml(p.title)}</h3>
            <p>${escapeHtml(p.description)}</p>
            <div class="meta"><time datetime="${p.date}">${formatDate(p.date)}</time><span>${p.minutes}분 읽기</span></div>
          </div>
        </a>
      </article>`;
}

function build() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const posts = fs.readdirSync(path.join(root, 'posts'))
    .filter((f) => f.endsWith('.html'))
    .map(readPost)
    .sort((a, b) => b.date.localeCompare(a.date) || b.file.localeCompare(a.file));

  // 글이 있는 카테고리만 메뉴에 보인다
  const usedCats = [...CATEGORIES, OTHER].filter((c) => posts.some((p) => p.category.slug === c.slug));

  for (const post of posts) {
    const url = `${base}/${post.slug}/`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description,
      articleSection: post.category.name,
      datePublished: post.date,
      dateModified: post.date,
      author: { '@type': 'Organization', name: config.author, url: `${base}/about/` },
      publisher: { '@type': 'Organization', name: config.title },
      ...(post.hero ? { image: `${base}${post.hero.src}` } : {}),
      mainEntityOfPage: url,
    };
    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: post.category.name, item: `${base}/category/${post.category.slug}/` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    };
    const related = [
      ...posts.filter((p) => p !== post && p.category.slug === post.category.slug),
      ...posts.filter((p) => p !== post && p.category.slug !== post.category.slug),
    ].slice(0, 3);
    const tocHtml = post.toc.length
      ? `<nav class="toc" aria-label="목차"><p class="toc-title">목차</p><ol>${post.toc.map((t) => `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`).join('')}</ol></nav>`
      : '';
    const tags = post.tags.map((t) => `<li><a href="/?q=${encodeURIComponent(t)}#browse">#${escapeHtml(t)}</a></li>`).join('');

    const body = `    <div class="progress" aria-hidden="true"><span></span></div>
    <article class="article">
      <header class="article-head">
        <nav class="crumbs" aria-label="위치"><a href="/">홈</a><span>/</span><a href="/category/${post.category.slug}/">${escapeHtml(post.category.name)}</a></nav>
        <span class="kicker">${escapeHtml(post.category.name)} 리뷰 큐레이션</span>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="dek">${escapeHtml(post.description)}</p>
        <div class="byline">
          <span class="avatar" aria-hidden="true">H</span>
          <div>
            <strong>${escapeHtml(config.author)} 편집팀</strong>
            <span><time datetime="${post.date}">${formatDate(post.date)}</time> · ${post.minutes}분 읽기${post.refCount ? ` · 자료 ${post.refCount}건 종합` : ''}</span>
          </div>
        </div>
      </header>
      ${post.hero ? `<figure class="article-hero"><img src="${post.hero.src}" alt="${escapeHtml(post.hero.alt)}">${post.hero.caption ? `<figcaption>${post.hero.caption}</figcaption>` : ''}</figure>` : ''}
      <div class="article-grid">
        <aside class="article-aside">${tocHtml}</aside>
        <div class="prose">
${post.body}
          ${tags ? `<ul class="tags">${tags}</ul>` : ''}
        </div>
      </div>
    </article>
    ${related.length ? `<section class="related">
      <div class="section-head"><h2>함께 보면 좋은 리뷰</h2><a href="/">전체 보기 ${ICON_ARROW}</a></div>
      <div class="grid">${related.map((p) => card(p)).join('\n')}</div>
    </section>` : ''}
    <script>
      (function () {
        var bar = document.querySelector('.progress span');
        var art = document.querySelector('.article');
        function update() {
          var r = art.getBoundingClientRect();
          var total = r.height - window.innerHeight;
          var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
          bar.style.transform = 'scaleX(' + p + ')';
        }
        document.addEventListener('scroll', update, { passive: true });
        update();
      })();
    </script>`;
    const dir = path.join(out, post.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), layout({
      title: post.title, description: post.description, url, image: post.hero && post.hero.src, body, type: 'article',
      cats: usedCats, activeSlug: post.category.slug, bodyClass: 'page-article',
      extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`,
    }));
  }

  // 첫 화면
  const [lead] = posts;
  const leadHtml = lead ? `<section class="lead">
      <a class="lead-link" href="/${lead.slug}/">
        <div class="lead-media">${lead.hero ? `<img src="${lead.hero.src}" alt="${escapeHtml(lead.hero.alt)}">` : placeholder(lead)}</div>
        <div class="lead-text">
          <span class="kicker">최신 리뷰 · ${escapeHtml(lead.category.name)}</span>
          <h2>${escapeHtml(lead.title)}</h2>
          <p>${escapeHtml(lead.description)}</p>
          <div class="meta"><time datetime="${lead.date}">${formatDate(lead.date)}</time><span>${lead.minutes}분 읽기</span>${lead.refCount ? `<span>자료 ${lead.refCount}건 종합</span>` : ''}</div>
          <span class="lead-cta">리뷰 읽기 ${ICON_ARROW}</span>
        </div>
      </a>
    </section>` : '';
  // 많이 쓰인 태그를 추천 검색어로
  const tagCount = new Map();
  posts.forEach((p) => p.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
  const popular = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  const chips = [`<button type="button" class="chip" data-cat="" aria-pressed="true">전체 <span>${posts.length}</span></button>`,
    ...usedCats.map((c) => `<button type="button" class="chip" data-cat="${c.slug}" aria-pressed="false">${escapeHtml(c.name)} <span>${posts.filter((p) => p.category.slug === c.slug).length}</span></button>`)].join('');

  const homeBody = `    <section class="finder" id="finder">
      <p class="eyebrow">Tech Review Curation</p>
      <h1>사기 전에, 먼저 써 본<br>사람들의 후기를 한눈에</h1>
      <p class="finder-sub">실사용 후기와 공식 자료, 경쟁 제품 비교까지 정리한 리뷰 ${posts.length}편</p>
      <form class="search" role="search" action="/" onsubmit="return false">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="q" type="search" name="q" autocomplete="off" placeholder="제품명, 브랜드, 키워드로 후기 찾기" aria-label="후기 검색">
        <kbd>/</kbd>
      </form>
      ${popular.length ? `<div class="popular"><span>추천 검색어</span>${popular.map((t) => `<button type="button" data-q="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join('')}</div>` : ''}
    </section>
    <div id="featured">${leadHtml}</div>
    <section class="browse" id="browse">
      <div class="browse-bar">
        <div class="chips" role="group" aria-label="카테고리">${chips}</div>
        <label class="sort"><span>정렬</span>
          <select id="sort">
            <option value="new">최신순</option>
            <option value="old">오래된순</option>
            <option value="title">가나다순</option>
            <option value="short">짧게 읽는 순</option>
          </select>
        </label>
      </div>
      <p class="result-count" id="count" aria-live="polite">전체 후기 ${posts.length}편</p>
      <div class="grid" id="list">${posts.map((p) => card(p)).join('\n')}</div>
      <div class="empty" id="empty" hidden>
        <strong>찾는 후기가 아직 없어요</strong>
        <p>다른 검색어를 써 보거나 <button type="button" id="reset">전체 후기 보기</button></p>
      </div>
    </section>
    <script>
      (function () {
        var q = document.getElementById('q'), sort = document.getElementById('sort');
        var list = document.getElementById('list'), count = document.getElementById('count');
        var empty = document.getElementById('empty'), featured = document.getElementById('featured');
        var cards = Array.prototype.slice.call(list.children);
        var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
        var cat = '';
        var norm = function (s) { return s.toLowerCase().replace(/\\s+/g, ''); };
        var sorters = {
          'new': function (a, b) { return b.dataset.date.localeCompare(a.dataset.date); },
          'old': function (a, b) { return a.dataset.date.localeCompare(b.dataset.date); },
          'title': function (a, b) { return a.dataset.title.localeCompare(b.dataset.title, 'ko'); },
          'short': function (a, b) { return a.dataset.min - b.dataset.min; }
        };
        function render() {
          var words = q.value.trim().split(/\\s+/).filter(Boolean).map(norm);
          var shown = 0;
          cards.sort(sorters[sort.value]).forEach(function (c) {
            var text = norm(c.dataset.text);
            var ok = (!cat || c.dataset.cat === cat) && words.every(function (w) { return text.indexOf(w) !== -1; });
            c.hidden = !ok; if (ok) shown++;
            list.appendChild(c);
          });
          var label = chips.filter(function (b) { return b.dataset.cat === cat; })[0].firstChild.textContent.trim();
          count.textContent = (q.value.trim() ? '"' + q.value.trim() + '" ' : '') + (cat ? label + ' ' : '전체 ') + '후기 ' + shown + '편';
          empty.hidden = shown > 0;
          featured.hidden = !!(q.value.trim() || cat);
          var url = new URL(location.href);
          q.value.trim() ? url.searchParams.set('q', q.value.trim()) : url.searchParams.delete('q');
          cat ? url.searchParams.set('cat', cat) : url.searchParams.delete('cat');
          history.replaceState(null, '', url);
        }
        function setCat(c) {
          cat = c;
          chips.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cat === cat)); });
          render();
        }
        chips.forEach(function (b) { b.addEventListener('click', function () { setCat(b.dataset.cat); }); });
        document.querySelectorAll('.popular button').forEach(function (b) {
          b.addEventListener('click', function () { q.value = b.dataset.q; render(); document.getElementById('browse').scrollIntoView({ behavior: 'smooth' }); });
        });
        document.getElementById('reset').addEventListener('click', function () { q.value = ''; setCat(''); });
        q.addEventListener('input', render);
        sort.addEventListener('change', render);
        document.addEventListener('keydown', function (e) {
          if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); }
        });
        var params = new URLSearchParams(location.search);
        q.value = params.get('q') || '';
        if (location.hash === '#finder') q.focus();
        setCat(params.get('cat') || '');
      })();
    </script>
    <section class="principles">
      <div class="principle"><span class="num">01</span><h3>후기는 출처와 함께</h3><p>누가 어디서 쓴 후기인지 밝히고, 원문 링크를 모두 남깁니다.</p></div>
      <div class="principle"><span class="num">02</span><h3>공식 자료로 사실 확인</h3><p>가격과 스펙은 제조사 발표를 기준으로, 확인되지 않은 수치는 쓰지 않습니다.</p></div>
      <div class="principle"><span class="num">03</span><h3>협찬 없는 비교</h3><p>광고와 협찬 없이, 경쟁 제품과 나란히 놓고 장단점을 정리합니다.</p></div>
    </section>`;
  fs.writeFileSync(path.join(out, 'index.html'), layout({
    title: config.title, description: config.description, url: `${base}/`,
    image: lead && lead.hero ? lead.hero.src : '', body: homeBody, cats: usedCats, bodyClass: 'page-home',
  }));

  // 카테고리 페이지
  for (const c of usedCats) {
    const list = posts.filter((p) => p.category.slug === c.slug);
    const dir = path.join(out, 'category', c.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), layout({
      title: `${c.name} 리뷰`, description: `${c.name} 신제품 실사용 후기와 비교 정리 모음`, url: `${base}/category/${c.slug}/`,
      cats: usedCats, activeSlug: c.slug, bodyClass: 'page-list',
      body: `    <section class="list-head"><p class="eyebrow">Category</p><h1>${escapeHtml(c.name)} 리뷰</h1><p>${list.length}개의 리뷰</p></section>
    <section class="latest"><div class="grid">${list.map((p) => card(p)).join('\n')}</div></section>`,
    }));
  }

  // 편집 원칙
  fs.mkdirSync(path.join(out, 'about'), { recursive: true });
  fs.writeFileSync(path.join(out, 'about', 'index.html'), layout({
    title: '편집 원칙', description: `${config.title}가 리뷰를 만드는 방법과 원칙`, url: `${base}/about/`, cats: usedCats, bodyClass: 'page-about',
    body: `    <article class="article about">
      <header class="article-head"><span class="kicker">About</span><h1>편집 원칙</h1>
        <p class="dek">${escapeHtml(config.title)}는 화제의 신제품을 두고 흩어져 있는 실사용 후기와 공식 자료를 모아, 사기 전에 꼭 알아야 할 내용을 한 편으로 정리하는 테크 리뷰 큐레이션입니다.</p></header>
      <div class="prose narrow">
        <h2>이렇게 만듭니다</h2>
        <ol>
          <li><strong>공식 자료 확인:</strong> 가격, 출시일, 스펙은 제조사 보도자료와 공식 홈페이지를 기준으로 합니다.</li>
          <li><strong>실사용 후기 수집:</strong> 언론 사용기와 커뮤니티 구매 후기를 직접 읽고, 공통된 평가와 엇갈리는 평가를 함께 정리합니다.</li>
          <li><strong>비교:</strong> 가장 많이 비교되는 경쟁 제품과 나란히 놓고 장단점을 정리합니다.</li>
        </ol>
        <h2>지키는 원칙</h2>
        <ul>
          <li>직접 써 보지 않은 제품을 써 본 것처럼 쓰지 않습니다. 직접 사용한 체험기는 글에 따로 밝힙니다.</li>
          <li>인용한 후기는 누가 어디서 쓴 것인지 밝히고, 참고한 자료의 링크를 모두 남깁니다.</li>
          <li>확인되지 않은 소문은 소문이라고 분명히 적고, 단정하지 않습니다.</li>
          <li>사진은 제조사가 자유 이용을 허락한 공식 제품 사진만 출처와 함께 씁니다.</li>
          <li>협찬, 광고, 제휴 링크를 받지 않습니다.</li>
        </ul>
        <h2>정정 요청</h2>
        <p>틀린 내용을 발견하시면 글의 댓글이나 사이트 운영 채널로 알려 주세요. 확인 후 바로 고치고, 고친 내용을 글에 남깁니다.</p>
      </div>
    </article>`,
  }));

  fs.writeFileSync(path.join(out, '404.html'), layout({
    title: '페이지를 찾을 수 없어요', description: config.description, url: `${base}/404.html`, cats: usedCats, bodyClass: 'page-list',
    body: '    <section class="list-head"><p class="eyebrow">404</p><h1>페이지를 찾을 수 없어요</h1><p><a href="/">첫 화면으로 가기</a></p></section>',
  }));

  const sitemapUrls = [
    { loc: `${base}/` },
    ...posts.map((p) => ({ loc: `${base}/${p.slug}/`, lastmod: p.date })),
    ...usedCats.map((c) => ({ loc: `${base}/category/${c.slug}/` })),
    { loc: `${base}/about/` },
  ];
  fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);

  const items = posts.slice(0, 20).map((p) => `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${base}/${p.slug}/</link>
      <guid>${base}/${p.slug}/</guid>
      <category>${escapeHtml(p.category.name)}</category>
      <pubDate>${new Date(`${p.date}T07:00:00+09:00`).toUTCString()}</pubDate>
      <description>${escapeHtml(p.description)}</description>
    </item>`).join('\n');
  fs.writeFileSync(path.join(out, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(config.title)}</title>
    <link>${base}/</link>
    <description>${escapeHtml(config.description)}</description>
    <language>${config.language}</language>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
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
