// 공개 자료 색인의 조회·검색·안전한 경로 처리.
export const PUBLIC_FOLDERS = ['학습지', 'PPT', '참고자료'];
const KEY = 'geo-materials-index-v1';
export const fileURL = path => 'https://gis-leet.github.io/kgghs-soc-c/' + path.split('/').map(encodeURIComponent).join('/');
export function parsePath(hash) {
  try {
    const path = decodeURIComponent(hash.replace(/^#/, '')).replace(/\/+$/, '');
    return path.split('/').some(p => p === '..' || p === '.') || path.startsWith('/') ? '' : path;
  } catch { return ''; }
}
/// 저장소 트리 → 색인. 배포 스크립트와 브라우저(실시간 확인)가 같은 함수를 씀
export function buildIndex(tree, generatedAt = new Date().toISOString()) {
  if (tree.truncated || !Array.isArray(tree.tree) || !/^[0-9a-f]{40}$/.test(tree.sha)) throw new Error('Incomplete materials tree');
  const items = tree.tree.filter(item => PUBLIC_FOLDERS.includes(item.path.split('/')[0]) &&
    !item.path.split('/').some(p => p.startsWith('.')) && ['tree','blob'].includes(item.type) && item.mode !== '120000')
    .map(item => ({name:item.path.split('/').at(-1),path:item.path,type:item.type === 'tree' ? 'dir' : 'file',...(item.type === 'blob' ? {size:item.size ?? 0} : {})}));
  return {version:1,source:'GIS-Leet/kgghs-soc-c',sourceSha:tree.sha,generatedAt,items};
}
const LIVE_KEY = 'geo-materials-live-v1';
const API = 'https://api.github.com/repos/GIS-Leet/kgghs-soc-c';
/// 배포된 색인이 저장소보다 뒤처졌으면 그 자리에서 다시 만든다 — 자료를 올리면 색인 갱신을 기다리지 않고 바로 보이게.
/// 비로그인 GitHub API 는 IP 당 시간 60회라 확인 결과를 ttl 동안 저장하고, 한도 초과·오류면 조용히 기존 색인을 쓴다.
export async function refreshIndex(index, {fetcher = fetch, storage, now = Date.now(), ttl = 10 * 60 * 1000} = {}) {
  if (storage === undefined) { try { storage = sessionStorage; } catch {} }
  let live; try { live = JSON.parse(storage?.getItem(LIVE_KEY) || 'null'); } catch {}
  if (live && now - live.at < ttl) return live.index && live.index.sourceSha !== index.sourceSha && validIndex(live.index) ? live.index : index;
  const remember = value => { try { storage?.setItem(LIVE_KEY, JSON.stringify({at:now, ...value})); } catch {} };
  try {
    const head = await fetcher(`${API}/commits/HEAD`, {headers:{Accept:'application/vnd.github+json'}});
    if (!head.ok) return index;
    const sha = (await head.json())?.commit?.tree?.sha;
    if (!/^[0-9a-f]{40}$/.test(sha) || sha === index.sourceSha) { remember({index:null}); return index; }
    const tree = await fetcher(`${API}/git/trees/${sha}?recursive=1`, {headers:{Accept:'application/vnd.github+json'}});
    if (!tree.ok) return index;
    const next = buildIndex(await tree.json(), new Date(now).toISOString());
    if (!validIndex(next)) return index;
    remember({index:next}); return next;
  } catch { return index; }
}
export function validIndex(value) {
  return value?.version === 1 && /^[0-9a-f]{40}$/.test(value.sourceSha) && Array.isArray(value.items) && value.items.every(item =>
    typeof item.path === 'string' && PUBLIC_FOLDERS.includes(item.path.split('/')[0]) &&
    !item.path.split('/').some(p => !p || p.startsWith('.')) && item.name === item.path.split('/').at(-1) &&
    ['file','dir'].includes(item.type) && (item.type === 'dir' || Number.isFinite(item.size)));
}
export async function loadIndex({fetcher = fetch, storage} = {}) {
  if (storage === undefined) { try { storage = localStorage; } catch {} }
  let cached;
  try { cached = JSON.parse(storage?.getItem(KEY) || 'null'); } catch {}
  try {
    const response = await fetcher('assets/materials-index.json', {cache:'no-cache'});
    if (!response.ok) throw new Error('자료 목록 응답 오류');
    const index = await response.json();
    if (!validIndex(index)) throw new Error('자료 목록 형식 오류');
    try { storage?.setItem(KEY, JSON.stringify(index)); } catch { /* 캐시 실패가 정상 목록을 가리지 않음. */ }
    return {index, stale:false};
  } catch (error) {
    if (validIndex(cached)) return {index:cached, stale:true};
    throw error;
  }
}
export function selectItems(index, path = '', query = '', category = '') {
  const needle = query.normalize('NFC').toLocaleLowerCase('ko').trim();
  return index.items.filter(item => {
    if (category && item.path.split('/')[0] !== category) return false;
    if (needle) return item.type === 'file' && item.path.normalize('NFC').toLocaleLowerCase('ko').includes(needle);
    if (category && !path) return item.type === 'file';
    return item.path.split('/').slice(0,-1).join('/') === path;
  }).sort((a,b) => (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1) || a.name.localeCompare(b.name,'ko'));
}
