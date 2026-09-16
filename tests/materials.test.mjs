// 공개 색인·경로·캐시의 회귀 시험.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../scripts/materials-index.mjs';
import { parsePath, selectItems, loadIndex, fileURL } from '../assets/materials.mjs';
const tree = {sha:'a'.repeat(40), tree:[{path:'학습지',type:'tree'}, {path:'학습지/지구.pdf',type:'blob',size:12}, {path:'.env',type:'blob'}, {path:'README.md',type:'blob'}, {path:'secret/answer.pdf',type:'blob'}]};
test('색인은 공개 자료 폴더만 포함하고 원래 URL 인코딩을 보존한다',()=>{
 const index=buildIndex(tree,'2026-09-16T00:00:00Z');
 assert.equal(index.items.length,2); assert.equal(index.sourceSha,tree.sha);
 assert.equal(selectItems(index,'','지구','학습지')[0].path,'학습지/지구.pdf');
 assert.match(fileURL(index.items[1].path),/%E1%84%8C/);
 assert.throws(()=>buildIndex({...tree,truncated:true}));
});
test('깨진 URL과 상위 경로는 자료실 루트로 안전하게 복구한다',()=>{
 assert.equal(parsePath('#%'),''); assert.equal(parsePath('#../secret'),'');
 assert.equal(parsePath('#'+encodeURIComponent('학습지')),'학습지');
});
test('폴더 탐색과 전체 검색은 필터를 함께 적용한다',()=>{
 const index=buildIndex(tree);
 assert.equal(selectItems(index,'')[0].type,'dir');
 assert.equal(selectItems(index,'학습지').length,1);
 assert.equal(selectItems(index,'','지구','PPT').length,0);
});
test('저장 공간 부족이어도 정상 HTTP 색인을 반환한다',async()=>{
 const index=buildIndex(tree); let count=0;
 const result=await loadIndex({fetcher:async()=>{count++;return {ok:true,json:async()=>index}},storage:{getItem(){return null},setItem(){throw Error('quota')}}});
 assert.equal(result.index.sourceSha,index.sourceSha); assert.equal(result.stale,false);assert.equal(count,1);
});
test('네트워크 실패시 검증된 이전 색인으로 복구하고 손상된 캐시는 거부한다',async()=>{
 const index=buildIndex(tree);const fetcher=async()=>{throw Error('offline')};
 assert.equal((await loadIndex({fetcher,storage:{getItem:()=>JSON.stringify(index)}})).stale,true);
 await assert.rejects(loadIndex({fetcher,storage:{getItem:()=>'{"items":[]}'}}));
});
