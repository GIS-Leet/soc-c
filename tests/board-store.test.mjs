// 게시판 어댑터의 페이지 합치기·중첩 구독·인증 변경 회귀 시험.
import test from 'node:test';import assert from 'node:assert/strict';import {BoardStore} from '../assets/board-store.mjs';
const settle=()=>new Promise(r=>setTimeout(r,0));
test('여러 페이지 전체를 합친 뒤 성공을 알리고 동일 폴링으로 중복 이벤트를 만들지 않는다',async()=>{
 const store=new BoardStore(async({cursor})=>cursor?{items:[{id:'b',text:'오래된 글'}],hasMore:false}:{items:[{id:'a',text:'최근 글'}],hasMore:true,cursor:'a'});
 const seen=[];store.listen('', 'added',s=>seen.push(s.key));await store.refresh();await settle();assert.deepEqual(seen,['a','b']);await store.refresh();await settle();assert.deepEqual(seen,['a','b']);assert.equal(store.state.complete,true);
});
test('두번째 페이지 실패는 이전 전체 목록을 지우거나 성공으로 알리지 않는다',async()=>{
 let fail=false;const store=new BoardStore(async({cursor})=>{if(fail && cursor)throw Error('network');return cursor?{items:[{id:'b'}],hasMore:false}:{items:[{id:'a'}],hasMore:true,cursor:'a'}});
 await store.refresh();fail=true;await assert.rejects(store.refresh());assert.deepEqual(Object.keys(store.data),['a','b']);assert.equal(store.state.complete,false);assert.equal(store.state.status,'error');
});
test('부모 추가 콜백에서 구독한 답변은 초기 이벤트가 한번만 발생한다',async()=>{
 const store=new BoardStore(async()=>({items:[{id:'a',replies:{r:{text:'답변'}}}],hasMore:false}));const seen=[];
 store.listen('','added',s=>store.listen(s.key+'/replies','added',r=>seen.push(r.key)));await store.refresh();await settle();assert.deepEqual(seen,['r']);
});
test('로그아웃 뒤 도착한 응답은 폐기한다',async()=>{
 let resolve;const store=new BoardStore(()=>new Promise(r=>resolve=r));const pending=store.refresh();store.reset();resolve({items:[{id:'private',text:'비밀'}],hasMore:false});await pending;assert.deepEqual(store.data,{});
});
test('한 글을 갱신하면 기존 답변의 changed/removed 이벤트도 전달한다',async()=>{
 const store=new BoardStore(async()=>({items:[],hasMore:false}));store.setItem({id:'a',replies:{r:{text:'old'}}});const seen=[];store.listen('a/replies','changed',s=>seen.push(s.val().text));store.listen('a/replies','removed',s=>seen.push('removed:'+s.key));await settle();store.setItem({id:'a',replies:{r:{text:'new'}}});await settle();store.setItem({id:'a',replies:{}});await settle();assert.deepEqual(seen,['new','removed:r']);
});
test('삭제 후 같은 답변 ID가 돌아와도 대댓글 구독이 중복되지 않는다',async()=>{
 const store=new BoardStore(async()=>({items:[],hasMore:false}));const seen=[];
 store.listen('a/replies','added',reply=>store.listen('a/replies/'+reply.key+'/subReplies','added',sub=>seen.push(sub.key)));
 store.setItem({id:'a',replies:{r:{subReplies:{s:{text:'one'}}}}});await settle();
 store.setItem({id:'a',replies:{}});await settle();
 store.setItem({id:'a',replies:{r:{subReplies:{s:{text:'two'}}}}});await settle();
 assert.deepEqual(seen,['s','s']);
});

test('서버 목록 상한 50개 이내로 요청한다',async()=>{
 const store=new BoardStore(async({limit})=>{assert.ok(limit<=50);return {items:[],hasMore:false}});await store.refresh();
});
// ── 가벼운 폴링 ──
test('가벼운 새로 고침은 판 번호를 보내고, 바뀐 게 없으면 목록과 이벤트를 그대로 둔다',async()=>{
 const calls=[];let version='7';
 const store=new BoardStore(async options=>{calls.push(options);if(options.stamp&&options.stamp===version)return{notModified:true,stamp:version};return{items:[{id:'a',text:version}],hasMore:false,stamp:version}});
 const seen=[];store.listen('a','value',s=>seen.push(s.val().text));
 await store.refresh();await settle();assert.equal(calls[0].stamp,undefined,'처음은 전체');
 await store.refresh({light:true});await settle();assert.equal(calls[1].stamp,'7');assert.deepEqual(seen,['7']);assert.equal(store.state.complete,true);
 version='8';await store.refresh({light:true});await settle();assert.deepEqual(seen,['7','8'],'판이 바뀌면 같은 요청으로 전체를 받는다');assert.equal(calls.length,3);
});
test('가벼운 새로 고침도 10번에 한 번은 전체를 받는다',async()=>{
 const calls=[];const store=new BoardStore(async options=>{calls.push(options);return options.stamp?{notModified:true,stamp:'1'}:{items:[{id:'a'}],hasMore:false,stamp:'1'}});
 await store.refresh();for(let i=0;i<10;i++)await store.refresh({light:true});
 assert.equal(calls.filter(c=>!c.stamp).length,2,'처음 + 10번째');
});
test('로그인 변경 뒤와 판 번호 없는 서버에는 판 번호를 보내지 않는다',async()=>{
 const calls=[];let stamp='3';const store=new BoardStore(async options=>{calls.push(options);return{items:[{id:'a'}],hasMore:false,...(stamp?{stamp}:{})}});
 await store.refresh();store.reset();await store.refresh({light:true});assert.equal(calls[1].stamp,undefined);
 stamp=null;await store.refresh();await store.refresh({light:true});assert.equal(calls[3].stamp,undefined);
});
