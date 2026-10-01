import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http2";
import {
  createDeskPushService,
  createApnsSender,
  createDatabaseEventHandler,
  createPushEvent,
  eventId,
  requestApns,
} from "../functions/desk-push.mjs";

function memoryStore(tokens = {}) {
  const values = { "desk/push/tokens": structuredClone(tokens) };
  return {
    values,
    async get(path) {
      return structuredClone(values[path] ?? null);
    },
    async transaction(path, transform) {
      const current = structuredClone(values[path] ?? null);
      const next = transform(current);
      if (next === undefined)
        return { committed: false, value: current };
      values[path] = structuredClone(next);
      const event = path.match(/^(desk\/push\/events\/[^/]+)$/);
      if (event && next?.devices) {
        for (const [token, delivery] of Object.entries(next.devices))
          values[`${path}/devices/${token}`] = structuredClone(delivery);
      }
      const child = path.match(/^(desk\/push\/events\/[^/]+)\/devices\/([^/]+)$/);
      if (child && values[child[1]]?.devices)
        values[child[1]].devices[child[2]] = structuredClone(next);
      return { committed: true, value: structuredClone(next) };
    },
  };
}

test("새벽에 등록된 질문도 호출 안에서 즉시 모든 기기로 전송한다", async () => {
  const store = memoryStore({
    developmentToken: { at: 10, env: "development", name: "iPad" },
    productionToken: { at: 20, env: "production", name: "iPhone" },
  });
  const sent = [];
  const now = Date.parse("2026-09-17T02:15:00+09:00");
  const service = createDeskPushService({
    store,
    now: () => now,
    owner: () => "worker-a",
    send: async (token, event, delivery) => {
      sent.push({ token, title: event.title, env: delivery.env });
      return { status: 200, reason: "" };
    },
  });

  const result = await service.created({
    kind: "question",
    params: { qid: "question-1" },
    value: { timestamp: now, title: "민감한 실제 제목은 알림에 쓰지 않음" },
  });

  assert.deepEqual(result, { accepted: 2, retry: 0, invalid: 0 });
  assert.deepEqual(sent, [
    { token: "developmentToken", title: "새 학생 질문", env: "development" },
    { token: "productionToken", title: "새 학생 질문", env: "production" },
  ]);
  const id = eventId("question", "question-1");
  assert.equal(
    store.values[`desk/push/events/${id}/devices/developmentToken`].state,
    "accepted",
  );
});

test("학생 추가 질문만 알리고 교사 답변은 알리지 않는다", async () => {
  assert.equal(
    createPushEvent({
      kind: "subreply",
      params: { qid: "q", rid: "r", sid: "teacher" },
      value: { isTeacher: true },
      tokens: { token: { at: 1, env: "development" } },
      now: 100,
    }),
    null,
  );
  const event = createPushEvent({
    kind: "subreply",
    params: { qid: "q", rid: "r", sid: "student" },
    value: { isTeacher: false, text: "알림 본문에 포함하면 안 되는 내용" },
    tokens: { token: { at: 1, env: "development" } },
    now: 100,
  });
  assert.equal(event.title, "학생의 추가 질문");
  assert.equal(event.body, "Desk에서 이어진 질문을 확인하세요.");
  assert.doesNotMatch(JSON.stringify(event), /알림 본문에 포함/);
});

test("일시 실패는 재시도 상태로 남고 같은 시각에 중복 전송하지 않는다", async () => {
  const store = memoryStore({ token: { at: 10, env: "development" } });
  let calls = 0;
  const service = createDeskPushService({
    store,
    now: () => 1_000_000,
    owner: () => `worker-${calls}`,
    send: async () => {
      calls++;
      return { status: 503, reason: "ServiceUnavailable" };
    },
  });
  const input = {
    kind: "question",
    params: { qid: "question-2" },
    value: { timestamp: 1_000_000 },
  };
  assert.deepEqual(await service.created(input), {
    accepted: 0,
    retry: 1,
    invalid: 0,
  });
  assert.deepEqual(await service.created(input), {
    accepted: 0,
    retry: 0,
    invalid: 0,
  });
  assert.equal(calls, 1);
});

test("APNs 환경별 호스트에 즉시 알림 payload와 서명 헤더를 보낸다", async () => {
  const requests = [];
  const sender = createApnsSender({
    credential: JSON.stringify({
      key: [
        "-----BEGIN PRIVATE KEY-----",
        "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg0u/",
        "-----END PRIVATE KEY-----",
      ].join("\n"),
      keyId: "KEY1234567",
      teamId: "TEAM123456",
      topic: "nyuheatgis",
    }),
    sign: () => Buffer.alloc(64, 7),
    now: () => 1_700_000_000_000,
    request: async (input) => {
      requests.push(input);
      return { status: 200, reason: "" };
    },
  });
  const event = { title: "새 학생 질문", body: "Desk에서 질문을 확인하세요.", badge: 1 };

  assert.deepEqual(await sender("aabb", event, { env: "development" }), {
    status: 200,
    reason: "",
  });
  assert.deepEqual(await sender("ccdd", event, { env: "production" }), {
    status: 200,
    reason: "",
  });
  assert.equal(requests[0].origin, "https://api.sandbox.push.apple.com");
  assert.equal(requests[1].origin, "https://api.push.apple.com");
  assert.equal(requests[0].path, "/3/device/aabb");
  assert.equal(requests[0].headers["apns-topic"], "nyuheatgis");
  assert.equal(requests[0].headers["apns-priority"], "10");
  assert.match(requests[0].headers.authorization, /^bearer [^.]+\.[^.]+\.[^.]+$/);
  assert.deepEqual(requests[0].payload, {
    aps: {
      alert: {
        title: "새 학생 질문",
        body: "Desk에서 질문을 확인하세요.",
      },
      sound: "default",
      badge: 1,
      "thread-id": "qna",
    },
    qa: true,
  });
});

test("응답하지 않는 APNs 연결은 제한시간 뒤 재시도 가능한 오류로 끝난다", async () => {
  const server = createServer();
  server.on("stream", () => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await assert.rejects(
      requestApns({
        origin: `http://127.0.0.1:${address.port}`,
        path: "/3/device/aabb",
        headers: {},
        payload: { aps: {} },
        timeoutMs: 20,
      }),
      /timed out/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Realtime Database 생성 이벤트의 경로와 값을 즉시 발송 서비스에 전달한다", async () => {
  const received = [];
  const question = createDatabaseEventHandler({
    kind: "question",
    service: { created: async (input) => received.push(input) },
  });
  const followup = createDatabaseEventHandler({
    kind: "subreply",
    service: { created: async (input) => received.push(input) },
  });
  await question({ params: { qid: "q1" }, data: { val: () => ({ timestamp: 1 }) } });
  await followup({
    params: { qid: "q1", rid: "r1", sid: "s1" },
    data: { val: () => ({ isTeacher: false, timestamp: 2 }) },
  });
  assert.deepEqual(received, [
    {
      kind: "question",
      params: { qid: "q1" },
      value: { timestamp: 1 },
    },
    {
      kind: "subreply",
      params: { qid: "q1", rid: "r1", sid: "s1" },
      value: { isTeacher: false, timestamp: 2 },
    },
  ]);
});

// ── 재시도 비용: 매분 도는 함수가 끝난 사건을 다시 읽지 않고, 오래된 사건은 지운다 ──
function treeStore(root = {}) {
  const tree = structuredClone(root);
  const calls = { get: 0, transaction: 0, set: 0 };
  const walk = (path, create) => {
    const keys = path.split("/");
    let node = tree;
    for (const key of keys.slice(0, -1)) {
      if (node[key] == null) {
        if (!create) return [null, keys.at(-1)];
        node[key] = {};
      }
      node = node[key];
    }
    return [node, keys.at(-1)];
  };
  const read = (path) => {
    const [node, key] = walk(path, false);
    return structuredClone(node?.[key] ?? null);
  };
  const write = (path, value) => {
    const [node, key] = walk(path, true);
    if (value === null) delete node[key];
    else node[key] = structuredClone(value);
  };
  return {
    tree,
    calls,
    read,
    async get(path) {
      calls.get++;
      return read(path);
    },
    async set(path, value) {
      calls.set++;
      write(path, value);
    },
    async transaction(path, transform) {
      calls.transaction++;
      const current = read(path);
      const next = transform(current);
      if (next === undefined) return { committed: false, value: current };
      write(path, next);
      return { committed: true, value: structuredClone(next) };
    },
  };
}
const HOUR = 3600_000;
const pushEvent = (createdAt, devices) => ({
  title: "새 학생 질문",
  body: "Desk에서 질문을 확인하세요.",
  badge: 1,
  createdAt,
  devices,
});

test("전송이 끝난 사건은 재시도 때 다시 점유하지 않는다", async () => {
  const now = Date.parse("2026-10-02T10:00:00+09:00");
  const store = treeStore({
    desk: {
      push: {
        events: {
          done: pushEvent(now - HOUR, {
            a: { state: "accepted", registeredAt: 1, env: "production" },
            b: { state: "invalid", registeredAt: 2, env: "development" },
          }),
        },
      },
    },
  });
  let sent = 0;
  const service = createDeskPushService({
    store,
    now: () => now,
    owner: () => "w",
    send: async () => (sent++, { status: 200, reason: "" }),
  });
  assert.deepEqual(await service.retryPending(), {
    accepted: 0,
    retry: 0,
    invalid: 0,
  });
  assert.equal(sent, 0);
  assert.equal(store.calls.transaction, 0, "끝난 기기는 DB 를 건드리지 않는다");
  assert.ok(store.read("desk/push/events/done"), "하루 안 된 사건은 중복 방지용으로 남긴다");
});

test("재시도 시각 전에는 건드리지 않고, 시각이 되면 다시 보낸다", async () => {
  let now = Date.parse("2026-10-02T10:00:00+09:00");
  const retryAt = Math.floor(now / 1000) + 600;
  const store = treeStore({
    desk: {
      push: {
        events: {
          wait: pushEvent(now - HOUR, {
            a: { state: "retry", attempts: 2, retryAt, leaseUntil: 0, registeredAt: 1, env: "production" },
          }),
        },
      },
    },
  });
  let sent = 0;
  const service = createDeskPushService({
    store,
    now: () => now,
    owner: () => "w",
    send: async () => (sent++, { status: 200, reason: "" }),
  });
  await service.retryPending();
  assert.equal(sent, 0);
  assert.equal(store.calls.transaction, 0);
  now += 601_000;
  assert.deepEqual(await service.retryPending(), { accepted: 1, retry: 0, invalid: 0 });
  assert.equal(sent, 1);
  assert.equal(store.read("desk/push/events/wait/devices/a").state, "accepted");
});

test("끝난 지 하루 지난 사건과 기기 없는 사건은 지운다", async () => {
  const now = Date.parse("2026-10-02T10:00:00+09:00");
  const store = treeStore({
    desk: {
      push: {
        events: {
          old: pushEvent(now - 25 * HOUR, { a: { state: "accepted", registeredAt: 1, env: "production" } }),
          empty: pushEvent(now - 25 * HOUR, {}),
          fresh: pushEvent(now - HOUR, { a: { state: "accepted", registeredAt: 1, env: "production" } }),
          waiting: pushEvent(now - 25 * HOUR, { a: { state: "retry", attempts: 3, retryAt: Math.floor(now / 1000) + 600, leaseUntil: 0, registeredAt: 1, env: "production" } }),
        },
      },
    },
  });
  const service = createDeskPushService({ store, now: () => now, owner: () => "w", send: async () => ({ status: 200, reason: "" }) });
  await service.retryPending();
  assert.deepEqual(Object.keys(store.read("desk/push/events")).sort(), ["fresh", "waiting"]);
});

test("7일 넘게 실패한 사건은 포기하고 지운다", async () => {
  const now = Date.parse("2026-10-02T10:00:00+09:00");
  const store = treeStore({
    desk: {
      push: {
        events: {
          stuck: pushEvent(now - 8 * 24 * HOUR, { a: { state: "retry", attempts: 9, retryAt: Math.floor(now / 1000) + 600, leaseUntil: 0, registeredAt: 1, env: "production" } }),
        },
      },
    },
  });
  let sent = 0;
  const service = createDeskPushService({ store, now: () => now, owner: () => "w", send: async () => (sent++, { status: 200, reason: "" }) });
  await service.retryPending();
  assert.equal(sent, 0);
  assert.equal(store.read("desk/push/events/stuck"), null);
});
