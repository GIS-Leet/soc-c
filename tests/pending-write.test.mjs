// 대기 중 중복 등록과 새 초안 삭제를 막는 폼 잠금 회귀 시험.
import test from 'node:test';import assert from 'node:assert/strict';import {guardPending} from '../assets/pending-write.mjs';
test('같은 폼의 두 클릭은 한 번만 저장하고 완료 후 이전 disabled 상태를 복구한다',async()=>{
 let resolve,calls=0;const field={disabled:false};const wrapped=guardPending(async()=>{calls++;await new Promise(r=>resolve=r)},()=>[field]);
 const first=wrapped('q');await wrapped('q');assert.equal(calls,1);assert.equal(field.disabled,true);resolve();await first;assert.equal(field.disabled,false);
});
test('실패해도 초안 값을 유지하고 다시 입력할 수 있다',async()=>{const field={value:'초안',disabled:false};const wrapped=guardPending(async()=>{throw Error('offline')},()=>[field]);await assert.rejects(wrapped('q'));assert.equal(field.value,'초안');assert.equal(field.disabled,false)});
