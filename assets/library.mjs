// 자료실 폴더·검색·필터 화면 — 카드 격자. 외부 데이터(이름·경로)는 textContent 로만 넣고, 아이콘은 고정 문자열만 쓴다.
import {loadIndex,refreshIndex,parsePath,selectItems,fileURL} from './materials.mjs?v=17f40dea';
import {recordDownload} from './download-stats.mjs?v=cebbea17';
const listing=document.getElementById('listing');
const crumbs=document.getElementById('crumbs');
const search=document.getElementById('materialSearch');
const category=document.getElementById('materialCategory');
const status=document.getElementById('materialStatus');
const types=document.getElementById('materialTypes');
let syncingTypes=false;
// 종류 세그먼트 — 숨긴 select 를 그대로 진실로 두고, 칩은 그 값을 비추기만 한다
function buildTypes(){
  if(!types)return;
  types.replaceChildren(...[...category.options].map(o=>{
    const b=node('button',o.textContent,'st-segmented__item'+(o.value===category.value?' is-on':''));
    b.type='button';b.setAttribute('role','tab');b.dataset.value=o.value;b.setAttribute('aria-selected',String(o.value===category.value));return b;
  }));
  const pick=v=>{if(syncingTypes)return;category.value=v;category.dispatchEvent(new Event('change'));};
  if(window.Stratum)Stratum.segmented(types,pick);
  else types.addEventListener('click',e=>{const b=e.target.closest('.st-segmented__item');if(!b)return;for(const i of types.querySelectorAll('.st-segmented__item')){i.classList.toggle('is-on',i===b);i.setAttribute('aria-selected',String(i===b));}pick(b.dataset.value);});
}
// 코드가 select 값을 바꿨을 때(폴더 이동 등) 칩을 따라오게 한다
function syncTypes(){
  if(!types)return;const on=types.querySelector(`.st-segmented__item[data-value="${CSS.escape(category.value)}"]`);
  if(on&&!on.classList.contains('is-on')){syncingTypes=true;on.click();syncingTypes=false;}
}
let snapshot;
function node(tag,text,cls) { const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el; }
function link(text,href,cls) {const el=node('a',text,cls);el.href=href;return el;}
function crumbsFor(path) {
  crumbs.replaceChildren(link('자료실','#'));
  let acc='';
  path.split('/').filter(Boolean).forEach(part=>{
    acc=acc ? acc+'/'+part : part;
    crumbs.append(node('span','/','sep'),link(part,'#'+encodeURIComponent(acc)));
  });
  crumbs.lastElementChild?.setAttribute('aria-current','page');
}
const ICO={dir:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h5"/>',img:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="10" r="1.8"/><path d="M21 16l-5-5L5 20"/>',file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'};
const IMAGE=['png','jpg','jpeg','gif','webp','svg','avif','bmp'],OFFICE=['doc','docx','ppt','pptx','xls','xlsx'];
// 아이콘은 위 고정 문자열만 쓴다(외부 데이터 아님)
function icon(kind,cls){const box=document.createElement('div');box.innerHTML=`<svg class="card-ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[kind]}</svg>`;return box.firstElementChild;}
const fmtSize=b=>b==null?'':b<1024?`${b} B`:b<1048576?`${Math.round(b/1024)} KB`:`${(b/1048576).toFixed(1)} MB`;
function card(item) {
  const li=node('li',undefined,'card');
  const folder=item.type==='dir';const name=item.name.normalize('NFC');
  const e=folder?'':(name.toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1]||'';
  const isImg=IMAGE.includes(e),isOffice=OFFICE.includes(e),isPDF=e==='pdf';
  const top=node('div',undefined,'card-top');
  top.append(icon(folder?'dir':isImg?'img':(isPDF||isOffice)?'doc':'file',folder?'dir':'file'));
  const head=node('div',undefined,'card-head');head.append(node('div',name,'card-name'));
  const meta=node('div',undefined,'card-meta');meta.append(node('span',folder?'폴더':(e||'file').toUpperCase(),folder?'tag dir':'tag'));
  if(!folder&&item.size!=null)meta.append(node('span',fmtSize(item.size),'size'));
  head.append(meta);top.append(head);li.append(top);
  const act=node('div',undefined,'card-act');
  if(folder){const open=link('열기','#'+encodeURIComponent(item.path),'btn');open.setAttribute('aria-label',`${name} 폴더 열기`);act.append(open);}
  else{
    const url=fileURL(item.path);const viewable=isPDF||isImg||isOffice;
    if(viewable){const view=link('열람',isOffice?`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`:url,'btn');view.target='_blank';view.rel='noopener noreferrer';view.setAttribute('aria-label',`${name} 열람`);view.addEventListener('click',()=>recordDownload(item.path,'view'));act.append(view);}
    const down=link('내려받기',url,viewable?'btn btn-ghost':'btn');down.setAttribute('download','');down.setAttribute('aria-label',`${name} 내려받기`);down.addEventListener('click',()=>recordDownload(item.path,'download'));act.append(down);
  }
  li.append(act);return li;
}
function render() {
  const path=parsePath(location.hash);crumbsFor(path);
  if(!snapshot)return;
  syncTypes();
  const items=selectItems(snapshot.index,path,search.value,category.value);
  listing.replaceChildren();
  const list=node('ul',undefined,'arch-grid');
  items.forEach(item=>list.append(card(item)));
  listing.append(list);
  if(!items.length) listing.append(node('p',search.value || category.value ? '일치하는 자료가 없습니다. 검색어나 종류를 바꿔 보세요.' : '아직 공개된 자료가 없습니다.','state'));
  const updated=new Date(snapshot.index.generatedAt);
  status.textContent=`${items.length}개 항목${Number.isNaN(updated.getTime())?'':` · 목록 갱신 ${updated.toLocaleDateString('ko-KR')}`}${snapshot.stale?' · 연결할 수 없어 저장된 목록을 표시합니다.':''}`;
}
async function refresh() {
  status.textContent='자료 목록을 불러오는 중…';
  try {
    snapshot=await loadIndex();render();
    // 배포된 색인보다 저장소가 앞서 있으면(방금 올린 자료) 그 자리에서 목록을 다시 만들어 보여 줌
    const live=await refreshIndex(snapshot.index);
    if(live!==snapshot.index){snapshot={index:live,stale:false};render();}
  }
  catch {
    status.textContent='자료 목록을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
    listing.replaceChildren();
    const retry=node('button','다시 시도','btn btn-ghost');retry.type='button';retry.addEventListener('click',refresh);listing.append(retry);
  }
}
search.addEventListener('input',render);
category.addEventListener('change',()=>{
  // 자료 종류를 바꾸면 이전 폴더에 검색 범위를 가두지 않음.
  if(category.value && parsePath(location.hash).split('/')[0] !== category.value) location.hash='';
  render();
});
window.addEventListener('hashchange',()=>{
  const folder=parsePath(location.hash).split('/')[0];
  if(folder && category.value && folder !== category.value) category.value='';
  render();
});
buildTypes();crumbsFor(parsePath(location.hash));refresh();
