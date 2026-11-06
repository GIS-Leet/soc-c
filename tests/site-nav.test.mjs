// 메뉴(전체 메뉴 · 상단 드롭다운 · 첫 화면 바로가기)가 사이트 지도와 맞는지 — 어긋나면 페이지마다 메뉴가 달라진다
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {existsSync} from 'node:fs';
import {GROUPS,MENU,NAV} from '../scripts/site-map.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
test('메뉴는 사이트 지도와 같아야 한다 (node scripts/site-nav.mjs)',()=>{
  const r=spawnSync(process.execPath,[join(root,'scripts','site-nav.mjs'),'--check'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr||r.stdout);
});
test('사이트 지도의 링크는 실제 페이지를 가리키고, 한 페이지는 한 묶음에만 있다',()=>{
  const seen=new Map();
  for(const [key,g] of Object.entries(GROUPS))for(const it of g.items){
    if(/^https?:/.test(it.href))continue;
    assert.ok(existsSync(join(root,it.href.split('#')[0])),`${key}: ${it.href}`);
    assert.ok(!seen.has(it.href),`${it.href} 가 ${seen.get(it.href)} · ${key} 두 묶음에 있음`);seen.set(it.href,key);
  }
  for(const m of MENU)for(const k of m.groups)assert.ok(GROUPS[k],k);
  for(const n of NAV)for(const k of n.drop||[])assert.ok(GROUPS[k],k);
});
