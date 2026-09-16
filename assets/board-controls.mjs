// 기존 게시판 화면에 서버 인증·비밀글 접근·폼 저장 상태를 연결함.
import {ensureAccess,loginTeacher,logoutTeacher,onSessionChanged,onBoardState,refreshBoard} from './board-client.mjs';
import {guardPending} from './pending-write.mjs';
export function installBoardControls({db,board,ref,update,remove,setAdmin,enableEditMode,onPostChange}){
 const $=id=>document.getElementById(id);const target=id=>ref(db,board+'/'+id);
 const modal=options=>new Promise(resolve=>{window.AppModal.show(options,resolve);const input=$('modalInput');if(input){input.setAttribute('aria-label','작성한 글의 비밀번호');input.placeholder='작성한 글의 비밀번호';}});
 const fail=error=>window.AppModal.show({type:'alert',msg:error.message||'처리하지 못했습니다. 입력한 내용은 유지됩니다.'});
 let isAdmin=false,ready=false;
 const boardRef=ref(db,board);
 const overlay=$('customModal');
 if(overlay&&window.GeographiaDialog){
  const dialog=window.GeographiaDialog(overlay,()=>window.AppModal.input.style.display==='block'?window.AppModal.input:$('modalConfirmBtn'));
  const show=window.AppModal.show.bind(window.AppModal),close=window.AppModal.close.bind(window.AppModal);
  window.AppModal.show=(...args)=>{const prior=document.activeElement;show(...args);dialog.open(prior);};
  window.AppModal.close=()=>{close();dialog.close();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.style.display!=='none'){event.preventDefault();window.AppModal.cancel();}});
 }

 onBoardState(boardRef,state=>ready=state.complete);
 onSessionChanged(db,session=>{
  isAdmin=session.isTeacher;setAdmin(isAdmin);
  $('adminBtn').textContent=isAdmin?'교사 로그아웃':'교사 로그인';$('adminBtn').classList.toggle('active',isAdmin);
 });
 $('adminLoginBox')?.replaceChildren();
 window.toggleAdminPanel=async()=>{try{isAdmin?await logoutTeacher(db):await loginTeacher(db)}catch(error){fail(error)}};
 window.loginAdmin=window.toggleAdminPanel;
 async function access(id,purpose){
  const item=await ensureAccess(target(id),purpose,()=>modal({type:'prompt',title:'작성자 확인',msg:'작성할 때 설정한 비밀번호를 입력해 주세요.'}));
  if(item)applyPostSnapshot(id,item);return item;
 }
 function setExpanded(id,open){
  const li=$('post-'+id);if(!li)return;
  li.classList.toggle('is-open',open);li.querySelector('.q-row,.item-row')?.setAttribute('aria-expanded',String(open));
  const content=$('content-'+id);if(content){ content.inert=!open; if(board!=='questions')content.style.display=open?'block':'none'; }
 }
 window.togglePost=async(id,_trigger,forceOpen=false)=>{
  const li=$('post-'+id);if(!li)return;
  if(!forceOpen&&li.classList.contains('is-open')){setExpanded(id,false);return;}
  try{if(await access(id,'read'))setExpanded(id,true)}catch(error){fail(error)}
 };
 window.handleEdit=async id=>{try{if(await access(id,'edit')){setExpanded(id,true);enableEditMode(id)}}catch(error){fail(error)}};
 window.handleDelete=async id=>{try{if(!await access(id,'delete'))return;if(await modal({type:'confirm',title:'글 삭제',msg:'이 글을 삭제하시겠습니까?',confirmText:'삭제'}))await remove(target(id))}catch(error){fail(error)}};
 window.markRead=async id=>{
  if(isAdmin){fail(Error('확인 표시는 질문을 작성한 학생이 남길 수 있습니다.'));return;}
  try{if(await access(id,'edit'))await update(target(id),{readAt:Date.now()})}catch(error){fail(error)}
 };
 function applyPostSnapshot(id,data){
  const li=$('post-'+id),body=$('post-body-'+id);if(!li||!body)return;
  const locked=data.isSecret&&data._access?.read!==true;
  const title=locked?'비밀글':String(data.title||'제목 없음');
  li.dataset.secret=String(!!data.isSecret);li.dataset.unlocked=String(!locked);li.dataset.sTitle=title;li.dataset.sAuthor=locked?'':String(data.author||'');li.dataset.sBody=data.isSecret?'':String(data.text||'');li.dataset.readAt=String(data.readAt||0);
  li.dataset.locked=String(locked);li.dataset.summaryAnswers=String(data._summary?.answerCount||0);li.dataset.summaryState=data._summary?.state||'open';
  $('title-text-'+id).textContent=(data.isSecret?'🔒 ':'')+title;
  const author=li.querySelector('.q-author,.item-author');if(author)author.textContent=locked?'비공개':String(data.author||'익명');
  body.dataset.text=locked?'':String(data.text||'');body.dataset.title=title;body.dataset.time=String(data.time||'');body.dataset.image=locked?'':String(data.imageUrl||'');
  if(locked||!body.querySelector('textarea')){
   body.replaceChildren(document.createTextNode(locked?'비밀글입니다. 작성자 확인 후 열람할 수 있습니다.':String(data.text||'')));
   if(!locked&&data.imageUrl){const image=document.createElement('img');image.src=data.imageUrl;image.alt='첨부 이미지';image.className='post-image';image.loading='lazy';body.append(image);}
   if(!locked&&data._imageUnavailable){const message=document.createElement('p');message.textContent='첨부 이미지를 불러오지 못했습니다. 다시 열어 주세요.';body.append(message);}
   const date=document.createElement('p');date.className='post-meta-foot';date.textContent='작성 '+String(data.time||'');body.append(date);
  }
  if(locked){setExpanded(id,false);$('comment-list-'+id)?.replaceChildren();}
  onPostChange();
 }
 // 저장 버튼 반복 클릭/Enter와 저장 중 새 초안 덮어쓰기를 같은 경계에서 방지함.
 const ids=(...names)=>names.map($);
 const fields={
  addQuestion:()=>ids('titleInput','questionInput','authorInput','pwInput','secretInput','imageInput','submitBtn'),
  saveEdit:id=>ids('edit-title-'+id,'edit-textarea-'+id),
  addReply:id=>ids('reply-input-'+id,'reply-image-'+id,'reply-btn-'+id),
  saveEditReply:(id,rid)=>ids('edit-reply-input-'+id+'-'+rid),
  addSubReply:(id,rid)=>ids('sub-author-'+id+'-'+rid,'sub-text-'+id+'-'+rid,'sub-image-'+id+'-'+rid,'sub-btn-'+id+'-'+rid)
 };
 for(const [name,getFields]of Object.entries(fields))if(typeof window[name]==='function')window[name]=guardPending(window[name],getFields);
 const status=$('boardEmpty')||$('boardStatus');
 if(status){
  const retry=document.createElement('button');retry.type='button';retry.className='btn-sub';retry.textContent='목록 다시 불러오기';
  retry.addEventListener('click',()=>refreshBoard(boardRef).catch(fail));status.after(retry);
  onBoardState(boardRef,state=>retry.hidden=state.status!=='error');
 }
 return {applyPostSnapshot,stateReady:()=>ready};
}
