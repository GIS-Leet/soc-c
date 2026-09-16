// 이전 암호 이관은 내용 출력 없이 원자적이고 재실행 가능해야 한다.
import test from "node:test";
import assert from "node:assert/strict";
let migrateRecord;
try {
  ({ migrateRecord } = await import("../scripts/migrate-boards.mjs"));
} catch (e) {
  if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}
test("dry-run migration leaves plaintext and credentials unchanged", async () => {
  assert.equal(
    typeof migrateRecord,
    "function",
    "migration must be implemented",
  );
  let updates = 0;
  const result = await migrateRecord({
    board: "questions",
    id: "old",
    post: { password: "old secret", text: "private content" },
    apply: false,
    store: { get: async () => null, update: async () => updates++ },
  });
  assert.equal(result.passwords, 1);
  assert.equal(updates, 0);
  assert.doesNotMatch(JSON.stringify(result), /old secret|private content/);
});
test("password migration writes verifier and removes old field in one atomic update", async () => {
  assert.equal(typeof migrateRecord, "function");
  const writes = [];
  const store = {
    get: async () => null,
    update: async (changes) => writes.push(changes),
  };
  await migrateRecord({
    board: "questions",
    id: "old",
    post: { password: "old secret" },
    apply: true,
    store,
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]["questions/old/password"], null);
  assert.equal(writes[0]["boardCredentials/questions/old"].algorithm, "scrypt");
  assert.doesNotMatch(JSON.stringify(writes[0]), /old secret/);
});
test("already migrated record skips verifier recreation and leaves record intact", async () => {
  assert.equal(typeof migrateRecord, "function");
  let writes = 0;
  const result = await migrateRecord({
    board: "questions",
    id: "old",
    post: { title: "Keep", text: "Keep body" },
    apply: true,
    store: { get: async () => null, update: async () => writes++ },
  });
  assert.equal(result.passwords, 0);
  assert.equal(writes, 0);
});

test("attachment migration cannot resurrect a concurrently deleted native post", async () => {
  assert.equal(typeof migrateRecord, "function");
  let canonical = null,
    revoked = false;
  const png = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");
  const store = {
    get: async () => null,
    update: async (changes) => {
      if (Object.keys(changes).some((p) => p.startsWith("questions/old/")))
        canonical = { resurrected: true };
    },
    transaction: async (path, fn) => {
      const v = fn(canonical);
      if (v !== undefined) canonical = v;
      return { committed: v !== undefined, value: canonical };
    },
  };
  const bucket = {
    file: () => ({
      getMetadata: async () => [{ size: png.length, contentType: "image/png" }],
      download: async () => [png],
      save: async () => {},
      setMetadata: async () => {
        revoked = true;
      },
    }),
  };
  await assert.rejects(
    migrateRecord({
      board: "questions",
      id: "old",
      post: {
        imageUrl:
          "https://firebasestorage.googleapis.com/v0/b/soc-c-qna.firebasestorage.app/o/images%2Fold",
      },
      apply: true,
      migrateAttachments: true,
      store,
      bucket,
    }),
  );
  assert.equal(canonical, null);
  assert.equal(revoked, false);
});
