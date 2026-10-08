// Cloudflare Worker 껍데기(worker/src) — 서비스 계정 토큰 · ID 토큰 검증 · RTDB REST 저장 계층 · APNs 서명 · 응답 모양을 검사한다.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign, verify as nodeVerify } from "node:crypto";
import { createCredential, verifyIdToken } from "../worker/src/google.mjs";
import { createRestStore, createKVStorage } from "../worker/src/store.mjs";
import { createWorkerApnsSender } from "../worker/src/apns.mjs";
import worker, { mutates } from "../worker/src/index.mjs";

const b64u = (v) => Buffer.from(v).toString("base64url");
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...rsa.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const NOW = 1_800_000_000_000, PROJECT = "soc-c-qna";
function idToken(claims = {}, { key = rsa.privateKey, kid = "k1" } = {}) {
  const seconds = NOW / 1000;
  const input = b64u(JSON.stringify({ alg: "RS256", kid })) + "." + b64u(JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "u1", iat: seconds - 10, exp: seconds + 3600, auth_time: seconds - 10, ...claims }));
  return input + "." + createSign("RSA-SHA256").update(input).sign(key).toString("base64url");
}
const fakeGoogle = (user = { localId: "u1" }) => async (url) => {
  if (String(url).includes("securetoken@system")) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "public, max-age=60" } });
  if (String(url).includes("accounts:lookup")) return Response.json({ users: user ? [user] : [] });
  throw new Error("unexpected " + url);
};
const credential = { getAccessToken: async () => ({ access_token: "t" }) };

test("ID 토큰 — 올바르면 통과, 대상 · 만료 · 서명 · 폐기 · 정지는 거부", async () => {
  const options = { projectId: PROJECT, credential, now: () => NOW };
  assert.equal((await verifyIdToken(idToken({ email: "a@b.c" }), { ...options, fetcher: fakeGoogle() })).uid, "u1");
  await assert.rejects(verifyIdToken(idToken({ aud: "other" }), { ...options, fetcher: fakeGoogle() }));
  await assert.rejects(verifyIdToken(idToken({ exp: NOW / 1000 - 1 }), { ...options, fetcher: fakeGoogle() }));
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await assert.rejects(verifyIdToken(idToken({}, { key: other.privateKey }), { ...options, fetcher: fakeGoogle() }), /signature/);
  await assert.rejects(verifyIdToken(idToken(), { ...options, fetcher: fakeGoogle({ localId: "u1", validSince: String(NOW / 1000 + 5) }) }), /revoked/);
  await assert.rejects(verifyIdToken(idToken(), { ...options, fetcher: fakeGoogle({ localId: "u1", disabled: true }) }), /disabled/);
  await assert.rejects(verifyIdToken(idToken(), { ...options, fetcher: fakeGoogle(null) }), /disabled/);
  await assert.rejects(verifyIdToken("a.b", { ...options, fetcher: fakeGoogle() }));
});

test("서비스 계정 토큰 — RS256 으로 서명해 받아 오고 55분 동안 다시 쓴다", async () => {
  const pem = rsa.privateKey.export({ type: "pkcs8", format: "pem" });
  let calls = 0, assertion = "";
  const fetcher = async (_url, init) => { calls++; assertion = new URLSearchParams(init.body).get("assertion"); return Response.json({ access_token: "ya29.x" }); };
  let now = NOW;
  const c = createCredential(JSON.stringify({ client_email: "sa@x.iam", private_key: pem }), { now: () => now, fetcher });
  assert.equal((await c.getAccessToken()).access_token, "ya29.x");
  const [h, p, sig] = assertion.split(".");
  assert.ok(nodeVerify("RSA-SHA256", Buffer.from(h + "." + p), rsa.publicKey, Buffer.from(sig, "base64url")));
  assert.equal(JSON.parse(Buffer.from(p, "base64url")).iss, "sa@x.iam");
  await c.getAccessToken(); assert.equal(calls, 1);
  now += 56 * 60000; await c.getAccessToken(); assert.equal(calls, 2);
});

test("RTDB REST 저장 계층 — 쪽 나누기는 키 순 · after 제외, update 는 뿌리에 PATCH, 실패는 unavailable", async () => {
  const seen = [];
  const fetcher = async (url, init) => {
    seen.push([init.method, String(url), init.body]);
    if (String(url).includes("orderBy")) return Response.json({ c: 3, a: 1, b: 2 });
    if (String(url).includes("/broken.json")) return new Response("no", { status: 500 });
    return Response.json(init.method === "GET" ? { v: 1 } : {});
  };
  const store = createRestStore({ credential, databaseURL: "https://db.example/", fetcher });
  assert.deepEqual(await store.page("questions", { after: "a", limit: 2 }), [["b", 2], ["c", 3]]);
  assert.match(seen[0][1], /questions\.json\?orderBy=%22%24key%22&startAt=%22a%22&limitToFirst=3$/);
  assert.deepEqual(await store.get("desk/push tokens"), { v: 1 });
  assert.equal(seen[1][1], "https://db.example/desk/push%20tokens.json");
  await store.update({ "a/b": 1, "c": null });
  assert.deepEqual(seen[2].slice(0, 2), ["PATCH", "https://db.example/.json"]);
  await store.set("x", null); assert.equal(seen[3][2], "null");
  await assert.rejects(store.get("broken"), (e) => e.code === "unavailable");
});

test("첨부 저장(KV) — mime 은 metadata 에, 없으면 null", async () => {
  const map = new Map();
  const kv = { put: async (k, v, o) => void map.set(k, [v, o.metadata]), getWithMetadata: async (k) => { const e = map.get(k); return { value: e ? e[0].buffer : null, metadata: e?.[1] }; }, delete: async (k) => void map.delete(k) };
  const storage = createKVStorage(kv);
  await storage.put("board-private/q/u/a", new Uint8Array([1, 2, 3]), "image/png");
  const got = await storage.get("board-private/q/u/a");
  assert.equal(got.mime, "image/png"); assert.deepEqual([...got.bytes], [1, 2, 3]);
  await storage.delete("board-private/q/u/a"); assert.equal(await storage.get("board-private/q/u/a"), null);
});

test("APNs — 공급자 토큰이 ES256 으로 맞게 서명되고 fetch 로 보낸다", async () => {
  const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credentialJSON = JSON.stringify({ key: ec.privateKey.export({ type: "pkcs8", format: "pem" }), keyId: "ABCDEFGHIJ", teamId: "JUD3Y3XYZ7", topic: "nyuheatgis" });
  let sent;
  const send = await createWorkerApnsSender(credentialJSON, { now: () => NOW, request: async (r) => { sent = r; return { status: 200, reason: "" }; } });
  assert.deepEqual(await send("ab12", { title: "새 학생 질문", body: "b", badge: 1 }, { env: "production" }), { status: 200, reason: "" });
  assert.equal(sent.origin, "https://api.push.apple.com"); assert.equal(sent.path, "/3/device/ab12");
  const [h, p, sig] = sent.headers.authorization.replace(/^bearer /, "").split(".");
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url")), { iss: "JUD3Y3XYZ7", iat: NOW / 1000 });
  assert.ok(nodeVerify("sha256", Buffer.from(h + "." + p), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
});

test("응답 모양 — CORS 사전 요청, 로그인 없는 호출은 callable 과 같은 오류, 없는 경로는 404", async () => {
  const env = { GOOGLE_SERVICE_ACCOUNT: "{}", DATABASE_URL: "https://db.example", PROJECT_ID: PROJECT, FILES: {} };
  const ctx = { waitUntil() {} };
  const pre = await worker.fetch(new Request("https://w.example/boardApi", { method: "OPTIONS" }), env, ctx);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "*");
  const anon = await worker.fetch(new Request("https://w.example/boardApi", { method: "POST", body: JSON.stringify({ data: { action: "list", board: "questions" } }) }), env, ctx);
  assert.equal(anon.status, 401); assert.deepEqual(await anon.json(), { error: { message: "unauthenticated", status: "UNAUTHENTICATED" } });
  assert.equal((await worker.fetch(new Request("https://w.example/nope"), env, ctx)).status, 404);
});

test("판 번호 — 글을 바꾸는 호출만 올리고, /boardTouch 는 교사만", async () => {
  assert.equal(mutates({ action: "create", board: "questions" }), true);
  assert.equal(mutates({ action: "reply.delete", board: "support" }), true);
  for (const action of ["list", "read", "unlock", "attachment.upload"]) assert.equal(mutates({ action, board: "questions" }), false);
  assert.equal(mutates({ action: "create", board: "nope" }), false);
  const env = { GOOGLE_SERVICE_ACCOUNT: "{}", DATABASE_URL: "https://db.example", PROJECT_ID: PROJECT, FILES: {} };
  const anon = await worker.fetch(new Request("https://w.example/boardTouch", { method: "POST", body: JSON.stringify({ data: { board: "questions" } }) }), env, { waitUntil() {} });
  assert.equal(anon.status, 403);
});
