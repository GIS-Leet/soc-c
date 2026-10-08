// 저장 계층 — RTDB 는 REST 로(functions/firebase-store.mjs 의 조건부 쓰기 transaction 을 그대로 씀), 첨부 그림은 Workers KV 로.
import { createFirebaseStore } from "../../functions/firebase-store.mjs";
import { BoardError } from "../../functions/board-security.mjs";

export function createRestStore({ credential, databaseURL, fetcher = fetch }) {
  const base = databaseURL.replace(/\/$/, "");
  const url = (path, query = "") => `${base}/${String(path).split("/").filter(Boolean).map(encodeURIComponent).join("/")}.json${query}`;
  async function call(method, target, body) {
    const token = (await credential.getAccessToken()).access_token;
    const response = await fetcher(target, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new BoardError("unavailable", method === "GET" ? "Database read failed" : "Database write failed");
    return response.json();
  }
  // transaction 은 기존 구현(읽기 → if-match 쓰기 → 412 면 다시)을 그대로 — database 인자는 거기서 쓰이지 않는다
  const { transaction } = createFirebaseStore({ database: null, credential, databaseURL, emulatorHost: undefined });
  return {
    get: (path) => call("GET", url(path)),
    async set(path, value) { await call("PUT", url(path), value === undefined ? null : value); },
    async update(changes) { await call("PATCH", url(""), changes); },
    async page(path, { after = "", limit = 50 } = {}) {
      // REST 는 키 순서를 보장하지 않는 객체를 준다 — 한 개 더 받아 after 자신을 빼고 키 순으로
      const query = `?orderBy=${encodeURIComponent('"$key"')}` + (after ? `&startAt=${encodeURIComponent(JSON.stringify(after))}` : "") + `&limitToFirst=${limit + (after ? 1 : 0)}`;
      const rows = Object.entries((await call("GET", url(path, query))) || {}).filter(([key]) => key !== after);
      rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return rows.slice(0, limit);
    },
    transaction,
  };
}

/** 목록은 글마다 boardGrants/<키> 를 하나씩 읽는다 — 50개짜리 목록이면 무료 요금제의 요청당 외부 호출 50번을 넘어 실패한다.
 *  요청 하나 안에서는 boardGrants 를 통째로 한 번만 받아 거기서 답한다(만료되면 정리되는 작은 노드). 그쪽에 쓰면 받아 둔 것을 버린다 */
export function withGrantSnapshot(store) {
  let grants;
  const touched = (path) => { if (String(path).startsWith("boardGrants")) grants = undefined; };
  return {
    ...store,
    async get(path) {
      const match = /^boardGrants\/([^/]+)$/.exec(path);
      if (!match) return store.get(path);
      grants ??= store.get("boardGrants").then((all) => all || {});
      return (await grants)[match[1]] ?? null;
    },
    async set(path, value) { touched(path); return store.set(path, value); },
    async update(changes) { grants = undefined; return store.update(changes); },
    async transaction(path, transform) { touched(path); return store.transaction(path, transform); },
  };
}

/** 첨부 그림 — KV 값은 바이트, mime 은 metadata 에 */
export function createKVStorage(kv) {
  return {
    async put(path, bytes, mime) { await kv.put(path, bytes, { metadata: { mime } }); },
    async get(path) {
      const { value, metadata } = await kv.getWithMetadata(path, "arrayBuffer");
      return value ? { bytes: new Uint8Array(value), mime: metadata?.mime || "application/octet-stream" } : null;
    },
    async delete(path) { await kv.delete(path); },
  };
}
