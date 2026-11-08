// 게시 후 검색엔진에 새 글을 알린다 (IndexNow: 네이버, Bing 등이 지원).
// 키 파일 docs/<key>.txt 가 사이트에 올라간 뒤에야 검색엔진이 받아 주므로, 먼저 키 파일이 열리는지 기다린다.

const fs = require('fs');
const path = require('path');

const root = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const base = config.baseUrl.replace(/\/$/, '');
const host = new URL(base).host;
const key = config.indexNowKey;
const keyLocation = `${base}/${key}.txt`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForKeyFile() {
  for (let i = 0; i < 18; i++) {
    try {
      const res = await fetch(keyLocation, { cache: 'no-store' });
      if (res.ok && (await res.text()).trim() === key) return true;
    } catch {}
    await sleep(10000);
  }
  return false;
}

async function main() {
  if (!key) throw new Error('site.config.json 에 indexNowKey 가 없어요.');
  const sitemap = fs.readFileSync(path.join(root, 'docs', 'sitemap.xml'), 'utf8');
  const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  if (!(await waitForKeyFile())) {
    console.log('키 파일이 아직 사이트에 반영되지 않아 검색엔진 알림을 건너뛰었어요.');
    return;
  }

  const body = JSON.stringify({ host, key, keyLocation, urlList });
  for (const endpoint of ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow']) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body,
      });
      console.log(`${endpoint} → ${res.status} (${urlList.length}개 주소)`);
    } catch (e) {
      console.log(`${endpoint} → 실패: ${e.message}`);
    }
  }
}

main();
