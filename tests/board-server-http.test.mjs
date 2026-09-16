// 실제 Functions·Auth·Database·Storage 에뮬레이터 경계를 통과하는 합성 HTTP 시험.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const enabled=process.env.BOARD_HTTP_EMULATOR_TEST==='1';
test('익명 글쓰기·비밀글 잠금·첨부 인증·재시도가 실제 callable 계약에서 작동한다',{skip:!enabled},async()=>{
 const root='http://127.0.0.1:5001/demo-soc-c/us-central1';
 const signup=async()=>{const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});assert.equal(response.status,200);return (await response.json()).idToken};
 const [owner,other]=await Promise.all([signup(),signup()]);
 const call=async(token,data)=>{const response=await fetch(root+'/boardApi',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})});const body=await response.json();return {status:response.status,...body}};
 const board='questions';
 const attachment=await call(owner,{action:'attachment.upload',board,requestId:randomUUID(),mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII='});assert.equal(attachment.status,200,JSON.stringify(attachment));
 const payload={action:'create',board,requestId:randomUUID(),title:'Synthetic HTTP fixture',text:'Private fixture body',author:'Synthetic',password:'fixture-pass',isSecret:true,attachmentIds:[attachment.result.attachmentId||attachment.result.id]};
 const created=await call(owner,payload);assert.equal(created.status,200,JSON.stringify(created));const id=created.result.id;
 try{
  assert.equal((await call(owner,payload)).result.id,id);
  const list=await call(other,{action:'list',board,limit:50});assert.equal(list.status,200);assert.equal(list.result.items.find(x=>x.id===id)?.text,'');
  const denied=await call(other,{action:'read',board,id});assert.ok(denied.error||denied.result.item._access.read===false);
  const unlocked=await call(other,{action:'unlock',board,id,password:'fixture-pass'});assert.equal(unlocked.status,200,JSON.stringify(unlocked));assert.equal(unlocked.result.item.text,'Private fixture body');assert.ok(unlocked.result.item._access.expiresAt);
  const url=created.result.item.imageUrl;assert.ok(url?.startsWith(root+'/boardAttachment'));assert.equal((await fetch(url)).status,403);assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+owner}})).status,200);
  assert.equal((await call(other,{action:'reply.create',board,id,text:'Cannot impersonate teacher',requestId:randomUUID()})).status,403);
 }finally{const deleted=await call(owner,{action:'delete',board,id,requestId:randomUUID()});assert.equal(deleted.status,200,JSON.stringify(deleted));}
});
