// 사이트 지도(scripts/site-map.mjs)를 전체 메뉴 · 상단 드롭다운(geo.js) · 첫 화면 바로가기에 써 넣는다. --check 는 어긋났는지만 본다
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GROUPS, NAV, MENU } from './site-map.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ext = (it) => (it.ext ? ' target="_blank" rel="noopener"' : '');

/** 전체 메뉴 — 묶음마다 제목 하나와 링크 줄 */
export function menuHTML() {
  const sections = MENU.map((m) => {
    const rows = [];
    if (m.first) rows.push(`      <a href="${esc(m.first.href)}">${esc(m.first.label)}</a>`);
    for (const key of m.groups) {
      for (const it of GROUPS[key].items) {
        const small = m.small === 'unit' ? GROUPS[key].title : it.desc;
        rows.push(`      <a href="${esc(it.href)}"${ext(it)}>${esc(it.label)}${small ? ` <small>${esc(small)}</small>` : ''}</a>`);
      }
    }
    return `    <div class="geo-group">\n      <h3>${esc(m.title)}</h3>\n${rows.join('\n')}\n    </div>`;
  });
  return `  <!-- site-nav:menu — scripts/site-map.mjs 에서 만든다. 여기를 직접 고치지 말 것 -->\n  <nav class="geo-menu__map" aria-label="전체 페이지">\n${sections.join('\n')}\n  </nav>\n  <!-- /site-nav:menu -->`;
}

/** 첫 화면 바로가기 — 전체 메뉴와 같은 묶음, 설명 없이 이름만 */
export function homeHTML() {
  const cols = MENU.map((m) => {
    const items = [...(m.first ? [m.first] : []), ...m.groups.flatMap((k) => GROUPS[k].items)];
    // 긴 묶음(시뮬레이터)은 두 줄에 걸쳐 놓아, 짧은 묶음 아래에 빈자리가 생기지 않게 한다
    const cls = items.length > 6 ? 'home-dir__col home-dir__col--tall' : 'home-dir__col';
    return `      <div class="${cls}">\n        <h2>${esc(m.title)}</h2>\n${items.map((it) => `        <a href="${esc(it.href)}"${ext(it)}>${esc(it.label)}</a>`).join('\n')}\n      </div>`;
  });
  return `    <!-- site-nav:home — scripts/site-map.mjs 에서 만든다 -->\n    <nav class="home-dir" aria-label="모든 페이지 바로가기">\n${cols.join('\n')}\n    </nav>\n    <!-- /site-nav:home -->`;
}

/** 상단 드롭다운 설정 — geo.js 안에 그대로 들어간다 */
export function dropJS() {
  // geo.js 의 다른 코드처럼 작은따옴표 객체 글자로
  const lit = (v) => Array.isArray(v) ? `[${v.map(lit).join(', ')}]`
    : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${k}: ${lit(x)}`).join(', ')} }`
    : typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(v);
  const entries = NAV.filter((n) => n.drop).map((n) => {
    const cols = n.drop.map((k) => `        ${lit({ title: GROUPS[k].title, items: GROUPS[k].items.map(({ label, href, desc, ext }) => ({ label, href, ...(desc ? { desc } : {}), ...(ext ? { ext } : {}) })) })}`);
    return `    '${n.href}': {\n      cols: [\n${cols.join(',\n')}\n      ]${n.foot ? `,\n      foot: ${lit(n.foot)}` : ''}\n    }`;
  });
  return `  /* site-nav:drop — scripts/site-map.mjs 에서 만든다. 여기를 직접 고치지 말 것 */\n  const NAV_DROP = {\n${entries.join(',\n')}\n  };\n  /* /site-nav:drop */`;
}

const between = (text, open, close, body, fallback) => {
  const re = new RegExp(`[ \\t]*${open}[\\s\\S]*?${close}`);
  if (re.test(text)) return text.replace(re, () => body);
  return fallback(text);
};

export async function apply(root, { check = false } = {}) {
  const changed = [];
  const put = async (file, next) => {
    const path = join(root, file), prev = await readFile(path, 'utf8');
    if (prev === next) return;
    changed.push(file);
    if (!check) await writeFile(path, next);
  };
  for (const file of (await readdir(root)).filter((f) => f.endsWith('.html')).sort()) {
    let text = await readFile(join(root, file), 'utf8');
    if (!text.includes('class="geo-menu"')) continue;
    text = between(text, '<!-- site-nav:menu', '<!-- /site-nav:menu -->', menuHTML(), (t) =>
      t.replace(/[ \t]*<div class="geo-menu__links">[\s\S]*?(?=\n[ \t]*<div class="geo-menu__foot">)/, () => menuHTML()));
    if (file === 'index.html') text = between(text, '<!-- site-nav:home', '<!-- /site-nav:home -->', homeHTML(), (t) =>
      t.replace(/[ \t]*<nav class="learning-links"[\s\S]*?<\/nav>/, () => homeHTML()));
    await put(file, text);
  }
  const js = 'design-system/geo.js';
  let geo = await readFile(join(root, js), 'utf8');
  geo = between(geo, '/\\* site-nav:drop', '/\\* /site-nav:drop \\*/', dropJS(), (t) =>
    t.replace(/[ \t]*const NAV_DROP = \{[\s\S]*?\n  \};/, () => dropJS()));
  await put(js, geo);
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const check = process.argv.includes('--check');
  const changed = await apply(resolve(dirname(fileURLToPath(import.meta.url)), '..'), { check });
  if (check && changed.length) { console.error('사이트 지도와 어긋난 파일 — node scripts/site-nav.mjs 를 돌릴 것:\n' + changed.join('\n')); process.exitCode = 1; }
  else console.log(check ? '메뉴가 사이트 지도와 같습니다' : `고친 파일 ${changed.length}개`);
}
