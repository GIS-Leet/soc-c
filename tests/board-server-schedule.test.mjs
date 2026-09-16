// 자동 유지보수는 페이지 진행점을 저장하고 동시 실행을 한 번으로 제한함.
import test from 'node:test';import assert from 'node:assert/strict';import {scheduledMaintenance} from '../functions/board-schedule.mjs';
function fake(){let state=null;return {get:async()=>state,transaction:async(_path,fn)=>{const next=fn(state);if(next===undefined)return {committed:false};state=next;return {committed:true,value:next}}};}
test('유지보수 진행점은 다음 실행에서 이어지고 알림은 기본 비활성이다',async()=>{
 const store=fake(),calls=[];const run=async options=>{calls.push(options);return {cursors:{attachments:'next'}}};
 await scheduledMaintenance({store,run,now:()=>1000});await scheduledMaintenance({store,run,now:()=>2000});assert.deepEqual(calls[1].cursors,{attachments:'next'});assert.equal(calls[0].notificationsEnabled,false);
});
test('동시 실행은 임대가 끝나기 전에 같은 페이지를 정리하지 않는다',async()=>{
 const store=fake();let release,started;const began=new Promise(r=>started=r);const first=scheduledMaintenance({store,run:()=>{started();return new Promise(r=>release=r)},now:()=>1000});await began;
 assert.deepEqual(await scheduledMaintenance({store,run:()=>assert.fail(),now:()=>1001}),{skipped:true});release({cursors:{}});await first;
});
