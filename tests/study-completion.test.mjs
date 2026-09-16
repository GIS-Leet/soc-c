// 공부 완료 재시도는 같은 세션·완료 기록을 한 번의 다중 경로 쓰기로 갱신함.
import test from 'node:test';import assert from 'node:assert/strict';import {completionPatch} from '../assets/study-completion.mjs';
test('하루 복습 재시도와 다른 탭 완료는 같은 세션 키를 사용한다',()=>{
 const args={date:'2026-09-16',app:false,session:{min:2},record:{finishedAt:'first'},subjectExists:false};
 const a=completionPatch(args),b=completionPatch({...args,record:{finishedAt:'retry'}});
 assert.deepEqual(Object.keys(a),Object.keys(b));assert.equal(Object.keys(a).filter(k=>k.startsWith('sessions/')).length,1);assert.ok(a['daily/2026-09-16']);assert.ok(a['subjects/study-review']);
});
test('앱의 회차와 추가 공부는 분리하고 기존 과목은 새로 만들지 않는다',()=>{
 const args={date:'2026-09-16',app:true,slot:2,extraId:'abc',session:{min:2},record:{slot:2},subjectExists:true};const p=completionPatch(args);assert.ok(p['phone/2026-09-16/2']);assert.ok(p['sessions/phone-2026-09-16-2']);assert.equal(Object.keys(p).length,2);
 const extra=completionPatch({...args,slot:0});assert.ok(extra['phone/2026-09-16/xabc']);assert.throws(()=>completionPatch({...args,date:'bad/path'}));
});
