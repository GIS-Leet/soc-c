// 자료실 폴더·검색·필터 화면. 외부 데이터는 HTML 문자열 대신 텍스트로 표시함.
import {loadIndex,parsePath,selectItems,fileURL} from './materials.mjs';
const listing=document.getElementById('listing');
const crumbs=document.getElementById('crumbs');
const search=document.getElementById('materialSearch');
const category=document.getElementById('materialCategory');
const status=document.getElementById('materialStatus');
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
function row(item) {
  const li=node('li',undefined,'material-row');
  const info=node('section',undefined,'material-info');
  const folder=item.type==='dir';
  const href=folder ? '#'+encodeURIComponent(item.path) : fileURL(item.path);
  const title=link(item.name.normalize('NFC'),href,'material-name');
  if(!folder){title.target='_blank';title.rel='noopener noreferrer';}
  info.append(title);
  const type=folder ? '폴더' : item.name.split('.').at(-1).toUpperCase();
  info.append(node('p',folder ? '폴더 열기' : `${item.path.split('/')[0]} · ${type} · ${Math.ceil(item.size/1024).toLocaleString()} KB`,'material-meta'));
  li.append(info);
  const open=link(folder?'열기':'열람',href,'btn btn-ghost');
  if(!folder){open.target='_blank';open.rel='noopener noreferrer';}
  open.setAttribute('aria-label',`${item.name.normalize('NFC')} ${folder?'폴더 열기':'열람'}`);
  li.append(open);
  return li;
}
function render() {
  const path=parsePath(location.hash);crumbsFor(path);
  if(!snapshot)return;
  const items=selectItems(snapshot.index,path,search.value,category.value);
  listing.replaceChildren();
  const list=node('ul',undefined,'materials-list');
  items.forEach(item=>list.append(row(item)));
  listing.append(list);
  if(!items.length) listing.append(node('p',search.value || category.value ? '일치하는 자료가 없습니다. 검색어나 종류를 바꿔 보세요.' : '아직 공개된 자료가 없습니다.','state'));
  const updated=new Date(snapshot.index.generatedAt);
  status.textContent=`${items.length}개 항목${Number.isNaN(updated.getTime())?'':` · 목록 갱신 ${updated.toLocaleDateString('ko-KR')}`}${snapshot.stale?' · 연결할 수 없어 저장된 목록을 표시합니다.':''}`;
}
async function refresh() {
  status.textContent='자료 목록을 불러오는 중…';
  try {snapshot=await loadIndex();render();}
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
crumbsFor(parsePath(location.hash));refresh();
