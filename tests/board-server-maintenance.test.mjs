// 정리·알림은 실제 상태 변화와 실패 후 재시도로 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
let createMaintenance;
try {
  ({ createMaintenance } = await import("../functions/board-maintenance.mjs"));
} catch (e) {
  if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}
function fixture(seed = {}) {
  let now = 1800000000000;
  const data = structuredClone(seed),
    objects = new Set(["pending", "live", "deleted"]);
  const store = {
    async get(p) {
      return structuredClone(
        p.split("/").reduce((d, k) => d?.[k], data) ?? null,
      );
    },
    async set(p, v) {
      const a = p.split("/");
      let d = data;
      for (const k of a.slice(0, -1)) d = d[k] ??= {};
      if (v === null) delete d[a.at(-1)];
      else d[a.at(-1)] = structuredClone(v);
    },
    async transaction(p, fn) {
      const v = fn(await this.get(p));
      if (v === undefined)
        return { committed: false, value: await this.get(p) };
      await this.set(p, v);
      return { committed: true, value: v };
    },
    async page(p, { after = "", limit = 50 } = {}) {
      return Object.entries((await this.get(p)) || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(([k]) => k > after)
        .slice(0, limit);
    },
  };
  return {
    store,
    objects,
    now: () => now,
    tick: (ms) => (now += ms),
    storage: {
      async delete(p) {
        objects.delete(p);
      },
    },
  };
}
const engine = (f) => {
  assert.equal(
    typeof createMaintenance,
    "function",
    "maintenance engine must be implemented",
  );
  return createMaintenance({
    ...f,
    containsAttachment: (p, id) => p?.attachmentId === id,
  });
};
test("expired orphan removed while canonical live attachment retained", async () => {
  const f = fixture({
    boardAttachments: {
      a: { createdAt: 1, state: "pending", storagePath: "pending" },
      b: {
        createdAt: 1,
        state: "claimed",
        storagePath: "live",
        board: "questions",
        postId: "live",
      },
      c: {
        createdAt: 1,
        state: "claimed",
        storagePath: "deleted",
        board: "questions",
        postId: "deleted",
      },
    },
    questions: { live: { attachmentId: "b" } },
  });
  const m = engine(f);
  await m.run({ limit: 50 });
  assert.deepEqual([...f.objects], ["live"]);
  assert.equal(await f.store.get("boardAttachments/a"), null);
  assert.ok(await f.store.get("boardAttachments/b"));
});
test("disabled notifications never send or discard pending outbox", async () => {
  const f = fixture({
    boardOutbox: {
      e: {
        board: "questions",
        postId: "p",
        state: "pending",
        nextAttemptAt: 1,
        attempts: 0,
      },
    },
  });
  let sends = 0;
  await engine(f).run({ send: async () => sends++, limit: 50 });
  assert.equal(sends, 0);
  assert.equal((await f.store.get("boardOutbox/e")).state, "pending");
});
test("notification failure releases lease with backoff and sends generic payload", async () => {
  const f = fixture({
    boardOutbox: {
      e: {
        board: "questions",
        postId: "p",
        state: "pending",
        nextAttemptAt: 1,
        attempts: 0,
      },
    },
    questions: { p: { title: "SECRET TITLE", text: "SECRET BODY" } },
  });
  const m = engine(f);
  await m.run({
    notificationsEnabled: true,
    send: async () => {
      throw Error("Failure");
    },
    limit: 50,
  });
  let e = await f.store.get("boardOutbox/e");
  assert.equal(e.state, "pending");
  assert.equal(e.attempts, 1);
  assert.ok(e.nextAttemptAt > f.now());
  f.tick(120000);
  let payload;
  await m.run({
    notificationsEnabled: true,
    send: async (p) => (payload = p),
    limit: 50,
  });
  assert.doesNotMatch(JSON.stringify(payload), /SECRET/);
  assert.match(JSON.stringify(payload), /desk\.html/);
  assert.equal((await f.store.get("boardOutbox/e")).state, "sent");
});
test("bounded maintenance exposes cursor rather than truncating orphan queue silently", async () => {
  const f = fixture({
    boardAttachments: {
      a: { createdAt: 1, state: "pending", storagePath: "pending" },
      b: { createdAt: 1, state: "pending", storagePath: "deleted" },
    },
  });
  const m = engine(f);
  const first = await m.run({ limit: 1 });
  assert.equal(first.cursors.attachments, "a");
  await m.run({ limit: 1, cursors: first.cursors });
  assert.equal(await f.store.get("boardAttachments/b"), null);
});

test("concurrent fresh claim prevents cleanup of an older pending attachment", async () => {
  const f = fixture({
    boardAttachments: {
      a: {
        createdAt: 1,
        state: "claimed",
        claimedAt: 1,
        storagePath: "live",
        board: "questions",
        postId: "live",
      },
    },
    questions: { live: { text: "no attachment yet" } },
  });
  const transaction = f.store.transaction.bind(f.store);
  let changed = false;
  f.store.transaction = async (path, fn) => {
    if (path === "boardAttachments/a" && !changed) {
      changed = true;
      await f.store.set(path, {
        createdAt: 1,
        state: "claimed",
        claimedAt: f.now(),
        storagePath: "live",
        board: "questions",
        postId: "live",
      });
      await f.store.set("questions/live", { attachmentId: "a" });
    }
    return transaction(path, fn);
  };
  await engine(f).run({ limit: 50 });
  assert.ok(f.objects.has("live"));
  assert.ok(await f.store.get("boardAttachments/a"));
});
