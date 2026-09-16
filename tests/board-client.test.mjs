// 브라우저 어댑터를 합성 인증·전송 경계로 실행하여 실제 요청과 세션 폐기를 검증함.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {BoardStore} from '../assets/board-store.mjs';import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../assets/board-client.mjs',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
function fixture(fetcher,overrides={}){
 const listeners=[];const auth={currentUser:{uid:'one',getIdToken:async()=> 'fixture-token'},authStateReady:async()=>{}};
 const sandbox={BoardStore,getAuth:()=>auth,onAuthStateChanged:(_,cb)=>{listeners.push(cb);queueMicrotask(()=>cb(auth.currentUser));return()=>{}},signInAnonymously:async()=>({user:auth.currentUser}),GoogleAuthProvider:class{},signInWithPopup:async()=>{},signOut:async()=>{},fetch:fetcher,document:{visibilityState:'hidden'},URL,Blob,AbortController,structuredClone,crypto:webcrypto,setInterval:()=>0,setTimeout:()=>0,clearTimeout(){},queueMicrotask,console,...overrides};
 vm.runInNewContext(source+';this.api={getDatabase,ref,push,readPost,loginTeacher,expireGrant};',sandbox);
 const db=sandbox.api.getDatabase({});return {api:sandbox.api,db,changeUser(){auth.currentUser={uid:'two',getIdToken:async()=> 'second-fixture'};listeners.forEach(cb=>cb(auth.currentUser))}};
}
test('알 수 없는 경로를 거부하고 게시글 요청의 관리자·시간 필드를 서버에 맡긴다',async()=>{
 const calls=[];const f=fixture(async(_url,options)=>{const data=JSON.parse(options.body).data;calls.push(data);return {ok:true,json:async()=>({result:{id:'new',item:{id:'new',text:'본문'}}})}});
 await new Promise(r=>queueMicrotask(r));
 assert.throws(()=>f.api.ref(f.db,'questions/a/other/b'));
 await f.api.push(f.api.ref(f.db,'questions'),{title:'제목',text:'본문',password:'test-only',author:'익명',isSecret:false,isTeacher:true,timestamp:1});
 const created=calls.find(x=>x.action==='create');assert.equal(created.isTeacher,undefined);assert.equal(created.timestamp,undefined);assert.ok(created.requestId);
});
test('인증 헤더는 고정 첨부 서버에만 전달하고 외부 이미지 URL을 거부한다',async()=>{
 const calls=[];const f=fixture(async(url,options)=>{calls.push(url);return {ok:true,json:async()=>({result:{item:{id:'private',text:'본문',imageUrl:'https://attacker.invalid/pixel'}}})}});
 await new Promise(r=>queueMicrotask(r));const result=await f.api.readPost(f.api.ref(f.db,'questions/private'));assert.equal(result.item.imageUrl,'');assert.equal(calls.some(x=>x.includes('attacker')),false);
});
test('첨부 다운로드 중 계정이 바뀌면 이전 계정의 본문을 다시 채우지 않는다',async()=>{
 let resolveImage,started;const imageStarted=new Promise(r=>started=r);
 const f=fixture(async(url)=>{if(url.includes('boardAttachment')){started();return new Promise(r=>resolveImage=()=>r({ok:true,blob:async()=>new Blob(['x'])}))}return {ok:true,json:async()=>({result:{item:{id:'private',text:'이전 계정 비밀',imageUrl:'https://us-central1-soc-c-qna.cloudfunctions.net/boardAttachment?board=questions&id=private'}}})}});
 await new Promise(r=>queueMicrotask(r));const pending=f.api.readPost(f.api.ref(f.db,'questions/private'));await imageStarted;f.changeUser();resolveImage();await assert.rejects(pending,/로그인 상태/);assert.equal(f.db.stores.size,0);
});

test('비밀번호 열람권은 owner 기능이 있어도 만료 시 본문과 해당 첨부만 폐기한다',async()=>{
 const timers=[];const revoked=[];
 const f=fixture(async()=>{throw Error('offline')},{setTimeout:(fn)=>{timers.push(fn);return timers.length},URL:Object.assign(class extends URL {},{revokeObjectURL:url=>revoked.push(url)})});
 await new Promise(r=>queueMicrotask(r));const store=new BoardStore(async()=>{throw Error('offline')});f.db.stores.set('questions',store);
 const item={id:'private',isSecret:true,text:'비밀',_access:{owner:true,read:true,expiresAt:Date.now()+20}};store.setItem(item);
 f.db.images.set('opaque-original',{url:'blob:private',board:'questions',postId:'private'});f.db.images.set('other',{url:'blob:other',board:'feedback',postId:'private'});
 f.api.expireGrant(f.db,'questions',item);assert.equal(timers.length,1);timers[0]();assert.equal(store.data.private.text,'');assert.deepEqual(revoked,['blob:private']);assert.equal(f.db.images.size,1);
});
test('교사 로그인 연속 요청은 하나의 팝업만 연다',async()=>{
 let count=0,resolve;const f=fixture(async()=>{}, {signInWithPopup:()=>{count++;return new Promise(r=>resolve=r)}});
 const first=f.api.loginTeacher(f.db),second=f.api.loginTeacher(f.db);assert.equal(count,1);resolve();await Promise.allSettled([first,second]);
});
