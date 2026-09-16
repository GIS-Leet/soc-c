// 서비스 워커 설치 실패·캐시 범위·갱신 수명의 회귀 시험.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function harness({fail=false,hit,put}={}){
 const handlers={},deleted=[];let skipped=false;
 const cache={add:async()=>{if(fail)throw Error('missing asset')},addAll:async()=>{if(fail)throw Error('missing asset')},match:async()=>hit,put:put||(async()=>{})};
 const context={self:{addEventListener:(k,v)=>handlers[k]=v,skipWaiting:()=>{skipped=true},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['another-app-v1','desk-shell-v2','desk-shell-v4'],delete:async k=>deleted.push(k)},location:{origin:'https://nyuheatgis.com'},URL,Response,fetch:async()=>new Response('fresh')};
 vm.runInNewContext(source,context);return {handlers,deleted,skipped:()=>skipped};
}
test('필수 파일이 실패하면 새 워커를 활성화하지 않는다',async()=>{const h=harness({fail:true});let work;h.handlers.install({waitUntil:p=>work=p});await assert.rejects(work);assert.equal(h.skipped(),false)});
test('활성화는 자기 이름의 구버전 캐시만 삭제한다',async()=>{const h=harness();let work;h.handlers.activate({waitUntil:p=>work=p});await work;assert.deepEqual(h.deleted,['desk-shell-v2']);});
test('캐시를 먼저 반환해도 갱신 저장이 끝날 때까지 이벤트 수명을 유지한다',async()=>{let resolve;let stored=false;const pending=new Promise(r=>resolve=r);const h=harness({hit:new Response('cached'),put:async()=>{await pending;stored=true}});let response;const waits=[];h.handlers.fetch({request:new Request('https://nyuheatgis.com/design-system/geo.css'),respondWith:p=>response=p,waitUntil:p=>waits.push(p)});assert.equal(await (await response).text(),'cached');assert.ok(waits.length);resolve();await Promise.all(waits);assert.equal(stored,true)});
