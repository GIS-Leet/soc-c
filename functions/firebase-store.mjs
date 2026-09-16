// RTDB 조건부 REST 쓰기로 실제 서버 값을 읽은 뒤 원자적으로 변경한다.
import { BoardError } from "./board-security.mjs";
export function createFirebaseStore({
  database,
  credential,
  databaseURL,
  emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST,
}) {
  const namespace = new URL(databaseURL).hostname.split(".")[0];
  async function transaction(path, transform) {
    const base = emulatorHost
      ? `http://${emulatorHost}`
      : databaseURL.replace(/\/$/, "");
    const url = `${base}/${path.split("/").map(encodeURIComponent).join("/")}.json${emulatorHost ? `?ns=${namespace}` : ""}`;
    for (let attempt = 0; attempt < 12; attempt++) {
      const token = emulatorHost
        ? "owner"
        : (await credential.getAccessToken()).access_token;
      const headers = {
        Authorization: `Bearer ${token}`,
        "X-Firebase-ETag": "true",
      };
      const read = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      if (!read.ok) throw new BoardError("unavailable", "Database read failed");
      const old = await read.json(),
        next = transform(old);
      if (next === undefined) return { committed: false, value: old };
      const write = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "if-match": read.headers.get("etag"),
        },
        body: JSON.stringify(next),
        signal: AbortSignal.timeout(20000),
      });
      if (write.status === 412) continue;
      if (!write.ok)
        throw new BoardError("unavailable", "Database write failed");
      return { committed: true, value: next };
    }
    throw new BoardError(
      "aborted",
      "Concurrent change; retry with the same requestId",
    );
  }
  return {
    async get(path) {
      return (await database.ref(path).get()).val();
    },
    async set(path, value) {
      await database.ref(path).set(value);
    },
    async update(changes) {
      await database.ref().update(changes);
    },
    async page(path, { after = "", limit = 50 } = {}) {
      let q = database.ref(path).orderByKey();
      if (after) q = q.startAfter(after);
      const snapshot = await q.limitToFirst(limit).get(),
        rows = [];
      snapshot.forEach((child) => {
        rows.push([child.key, child.val()]);
      });
      return rows;
    },
    transaction,
  };
}
export function createBucketStorage(bucket) {
  return {
    async put(path, bytes, mime) {
      await bucket.file(path).save(bytes, {
        resumable: false,
        metadata: { contentType: mime, cacheControl: "private, no-store" },
      });
    },
    async get(path) {
      const file = bucket.file(path);
      try {
        const [[bytes], [metadata]] = await Promise.all([
          file.download(),
          file.getMetadata(),
        ]);
        return {
          bytes,
          mime: metadata.contentType || "application/octet-stream",
        };
      } catch (e) {
        if (e.code === 404) return null;
        throw e;
      }
    },
    async delete(path) {
      await bucket.file(path).delete({ ignoreNotFound: true });
    },
  };
}
