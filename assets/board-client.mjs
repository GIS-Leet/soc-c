// 학생 게시판은 인증된 서버 API만 사용함. 공개 DB로 우회하지 않음.
import {getAuth,onAuthStateChanged,signInAnonymously,GoogleAuthProvider,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import {BoardStore} from './board-store.mjs?v=4ed9928a';
const API='https://us-central1-soc-c-qna.cloudfunctions.net/boardApi';
const IMAGE='https://us-central1-soc-c-qna.cloudfunctions.net/boardAttachment';
const BOARDS=new Set(['questions','feedback','support']);
const handles=new WeakMap();
const keyOK=key=>/^[A-Za-z0-9_-]+$/.test(key);
const teacher=user=>user?.email==='leetae712@gmail.com'&&user.emailVerified===true;
export function getDatabase(app){
 if(handles.has(app))return handles.get(app);
 const auth=getAuth(app);const handle={auth,stores:new Map(),sessions:new Set(),uid:undefined,epoch:0,requests:new Map(),pending:new Map(),images:new Map(),expiries:new Map(),uploads:new WeakMap()};
 handles.set(app,handle);
 onAuthStateChanged(auth,user=>{
  if(handle.uid!==user?.uid){handle.uid=user?.uid;handle.epoch++;for(const store of handle.stores.values())store.reset();for(const entry of handle.images.values())URL.revokeObjectURL(entry.url);handle.images.clear();for(const timer of handle.expiries.values())clearTimeout(timer);handle.expiries.clear();handle.requests.clear();handle.pending.clear();}
  for(const callback of handle.sessions)callback({isTeacher:teacher(user),user});
  if(user)for(const store of handle.stores.values())store.refresh().catch(()=>{});
 });
 handle.timer=setInterval(()=>{if(document.visibilityState==='visible')for(const store of handle.stores.values())store.refresh().catch(()=>{})},60000);   // 보고 있을 때 1분마다(전체 목록을 다시 받으므로 잦으면 부담)
 return handle;
}
async function userFor(handle){await handle.auth.authStateReady();return handle.auth.currentUser||(await signInAnonymously(handle.auth)).user;}
async function request(handle,payload){
 const user=await userFor(handle);const epoch=handle.epoch;const token=await user.getIdToken();
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
 let response;try{response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data:payload}),signal:controller.signal})}finally{clearTimeout(timer)}
 let body;try{body=await response.json()}catch{throw Error('서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');}
 if(epoch!==handle.epoch)throw Error('로그인 상태가 변경되었습니다. 다시 시도해 주세요.');
 if(!response.ok||body.error){const error=Error(body.error?.message||'요청을 처리하지 못했습니다.');error.code=body.error?.status||response.status;throw error;}
 return body.result ?? body.data;
}
function allowedImage(value){
 let url;try{url=new URL(value)}catch{return false;}
 const img=new URL(IMAGE);
 return (url.origin===img.origin&&url.pathname===img.pathname)||(url.protocol==='https:'&&url.hostname==='firebasestorage.googleapis.com'&&url.pathname.startsWith('/v0/b/soc-c-qna.firebasestorage.app/o/'));
}
/// 목록용: 받지 않고 주소만 검증. 열람 권한이 없는 비밀글의 이미지는 표시하지 않는다(토큰 없이 요청하면 거부되어 깨진 그림이 된다)
function sanitizeImages(record,secret=record?.isSecret&&!record?._access?.read){
 if(!record||typeof record!=='object')return;
 if(record.imageUrl&&(secret||!allowedImage(record.imageUrl)))record.imageUrl='';
 for(const reply of Object.values(record.replies||{}))sanitizeImages(reply,secret);
 for(const reply of Object.values(record.subReplies||{}))sanitizeImages(reply,secret);
}
async function hydrateImages(handle,item){
 const epoch=handle.epoch;
 async function hydrate(record){
  if(!record||typeof record!=='object')return;
  if(record.imageUrl){
   let url;try{url=new URL(record.imageUrl)}catch{record.imageUrl='';}
   if(url && url.origin===new URL(IMAGE).origin&&url.pathname===new URL(IMAGE).pathname){
    const original=url.href;const cached=handle.images.get(original);
    if(cached && cached.until>Date.now())record.imageUrl=cached.url;
    else try{
     const user=await userFor(handle);const response=await fetch(original,{headers:{Authorization:'Bearer '+await user.getIdToken()}});
     if(!response.ok)throw Error('image denied');
     const blob=await response.blob();if(epoch!==handle.epoch)return;
     if(cached)URL.revokeObjectURL(cached.url);
     const blobURL=URL.createObjectURL(blob);handle.images.set(original,{url:blobURL,until:Date.now()+30*60000,board:url.searchParams.get('board'),postId:item.id});record.imageUrl=blobURL;
    }catch{record.imageUrl='';record._imageUnavailable=true;}
   }else if(url&&!(url.protocol==='https:'&&url.hostname==='firebasestorage.googleapis.com'&&url.pathname.startsWith('/v0/b/soc-c-qna.firebasestorage.app/o/')))record.imageUrl='';
  }
  for(const reply of Object.values(record.replies||{}))await hydrate(reply);
  for(const reply of Object.values(record.subReplies||{}))await hydrate(reply);
 }
 await hydrate(item);if(epoch!==handle.epoch)throw Error('로그인 상태가 변경되었습니다.');return item;
}
function storeFor(handle,board){
 if(!handle.stores.has(board)){
  const store=new BoardStore(async options=>{
   const page=await request(handle,{action:'list',board,...options});
   // 목록 단계에서는 이미지를 받지 않는다. 공개 이미지는 <img loading="lazy"> 가 화면에 보일 때 직접 받고(서버가 익명 읽기 허용),
   // 비공개 글의 이미지는 열람(read/unlock) 때 토큰으로 받는다(adopt → hydrateImages). 주소만 검증해 허용 밖이면 지운다.
   for(const item of page.items){sanitizeImages(item);expireGrant(handle,board,item);}return page;
  });
  handle.stores.set(board,store);queueMicrotask(()=>store.refresh().catch(()=>{}));
 }
 return handle.stores.get(board);
}
export function ref(handle,path){
 const parts=String(path).split('/');
 if(!BOARDS.has(parts[0])||parts.some(part=>!keyOK(part))||![1,2,3,4,5,6].includes(parts.length)||parts.length>=3&&parts[2]!=='replies'||parts.length>=5&&(parts[0]!=='questions'||parts[4]!=='subReplies'))throw Error('지원하지 않는 게시판 경로입니다.');
 return {handle,board:parts[0],parts:parts.slice(1),path};
}
const subscribe=(event,target,callback,error,options)=>storeFor(target.handle,target.board).listen(target.parts.join('/'),event,callback,error,options);
export const onValue=(target,callback,error,options)=>subscribe('value',target,callback,error,options);
export const onChildAdded=(target,callback,error)=>subscribe('added',target,callback,error);
export const onChildChanged=(target,callback,error)=>subscribe('changed',target,callback,error);
export const onChildRemoved=(target,callback,error)=>subscribe('removed',target,callback,error);
export function onBoardState(target,callback){return storeFor(target.handle,target.board).onState(callback);}
export function onSessionChanged(handle,callback){handle.sessions.add(callback);callback({isTeacher:teacher(handle.auth.currentUser),user:handle.auth.currentUser});return()=>handle.sessions.delete(callback);}
export async function loginTeacher(handle){
 if(handle.loginPending)return handle.loginPending;
 const task=(async()=>{await signInWithPopup(handle.auth,new GoogleAuthProvider());if(!teacher(handle.auth.currentUser))throw Error('교사 계정으로 로그인해 주세요.');})();
 handle.loginPending=task;try{return await task}finally{if(handle.loginPending===task)handle.loginPending=null}
}
export async function logoutTeacher(handle){await signOut(handle.auth);await userFor(handle);}
export async function refreshBoard(target){return storeFor(target.handle,target.board).refresh();}
function expireGrant(handle,board,item){
 const key=board+':'+item.id;clearTimeout(handle.expiries.get(key));handle.expiries.delete(key);
 if(!item._access?.expiresAt||item._access.teacher)return;
 const epoch=handle.epoch;
 const timer=setTimeout(()=>{
  handle.expiries.delete(key);if(epoch!==handle.epoch)return;
  // 네트워크가 끊겨도 만료된 비밀글 본문을 브라우저에 남기지 않음.
  if(item.isSecret)storeFor(handle,board).setItem({id:item.id,isSecret:true,title:'비밀글',text:'',author:'',imageUrl:'',replies:{},time:item.time,timestamp:item.timestamp,_access:{read:false,write:false},_summary:item._summary});
  for(const [source,entry]of handle.images){if(entry.board===board&&entry.postId===item.id){URL.revokeObjectURL(entry.url);handle.images.delete(source);}}
  storeFor(handle,board).refresh().catch(()=>{});
 },Math.max(0,item._access.expiresAt-Date.now()));handle.expiries.set(key,timer);
}
async function adopt(handle,board,result){
 const epoch=handle.epoch;
 if(result.item)await hydrateImages(handle,result.item);
 if(epoch!==handle.epoch)throw Error('로그인 상태가 변경되었습니다.');
 if(result.item){expireGrant(handle,board,result.item);storeFor(handle,board).setItem(result.item);}return result;
}
export async function readPost(target){return adopt(target.handle,target.board,await request(target.handle,{action:'read',board:target.board,id:target.parts[0]}));}
export async function ensureAccess(target,purpose,promptPassword){
 const result=await request(target.handle,{action:'read',board:target.board,id:target.parts[0]}).catch(error=>{if(['PERMISSION_DENIED','permission-denied',403].includes(error.code))return null;throw error;});
 const access=result?.item?._access;
 if(result&&(purpose==='read' ? access?.read : access?.write)){await adopt(target.handle,target.board,result);return result.item;}
 const password=await promptPassword();if(password==null)return null;
 const unlocked=await request(target.handle,{action:'unlock',board:target.board,id:target.parts[0],password});await adopt(target.handle,target.board,unlocked);return unlocked.item;
}
function payloadFor(target,kind,data){
 const depth=target.parts.length;const base={board:target.board,id:target.parts[0],replyId:target.parts[2],subreplyId:target.parts[4]};
 let action;
 if(kind==='push')action=depth===0?'create':depth===2?'reply.create':depth===4?'subreply.create':null;
 if(kind==='update')action=depth===1?(Object.keys(data).length===1&&'readAt'in data?'read.mark':'update'):depth===3?'reply.update':null;
 if(kind==='remove')action=depth===1?'delete':depth===3?'reply.delete':depth===5?'subreply.delete':null;
 if(!action)throw Error('지원하지 않는 게시판 작업입니다.');
 const accepted=action==='create'?['title','text','author','password','isSecret','attachmentIds']:action==='subreply.create'?['text','author','attachmentIds']:action==='reply.create'?['text','attachmentIds']:['title','text'];
 const fields={};for(const field of accepted)if(data?.[field]!==undefined)fields[field]=data[field];
 return {...base,...fields,action};
}
async function mutate(target,kind,data={}){
 const handle=target.handle,payload=payloadFor(target,kind,data),signature=JSON.stringify(payload);
 if(handle.pending.has(signature))return handle.pending.get(signature);
 if(!handle.requests.has(signature))handle.requests.set(signature,crypto.randomUUID());
 payload.requestId=handle.requests.get(signature);
 const task=(async()=>{
  const result=await request(handle,payload);await adopt(handle,target.board,result);
  if(payload.action==='delete')storeFor(handle,target.board).removeItem(target.parts[0]);
  handle.requests.delete(signature);return {key:result.id,...result};
 })();handle.pending.set(signature,task);
 try{return await task;}finally{handle.pending.delete(signature);}
}
export const push=(target,data)=>mutate(target,'push',data);
export const update=(target,data)=>mutate(target,'update',data);
export const remove=target=>mutate(target,'remove');
export async function uploadAttachment(handle,file,{board}){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('5MB 이하 JPG·PNG·WebP 이미지만 첨부할 수 있습니다.');
 let entries=handle.uploads.get(file);if(!entries){entries=new Map();handle.uploads.set(file,entries)}
 const key=handle.uid+':'+board;const entry=entries.get(key)||{requestId:crypto.randomUUID()};if(entry.promise)return entry.promise;
 const task=(async()=>{
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return request(handle,{action:'attachment.upload',board,requestId:entry.requestId,mime:file.type,base64:btoa(binary)});
 })();entry.promise=task;entries.set(key,entry);try{return await task}catch(error){entry.promise=null;throw error}
}
