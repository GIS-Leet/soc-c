// 실제 에뮬레이터의 ETag 충돌과 원자적 생성 영수증을 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createFirebaseStore } from "../functions/firebase-store.mjs";
import { createBoardService } from "../functions/board-service.mjs";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
test(
  "REST transactions retry ETag conflicts and board engine persists through real RTDB",
  { skip: !process.env.FIREBASE_DATABASE_EMULATOR_HOST },
  async () => {
    const { initializeApp, deleteApp } = require("firebase-admin/app"),
      { getDatabase } = require("firebase-admin/database");
    const credential = {
      getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }),
    };
    const databaseURL = "https://soc-c-qna-default-rtdb.firebaseio.com";
    const app = initializeApp(
      { projectId: "soc-c-qna", databaseURL, credential },
      "board-store-test",
    );
    const db = getDatabase(app),
      store = createFirebaseStore({ database: db, credential, databaseURL });
    try {
      const path = "boardTest/counter";
      await store.set(path, 0);
      await Promise.all(
        Array.from({ length: 5 }, () =>
          store.transaction(path, (n) => (n || 0) + 1),
        ),
      );
      assert.equal(await store.get(path), 5);
      const service = createBoardService({
          store,
          storage: {},
          attachmentBase: "https://example.test/image",
        }),
        auth = { uid: "emulator-author", token: {} };
      const request = {
        action: "create",
        board: "questions",
        requestId: "emulator-" + Date.now(),
        title: "Synthetic title",
        text: "Synthetic body",
        author: "Synthetic",
        password: "pass123",
        isSecret: true,
      };
      const created = await service.call(request, auth);
      assert.equal((await service.call(request, auth)).id, created.id);
      assert.equal(
        (await store.get("questions/" + created.id)).password,
        undefined,
      );
      await store.set("questions/" + created.id, null);
      await assert.rejects(
        service.call(request, auth),
        (e) => e.code === "not-found",
      );
      await store.set(path, null);
    } finally {
      await deleteApp(app);
    }
  },
);
