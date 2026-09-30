// 공개 자료 색인의 조회·검색·안전한 경로 처리.
// 자료 저장소 구조: 「2026-2학기 통사2C/학습지/…」처럼 학기 폴더 → 종류 폴더. 예전 최상위 종류 폴더(학습지/…)도 계속 공개한다.
export const TYPE_FOLDERS = ['학습지', 'PPT', '참고자료'];
export const PUBLIC_FOLDERS = TYPE_FOLDERS;
const SEMESTER = /^\d{4}-[12]학기(?: .+)?$/;
const nfc = s => s.normalize('NFC');
export const isSemester = seg => typeof seg === 'string' && SEMESTER.test(nfc(seg));
const isPublicTop = seg => isSemester(seg) || TYPE_FOLDERS.includes(nfc(seg));
/// 경로의 자료 종류(학습지·PPT·참고자료) — 학기 폴더 아래면 둘째 칸, 예전 구조면 첫째 칸
export function typeOf(path) {
  const segs = nfc(path).split('/');
  const t = isSemester(segs[0]) ? segs[1] : segs[0];
  return TYPE_FOLDERS.includes(t) ? t : '';
}
/// 학생에게 보여 줄 위치 — 「2026-2학기 통사2C · 학습지」
export function placeOf(path) {
  const segs = nfc(path).split('/').slice(0, -1);
  return segs.join(' · ');
}
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
  const items = tree.tree.filter(item => isPublicTop(item.path.split('/')[0]) &&
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
    const sha = (await head.json())?.sha;   // trees/{커밋} 응답의 sha 는 트리가 아니라 그 커밋 sha 로 돌아온다(확인함) — 색인의 sourceSha 도 같은 값
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
    typeof item.path === 'string' && isPublicTop(item.path.split('/')[0]) &&
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
const parentOf = p => p.split('/').slice(0, -1).join('/');
const typeRank = name => { const i = TYPE_FOLDERS.indexOf(nfc(name)); return i < 0 ? TYPE_FOLDERS.length : i; };
/// 정렬: 폴더 먼저 → 학기 폴더는 최근 학기가 위 → 종류 폴더는 학습지·PPT·참고자료 순 → 파일은 최근 학기 먼저, 같은 학기 안에서는 이름순
function order(a, b) {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  const sa = nfc(a.path).split('/')[0], sb = nfc(b.path).split('/')[0];
  if (isSemester(sa) && isSemester(sb) && sa !== sb) return sb.localeCompare(sa, 'ko');
  if (isSemester(sa) !== isSemester(sb)) return isSemester(sa) ? -1 : 1;
  if (a.type === 'dir') { const r = typeRank(a.name) - typeRank(b.name); if (r) return r; }
  return nfc(a.name).localeCompare(nfc(b.name), 'ko');
}
/// path 폴더의 목록. 검색어가 있으면 전체 자료에서 찾고, 종류를 고르면 지금 위치(자료실 또는 학기 폴더) 아래의 그 종류 파일을 모아 보여 준다.
export function selectItems(index, path = '', query = '', category = '') {
  const needle = nfc(query).toLocaleLowerCase('ko').trim();
  const here = nfc(path);
  const under = p => !here || nfc(p).startsWith(here + '/');
  const flat = category && (!here || (isSemester(here) && !here.includes('/')));
  return index.items.filter(item => {
    if (category && typeOf(item.path) !== category) return false;
    if (needle) return item.type === 'file' && nfc(item.path).toLocaleLowerCase('ko').includes(needle);
    if (flat) return item.type === 'file' && under(item.path);
    return nfc(parentOf(item.path)) === here;
  }).sort(order);
}
/// 폴더 안의 파일 수(하위 폴더 포함)
export function countFiles(index, path) {
  const here = nfc(path) + '/';
  return index.items.filter(item => item.type === 'file' && nfc(item.path).startsWith(here)).length;
}
