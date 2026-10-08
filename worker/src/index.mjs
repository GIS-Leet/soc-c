// 게시판 API · 인증된 첨부 읽기 · 정리 작업 · Desk 푸시를 Cloudflare Workers 에서 제공한다 — functions/index.mjs 와 같은 일을 같은 응답 모양으로.
// 게시판 · 푸시 로직은 functions/ 의 모듈을 그대로 불러 쓴다(두 벌로 만들지 않음). 여기에는 플랫폼에 맞춘 껍데기만 있다.
import { Buffer } from "node:buffer";
import { createBoardService, bumpBoardVersion } from "../../functions/board-service.mjs";
import { createMaintenance } from "../../functions/board-maintenance.mjs";
import { scheduledMaintenance } from "../../functions/board-schedule.mjs";
import { BoardError, isTeacher, fields } from "../../functions/board-security.mjs";
import { createDeskPushService } from "../../functions/desk-push.mjs";
import { createCredential, verifyIdToken } from "./google.mjs";
import { createRestStore, createKVStorage, withGrantSnapshot } from "./store.mjs";
import { createWorkerApnsSender } from "./apns.mjs";
import { serveOta } from "./ota.mjs";

// firebase-functions 의 onCall 이 쓰는 상태 이름 · HTTP 코드(클라이언트가 body.error.status 를 읽는다)
const HTTP = { "invalid-argument": 400, "failed-precondition": 400, "out-of-range": 400, unauthenticated: 401, "permission-denied": 403, "not-found": 404,
  "already-exists": 409, aborted: 409, "resource-exhausted": 429, cancelled: 499, internal: 500, unknown: 500, "data-loss": 500, unimplemented: 501, unavailable: 503, "deadline-exceeded": 504 };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS, ...headers } });
function callableError(error) {
  const code = error instanceof BoardError && HTTP[error.code] ? error.code : "internal";
  const message = code === "internal" ? "Server operation failed. Retry with the same requestId." : error.message;
  return json({ error: { message, status: code.toUpperCase().replace(/-/g, "_") } }, HTTP[code]);
}

function build(env, origin) {
  const credential = createCredential(env.GOOGLE_SERVICE_ACCOUNT);
  const store = createRestStore({ credential, databaseURL: env.DATABASE_URL });
  const storage = createKVStorage(env.FILES);
  const service = createBoardService({ store: withGrantSnapshot(store), storage, attachmentBase: `${origin}/boardAttachment` });
  const maintenance = createMaintenance({ store, storage, containsAttachment: service.containsAttachment });
  const push = async () => createDeskPushService({ store, send: await createWorkerApnsSender(env.DESK_APNS_CREDENTIAL), owner: () => `worker-${crypto.randomUUID()}` })   // 전송 기록의 owner 로 누가 보냈는지 구분;
  return { credential, store, service, maintenance, push };
}
async function authenticate(request, env, credential, required) {
  const bearer = request.headers.get("Authorization");
  if (!bearer) { if (required) throw new BoardError("unauthenticated"); return null; }
  if (!bearer.startsWith("Bearer ")) throw new BoardError("unauthenticated");
  try {
    const token = await verifyIdToken(bearer.slice(7), { projectId: env.PROJECT_ID, credential });
    return { uid: token.uid, token };
  } catch (error) { console.error("auth:", error?.message); throw new BoardError("unauthenticated"); }   // 사유만 기록(토큰은 남기지 않음)
}
/** 정리 결과 알림(Discord 웹훅) — 비밀이 없으면 끔. functions 의 notificationSender 와 같은 주소 검사 */
function notificationSender(env) {
  const webhook = (env.BOARD_NOTIFICATION_WEBHOOK || "").trim();
  if (!webhook) return null;
  let parsed;
  try { parsed = new URL(webhook); } catch { throw new BoardError("failed-precondition", "Invalid notification secret"); }
  if (parsed.origin !== "https://discord.com" || !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(parsed.pathname) || parsed.search)
    throw new BoardError("failed-precondition", "Invalid notification secret");
  return async (payload) => {
    const sent = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
    if (!sent.ok) throw new BoardError("unavailable", "Notification delivery failed");
  };
}
// 함수에서는 RTDB 쓰기 트리거가 판 번호(boardVersion)를 올렸다 — 여기서는 글을 바꾸는 호출이 끝난 직후에 올린다.
// Desk 처럼 DB 에 직접 쓰는 쪽은 쓴 뒤 /boardTouch 를 부른다(교사만). 놓쳐도 화면이 10번에 한 번은 전체를 다시 받는다
const BOARDS = ["questions", "feedback", "support"];
export const mutates = (data) => BOARDS.includes(data?.board) && !["list", "read", "unlock", "attachment.upload"].includes(data?.action);

/** 함수에서는 RTDB 생성 트리거가 하던 일 — 새 질문 · 학생의 이어진 질문이 API 로 만들어진 직후 Desk 에 푸시 */
async function pushAfter(data, auth, result, app) {
  if (data?.board !== "questions" || !result?.id) return;
  const service = await app.push();
  if (data.action === "create") await service.created({ kind: "question", params: { qid: result.id }, value: {} });
  else if (data.action === "subreply.create")
    await service.created({ kind: "subreply", params: { qid: data.id, rid: data.replyId, sid: result.id }, value: { isTeacher: isTeacher(auth) } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ota/")) return serveOta(request, env.FILES, url.pathname);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const app = build(env, url.origin);
    if (url.pathname === "/boardTouch") {
      try {
        const body = await request.json().catch(() => ({}));
        if (!isTeacher(await authenticate(request, env, app.credential, false))) throw new BoardError("permission-denied");
        if (!BOARDS.includes(body.data?.board)) throw new BoardError("invalid-argument", "Invalid board");
        await bumpBoardVersion(app.store, body.data.board);
        return json({ result: { ok: true } });
      } catch (error) { return callableError(error); }
    }
    if (url.pathname === "/boardApi" || url.pathname === "/boardMaintenance") {
      if (request.method !== "POST") return json({ error: { message: "POST only", status: "INVALID_ARGUMENT" } }, 405);
      try {
        const body = await request.json().catch(() => { throw new BoardError("invalid-argument", "Invalid request body"); });
        const auth = await authenticate(request, env, app.credential, false);
        if (url.pathname === "/boardMaintenance") {
          if (!isTeacher(auth)) throw new BoardError("permission-denied");
          fields(body.data || {}, ["limit", "cursors"]);
          const send = notificationSender(env);
          return json({ result: await app.maintenance.run({ ...body.data, notificationsEnabled: !!send, send }) });
        }
        const result = await app.service.call(body.data, auth, { ip: request.headers.get("CF-Connecting-IP") || "" });
        if (mutates(body.data)) ctx.waitUntil(bumpBoardVersion(app.store, body.data.board).catch(() => {}));
        if (["create", "subreply.create"].includes(body.data?.action)) ctx.waitUntil(pushAfter(body.data, auth, result, app).catch(() => {}));   // 실패는 매분 재시도가 이어받음
        return json({ result });
      } catch (error) { return callableError(error); }
    }
    if (url.pathname === "/boardAttachment") {
      const base = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...CORS };
      if (request.method !== "GET") return new Response(null, { status: 405, headers: base });
      try {
        const q = url.searchParams;
        const auth = await authenticate(request, env, app.credential, false);
        const result = await app.service.attachment({ board: q.get("board") ?? undefined, id: q.get("id") ?? undefined, attachmentId: q.get("attachmentId") ?? undefined }, auth);
        return new Response(result.bytes, { headers: { ...base, "Content-Type": result.mime, ...(result.cacheable ? { "Cache-Control": "private, max-age=604800, immutable" } : {}) } });
      } catch (error) {
        const code = typeof error?.code === "string" ? error.code : "internal";
        const status = code === "not-found" ? 404 : code === "unauthenticated" ? 401 : code === "permission-denied" ? 403 : code === "invalid-argument" ? 400 : 500;
        return new Response(JSON.stringify({ error: status === 500 ? "internal" : code }), { status, headers: { ...base, "Content-Type": "application/json" } });
      }
    }
    return new Response("Not found", { status: 404, headers: CORS });
  },

  /** 매분 — Desk 푸시 재시도. 분이 10의 배수일 때는 게시판 정리도(무료 요금제의 요청당 외부 호출 50번 한도에 맞춰 한 번에 조금씩) */
  async scheduled(event, env, ctx) {
    const app = build(env, env.PUBLIC_ORIGIN || "https://soc-c-api.workers.dev");
    const jobs = [app.push().then((service) => service.retryPending())];
    if (new Date(event.scheduledTime).getUTCMinutes() % 10 === 0)
      jobs.push(scheduledMaintenance({ store: app.store, run: (options) => app.maintenance.run({ ...options, limit: Math.min(options.limit || 50, 6) }), send: notificationSender(env) }));
    ctx.waitUntil(Promise.allSettled(jobs));
  },
};
