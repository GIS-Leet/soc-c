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
