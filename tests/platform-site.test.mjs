// 링크와 스크립트 오류가 배포 검사에서 실제로 차단되는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkSite} from '../scripts/check-site.mjs';
test('유효한 링크를 허용하고 누락 파일과 문법 오류를 찾는다',async()=>{const root=await mkdtemp(join(tmpdir(),'site-check-'));try {await writeFile(join(root,'index.html'),'<a href="next.html#lesson">수업</a><script>const x = 1;</script>');await writeFile(join(root,'next.html'),'<section id="lesson"></section>');assert.deepEqual(await checkSite(root,{publicPages:[]}),[]);await writeFile(join(root,'index.html'),'<a href="missing.html">수업</a><script>const = ;</script>');const errors=await checkSite(root,{publicPages:[]});assert.ok(errors.some(x=>x.includes('missing.html')));assert.ok(errors.some(x=>x.includes('syntax')));}finally{await rm(root,{recursive:true,force:true});}});
test('공개 페이지 메타와 잘못된 프래그먼트를 검증한다',async()=>{const root=await mkdtemp(join(tmpdir(),'site-check-'));try{await writeFile(join(root,'index.html'),'<a href="#absent">보기</a>');const errors=await checkSite(root,{publicPages:['index.html']});assert.ok(errors.some(x=>x.includes('description')));assert.ok(errors.some(x=>x.includes('#absent')));}finally{await rm(root,{recursive:true,force:true});}});

test('Desk 학습 실행 경로만 예외로 허용한다',async()=>{const root=await mkdtemp(join(tmpdir(),'site-check-'));try{await writeFile(join(root,'index.html'),'<a href="desk.html#study">학습</a><a href="desk.html#unknown">오류</a>');await writeFile(join(root,'desk.html'),'<main></main>');const errors=await checkSite(root,{publicPages:[]});assert.equal(errors.length,1);assert.ok(errors[0].includes('#unknown'));}finally{await rm(root,{recursive:true,force:true});}});
