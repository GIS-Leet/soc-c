// 자산 주소의 내용 해시 스탬프가 최신인지 — 오래됐으면 배포해도 방문자가 10분 동안 옛 파일을 본다
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
test('자산 스탬프는 파일 내용과 맞아야 한다 (npm run stamp)',()=>{
  const script=join(dirname(fileURLToPath(import.meta.url)),'..','scripts','stamp-assets.mjs');
  const r=spawnSync(process.execPath,[script,'--check'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr||r.stdout);
});
