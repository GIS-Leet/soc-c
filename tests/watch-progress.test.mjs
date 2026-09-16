// 탐색 위치와 실제 시청 시간을 분리하고 재시도 중 새 기록을 보존하는 시험.
import test from 'node:test';import assert from 'node:assert/strict';
import {WatchProgress,LatestWrites} from '../assets/watch-progress.mjs';
test('끝으로 탐색해도 완료가 되지 않으며 실제 재생 구간만 합친다',()=>{
 const watch=new WatchProgress({sec:95,dur:100});watch.sample(0,0,true);watch.sample(1,1000,true);watch.sample(95,2000,true);watch.sample(96,3000,true);
 assert.equal(watch.record(100).watchedSec,2);assert.equal(watch.record(100).done,false);assert.equal(watch.record(100).sec,96);
 watch.sample(0,4000,true);watch.sample(1,5000,true);assert.equal(watch.record(100).watchedSec,2);
});
test('배속·일시정지·종료 샘플은 경과시간을 넘어선 구간을 인정하지 않는다',()=>{
 const watch=new WatchProgress();watch.sample(0,0,true,2);watch.sample(2,1000,true,2);watch.sample(3,1500,false,2);watch.sample(50,3000,false);watch.sample(50,4000,true);watch.sample(51,5000,true);
 assert.equal(watch.record(100).watchedSec,4);
});
test('기존 완료 기록은 유지하지만 과거 위치를 시청한 구간으로 바꾸지 않는다',()=>{
 const watch=new WatchProgress({sec:100,dur:100,done:true});const r=watch.record(100);assert.equal(r.done,true);assert.equal(r.legacyDone,true);assert.equal(r.watchedSec,0);
});
test('전송 중 새 기록이 생기면 이전 ACK는 최신 기록을 지우지 않는다',async()=>{
 let ack;const sent=[];const queue=new LatestWrites(async(key,value)=>{sent.push(value);if(sent.length===1)await new Promise(r=>ack=r)});
 queue.put('a',{sec:1});const pending=queue.flush();queue.put('a',{sec:2});ack();await pending;assert.deepEqual(sent,[{sec:1},{sec:2}]);assert.equal(queue.size,0);
});
test('실패한 시청 기록은 보존하고 같은 경로로 재시도한다',async()=>{
 let fail=true;const queue=new LatestWrites(async()=>{if(fail)throw Error('offline')});queue.put('a',{sec:1});await assert.rejects(queue.flush());assert.equal(queue.size,1);fail=false;await queue.flush();assert.equal(queue.size,0);
});
