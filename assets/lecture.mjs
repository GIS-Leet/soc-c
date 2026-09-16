// 강의 본인 확인·재생·시청 기록을 세션 단위로 관리함.
import {WatchProgress,LatestWrites} from './watch-progress.mjs';

  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
  import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
  import { getDatabase, ref, set, get, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDBgqclt0Qnnal7SlQmoYL-63L0DDplZkM",
    authDomain: "soc-c-qna.web.app",
    databaseURL: "https://soc-c-qna-default-rtdb.firebaseio.com",
    projectId: "soc-c-qna",
    storageBucket: "soc-c-qna.firebasestorage.app",
    messagingSenderId: "927605189358",
    appId: "1:927605189358:web:9ea5171373ac4c9e8661ff"
  };
  const app = initializeApp(firebaseConfig, "lecture-student"), auth = getAuth(app), db = getDatabase(app);
  const $ = id => document.getElementById(id);
  const H = window.LectureHash;
  const LS = 'lecture-id-v2';
  try { localStorage.removeItem('lecture-id'); } catch {}
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const saved = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };

  let uid = null, identity = null, videos = [], mine = {}, unsubVideos = null, epoch=0, verifying=false, renderRevision=0;
  const show = (gate, list, status) => { $('gate').hidden = !gate; $('list').hidden = !list; $('status').hidden = !status; if (status) $('status').textContent = status; };

  // ── 인증: members/{uid} 쓰기 성공 = 명단에 있음(보안 규칙이 roster 와 대조) ──
  async function verify(sid, name, remember=false, reuseUid=null) {
    if(auth.currentUser && auth.currentUser.uid!==reuseUid)await signOut(auth);
    if (!auth.currentUser) await signInAnonymously(auth);
    const u = auth.currentUser.uid, h = await H.hashId(sid, name);
    await set(ref(db, `members/${u}`), { h, sid: H.normSid(sid), name: H.normName(name), at: serverTimestamp() });
    identity={sid:H.normSid(sid),name:H.normName(name),uid:u};
    try { if(remember)localStorage.setItem(LS,JSON.stringify(identity));else localStorage.removeItem(LS); } catch {}
    return u;
  }
  function gateError(e) {
    const code = ((e && e.code) || '') + ' ' + ((e && e.message) || '');
    if (/permission_denied|permission denied/i.test(code)) return '명단에 없는 학번 또는 이름입니다. 다시 확인해 주세요.';
    if (/operation-not-allowed|admin-restricted-operation/i.test(code)) return '관리자 설정이 아직 안 되었습니다. 선생님께 알려 주세요.';
    if (/network/i.test(code)) return '네트워크 연결을 확인해 주세요.';
    return '확인에 실패했습니다. ' + ((e && e.message) || '');
  }
  $('gateForm').addEventListener('submit', async ev => {
    ev.preventDefault(); if(verifying)return;verifying=true; $('gateErr').textContent = ''; $('gateBtn').disabled = true;
    try { uid = await verify($('sid').value, $('name').value,$('rememberIdentity').checked); enter(); }
    catch (e) { $('gateErr').textContent = gateError(e); }
    finally { verifying=false; $('gateBtn').disabled = false; }
  });
  $('whoReset').addEventListener('click', async () => {
    $('whoReset').disabled=true;closePlayer();
    try { await flushWrites(); }
    catch { $('whoReset').disabled=false;return; }
    verifying=true;
    try {
      if(auth.currentUser?.isAnonymous)await signOut(auth);
      stop();uid=null;identity=null;mine={};videos=[];writes.clear();
      try { localStorage.removeItem(LS); } catch {}
      $('sid').value='';$('name').value='';$('rememberIdentity').checked=false;$('gateErr').textContent='';$('units').replaceChildren();$('whoText').textContent='';show(true,false,false);
    } catch(e){$('saveStatus').textContent=gateError(e)}
    finally{verifying=false;$('whoReset').disabled=false}
  });

  // 명단과 기록을 읽는 비동기 응답은 현재 세션에서만 반영함.
  function enter() {
    stop();const token=epoch;
    $('whoText').textContent = identity ? `${identity.name} · ${identity.sid}` : '';
    show(false, true, false);
    unsubVideos = onValue(ref(db, 'videos'), snap => { if(token!==epoch)return;videos = parseVideos(snap.val()); render(); },
      err => { if(token!==epoch)return;stop();show(true,false,false);$('gateErr').textContent=gateError(err); });
  }
  function stop() { closePlayer();epoch++;renderRevision++;if (unsubVideos) unsubVideos();unsubVideos=null; }
  function parseVideos(v) {
    return Object.entries(v || {}).map(([id, d]) => ({ id, ...d, order: Number(d.order || 0) })).filter(d => d.yt)
      .sort((a, b) => a.order !== b.order ? a.order - b.order : String(b.date || '').localeCompare(String(a.date || '')));
  }
  async function render() {
    const token=epoch,revision=++renderRevision,user=uid,items=[...videos],out={};
    try {await Promise.all(items.map(async v=>{const snap=await get(ref(db,`views/${v.id}/${user}`));if(snap.exists())out[v.id]=snap.val()}));}
    catch {if(token===epoch){$('saveStatus').textContent='시청 기록을 읽지 못했습니다. 영상을 다시 선택하기 전에 재시도해 주세요.';$('retrySave').hidden=false;}return;}
    if(token!==epoch||revision!==renderRevision||user!==uid)return;
    mine={...out,...mine};
    const units = []; const by = {};
    for (const v of videos) { const u = v.unit || '기타'; if (!by[u]) { by[u] = []; units.push(u); } by[u].push(v); }
    $('listEmpty').hidden = videos.length > 0;
    $('units').innerHTML = units.map(u => `
      <section class="unit"><div class="st-eyebrow">${esc(u)}</div><div class="st-list">${by[u].map(v => {
        const r = mine[v.id], pct = r && r.dur > 0 ? Math.min(100, Math.round((r.progressVersion===2 ? r.watchedSec : (r.done ? r.dur : 0)) / r.dur * 100)) : 0;
        const badge = r && r.done ? '<span class="st-badge st-badge--success">시청 완료</span>' : pct > 0 ? `<span class="st-footnote st-dim pct">${pct}%</span>` : '';
        return `<div class="st-row vrow" data-id="${esc(v.id)}" role="button" tabindex="0">
          <img class="thumb" src="https://i.ytimg.com/vi/${esc(v.yt)}/mqdefault.jpg" alt="" loading="lazy">
          <div class="body"><div class="st-row__title">${esc(v.title || v.yt)}</div><div class="st-row__meta">${esc([v.date, v.note].filter(Boolean).join(' · '))}</div></div>${badge}</div>`; }).join('')}</div></section>`).join('');
    $('units').querySelectorAll('.vrow').forEach(el => {
      const open = () => play(videos.find(v => v.id === el.dataset.id));
      el.addEventListener('click', open);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  // 재생 위치는 이어보기에, 실제 재생 구간은 완료 판정에 사용함.
  let player=null,current=null,timer=null,tracker=null,playRevision=0,sessionCount=0,lastSave=0,ytPromise=null;
  const writes=new LatestWrites((path,value)=>update(ref(db,path),value));
  async function flushWrites(){
    const token=epoch;
    try{await writes.flush();if(token===epoch){$('saveStatus').textContent='시청 기록 저장됨';$('retrySave').hidden=true;}}
    catch(e){if(token===epoch){$('saveStatus').textContent='시청 기록을 아직 저장하지 못했습니다. 이 화면을 닫기 전에 다시 저장해 주세요.';$('retrySave').hidden=false;}throw e;}
  }
  $('retrySave').addEventListener('click',async()=>{try{await flushWrites();await render()}catch{}});
  window.addEventListener('online',()=>flushWrites().catch(()=>{}));
  function youtubeReady(){
    if(window.YT?.Player)return Promise.resolve();if(ytPromise)return ytPromise;
    ytPromise=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('YouTube 연결 시간이 초과되었습니다.')),12000);
      window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve()};
      const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timeout);script.remove();reject(Error('YouTube에 연결하지 못했습니다.'))};document.head.appendChild(script);
    }).catch(e=>{ytPromise=null;throw e});return ytPromise;
  }
  async function play(v){
    if(!v||!uid)return;closePlayer();const revision=++playRevision,token=epoch;
    $('playerError').hidden=true;
    try{await youtubeReady()}catch(e){if(token===epoch&&revision===playRevision){$('playerError').textContent=e.message+' 영상 제목을 눌러 다시 시도하거나 공개 학습지를 확인해 주세요.';$('playerError').hidden=false;}return;}
    if(token!==epoch||revision!==playRevision)return;
    current=v;tracker=new WatchProgress(mine[v.id]);sessionCount=(Number(mine[v.id]?.n)||0)+1;lastSave=0;
    $('playerTitle').textContent=v.title||v.yt;$('lectureQuestion').href='qna.html?q='+encodeURIComponent(v.title||v.unit||'');$('player').hidden=false;$('player').scrollIntoView({behavior:'smooth',block:'start'});
    const start=mine[v.id]&&!mine[v.id].done?Math.floor(mine[v.id].sec):0;
    player=new YT.Player('yt',{host:'https://www.youtube-nocookie.com',videoId:v.yt,playerVars:{rel:0,playsinline:1,start,autoplay:1},events:{
      onStateChange:e=>{if(token!==epoch||revision!==playRevision)return;sample(e.data===YT.PlayerState.PLAYING);
        if(e.data===YT.PlayerState.PLAYING){if(!timer)timer=setInterval(()=>sample(true),1000);}
        else{if(timer)clearInterval(timer);timer=null;record();}},
      onError:()=>{if(token!==epoch)return;$('playerError').textContent='영상을 재생할 수 없습니다. 잠시 후 다시 선택하거나 공개 학습지를 확인해 주세요.';$('playerError').hidden=false;}
    }});
  }
  function sample(playing){
    if(!player||!tracker)return;tracker.sample(player.getCurrentTime?.()||0,performance.now(),playing,player.getPlaybackRate?.()||1);
    if(Date.now()-lastSave>=15000)record();
  }
  function record(){
    if(!player||!current||!uid||!tracker)return;
    const rec={...tracker.record(player.getDuration?.()||0),n:sessionCount,at:Date.now()};if(!rec.dur)return;
    mine[current.id]=rec;writes.put(`views/${current.id}/${uid}`,rec);lastSave=Date.now();flushWrites().catch(()=>{});
  }
  function closePlayer(){
    playRevision++;if(timer)clearInterval(timer);timer=null;
    if(player){sample(false);record();try{player.destroy()}catch{}player=null;}
    current=null;tracker=null;$('player').hidden=true;
    const frame=document.createElement('section');frame.id='yt';$('player').querySelector('.frame').replaceChildren(frame);
  }
  $('playerClose').addEventListener('click',()=>{closePlayer();render()});
  window.addEventListener('pagehide',()=>{sample(false);record()});
  window.addEventListener('beforeunload',event=>{if(writes.size){event.preventDefault();event.returnValue='';}});

  // 기기 기억을 선택한 경우만 자동 진입함. 기존 Firebase 세션만으로 이름을 복원하지 않음.
  onAuthStateChanged(auth,async user=>{
    if(verifying)return;
    if(uid&&user?.uid===uid)return;
    stop();writes.clear();uid=null;identity=null;mine={};videos=[];$('units').replaceChildren();
    const me=saved();
    if(me?.sid&&me?.name){
      verifying=true;try{uid=await verify(me.sid,me.name,true,me.uid);enter();return;}
      catch{$('sid').value=me.sid;$('name').value=me.name;$('rememberIdentity').checked=true;}
      finally{verifying=false;}
    }
    show(true,false,false);
  });
