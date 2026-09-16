// 로그아웃 뒤 늦은 데이터·캐시가 다시 나타나지 않는지 확인함.
import test from 'node:test';import assert from 'node:assert/strict';import {createSessionScope} from '../assets/session-scope.mjs';
test('종료 시 모든 구독을 해제하고 예전 콜백을 무효화한다',()=>{
 const scope=createSessionScope();let calls=0,stops=0;const callback=scope.guard(()=>calls++);
 scope.track(()=>stops++);callback();scope.clear();callback();scope.guard(()=>calls++)();
 assert.equal(calls,2);assert.equal(stops,1);
});
test('정리 함수 하나가 실패해도 나머지를 정리한다',()=>{const scope=createSessionScope();let stopped=false;scope.track(()=>{throw Error('bad cleanup')});scope.track(()=>stopped=true);scope.clear();assert.equal(stopped,true);});
