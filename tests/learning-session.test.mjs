// 실제 강의 verify와 공부 인증 콜백을 격리하여 사용자 전환을 재현함.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const lecture=readFileSync(new URL('../assets/lecture.mjs',import.meta.url),'utf8');
const verifySource=lecture.slice(lecture.indexOf('async function verify('),lecture.indexOf('  function gateError'));
function lectureFixture(){
 let n=0;const writes=[],remembered=new Map(),auth={currentUser:{uid:'student-A'}},H={normSid:x=>x,normName:x=>x,hashId:async(s,n)=>s+n};
 const factory=new Function('auth','signOut','signInAnonymously','H','set','ref','db','serverTimestamp','localStorage','LS','let identity;'+verifySource+';return verify');
 const verify=factory(auth,async()=>{auth.currentUser=null},async()=>{auth.currentUser={uid:'new-'+(++n)}},H,async(path,value)=>writes.push({path,value}),(_,path)=>path,{},()=>1,{setItem:(k,v)=>remembered.set(k,v),removeItem:k=>remembered.delete(k)},'fixture');return {verify,auth,writes,remembered};
}
test('학번 기억을 안 한 다음 학생은 남아 있던 익명 UID를 재사용하지 않는다',async()=>{
 const f=lectureFixture();const uid=await f.verify('2','학생B');assert.notEqual(uid,'student-A');assert.equal(f.writes[0].path,'members/'+uid);assert.equal(f.remembered.size,0);
});
test('기기에 기억한 학생은 일치하는 UID에서만 이어보고 UID도 함께 저장한다',async()=>{
 const f=lectureFixture();assert.equal(await f.verify('1','학생A',true,'student-A'),'student-A');assert.equal(JSON.parse(f.remembered.get('fixture')).uid,'student-A');assert.notEqual(await f.verify('2','학생B',true,'someone-else'),'student-A');
});
test('공부 초기화 이후 인증이 끊겨도 소유자 재로그인은 화면을 복구한다',()=>{
 const html=readFileSync(new URL('../study.html',import.meta.url),'utf8');const start=html.indexOf('else onAuthStateChanged(auth, user => {')+'else onAuthStateChanged(auth, '.length;const end=html.indexOf('\n  });',start);const body=html.slice(start,end)+'\n  }';const gate={style:{}},appEl={style:{}};let boots=0;
 const run=new Function('gate','appEl','boot','showGate','showWarn','signOut','post','auth','OWNER_EMAIL','APP','let booted=false;return ('+body+');')(gate,appEl,()=>boots++,()=>{gate.style.display='';appEl.style.display='none'},()=>{},()=>{},()=>{},{},'teacher',false);
 const owner={email:'teacher',emailVerified:true};run(owner);run(null);assert.equal(appEl.style.display,'none');run(owner);assert.equal(appEl.style.display,'');assert.equal(gate.style.display,'none');assert.equal(boots,1);
});
