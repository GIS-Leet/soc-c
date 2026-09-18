// 자료실 내려받기·열람 횟수 기록 — 누가가 아니라 몇 번만. 날짜별·파일별로 Firebase 에 1씩 더한다(익명 쓰기, 규칙에서 +1 만 허용)
const DB = 'https://soc-c-qna-default-rtdb.firebaseio.com';
/** 자료 경로 → Firebase 키(. # $ [ ] / 금지) — 폴더 구분은 「｜」, 점은 「·」로 바꿔 화면에서 읽을 수 있게 */
export function statKey(path) {
  return path.normalize('NFC').replace(/[.#$\[\]\/]/g, ch => ch === '/' ? '｜' : ch === '.' ? '·' : '_').slice(0, 200);
}
export function dayKey(now = new Date()) {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10);
}
/** 한 번 기록. 실패해도 자료 열기를 막지 않도록 조용히 끝남 */
export function recordDownload(path, kind = 'download', {fetcher = fetch, now = new Date()} = {}) {
  const body = JSON.stringify({[statKey(path)]: {[kind]: {'.sv': {increment: 1}}}});
  return fetcher(`${DB}/stats/downloads/${dayKey(now)}.json`, {method:'PATCH', body, keepalive:true, headers:{'Content-Type':'application/json'}}).catch(() => {});
}
