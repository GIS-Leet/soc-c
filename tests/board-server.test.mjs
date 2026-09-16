// 게시판 서버의 권한·비밀글·재시도 경계를 합성 데이터로 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
let createBoardService;
try {
  ({ createBoardService } = await import("../functions/board-service.mjs"));
} catch (e) {
  if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}
const alice = { uid: "alice", token: {} },
  bob = { uid: "bob", token: {} },
  teacher = {
    uid: "teacher",
    token: { email: "leetae712@gmail.com", email_verified: true },
  };
class MemoryStore {
  constructor(seed = {}) {
    this.data = structuredClone(seed);
    this.tail = Promise.resolve();
  }
  async get(path) {
    return structuredClone(
      path
        .split("/")
        .filter(Boolean)
        .reduce((v, k) => v?.[k], this.data) ?? null,
    );
  }
  async set(path, value) {
    const a = path.split("/");
    let d = this.data;
    for (const k of a.slice(0, -1)) d = d[k] ??= {};
    if (value === null) delete d[a.at(-1)];
    else d[a.at(-1)] = structuredClone(value);
  }
  async transaction(path, fn) {
    const work = this.tail.then(async () => {
      const next = fn(await this.get(path));
      if (next === undefined)
        return { committed: false, value: await this.get(path) };
      await this.set(path, next);
      return { committed: true, value: structuredClone(next) };
    });
    this.tail = work.catch(() => {});
    return work;
  }
  async update(changes) {
    for (const [p, v] of Object.entries(changes)) await this.set(p, v);
  }
  async page(path, { after = "", limit = 50 } = {}) {
    const d = (await this.get(path)) || {};
    return Object.entries(d)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([k]) => k > after)
      .slice(0, limit);
  }
}
function setup(seed = {}) {
  assert.equal(
    typeof createBoardService,
    "function",
    "board service must be implemented",
  );
  const store = new MemoryStore(seed),
    objects = new Map();
  let now = 1800000000000;
  const storage = {
    async put(path, bytes, mime) {
      objects.set(path, { bytes, mime });
    },
    async get(path) {
      return objects.get(path);
    },
    async delete(path) {
      objects.delete(path);
    },
  };
  const api = createBoardService({
    store,
    storage,
    now: () => now,
    attachmentBase: "https://example.test/boardAttachment",
  });
  return { store, api, objects, tick: (ms) => (now += ms) };
}
const req = (action, extra = {}) => ({ action, board: "questions", ...extra });
const draft = (requestId = "request-0001", extra = {}) =>
  req("create", {
    requestId,
    title: "Public title",
    text: "Visible body",
    author: "Student",
    password: "1234",
    isSecret: false,
    ...extra,
  });
const rejected = (promise, code) =>
  assert.rejects(promise, (e) => e.code === code);
test("service supplies real callable business entrypoint", () => setup());
test("public serializer drops passwords and private nested metadata", async () => {
  const { api } = setup({
    questions: {
      legacy: {
        title: "Title",
        text: "Body",
        password: "never-return",
        isSecret: false,
        time: "2026/09/16 AM 9:00",
        timestamp: 1,
        replies: {
          r: {
            text: "Answer",
            isTeacher: true,
            password: "hidden",
            time: "x",
            subReplies: {
              s: {
                text: "Followup",
                author: "A",
                ownerUid: "private",
                time: "y",
              },
            },
          },
        },
      },
    },
  });
  const list = await api.call(req("list"), alice);
  assert.equal(list.items[0].text, "Body");
  assert.equal(list.items[0].replies.r.subReplies.s.text, "Followup");
  assert.doesNotMatch(
    JSON.stringify(list),
    /never-return|hidden|ownerUid|password/,
  );
});
test("stranger sees only generic private row and cannot read body", async () => {
  const { api } = setup();
  const c = await api.call(
    draft("secret-0001", {
      isSecret: true,
      title: "Sensitive title",
      text: "Sensitive body",
    }),
    alice,
  );
  const list = await api.call(req("list"), bob);
  assert.equal(list.items[0].title, "비밀글");
  assert.doesNotMatch(JSON.stringify(list), /Sensitive|Student|1234/);
  await rejected(api.call(req("read", { id: c.id }), bob), "permission-denied");
  assert.equal(
    (await api.call(req("read", { id: c.id }), teacher)).item.text,
    "Sensitive body",
  );
});
test("author CRUD and idempotent create/update retry keep one record", async () => {
  const { api, store } = setup();
  const c = await api.call(draft(), alice);
  assert.equal((await api.call(draft(), alice)).id, c.id);
  assert.equal(Object.keys(await store.get("questions")).length, 1);
  await rejected(
    api.call(draft("request-0001", { text: "different" }), alice),
    "already-exists",
  );
  await rejected(
    api.call(
      req("update", {
        id: c.id,
        requestId: "edit-0001",
        title: "X",
        text: "Y",
      }),
      bob,
    ),
    "permission-denied",
  );
  await api.call(
    req("update", {
      id: c.id,
      requestId: "edit-0001",
      title: "New",
      text: "New body",
    }),
    alice,
  );
  assert.equal(
    (await api.call(req("read", { id: c.id }), alice)).item.title,
    "New",
  );
  await api.call(req("delete", { id: c.id, requestId: "delete-001" }), alice);
  assert.equal(await store.get("questions/" + c.id), null);
  await rejected(api.call(req("read", { id: c.id }), alice), "not-found");
});
test("teacher spoof and unknown fields rejected before writes", async () => {
  const { api } = setup();
  await rejected(
    api.call(draft("spoof-001", { isTeacher: true }), alice),
    "invalid-argument",
  );
  const c = await api.call(draft(), alice);
  await rejected(
    api.call(
      req("reply.create", {
        id: c.id,
        requestId: "reply-001",
        text: "Fake",
        isTeacher: true,
      }),
      bob,
    ),
    "invalid-argument",
  );
  await rejected(
    api.call(
      req("reply.create", { id: c.id, requestId: "reply-002", text: "Fake" }),
      bob,
    ),
    "permission-denied",
  );
  await rejected(
    api.call(
      req("reply.create", { id: c.id, requestId: "reply-003", text: "Fake" }),
      {
        uid: "fake",
        token: { email: "leetae712@gmail.com", email_verified: false },
      },
    ),
    "permission-denied",
  );
});
test("new subreply author ownership and parent deletion enforced", async () => {
  const { api, store } = setup();
  const c = await api.call(draft(), alice);
  const r = await api.call(
    req("reply.create", {
      id: c.id,
      requestId: "reply-001",
      text: "Teacher answer",
    }),
    teacher,
  );
  const s = await api.call(
    req("subreply.create", {
      id: c.id,
      replyId: r.id,
      requestId: "sub-00001",
      text: "Followup",
      author: "Bob",
    }),
    bob,
  );
  await rejected(
    api.call(
      req("subreply.delete", {
        id: c.id,
        replyId: r.id,
        subreplyId: s.id,
        requestId: "del-sub-1",
      }),
      alice,
    ),
    "permission-denied",
  );
  await api.call(
    req("subreply.delete", {
      id: c.id,
      replyId: r.id,
      subreplyId: s.id,
      requestId: "del-sub-2",
    }),
    bob,
  );
  await store.set("questions/" + c.id, null);
  await rejected(
    api.call(
      req("reply.create", {
        id: c.id,
        requestId: "reply-004",
        text: "No resurrection",
      }),
      teacher,
    ),
    "not-found",
  );
  assert.equal(await store.get("questions/" + c.id), null);
});
test("legacy password unlock grants expiring access without claiming ownership", async () => {
  const { api, store, tick } = setup({
    questions: {
      old: {
        title: "Secret",
        text: "Private",
        author: "Old",
        password: "oldpw",
        isSecret: true,
        time: "2026/01/01 AM 1:00",
        timestamp: 1,
      },
    },
  });
  await api.call(req("unlock", { id: "old", password: "oldpw" }), alice);
  assert.equal(
    (await api.call(req("read", { id: "old" }), alice)).item.text,
    "Private",
  );
  assert.equal((await store.get("questions/old")).password, undefined);
  assert.equal((await store.get("questions/old"))._board?.ownerUid, undefined);
  await api.call(req("unlock", { id: "old", password: "oldpw" }), bob);
  tick(31 * 60 * 1000);
  await rejected(
    api.call(req("read", { id: "old" }), alice),
    "permission-denied",
  );
});
test("password failures throttle across distinct UIDs by record and IP", async () => {
  const { api } = setup();
  const c = await api.call(draft("secret-0001", { isSecret: true }), alice);
  for (let i = 0; i < 5; i++)
    await rejected(
      api.call(
        req("unlock", { id: c.id, password: "wrong" }),
        { uid: "guess" + i, token: {} },
        { ip: "198.51.100.1" },
      ),
      "permission-denied",
    );
  await rejected(
    api.call(req("unlock", { id: c.id, password: "1234" }), bob, {
      ip: "198.51.100.1",
    }),
    "resource-exhausted",
  );
});
test("read receipt belongs to author even on public post", async () => {
  const { api } = setup();
  const c = await api.call(draft(), alice);
  await rejected(
    api.call(req("read.mark", { id: c.id, requestId: "read-0001" }), bob),
    "permission-denied",
  );
  await rejected(
    api.call(req("read.mark", { id: c.id, requestId: "read-0002" }), teacher),
    "permission-denied",
  );
  assert.ok(
    (
      await api.call(
        req("read.mark", { id: c.id, requestId: "read-0003" }),
        alice,
      )
    ).item.readAt > 0,
  );
});
test("pagination drains all posts with stable keys and explicit more flag", async () => {
  const questions = Object.fromEntries(
    Array.from({ length: 121 }, (_, i) => [
      "key" + String(i).padStart(3, "0"),
      {
        title: "T" + i,
        text: "B" + i,
        time: "",
        timestamp: i,
        isSecret: false,
      },
    ]),
  );
  const { api } = setup({ questions });
  let cursor = null,
    items = [];
  do {
    const result = await api.call(
      req("list", { limit: 50, ...(cursor ? { cursor } : {}) }),
      alice,
    );
    items.push(...result.items);
    cursor = result.cursor;
    assert.equal(result.hasMore, !!cursor);
  } while (cursor);
  assert.equal(items.length, 121);
  assert.equal(items.at(-1).text, "B120");
});
test("image signature and size enforced; attachment cannot be stolen", async () => {
  const { api } = setup();
  await rejected(
    api.call(
      req("attachment.upload", {
        requestId: "image-001",
        mime: "image/png",
        base64: Buffer.from("not png").toString("base64"),
      }),
      alice,
    ),
    "invalid-argument",
  );
  await rejected(
    api.call(
      req("attachment.upload", {
        requestId: "image-002",
        mime: "image/png",
        base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
      }),
      alice,
    ),
    "invalid-argument",
  );
  const png = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");
  const a = await api.call(
    req("attachment.upload", {
      requestId: "image-003",
      mime: "image/png",
      base64: png.toString("base64"),
    }),
    alice,
  );
  await rejected(
    api.call(draft("steal-001", { attachmentIds: [a.attachmentId] }), bob),
    "permission-denied",
  );
  const c = await api.call(
    draft("image-post", { isSecret: true, attachmentIds: [a.attachmentId] }),
    alice,
  );
  await rejected(
    api.attachment(
      { board: "questions", id: c.id, attachmentId: a.attachmentId },
      bob,
    ),
    "permission-denied",
  );
  assert.deepEqual(
    (
      await api.attachment(
        { board: "questions", id: c.id, attachmentId: a.attachmentId },
        alice,
      )
    ).bytes,
    png,
  );
});
test("notifications contain metadata only and deletion queues attachment cleanup", async () => {
  const { api, store } = setup();
  const c = await api.call(
    draft("secret-0001", {
      isSecret: true,
      title: "Hidden title",
      text: "Hidden body",
    }),
    alice,
  );
  const out = await store.get("boardOutbox");
  assert.ok(out);
  assert.doesNotMatch(JSON.stringify(out), /Hidden|Student|1234/);
  await api.call(req("delete", { id: c.id, requestId: "delete-001" }), alice);
  assert.ok(await store.get("boardTombstones/questions/" + c.id));
});
test("unauthenticated requests and path injection denied", async () => {
  const { api } = setup();
  await rejected(api.call(req("list"), null), "unauthenticated");
  await rejected(
    api.call(req("read", { id: "../desk" }), alice),
    "invalid-argument",
  );
  await rejected(
    api.call({ action: "list", board: "desk" }, alice),
    "invalid-argument",
  );
});

test("mutation rechecks current private state after concurrent native change", async () => {
  const { api, store } = setup();
  const c = await api.call(draft(), alice);
  const r = await api.call(
    req("reply.create", {
      id: c.id,
      requestId: "reply-001",
      text: "Teacher answer",
    }),
    teacher,
  );
  const transaction = store.transaction.bind(store);
  let switched = false;
  store.transaction = async (path, fn) => {
    if (path === "questions/" + c.id && !switched) {
      switched = true;
      await store.set(path + "/isSecret", true);
    }
    return transaction(path, fn);
  };
  await rejected(
    api.call(
      req("subreply.create", {
        id: c.id,
        replyId: r.id,
        requestId: "race-0001",
        text: "must deny",
        author: "Bob",
      }),
      bob,
    ),
    "permission-denied",
  );
});
test("delete retry completes if cleanup failed after canonical removal", async () => {
  const { api, store } = setup();
  const c = await api.call(draft(), alice);
  const set = store.set.bind(store);
  let once = true;
  store.set = async (path, value) => {
    if (path.startsWith("boardCleanup/") && once) {
      once = false;
      throw Error("transient storage outage");
    }
    return set(path, value);
  };
  await assert.rejects(
    api.call(req("delete", { id: c.id, requestId: "delete-001" }), alice),
  );
  const again = await api.call(
    req("delete", { id: c.id, requestId: "delete-001" }),
    alice,
  );
  assert.equal(again.deleted, true);
  assert.equal(await store.get("questions/" + c.id), null);
});
test("prototype-shaped identifiers cannot alter generated maps", async () => {
  const { api } = setup();
  await rejected(
    api.call(req("read", { id: "__proto__" }), alice),
    "invalid-argument",
  );
  await rejected(
    api.call(req("read", { id: "constructor" }), alice),
    "invalid-argument",
  );
});
test("external image URL and private legacy bearer URL never escape serialization", async () => {
  const { api } = setup({
    questions: {
      a: {
        title: "A",
        text: "B",
        isSecret: false,
        imageUrl: "https://firebasestorage.googleapis.com/v0/b/attacker/o/img",
      },
      b: {
        title: "Private",
        text: "B",
        isSecret: true,
        imageUrl:
          "https://firebasestorage.googleapis.com/v0/b/soc-c-qna.firebasestorage.app/o/img?token=old",
      },
    },
  });
  const list = await api.call(req("list"), teacher);
  assert.equal(list.items[0].imageUrl, "");
  assert.equal(list.items[1].imageUrl, "");
});

test("create retry cannot resurrect a native-deleted record after outbox failure", async () => {
  const { api, store } = setup();
  const transaction = store.transaction.bind(store);
  let once = true;
  store.transaction = async (path, fn) => {
    if (path.startsWith("boardOutbox/") && once) {
      once = false;
      throw Error("outbox unavailable");
    }
    return transaction(path, fn);
  };
  await assert.rejects(api.call(draft(), alice));
  const id = Object.keys(await store.get("questions"))[0];
  await store.set("questions/" + id, null);
  await rejected(api.call(draft(), alice), "failed-precondition");
  assert.equal(await store.get("questions/" + id), null);
});
test("failed upload reserves metadata so cleanup can find its object", async () => {
  const { api, store, objects } = setup();
  const transaction = store.transaction.bind(store);
  let times = 0;
  store.transaction = async (path, fn) => {
    if (path.startsWith("boardAttachments/")) {
      times++;
      if (times === 2) throw Error("finalization failed");
    }
    return transaction(path, fn);
  };
  const png = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");
  await assert.rejects(
    api.call(
      req("attachment.upload", {
        requestId: "upload-reserve",
        mime: "image/png",
        base64: png.toString("base64"),
      }),
      alice,
    ),
  );
  assert.equal(Object.keys(await store.get("boardAttachments")).length, 1);
  assert.equal(objects.size, 1);
});

test("list pages are byte bounded without silently dropping full public bodies", async () => {
  const questions = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      "large" + i,
      {
        title: "Large",
        text: "x".repeat(700000),
        isSecret: false,
        replies: {},
      },
    ]),
  );
  const { api } = setup({ questions });
  let cursor,
    ids = [];
  do {
    const page = await api.call(
      req("list", { limit: 50, ...(cursor ? { cursor } : {}) }),
      alice,
    );
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 4 * 1024 * 1024);
    ids.push(...page.items.map((i) => i.id));
    cursor = page.cursor;
  } while (cursor);
  assert.equal(ids.length, 8);
});
test("oversized legacy thread errors explicitly and new reply cannot exceed thread ceiling", async () => {
  const { api } = setup({
    questions: {
      huge: { title: "Huge", text: "x".repeat(1100000), isSecret: false },
      near: {
        title: "Near",
        text: "x".repeat(1040000),
        isSecret: false,
        replies: {},
      },
    },
  });
  await rejected(
    api.call(req("read", { id: "huge" }), teacher),
    "resource-exhausted",
  );
  await rejected(
    api.call(
      req("reply.create", {
        id: "near",
        requestId: "ceiling-001",
        text: "x".repeat(20000),
      }),
      teacher,
    ),
    "resource-exhausted",
  );
});
